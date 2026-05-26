//! WebSocket endpoint — streams file watcher events to connected clients.

use axum::{
    Router,
    extract::State,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
};
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::watcher::{EventSender, WatchEvent};

pub fn routes(tx: EventSender) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .with_state(Arc::new(tx))
}

async fn ws_handler(ws: WebSocketUpgrade, State(tx): State<Arc<EventSender>>) -> impl IntoResponse {
    tracing::info!("ws client connecting");
    let rx = tx.subscribe();
    ws.on_upgrade(move |socket| handle_socket(socket, rx))
}

async fn handle_socket(mut socket: WebSocket, mut rx: broadcast::Receiver<WatchEvent>) {
    tracing::info!("ws client connected");
    loop {
        tokio::select! {
            // Forward watcher events to client
            Ok(event) = rx.recv() => {
                let json = match serde_json::to_string(&event) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break; // Client disconnected
                }
            }
            // Handle incoming messages (ping/pong, close)
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::info!("ws client disconnected");
                        break;
                    }
                    #[allow(clippy::collapsible_match)]
                    Some(Ok(Message::Ping(data))) => {
                        if socket.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    _ => {} // Ignore other messages
                }
            }
        }
    }
}
