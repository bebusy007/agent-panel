use crate::scanner::{session_loader, sessions};
use axum::{
    Json, Router,
    extract::{Path, Query},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;

pub fn routes() -> Router {
    Router::new()
        .route(
            "/sessions/{session_id}/images/{message_id}/{index}",
            get(serve_image),
        )
        .route("/open-folder", post(open_folder))
}

#[derive(Deserialize)]
struct ImageQuery {
    #[serde(default)]
    cache_path: Option<String>,
}

async fn serve_image(
    Path((session_id, message_id, index)): Path<(String, String, u32)>,
    Query(query): Query<ImageQuery>,
) -> Response {
    // Fast path: if cache_path is provided and the file exists, serve it directly
    if let Some(ref cp) = query.cache_path {
        let p = std::path::Path::new(cp);
        if p.is_file()
            && let Ok(bytes) = std::fs::read(p) {
                let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("png");
                let media = match ext {
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    _ => "application/octet-stream",
                };
                return (
                    StatusCode::OK,
                    [
                        (header::CONTENT_TYPE, media.to_string()),
                        (
                            header::CACHE_CONTROL,
                            format!("public, max-age={}", crate::constants::IMAGE_CACHE_MAX_AGE),
                        ),
                        (header::CONTENT_LENGTH, bytes.len().to_string()),
                    ],
                    bytes,
                )
                    .into_response();
            }
    }

    let result = sessions::scan_all_sessions();
    let session = match result.sessions.iter().find(|s| s.id == session_id) {
        Some(s) => s,
        None => return (StatusCode::NOT_FOUND, "session not found").into_response(),
    };

    let jsonl_path = std::path::Path::new(&session.file_path);
    if !jsonl_path.exists() {
        return (StatusCode::NOT_FOUND, "session file not found").into_response();
    }

    let message_uuid = extract_uuid_from_message_id(&message_id);
    let session_id_raw = session.session_id_raw.as_deref();

    match session_loader::resolve_image(jsonl_path, session_id_raw, &message_uuid, index) {
        Ok((bytes, media_type)) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, media_type),
                (
                    header::CACHE_CONTROL,
                    format!("public, max-age={}", crate::constants::IMAGE_CACHE_MAX_AGE),
                ),
                (header::CONTENT_LENGTH, bytes.len().to_string()),
            ],
            bytes,
        )
            .into_response(),
        Err(e) => {
            tracing::debug!(session_id = %session_id, message_id = %message_id, index, error = %e, "image not resolved");
            (StatusCode::NOT_FOUND, "image not found").into_response()
        }
    }
}

#[derive(Deserialize)]
struct OpenFolderBody {
    path: String,
}

/// Validate a path for the open-folder endpoint.
/// Returns `Some((is_file, directory))` if the path is valid, `None` if not found.
fn resolve_open_target(path: &str) -> Option<(bool, std::path::PathBuf)> {
    let file_path = std::path::Path::new(path);
    if file_path.is_file() {
        file_path.parent().map(|d| (true, d.to_path_buf()))
    } else if file_path.is_dir() {
        Some((false, file_path.to_path_buf()))
    } else {
        None
    }
}

async fn open_folder(Json(body): Json<OpenFolderBody>) -> Response {
    let (is_file, dir) = match resolve_open_target(&body.path) {
        Some(t) => t,
        None => return (StatusCode::NOT_FOUND, "path not found").into_response(),
    };

    let result = if is_file {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&body.path)
            .spawn()
    } else {
        std::process::Command::new("open").arg(&dir).spawn()
    };

    match result {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({"ok": true}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to open: {e}"),
        )
            .into_response(),
    }
}

/// Extract the UUID portion from a message ID.
/// Message IDs are formatted as "{uuid}-b{idx}" or "{uuid}-{idx}".
fn extract_uuid_from_message_id(message_id: &str) -> String {
    // Message ID: "{uuid}-b{N}" or "{uuid}-{N}"
    // Split on "-b" suffix pattern or take first UUID_LEN chars if it looks like a UUID
    if message_id.len() >= crate::constants::UUID_LEN {
        let potential_uuid = &message_id[..crate::constants::UUID_LEN];
        if potential_uuid.chars().filter(|c| *c == '-').count() == 4 {
            return potential_uuid.to_string();
        }
    }
    // Fallback: return as-is
    message_id.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_uuid_standard() {
        let msg_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890-b3";
        let uuid = extract_uuid_from_message_id(msg_id);
        assert_eq!(uuid, "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    }

    #[test]
    fn test_extract_uuid_no_suffix() {
        let msg_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        let uuid = extract_uuid_from_message_id(msg_id);
        assert_eq!(uuid, "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    }

    #[test]
    fn test_extract_uuid_with_numeric_suffix() {
        let msg_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890-5";
        let uuid = extract_uuid_from_message_id(msg_id);
        assert_eq!(uuid, "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    }

    #[test]
    fn test_extract_uuid_short_string() {
        let msg_id = "short-id";
        let uuid = extract_uuid_from_message_id(msg_id);
        assert_eq!(uuid, "short-id");
    }

    #[test]
    fn test_extract_uuid_empty() {
        let uuid = extract_uuid_from_message_id("");
        assert_eq!(uuid, "");
    }

    #[test]
    fn test_extract_uuid_no_dashes_in_prefix() {
        let msg_id = "abcdefghijklmnopqrstuvwxyz0123456789-b1";
        let uuid = extract_uuid_from_message_id(msg_id);
        assert_eq!(uuid, msg_id);
    }

    #[test]
    fn test_extract_uuid_exact_length() {
        let msg_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        assert_eq!(msg_id.len(), crate::constants::UUID_LEN);
        let uuid = extract_uuid_from_message_id(msg_id);
        assert_eq!(uuid, msg_id);
    }

    #[test]
    fn test_resolve_open_target_nonexistent() {
        assert!(resolve_open_target("/nonexistent/path/xyz").is_none());
    }

    #[test]
    fn test_resolve_open_target_directory() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = resolve_open_target(dir.path().to_str().unwrap());
        assert!(result.is_some());
        let (is_file, path) = result.unwrap();
        assert!(!is_file);
        assert_eq!(path, dir.path());
    }

    #[test]
    fn test_resolve_open_target_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let file = dir.path().join("test.png");
        std::fs::write(&file, "fake").unwrap();
        let result = resolve_open_target(file.to_str().unwrap());
        assert!(result.is_some());
        let (is_file, path) = result.unwrap();
        assert!(is_file);
        assert_eq!(path, dir.path());
    }
}
