use axum::{Json, Router, routing::post};
use serde::Deserialize;

use crate::search::{self, SearchFilters, full_text};

#[derive(Deserialize)]
struct SearchRequest {
    query: String,
    #[serde(default)]
    filters: Option<SearchFilters>,
    #[serde(default)]
    limit: Option<usize>,
    #[serde(default)]
    offset: Option<usize>,
}

pub fn routes() -> Router {
    Router::new().route("/search/messages", post(search_messages))
}

async fn search_messages(Json(body): Json<SearchRequest>) -> Json<search::SearchResponse> {
    let query = body.query.trim().to_string();
    let filter_summary = body
        .filters
        .as_ref()
        .map(|f| {
            let mut parts = Vec::new();
            if let Some(ref mt) = f.message_type {
                parts.push(format!("type={mt}"));
            }
            if !f.projects.is_empty() {
                parts.push(format!("projects={}", f.projects.join(",")));
            }
            if let Some(ref d) = f.date_from {
                parts.push(format!("from={d}"));
            }
            if let Some(ref d) = f.date_to {
                parts.push(format!("to={d}"));
            }
            if f.has_tool_calls == Some(true) {
                parts.push("has_tools".into());
            }
            if f.has_errors == Some(true) {
                parts.push("has_errors".into());
            }
            if f.has_file_changes == Some(true) {
                parts.push("has_files".into());
            }
            parts.join(" ")
        })
        .unwrap_or_default();
    tracing::info!(
        query = %query,
        filters = %filter_summary,
        limit = ?body.limit,
        offset = ?body.offset,
        "search_messages request",
    );
    if query.len() < 2 {
        return Json(search::SearchResponse {
            query,
            hits: vec![],
            total_matches: 0,
            search_time_ms: 0,
        });
    }

    let filters = body.filters.unwrap_or(SearchFilters {
        message_type: None,
        projects: vec![],
        date_from: None,
        date_to: None,
        ..Default::default()
    });

    let response = full_text::search_all_sessions(&query, &filters, body.limit, body.offset);
    Json(response)
}
