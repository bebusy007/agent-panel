use crate::scanner::mcps::scan_mcps;
use axum::{Json, Router, extract::Path, routing::get};

pub fn routes() -> Router {
    Router::new()
        .route("/mcps", get(list_mcps))
        .route("/mcps/{name}", get(get_mcp))
}

async fn list_mcps() -> Json<serde_json::Value> {
    let mcps = scan_mcps();
    tracing::info!(total = mcps.len(), "list_mcps → ok");
    Json(serde_json::json!({
        "mcps": mcps,
        "total": mcps.len(),
    }))
}

async fn get_mcp(Path(name): Path<String>) -> Json<serde_json::Value> {
    let decoded = urlencoding::decode(&name).unwrap_or_default();
    tracing::info!(mcp_name = %decoded, "get_mcp request");
    let mcps = scan_mcps();
    match mcps.into_iter().find(|m| m.server_name == decoded.as_ref()) {
        Some(mcp) => {
            tracing::info!(mcp_name = %decoded, tools = mcp.tool_count, "get_mcp → found");
            Json(serde_json::json!({ "mcp": mcp }))
        }
        None => {
            tracing::warn!(mcp_name = %decoded, "get_mcp → not found");
            Json(serde_json::json!({ "error": "not found" }))
        }
    }
}
