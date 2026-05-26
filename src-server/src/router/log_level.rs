use axum::{Json, Router, extract::State, routing::get};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tracing_subscriber::{EnvFilter, reload};

#[derive(Clone)]
pub struct LogLevelState {
    pub handle: reload::Handle<EnvFilter, tracing_subscriber::Registry>,
    current_level: Arc<RwLock<String>>,
}

#[derive(Serialize)]
struct LogLevelResponse {
    level: String,
}

#[derive(Deserialize)]
struct SetLogLevelRequest {
    level: String,
}

async fn get_log_level(State(state): State<Arc<LogLevelState>>) -> Json<LogLevelResponse> {
    let level = state.current_level.read().unwrap_or_else(|e| e.into_inner()).clone();
    Json(LogLevelResponse { level })
}

async fn set_log_level(
    State(state): State<Arc<LogLevelState>>,
    Json(body): Json<SetLogLevelRequest>,
) -> Json<LogLevelResponse> {
    let filter = match body.level.as_str() {
        "off" => EnvFilter::new("off"),
        level => EnvFilter::new(format!("agent_panel_server={level},tower_http={level}")),
    };

    match state.handle.reload(filter) {
        Ok(()) => {
            tracing::info!(new_level = %body.level, "log level changed");
            if let Ok(mut w) = state.current_level.write() {
                *w = body.level.clone();
            }
            Json(LogLevelResponse { level: body.level })
        }
        Err(e) => {
            tracing::error!(error = %e, "failed to change log level");
            Json(LogLevelResponse {
                level: "error".to_string(),
            })
        }
    }
}

pub fn routes(handle: reload::Handle<EnvFilter, tracing_subscriber::Registry>) -> Router {
    let state = Arc::new(LogLevelState {
        handle,
        current_level: Arc::new(RwLock::new("info".to_string())),
    });
    Router::new()
        .route("/log-level", get(get_log_level).post(set_log_level))
        .with_state(state)
}
