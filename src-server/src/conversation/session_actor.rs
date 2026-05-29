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

// ── Actor handle ──

pub struct SessionActorHandle {
    pub cmd_tx: mpsc::Sender<ActorCommand>,
    pub event_rx: broadcast::Receiver<ServerMessage>,
    pub pid: Option<u32>,
}

// ── Actor state ──

struct SessionActor {
    cmd_rx: mpsc::Receiver<ActorCommand>,
    event_tx: broadcast::Sender<ServerMessage>,
    transport: Transport,
    stdin: Option<ChildStdin>,
    parser: ProtocolParser,
    active_turn: bool,
    pending_messages: VecDeque<(String, Vec<AttachmentData>)>,
    session_id: Option<String>,
    resume_session_id: Option<String>,
    seq: u64,
}

pub async fn spawn_actor(config: SpawnConfig) -> Result<SessionActorHandle, String> {
    SessionActor::spawn(config).await
}

impl SessionActor {
    async fn spawn(config: SpawnConfig) -> Result<SessionActorHandle, String> {
        let mut transport = Transport::spawn(&config).await?;
        let stdin = transport.take_stdin();
        let pid = transport.pid();

        let resume_session_id = match &config.mode {
            SpawnMode::Resume { session_id } => Some(session_id.clone()),
            SpawnMode::New => None,
        };

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
            resume_session_id,
            seq: 0,
        };

        tokio::spawn(actor.run());

        Ok(SessionActorHandle {
            cmd_tx,
            event_rx,
            pid,
        })
    }

    async fn run(mut self) {
        // For resume, emit Connected immediately — the CLI won't output
        // system/init until it receives a user message on stdin.
        if let Some(sid) = self.resume_session_id.take() {
            self.session_id = Some(sid.clone());
            self.seq += 1;
            let msg = ServerMessage::Connected {
                epoch: 0,
                session_id: sid,
                seq: self.seq,
                reconnect_token: Some(format!("tok_{}", uuid::Uuid::new_v4())),
            };
            let _ = self.event_tx.send(msg);
        }

        let mut stdout_rx = self.transport.stdout_rx();

        loop {
            tokio::select! {
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
                            tracing::debug!("All command senders dropped, stopping actor");
                            let _ = self.transport.kill().await;
                            return;
                        }
                    }
                }
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
            // Detect session_init → emit Connected
            if let ChatEvent::SessionInit { ref session_id, .. } = event {
                if self.session_id.is_none() {
                    self.session_id = Some(session_id.clone());
                    let msg = ServerMessage::Connected {
                        epoch: 0,
                        session_id: session_id.clone(),
                        seq: self.seq,
                        reconnect_token: Some(format!("tok_{}", uuid::Uuid::new_v4())),
                    };
                    let _ = self.event_tx.send(msg);
                }
            }

            // Detect turn_complete → chain next queued message
            if matches!(&event, ChatEvent::TurnComplete { .. }) {
                self.active_turn = false;
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

            // Emit event
            self.seq += 1;
            let _ = self.event_tx.send(ServerMessage::Event {
                seq: self.seq,
                event,
            });
        }
    }

    async fn handle_process_exit(&mut self) {
        self.active_turn = false;
        if !self.pending_messages.is_empty() {
            tracing::warn!(
                count = self.pending_messages.len(),
                "CLI exited with queued messages; discarding"
            );
            self.pending_messages.clear();
        }
        let _ = self.event_tx.send(ServerMessage::Disconnected {
            reason: "CLI process exited".to_string(),
        });
    }

    async fn write_stdin(&mut self, data: &str) -> Result<(), String> {
        let stdin = self.stdin.as_mut().ok_or("stdin not available")?;
        stdin
            .write_all(data.as_bytes())
            .await
            .map_err(|e| format!("stdin write: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("stdin flush: {}", e))?;
        Ok(())
    }
}
