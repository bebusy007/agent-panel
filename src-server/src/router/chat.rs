use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};

use crate::conversation::manager::SessionManager;
use crate::conversation::types::*;

#[derive(serde::Deserialize)]
pub struct NewSessionQuery {
    cwd: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    permission_mode: Option<String>,
}

#[derive(serde::Deserialize, Default)]
pub struct ResumeSessionQuery {
    #[serde(default)]
    token: Option<String>,
}

pub fn routes(manager: SessionManager) -> Router {
    Router::new()
        .route("/ws/chat/resume/{session_id}", get(ws_resume_handler))
        .route("/ws/chat/new", get(ws_new_handler))
        .with_state(manager)
}

async fn ws_resume_handler(
    ws: WebSocketUpgrade,
    Path(session_id): Path<String>,
    Query(params): Query<ResumeSessionQuery>,
    State(manager): State<SessionManager>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| {
        handle_ws_session(socket, manager, SpawnMode::Resume { session_id }, None, params.token)
    })
}

async fn ws_new_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<NewSessionQuery>,
    State(manager): State<SessionManager>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| {
        handle_ws_session(socket, manager, SpawnMode::New, Some(params.cwd), None)
    })
}

async fn handle_ws_session(
    mut socket: WebSocket,
    manager: SessionManager,
    mode: SpawnMode,
    cwd: Option<String>,
    reconnect_token: Option<String>,
) {
    let config = SpawnConfig {
        mode: mode.clone(),
        cwd: cwd.unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "/tmp".to_string())
        }),
        model: None,
        permission_mode: None,
        cli_path: None,
    };

    let connect_result = manager.connect(config, reconnect_token).await;

    let (mut event_rx, session_key, _token) = match connect_result {
        Ok(result) => result,
        Err(e) => {
            let error_msg = ServerMessage::Error {
                code: e.clone(),
                message: format!("Connection failed: {}", e),
            };
            let json = serde_json::to_string(&error_msg).unwrap_or_default();
            let _ = socket.send(Message::Text(json.into())).await;
            let _ = socket.send(Message::Close(None)).await;
            return;
        }
    };

    // Main loop: forward events and handle incoming messages
    loop {
        tokio::select! {
            // Forward server events to WebSocket client
            event = event_rx.recv() => {
                match event {
                    Ok(msg) => {
                        let json = match serde_json::to_string(&msg) {
                            Ok(j) => j,
                            Err(_) => continue,
                        };
                        if socket.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        let disc = ServerMessage::Disconnected {
                            reason: "session ended".to_string(),
                        };
                        let json = serde_json::to_string(&disc).unwrap_or_default();
                        let _ = socket.send(Message::Text(json.into())).await;
                        break;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(skipped = n, "WebSocket event consumer lagged");
                    }
                }
            }
            // Handle incoming WebSocket messages from client
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(should_break) = handle_client_message(
                            &text, &manager, &session_key
                        ).await {
                            if should_break {
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }

    // WebSocket closed — notify manager for 30s reconnect window
    manager.ws_disconnected(&session_key).await;
}

/// Process a client message. Returns Err(true) if connection should close.
async fn handle_client_message(
    text: &str,
    manager: &SessionManager,
    session_key: &str,
) -> Result<(), bool> {
    let client_msg: ClientMessage = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!(error = %e, "Invalid client message JSON");
            return Ok(());
        }
    };

    match client_msg {
        ClientMessage::UserMessage { text, attachments } => {
            if let Err(e) = manager.send_message(session_key, text, attachments).await {
                tracing::error!(error = %e, "send_message failed");
            }
        }
        ClientMessage::PermissionResponse {
            request_id,
            decision,
        } => {
            if let Err(e) = manager
                .send_permission(session_key, request_id, decision)
                .await
            {
                tracing::error!(error = %e, "send_permission failed");
            }
        }
        ClientMessage::Interrupt {} => {
            if let Err(e) = manager.interrupt(session_key).await {
                tracing::error!(error = %e, "interrupt failed");
            }
        }
        ClientMessage::Disconnect {} => {
            let _ = manager.disconnect(session_key).await;
            return Err(true);
        }
        ClientMessage::RewindFiles {
            request_id,
            user_message_id,
            dry_run,
            files,
        } => {
            // Rewind is sent as a control_request to CLI stdin
            // The response comes back through the event stream
            let line = crate::conversation::build_rewind_request(
                &request_id,
                &user_message_id,
                dry_run,
                files.as_deref(),
            );
            // We need to write directly to the actor's stdin — for now, treat as a message
            // TODO: Add dedicated rewind command to ActorCommand enum for proper handling
            tracing::info!(request_id, user_message_id, dry_run, "Rewind request");
        }
    }

    Ok(())
}
