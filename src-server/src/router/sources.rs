use axum::{routing::get, Json, Router};
use crate::scanner::skills::scan_skills;

pub fn routes() -> Router {
    Router::new()
        .route("/sources", get(list_sources))
}

async fn list_sources() -> Json<serde_json::Value> {
    let skills = scan_skills();

    // Count by source
    let mut source_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for s in &skills {
        *source_counts.entry(s.source.clone()).or_insert(0) += 1;
    }

    let sources: Vec<serde_json::Value> = source_counts.iter()
        .map(|(source, count)| serde_json::json!({
            "type": source,
            "count": count,
        }))
        .collect();

    tracing::info!(source_types = sources.len(), "list_sources → ok");
    Json(serde_json::json!({ "sources": sources }))
}
