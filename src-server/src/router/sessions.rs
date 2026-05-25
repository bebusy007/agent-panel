use crate::router::resume::build_resume_hints;
use crate::scanner::{session_loader, sessions};
use axum::{
    Json, Router,
    extract::{Path, Query},
    routing::get,
};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
struct ListParams {
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    q: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
    #[serde(default)]
    sort_by: Option<String>,
}

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

pub fn routes() -> Router {
    Router::new()
        .route("/sessions", get(list_sessions))
        .route("/sessions/", get(list_sessions))
        .route("/sessions/projects", get(list_projects))
        .route("/sessions/search", get(search_sessions))
        .route("/sessions/health", get(health))
        .route("/sessions/refresh", axum::routing::post(refresh_sessions))
        .route("/sessions/{id}", get(get_session))
        .route("/sessions/{id}/search", get(search_in_session))
        .route("/sessions/{id}/export.md", get(export_session_md))
        .route("/sessions/{id}/subagent/{agent_hash}", get(get_subagent))
}

async fn get_subagent(Path((id, agent_hash)): Path<(String, String)>) -> Json<serde_json::Value> {
    tracing::info!(session_id = %id, agent_hash = %agent_hash, "get_subagent request");
    let result = sessions::scan_all_sessions();
    let session = match result.sessions.iter().find(|s| s.id == id) {
        Some(s) => s,
        None => return Json(serde_json::json!({ "error": "session not found" })),
    };

    if session.source != "claude-code" {
        return Json(
            serde_json::json!({ "error": "subagents only exist for claude-code sessions" }),
        );
    }

    // Subagent files live at: <session_file_without_.jsonl>/subagents/agent-<hash>.jsonl
    let base = session.file_path.trim_end_matches(".jsonl");
    let sub_path = format!("{}/subagents/agent-{}.jsonl", base, agent_hash);
    let sub_path = std::path::Path::new(&sub_path);

    if !sub_path.exists() {
        return Json(serde_json::json!({ "error": "subagent not found" }));
    }

    let messages = match session_loader::load_messages(sub_path) {
        Ok(msgs) => msgs,
        Err(e) => return Json(serde_json::json!({ "error": e })),
    };

    Json(serde_json::json!({
        "meta": {
            "agentHash": agent_hash,
            "messageCount": messages.len(),
            "filePath": sub_path.to_string_lossy(),
        },
        "messages": messages,
    }))
}

async fn health() -> Json<serde_json::Value> {
    let result = sessions::scan_all_sessions();
    Json(serde_json::json!({
        "status": "ok",
        "sessionCount": result.sessions.len(),
        "scanTimeMs": result.scan_time_ms,
    }))
}

