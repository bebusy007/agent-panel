use axum::{Json, Router, routing::get};
use serde_json::{Value, json};

pub fn routes() -> Router {
    Router::new().route("/health", get(health_check))
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "server": "agent-panel-server",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
