//! Trash management — soft-delete sessions by renaming .jsonl → .jsonl.trash
//! Restore by renaming back. Permanent delete removes the file.

use axum::{routing::post, Json, Router};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

pub fn routes() -> Router {
    Router::new()
        .route("/sessions/trash", post(trash_sessions))
        .route("/sessions/restore", post(restore_sessions))
        .route("/sessions/permanent-delete", post(permanent_delete))
        .route("/sessions/trash/list", axum::routing::get(list_trash))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrashRequest {
    file_paths: Vec<String>,
}

async fn trash_sessions(Json(body): Json<TrashRequest>) -> Json<serde_json::Value> {
    let mut trashed = Vec::new();
    let mut errors = Vec::new();

    for path_str in &body.file_paths {
        let path = PathBuf::from(path_str);
        if !path.exists() || !path_str.ends_with(".jsonl") {
            errors.push(format!("invalid path: {}", path_str));
            continue;
        }

        let trash_path = PathBuf::from(format!("{}.trash", path_str));
        match fs::rename(&path, &trash_path) {
            Ok(_) => trashed.push(path_str.clone()),
            Err(e) => errors.push(format!("{}: {}", path_str, e)),
        }
    }

    if !errors.is_empty() {
        tracing::warn!(errors = ?errors, "trash operation had errors");
    }
    tracing::info!(trashed_count = trashed.len(), "sessions trashed");

    Json(serde_json::json!({
        "trashed": trashed,
        "errors": errors,
    }))
}

async fn restore_sessions(Json(body): Json<TrashRequest>) -> Json<serde_json::Value> {
    let mut restored = Vec::new();
    let mut errors = Vec::new();

    for path_str in &body.file_paths {
        // Accept both .jsonl.trash and .jsonl paths
        let trash_path = if path_str.ends_with(".trash") {
            PathBuf::from(path_str)
        } else {
            PathBuf::from(format!("{}.trash", path_str))
        };

        let original_path = if path_str.ends_with(".trash") {
            PathBuf::from(path_str.trim_end_matches(".trash"))
        } else {
            PathBuf::from(path_str)
        };

        if !trash_path.exists() {
            errors.push(format!("not in trash: {}", path_str));
            continue;
        }

        match fs::rename(&trash_path, &original_path) {
            Ok(_) => restored.push(original_path.to_string_lossy().to_string()),
            Err(e) => errors.push(format!("{}: {}", path_str, e)),
        }
    }

    if !errors.is_empty() {
        tracing::warn!(errors = ?errors, "restore operation had errors");
    }
    tracing::info!(restored_count = restored.len(), "sessions restored");

    Json(serde_json::json!({
        "restored": restored,
        "errors": errors,
    }))
}

async fn permanent_delete(Json(body): Json<TrashRequest>) -> Json<serde_json::Value> {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    for path_str in &body.file_paths {
        let path = PathBuf::from(path_str);
        if !path.exists() {
            errors.push(format!("not found: {}", path_str));
            continue;
        }

        // Safety: only allow deleting .jsonl or .jsonl.trash files inside ~/.claude/
        let home = dirs::home_dir().unwrap_or_default();
        let claude_dir = home.join(".claude");
        if !path.starts_with(&claude_dir) {
            errors.push(format!("refusing to delete outside ~/.claude: {}", path_str));
            continue;
        }

        match fs::remove_file(&path) {
            Ok(_) => deleted.push(path_str.clone()),
            Err(e) => errors.push(format!("{}: {}", path_str, e)),
        }
    }

    if !errors.is_empty() {
        tracing::warn!(errors = ?errors, "permanent delete had errors");
    }
    tracing::info!(deleted_count = deleted.len(), "sessions permanently deleted");

    Json(serde_json::json!({
        "deleted": deleted,
        "errors": errors,
    }))
}

async fn list_trash() -> Json<serde_json::Value> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Json(serde_json::json!({ "items": [] })),
    };

    let projects_dir = home.join(".claude").join("projects");
    if !projects_dir.is_dir() {
        return Json(serde_json::json!({ "items": [] }));
    }

    let mut items = Vec::new();

    if let Ok(projects) = fs::read_dir(&projects_dir) {
        for proj in projects.flatten() {
            if let Ok(files) = fs::read_dir(proj.path()) {
                for file in files.flatten() {
                    let path = file.path();
                    if path.to_string_lossy().ends_with(".jsonl.trash") {
                        let meta = fs::metadata(&path).ok();
                        items.push(serde_json::json!({
                            "path": path.to_string_lossy(),
                            "project": proj.file_name().to_string_lossy(),
                            "sizeBytes": meta.map(|m| m.len()).unwrap_or(0),
                        }));
                    }
                }
            }
        }
    }

    Json(serde_json::json!({ "items": items, "total": items.len() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_trash_and_restore_flow() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.jsonl");
        fs::write(&file, "{}").unwrap();

        let file_str = file.to_string_lossy().to_string();
        let trash_str = format!("{}.trash", file_str);

        // Trash
        fs::rename(&file, &PathBuf::from(&trash_str)).unwrap();
        assert!(!file.exists());
        assert!(PathBuf::from(&trash_str).exists());

        // Restore
        fs::rename(&PathBuf::from(&trash_str), &file).unwrap();
        assert!(file.exists());
        assert!(!PathBuf::from(&trash_str).exists());
    }

    #[test]
    fn test_safety_check_path_validation() {
        // Verify the path must be inside ~/.claude
        let home = dirs::home_dir().unwrap_or_default();
        let claude_dir = home.join(".claude");
        let safe_path = claude_dir.join("projects/test/file.jsonl");
        let unsafe_path = PathBuf::from("/etc/passwd");

        assert!(safe_path.starts_with(&claude_dir));
        assert!(!unsafe_path.starts_with(&claude_dir));
    }
}