async fn export_session_md(Path(id): Path<String>) -> axum::response::Response {
    use axum::http::header;
    use axum::response::IntoResponse;

    tracing::info!(session_id = %id, "export_session_md request");
    let result = sessions::scan_all_sessions();
    let session = match result.sessions.iter().find(|s| s.id == id) {
        Some(s) => s,
        None => return (axum::http::StatusCode::NOT_FOUND, "session not found").into_response(),
    };

    let messages = match session_loader::load_messages(std::path::Path::new(&session.file_path)) {
        Ok(msgs) => msgs,
        Err(e) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    // Build markdown
    let mut md = format!("# {}\n\n", session.title);
    if let Some(ref cwd) = session.cwd {
        md.push_str(&format!("> Project: `{}`\n\n", cwd));
    }
    md.push_str("---\n\n");

    for msg in &messages {
        match msg.role.as_str() {
            "user" => {
                md.push_str("## 👤 User\n\n");
                if let Some(ref text) = msg.text {
                    md.push_str(text);
                    md.push_str("\n\n");
                }
            }
            "assistant" => {
                md.push_str("## 🤖 Assistant\n\n");
                if let Some(ref text) = msg.text {
                    md.push_str(text);
                    md.push_str("\n\n");
                }
            }
            "tool_use" => {
                let name = msg.tool_name.as_deref().unwrap_or("tool");
                md.push_str(&format!("### 🔧 {}\n\n", name));
                if let Some(ref input) = msg.tool_input {
                    md.push_str(&format!(
                        "```json\n{}\n```\n\n",
                        serde_json::to_string_pretty(input).unwrap_or_default()
                    ));
                }
            }
            "tool_result" => {
                if let Some(ref output) = msg.tool_output {
                    let truncated = if output.len() > crate::constants::EXPORT_TOOL_OUTPUT_MAX_LEN {
                        &output[..crate::constants::EXPORT_TOOL_OUTPUT_MAX_LEN]
                    } else {
                        output.as_str()
                    };
                    md.push_str(&format!("```\n{}\n```\n\n", truncated));
                }
            }
            _ => {}
        }
    }

    let headers = [(header::CONTENT_TYPE, "text/markdown; charset=utf-8")];
    (headers, md).into_response()
}

async fn list_sessions(Query(params): Query<ListParams>) -> Json<serde_json::Value> {
    tracing::info!(
        source = params.source.as_deref().unwrap_or("all"),
        q = params.q.as_deref().unwrap_or(""),
        sort_by = params.sort_by.as_deref().unwrap_or("lastActivity"),
        limit = ?params.limit,
        "list_sessions request",
    );
    let result = sessions::scan_all_sessions();
    let mut sessions_list = result.sessions;

    // Filter by source
    if let Some(source) = &params.source {
        sessions_list.retain(|s| &s.source == source);
    }

    // Filter by query
    if let Some(q) = &params.q {
        let ql = q.to_lowercase();
        sessions_list.retain(|s| {
            s.title.to_lowercase().contains(&ql)
                || s.first_user_message
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .contains(&ql)
                || s.cwd.as_deref().unwrap_or("").to_lowercase().contains(&ql)
        });
    }

    // Sort
    let sort_by = params.sort_by.as_deref().unwrap_or("lastActivity");
    match sort_by {
        "tokens" => sessions_list.sort_by(|a, b| b.tokens_total.cmp(&a.tokens_total)),
        "messageCount" => sessions_list.sort_by(|a, b| b.message_count.cmp(&a.message_count)),
        "startedAt" => sessions_list.sort_by(|a, b| {
            b.started_at
                .as_deref()
                .unwrap_or("")
                .cmp(a.started_at.as_deref().unwrap_or(""))
        }),
        _ => sessions_list.sort_by(|a, b| {
            b.last_activity
                .as_deref()
                .unwrap_or("")
                .cmp(a.last_activity.as_deref().unwrap_or(""))
        }),
    }

    let total = sessions_list.len();
    if let Some(limit) = params.limit {
        sessions_list.truncate(limit);
    }

    tracing::info!(
        total = total,
        returned = sessions_list.len(),
        scan_time_ms = result.scan_time_ms,
        "list_sessions → ok"
    );

    Json(serde_json::json!({
        "total": total,
        "sessions": sessions_list,
        "scanTimeMs": result.scan_time_ms,
    }))
}

async fn list_projects() -> Json<serde_json::Value> {
    let result = sessions::scan_all_sessions();
    let mut projects: HashMap<String, Vec<&sessions::SessionSummary>> = HashMap::new();

    for s in &result.sessions {
        projects.entry(s.project_dir.clone()).or_default().push(s);
    }

    let mut project_list: Vec<serde_json::Value> = projects
        .iter()
        .map(|(dir, sessions)| {
            let total_tokens: u64 = sessions.iter().filter_map(|s| s.tokens_total).sum();
            let latest = sessions
                .iter()
                .filter_map(|s| s.last_activity.as_deref())
                .max()
                .unwrap_or("");

            serde_json::json!({
                "projectDir": dir,
                "sessionCount": sessions.len(),
                "totalTokens": total_tokens,
                "lastActivity": latest,
            })
        })
        .collect();

    project_list.sort_by(|a, b| {
        let ta = b["lastActivity"].as_str().unwrap_or("");
        let tb = a["lastActivity"].as_str().unwrap_or("");
        ta.cmp(tb)
    });

    Json(serde_json::json!({ "projects": project_list }))
}

async fn search_sessions(Query(params): Query<SearchParams>) -> Json<serde_json::Value> {
    let q = params.q.unwrap_or_default();
    tracing::info!(q = %q, limit = ?params.limit, "search_sessions request");
    if q.trim().len() < crate::constants::MIN_SEARCH_QUERY_LEN {
        return Json(serde_json::json!({ "hits": [], "total": 0 }));
    }

    let limit = params.limit.unwrap_or(crate::constants::DEFAULT_PAGE_LIMIT);

    // Use the full-text search engine for cross-session search
    let filters = crate::search::SearchFilters {
        message_type: None,
        projects: vec![],
        date_from: None,
        date_to: None,
        ..Default::default()
    };
    let response = crate::search::full_text::search_all_sessions(&q, &filters, Some(limit), None);

    Json(serde_json::json!({
        "q": q,
        "hits": response.hits,
        "total": response.total_matches,
        "searchTimeMs": response.search_time_ms,
    }))
}

async fn get_session(Path(id): Path<String>) -> Json<serde_json::Value> {
    tracing::info!(session_id = %id, "get_session request");
    let result = sessions::scan_all_sessions();

    let session = result.sessions.iter().find(|s| s.id == id);
    let session = match session {
        Some(s) => s,
        None => return Json(serde_json::json!({ "error": "session not found" })),
    };

    // Load full messages
    let messages = match session_loader::load_messages(std::path::Path::new(&session.file_path)) {
        Ok(msgs) => msgs,
        Err(e) => {
            tracing::warn!(session_id = %id, error = %e, "failed to load session messages");
            return Json(serde_json::json!({ "error": e }));
        }
    };

    // Discover subagents for claude-code sessions
    let subagents = if session.source == "claude-code" {
        session_loader::discover_subagents(&session.file_path)
    } else {
        vec![]
    };

    // Build resume hints
    let hints = build_resume_hints(
        &session.source,
        session.cwd.as_deref(),
        session.session_id_raw.as_deref(),
    );

    Json(serde_json::json!({
        "session": session,
        "messages": messages,
        "messageCount": messages.len(),
        "subagents": subagents,
        "resumeHints": hints,
    }))
}

async fn refresh_sessions() -> Json<serde_json::Value> {
    tracing::info!("refresh_sessions request");
    let result = sessions::scan_all_sessions();
    tracing::info!(
        session_count = result.sessions.len(),
        scan_time_ms = result.scan_time_ms,
        "refresh_sessions → ok"
    );
    Json(serde_json::json!({
        "ok": true,
        "sessionCount": result.sessions.len(),
        "scanTimeMs": result.scan_time_ms,
    }))
}

async fn search_in_session(
    Path(id): Path<String>,
    Query(params): Query<SearchParams>,
) -> Json<serde_json::Value> {
    let q = params.q.unwrap_or_default();
    tracing::info!(session_id = %id, q = %q, "search_in_session request");
    if q.trim().is_empty() {
        return Json(serde_json::json!({ "hits": [], "total": 0 }));
    }

    let result = sessions::scan_all_sessions();
    let session = match result.sessions.iter().find(|s| s.id == id) {
        Some(s) => s,
        None => return Json(serde_json::json!({ "error": "session not found" })),
    };

    let messages = match session_loader::load_messages(std::path::Path::new(&session.file_path)) {
        Ok(msgs) => msgs,
        Err(e) => return Json(serde_json::json!({ "error": e })),
    };

    let limit = params.limit.unwrap_or(crate::constants::DEFAULT_PAGE_LIMIT);
    let hits = session_loader::search_in_messages(&messages, &q, limit);

    Json(serde_json::json!({
        "q": q,
        "hits": hits,
        "total": hits.len(),
    }))
}
