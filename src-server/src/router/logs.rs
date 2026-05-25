use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::{
    Json, Router,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub fn routes(log_dir: String) -> Router {
    let state = Arc::new(log_dir);
    Router::new()
        .route("/logs", post(ingest_logs))
        .route("/logs/files", get(list_files))
        .route("/logs/content", get(read_content))
        .with_state(state)
}

// ── Ingest (existing) ──────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrontendLogEntry {
    #[allow(dead_code)]
    ts: String,
    level: String,
    category: String,
    message: String,
    session_id: String,
    request_id: Option<String>,
    meta: Option<serde_json::Value>,
}

async fn ingest_logs(Json(entries): Json<Vec<FrontendLogEntry>>) -> StatusCode {
    for entry in &entries {
        let rid = entry.request_id.as_deref().unwrap_or("");
        match entry.level.as_str() {
            "error" => tracing::error!(
                source = "frontend",
                category = %entry.category,
                session_id = %entry.session_id,
                request_id = %rid,
                meta = ?entry.meta,
                "{}", entry.message,
            ),
            "warn" => tracing::warn!(
                source = "frontend",
                category = %entry.category,
                session_id = %entry.session_id,
                request_id = %rid,
                meta = ?entry.meta,
                "{}", entry.message,
            ),
            "info" => tracing::info!(
                source = "frontend",
                category = %entry.category,
                session_id = %entry.session_id,
                request_id = %rid,
                "{}", entry.message,
            ),
            _ => tracing::debug!(
                source = "frontend",
                category = %entry.category,
                session_id = %entry.session_id,
                request_id = %rid,
                "{}", entry.message,
            ),
        }
    }
    StatusCode::NO_CONTENT
}

// ── List log files ─────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogFileInfo {
    name: String,
    size_bytes: u64,
    date: String,
}

async fn list_files(State(log_dir): State<Arc<String>>) -> Json<serde_json::Value> {
    let dir = Path::new(log_dir.as_str());
    let mut files: Vec<LogFileInfo> = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".log") {
                continue;
            }
            let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let date = extract_date_from_filename(&name);
            files.push(LogFileInfo {
                name,
                size_bytes,
                date,
            });
        }
    }

    // Sort: newest date first, within same date prefer main log over error log
    files.sort_by(|a, b| {
        b.date.cmp(&a.date).then_with(|| {
            let a_is_error = a.name.contains("-error");
            let b_is_error = b.name.contains("-error");
            a_is_error.cmp(&b_is_error)
        })
    });

    Json(serde_json::json!({ "files": files }))
}

fn extract_date_from_filename(name: &str) -> String {
    // Pattern: agent-panel.2026-05-10.log or agent-panel-error.2026-05-10.log
    let parts: Vec<&str> = name.split('.').collect();
    if parts.len() >= 3 {
        let candidate = parts[parts.len() - 2];
        // Validate YYYY-MM-DD pattern
        if candidate.len() == 10 && candidate.chars().nth(4) == Some('-') {
            return candidate.to_string();
        }
    }
    String::new()
}

// ── Read log content ───────────────────────────────────────

#[derive(Deserialize)]
struct ContentParams {
    file: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParsedLogEntry {
    timestamp: String,
    level: String,
    target: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    span: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fields: Option<serde_json::Value>,
}

async fn read_content(
    State(log_dir): State<Arc<String>>,
    Query(params): Query<ContentParams>,
) -> Json<serde_json::Value> {
    // Security: prevent directory traversal
    let filename = &params.file;
    if filename.contains("..")
        || filename.contains('/')
        || filename.contains('\\')
        || !filename.ends_with(".log")
    {
        return Json(serde_json::json!({ "error": "invalid filename" }));
    }

    let file_path = PathBuf::from(log_dir.as_str()).join(filename);
    if !file_path.exists() {
        return Json(serde_json::json!({ "error": "file not found" }));
    }

    let file = match fs::File::open(&file_path) {
        Ok(f) => f,
        Err(e) => return Json(serde_json::json!({ "error": format!("open: {e}") })),
    };

    let reader = BufReader::new(file);
    let mut entries: Vec<ParsedLogEntry> = Vec::new();
    let mut total_lines = 0u64;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.is_empty() {
            continue;
        }
        total_lines += 1;

        let json: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => {
                // Non-JSON line — include as raw text
                entries.push(ParsedLogEntry {
                    timestamp: String::new(),
                    level: "INFO".to_string(),
                    target: String::new(),
                    message: line,
                    span: None,
                    fields: None,
                });
                continue;
            }
        };

