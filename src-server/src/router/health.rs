use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

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
