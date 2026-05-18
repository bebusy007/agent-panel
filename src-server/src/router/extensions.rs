use axum::{routing::get, Json, Router};
use crate::scanner::extensions;

pub fn routes() -> Router {
    Router::new()
        .route("/extensions/hooks", get(list_hooks))
        .route("/extensions/agents", get(list_agents))
        .route("/extensions/plugins", get(list_plugins))
        .route("/extensions/commands", get(list_commands))
        .route("/extensions/summary", get(summary))
}

async fn list_commands() -> Json<serde_json::Value> {
    let skills = crate::scanner::skills::scan_skills();
    let mut commands: Vec<serde_json::Value> = Vec::new();

    for skill in &skills {
        for cmd in &skill.cli_commands {
            commands.push(serde_json::json!({
                "command": cmd,
                "skill": skill.name,
                "source": skill.source,
            }));
        }
    }

    tracing::info!(total = commands.len(), "list_commands → ok");
    Json(serde_json::json!({ "commands": commands, "total": commands.len() }))
}

async fn list_hooks() -> Json<serde_json::Value> {
    let hooks = extensions::scan_hooks();
    tracing::info!(total = hooks.len(), "list_hooks → ok");
    Json(serde_json::json!({ "hooks": hooks }))
}

async fn list_agents() -> Json<serde_json::Value> {
    let agents = extensions::scan_agents();
    tracing::info!(total = agents.len(), "list_agents → ok");
    Json(serde_json::json!({ "agents": agents }))
}

async fn list_plugins() -> Json<serde_json::Value> {
    let plugins = extensions::scan_plugins();
    tracing::info!(total = plugins.len(), "list_plugins → ok");
    Json(serde_json::json!({ "plugins": plugins }))
}

async fn summary() -> Json<serde_json::Value> {
    let hooks = extensions::scan_hooks();
    let agents = extensions::scan_agents();
    let plugins = extensions::scan_plugins();

    tracing::info!(hooks = hooks.len(), agents = agents.len(), plugins = plugins.len(), "extensions_summary → ok");
    Json(serde_json::json!({
        "hooks": hooks.len(),
        "agents": agents.len(),
        "plugins": plugins.len(),
    }))
}