        let timestamp = json
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let level = json
            .get("level")
            .and_then(|v| v.as_str())
            .unwrap_or("INFO")
            .to_string();
        let target = json
            .get("target")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Extract message from fields.message
        let fields_obj = json.get("fields");
        let message = fields_obj
            .and_then(|f| f.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Format span info
        let span = json.get("span").map(|s| format_span(s));

        // Collect remaining fields (exclude "message" since we extracted it)
        let fields = fields_obj.and_then(|f| {
            if let Some(obj) = f.as_object() {
                let filtered: serde_json::Map<String, serde_json::Value> = obj
                    .iter()
                    .filter(|(k, _)| k.as_str() != "message")
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
                if filtered.is_empty() {
                    None
                } else {
                    Some(serde_json::Value::Object(filtered))
                }
            } else {
                None
            }
        });

        entries.push(ParsedLogEntry {
            timestamp,
            level,
            target,
            message,
            span,
            fields,
        });
    }

    Json(serde_json::json!({
        "file": filename,
        "entries": entries,
        "totalLines": total_lines,
    }))
}

fn format_span(span: &serde_json::Value) -> String {
    if let Some(obj) = span.as_object() {
        let parts: Vec<String> = obj
            .iter()
            .filter(|(k, _)| k.as_str() != "name")
            .map(|(k, v)| {
                let val = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                format!("{k}={val}")
            })
            .collect();
        let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if parts.is_empty() {
            name.to_string()
        } else {
            format!("{name} {{ {} }}", parts.join(" "))
        }
    } else {
        span.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_date_from_filename_standard() {
        assert_eq!(
            extract_date_from_filename("agent-panel.2026-05-10.log"),
            "2026-05-10"
        );
    }

    #[test]
    fn test_extract_date_from_filename_error_log() {
        assert_eq!(
            extract_date_from_filename("agent-panel-error.2026-05-10.log"),
            "2026-05-10"
        );
    }

    #[test]
    fn test_extract_date_from_filename_no_date() {
        assert_eq!(extract_date_from_filename("agent-panel.log"), "");
    }

    #[test]
    fn test_extract_date_from_filename_invalid_date() {
        assert_eq!(extract_date_from_filename("agent-panel.not-a-date.log"), "");
    }

    #[test]
    fn test_extract_date_from_filename_short_name() {
        assert_eq!(extract_date_from_filename("x.log"), "");
    }

    #[test]
    fn test_format_span_with_name_and_fields() {
        let span = serde_json::json!({"name": "request", "method": "GET", "path": "/api"});
        let result = format_span(&span);
        assert!(result.starts_with("request {"));
        assert!(result.contains("method=GET"));
        assert!(result.contains("path=/api"));
    }

    #[test]
    fn test_format_span_name_only() {
        let span = serde_json::json!({"name": "handler"});
        assert_eq!(format_span(&span), "handler");
    }

    #[test]
    fn test_format_span_empty_object() {
        let span = serde_json::json!({});
        assert_eq!(format_span(&span), "");
    }

    #[test]
    fn test_format_span_non_object() {
        let span = serde_json::json!("just a string");
        assert_eq!(format_span(&span), "\"just a string\"");
    }

    #[test]
    fn test_format_span_numeric_field() {
        let span = serde_json::json!({"name": "db", "duration_ms": 42});
        let result = format_span(&span);
        assert!(result.contains("duration_ms=42"));
    }
}
