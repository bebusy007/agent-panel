use axum::{extract::Path, routing::get, Json, Router};
use crate::scanner::skills::scan_skills;

pub fn routes() -> Router {
    Router::new()
        .route("/skills", get(list_skills))
        .route("/skills/{id}", get(get_skill))
}

async fn list_skills() -> Json<serde_json::Value> {
    let skills = scan_skills();
    tracing::info!(total = skills.len(), "list_skills → ok");
    Json(serde_json::json!({
        "skills": skills,
        "total": skills.len(),
    }))
}

async fn get_skill(Path(id): Path<String>) -> Json<serde_json::Value> {
    let decoded_id = urlencoding::decode(&id).unwrap_or_default();
    tracing::info!(skill_id = %decoded_id, "get_skill request");
    let skills = scan_skills();
    match skills.into_iter().find(|s| s.id == decoded_id.as_ref() || s.name == decoded_id.as_ref()) {
        Some(skill) => {
            tracing::info!(skill_id = %decoded_id, name = %skill.name, source = %skill.source, "get_skill → found");
            Json(serde_json::json!({ "skill": skill }))
        }
        None => {
            tracing::warn!(skill_id = %decoded_id, "get_skill → not found");
            Json(serde_json::json!({ "error": "not found" }))
        }
    }
}
