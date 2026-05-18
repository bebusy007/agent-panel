use axum::{routing::get, Json, Router};

pub fn routes() -> Router {
    Router::new()
        .route("/version", get(get_version))
}

async fn get_version() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "agent-panel-server",
        "runtime": "rust",
    }))
}
