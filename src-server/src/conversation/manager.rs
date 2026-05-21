use crate::conversation::session_actor::{ActorCommand, SessionActor, SessionActorHandle};
use crate::conversation::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};

/// Manages all active CLI sessions. Thread-safe, shared via Arc.
#[derive(Clone)]
pub struct SessionManager {
    inner: Arc<Mutex<ManagerInner>>,
}

struct ManagerInner {
    sessions: HashMap<String, ActiveSession>,
}

struct ActiveSession {
    handle: SessionActorHandle,
    reconnect_token: String,
    ws_connected: bool,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(ManagerInner {
                sessions: HashMap::new(),
            })),
        }
    }

    /// Connect to a session (resume or new). Returns (event_rx, session_key, reconnect_token).
    /// For resume: session_key = session_id.
    /// For new: session_key = temporary connection_id (until SessionInit arrives).
    pub async fn connect(
        &self,
        config: SpawnConfig,
        reconnect_token: Option<String>,
    ) -> Result<(broadcast::Receiver<ServerMessage>, String, String), String> {
        let mut inner = self.inner.lock().await;

        // For resume mode, check if session already connected
        if let SpawnMode::Resume { ref session_id } = config.mode {
            if let Some(session) = inner.sessions.get(session_id) {
                // Check reconnect token for returning client
                if let Some(ref token) = reconnect_token {
                    if *token == session.reconnect_token && !session.ws_connected {
                        // Reconnecting client — return existing event stream
                        let rx = session.handle.event_rx.resubscribe();
                        let tok = session.reconnect_token.clone();
                        // Mark as connected
                        inner.sessions.get_mut(session_id).unwrap().ws_connected = true;
                        return Ok((rx, session_id.clone(), tok));
                    }
                }

                if session.ws_connected {
                    return Err("already_connected".to_string());
                }
            }
        }

        // Spawn new actor
        let handle = SessionActor::spawn(config.clone()).await?;
        let event_rx = handle.event_rx.resubscribe();

        let token = generate_token();
        let session_key = match &config.mode {
            SpawnMode::Resume { session_id } => session_id.clone(),
            SpawnMode::New => format!("conn_{}", uuid::Uuid::new_v4()),
        };

        inner.sessions.insert(
            session_key.clone(),
            ActiveSession {
                handle,
                reconnect_token: token.clone(),
                ws_connected: true,
            },
        );

        Ok((event_rx, session_key, token))
    }

    /// Mark a WebSocket as disconnected. Starts the 30s timeout.
    pub async fn ws_disconnected(&self, session_key: &str) {
        let mut inner = self.inner.lock().await;
        if let Some(session) = inner.sessions.get_mut(session_key) {
            session.ws_connected = false;
        }

        // Spawn cleanup task
        let manager = self.clone();
        let key = session_key.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            manager.cleanup_if_disconnected(&key).await;
        });
    }

    /// Remove session if still disconnected after timeout.
    async fn cleanup_if_disconnected(&self, session_key: &str) {
        let mut inner = self.inner.lock().await;
        if let Some(session) = inner.sessions.get(session_key) {
            if !session.ws_connected {
                tracing::info!(session_key, "30s reconnect timeout, stopping session");
                let cmd_tx = session.handle.cmd_tx.clone();
                drop(inner); // Release lock before awaiting

                let (reply_tx, _reply_rx) = oneshot::channel();
                let _ = cmd_tx.send(ActorCommand::Stop { reply: reply_tx }).await;

                let mut inner = self.inner.lock().await;
                inner.sessions.remove(session_key);
            }
        }
    }

    /// Send a user message to a session.
    pub async fn send_message(
        &self,
        session_key: &str,
        text: String,
        attachments: Vec<AttachmentData>,
    ) -> Result<String, String> {
        let inner = self.inner.lock().await;
        let session = inner
            .sessions
            .get(session_key)
            .ok_or_else(|| "session not found".to_string())?;

        let (reply_tx, reply_rx) = oneshot::channel();
        session
            .handle
            .cmd_tx
            .send(ActorCommand::SendMessage {
                text,
                attachments,
                reply: reply_tx,
            })
            .await
            .map_err(|_| "actor dead".to_string())?;

        drop(inner);
        reply_rx.await.map_err(|_| "actor dropped reply".to_string())?
    }

    /// Send permission response.
    pub async fn send_permission(
        &self,
        session_key: &str,
        request_id: String,
        decision: PermissionDecision,
    ) -> Result<(), String> {
        let inner = self.inner.lock().await;
        let session = inner
            .sessions
            .get(session_key)
            .ok_or_else(|| "session not found".to_string())?;

        session
            .handle
            .cmd_tx
            .send(ActorCommand::SendPermission {
                request_id,
                decision,
            })
            .await
            .map_err(|_| "actor dead".to_string())
    }

    /// Send interrupt to session.
    pub async fn interrupt(&self, session_key: &str) -> Result<(), String> {
        let inner = self.inner.lock().await;
        let session = inner
            .sessions
            .get(session_key)
            .ok_or_else(|| "session not found".to_string())?;

        session
            .handle
            .cmd_tx
            .send(ActorCommand::Interrupt)
            .await
            .map_err(|_| "actor dead".to_string())
    }

    /// Explicitly disconnect/stop a session.
    pub async fn disconnect(&self, session_key: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let session = inner
            .sessions
            .remove(session_key)
            .ok_or_else(|| "session not found".to_string())?;

        let (reply_tx, reply_rx) = oneshot::channel();
        let _ = session.handle.cmd_tx.send(ActorCommand::Stop { reply: reply_tx }).await;
        drop(inner);

        reply_rx.await.map_err(|_| "actor dropped reply".to_string())?
    }

    /// Stop all sessions (for graceful shutdown).
    pub async fn shutdown_all(&self) {
        let mut inner = self.inner.lock().await;
        let keys: Vec<String> = inner.sessions.keys().cloned().collect();

        for key in keys {
            if let Some(session) = inner.sessions.remove(&key) {
                let (reply_tx, _) = oneshot::channel();
                let _ = session.handle.cmd_tx.send(ActorCommand::Stop { reply: reply_tx }).await;
            }
        }
    }

    /// Migrate a session from temporary connection_id to real session_id.
    pub async fn migrate_session_key(&self, old_key: &str, new_key: &str) {
        let mut inner = self.inner.lock().await;
        if let Some(session) = inner.sessions.remove(old_key) {
            inner.sessions.insert(new_key.to_string(), session);
        }
    }

    /// Get active session count.
    pub async fn active_count(&self) -> usize {
        let inner = self.inner.lock().await;
        inner.sessions.len()
    }

    /// Get all active PIDs for orphan tracking.
    pub async fn active_pids(&self) -> Vec<u32> {
        let inner = self.inner.lock().await;
        inner
            .sessions
            .values()
            .filter_map(|s| s.handle.pid)
            .collect()
    }
}

fn generate_token() -> String {
    format!("tok_{}", uuid::Uuid::new_v4())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_manager_is_clone_send_sync() {
        fn assert_all<T: Clone + Send + Sync>() {}
        assert_all::<SessionManager>();
    }

    #[tokio::test]
    async fn new_manager_has_zero_sessions() {
        let mgr = SessionManager::new();
        assert_eq!(mgr.active_count().await, 0);
    }

    #[tokio::test]
    async fn connect_nonexistent_cli_returns_error() {
        let mgr = SessionManager::new();
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("__nonexistent_cli__".to_string()),
        };

        let result = mgr.connect(config, None).await;
        assert!(result.is_err());
        assert_eq!(mgr.active_count().await, 0);
    }
}
