use axum::{Json, Router, extract::State, routing::get};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing_subscriber::{EnvFilter, reload};

#[derive(Clone)]
pub struct LogLevelState {
    pub handle: reload::Handle<EnvFilter, tracing_subscriber::Registry>,
}

#[derive(Serialize)]
struct LogLevelResponse {
    level: String,
}

#[derive(Deserialize)]
struct SetLogLevelRequest {
    level: String,
}

async fn get_log_level() -> Json<LogLevelResponse> {
    // Return a generic level since we can't easily read the current filter
    Json(LogLevelResponse {
        level: "info".to_string(),
    })
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
    let state = Arc::new(LogLevelState { handle });
    Router::new()
        .route("/log-level", get(get_log_level).post(set_log_level))
        .with_state(state)
}
