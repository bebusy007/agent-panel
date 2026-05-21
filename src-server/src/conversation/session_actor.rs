use crate::conversation::protocol::ProtocolParser;
use crate::conversation::stdin_writer::{
    build_interrupt_request, build_permission_response, build_user_message,
};
use crate::conversation::transport::Transport;
use crate::conversation::types::*;
use std::collections::VecDeque;
use tokio::io::AsyncWriteExt;
use tokio::process::ChildStdin;
use tokio::sync::{broadcast, mpsc, oneshot};

// ── Actor commands ──

pub enum ActorCommand {
    SendMessage {
        text: String,
        attachments: Vec<AttachmentData>,
        reply: oneshot::Sender<Result<String, String>>,
    },
    SendPermission {
        request_id: String,
        decision: PermissionDecision,
    },
    Interrupt,
    Stop {
        reply: oneshot::Sender<Result<(), String>>,
    },
}

// ── Actor state ──

pub struct SessionActor {
    cmd_rx: mpsc::Receiver<ActorCommand>,
    event_tx: broadcast::Sender<ServerMessage>,
    transport: Transport,
    stdin: Option<ChildStdin>,
    parser: ProtocolParser,
    active_turn: bool,
    pending_messages: VecDeque<(String, Vec<AttachmentData>)>,
    session_id: Option<String>,
}

/// Handle returned when creating a SessionActor, for external communication.
pub struct SessionActorHandle {
    pub cmd_tx: mpsc::Sender<ActorCommand>,
    pub event_rx: broadcast::Receiver<ServerMessage>,
    pub pid: Option<u32>,
}

impl SessionActor {
    /// Spawn a new SessionActor. Returns a handle for communication.
    pub async fn spawn(config: SpawnConfig) -> Result<SessionActorHandle, String> {
        let mut transport = Transport::spawn(&config).await?;
        let stdin = transport.take_stdin();
        let pid = transport.pid();

        let (cmd_tx, cmd_rx) = mpsc::channel(64);
        let (event_tx, event_rx) = broadcast::channel(1024);

        let actor = Self {
            cmd_rx,
            event_tx: event_tx.clone(),
            transport,
            stdin,
            parser: ProtocolParser::new(),
            active_turn: false,
            pending_messages: VecDeque::new(),
            session_id: None,
        };

        tokio::spawn(actor.run());

        Ok(SessionActorHandle {
            cmd_tx,
            event_rx,
            pid,
        })
    }

    async fn run(mut self) {
        let mut stdout_rx = self.transport.stdout_rx();

        // Immediately notify connected (CLI doesn't emit init until first message)
        let _ = self.event_tx.send(ServerMessage::Connected {
            epoch: 0,
            session_id: String::new(),
            reconnect_token: None,
        });

        loop {
            tokio::select! {
                // Process commands from the handle
                cmd = self.cmd_rx.recv() => {
                    match cmd {
                        Some(ActorCommand::SendMessage { text, attachments, reply }) => {
                            let result = self.handle_send_message(text, attachments).await;
                            let _ = reply.send(result);
                        }
                        Some(ActorCommand::SendPermission { request_id, decision }) => {
                            self.handle_send_permission(&request_id, &decision).await;
                        }
                        Some(ActorCommand::Interrupt) => {
                            self.handle_interrupt().await;
                        }
                        Some(ActorCommand::Stop { reply }) => {
                            let result = self.handle_stop().await;
                            let _ = reply.send(result);
                            return;
                        }
                        None => {
                            // All senders dropped, shutdown
                            tracing::debug!("All command senders dropped, stopping actor");
                            let _ = self.transport.kill().await;
                            return;
                        }
                    }
                }
                // Process stdout lines from CLI
                line = stdout_rx.recv() => {
                    match line {
                        Ok(line) => self.handle_stdout_line(&line).await,
                        Err(broadcast::error::RecvError::Closed) => {
                            tracing::debug!("CLI stdout closed");
                            self.handle_process_exit().await;
                            return;
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!(skipped = n, "stdout receiver lagged");
                        }
                    }
                }
            }
        }
    }

    async fn handle_send_message(
        &mut self,
        text: String,
        attachments: Vec<AttachmentData>,
    ) -> Result<String, String> {
        if self.active_turn {
            // Queue for later
            self.pending_messages.push_back((text, attachments));
            return Ok("queued".to_string());
        }

        self.dispatch_message(&text, &attachments).await
    }

    async fn dispatch_message(
        &mut self,
        text: &str,
        attachments: &[AttachmentData],
    ) -> Result<String, String> {
        let (line, uuid) = build_user_message(text, attachments);
        self.write_stdin(&line).await?;
        self.active_turn = true;
        Ok(uuid)
    }

    async fn handle_send_permission(&mut self, request_id: &str, decision: &PermissionDecision) {
        let line = build_permission_response(request_id, decision);
        if let Err(e) = self.write_stdin(&line).await {
            tracing::error!(error = %e, "Failed to write permission response");
        }
    }

    async fn handle_interrupt(&mut self) {
        let line = build_interrupt_request();
        if let Err(e) = self.write_stdin(&line).await {
            tracing::error!(error = %e, "Failed to write interrupt");
        }
    }

    async fn handle_stop(&mut self) -> Result<(), String> {
        self.transport.kill().await
    }

    async fn handle_stdout_line(&mut self, line: &str) {
        let events = self.parser.parse_line(line);

        for event in events {
            // Check for session init
            if let ChatEvent::SessionInit { ref session_id, .. } = event {
                if self.session_id.is_none() {
                    self.session_id = Some(session_id.clone());
                    let _ = self.event_tx.send(ServerMessage::Connected {
                        epoch: 0,
                        session_id: session_id.clone(),
                        reconnect_token: None,
                    });
                }
            }

            // Check for turn complete
            if matches!(&event, ChatEvent::TurnComplete { .. }) {
                self.active_turn = false;
                // Dispatch next queued message if any
                if let Some((text, attachments)) = self.pending_messages.pop_front() {
                    if let Err(e) = self.dispatch_message(&text, &attachments).await {
                        tracing::error!(error = %e, "Failed to dispatch queued message");
                    }
                } else {
                    let _ = self.event_tx.send(ServerMessage::StateChange {
                        state: SessionState::Idle,
                        reason: None,
                    });
                }
            }

            // Forward event
            let _ = self.event_tx.send(ServerMessage::Event(event));
        }
    }

    async fn handle_process_exit(&mut self) {
        self.active_turn = false;
        let _ = self.event_tx.send(ServerMessage::Disconnected {
            reason: "CLI process exited".to_string(),
        });
    }

    async fn write_stdin(&mut self, data: &str) -> Result<(), String> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| "stdin not available".to_string())?;
        stdin
            .write_all(data.as_bytes())
            .await
            .map_err(|e| format!("stdin write failed: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("stdin flush failed: {}", e))?;
        Ok(())
    }

    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actor_command_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<ActorCommand>();
    }

    #[test]
    fn session_actor_handle_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<SessionActorHandle>();
    }
}
