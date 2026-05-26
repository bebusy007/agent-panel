use axum::{
    Json, Router,
    extract::Path,
    routing::{delete, get, post},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::scanner::{session_loader, sessions};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItem {
    pub id: String,
    pub session_id: String,
    pub message_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct FavoritesFile {
    favorites: Vec<FavoriteItem>,
}

fn favorites_path() -> PathBuf {
    let home = crate::scanner::home_dir().unwrap_or_default();
    home.join(".claude")
        .join("agent-panel")
        .join("favorites.json")
}

fn load_favorites() -> FavoritesFile {
    let path = favorites_path();
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return FavoritesFile::default(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_favorites(data: &FavoritesFile) -> Result<(), String> {
    let path = favorites_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn routes() -> Router {
    Router::new()
        .route("/favorites", get(list_favorites))
        .route("/favorites", post(add_favorite))
        .route("/favorites/{id}", delete(remove_favorite))
        .route(
            "/favorites/by-message/{session_id}/{message_id}",
            delete(remove_by_message),
        )
        .route("/favorites/session/{session_id}", get(session_favorites))
}

async fn remove_by_message(
    Path((session_id, message_id)): Path<(String, String)>,
) -> Json<serde_json::Value> {
    tracing::info!(session_id = %session_id, message_id = %message_id, "remove_favorite_by_message request");
    let mut data = load_favorites();
    let before = data.favorites.len();
    data.favorites
        .retain(|f| !(f.session_id == session_id && f.message_id == message_id));

    if data.favorites.len() == before {
        tracing::warn!(session_id = %session_id, message_id = %message_id, "remove_favorite_by_message → not found");
        return Json(serde_json::json!({ "error": "not found" }));
    }

    if let Err(e) = save_favorites(&data) {
        tracing::error!(error = %e, "remove_favorite_by_message → save failed");
        return Json(serde_json::json!({ "error": e }));
    }

    tracing::info!(session_id = %session_id, message_id = %message_id, "remove_favorite_by_message → ok");
    Json(serde_json::json!({ "ok": true }))
}

async fn list_favorites() -> Json<serde_json::Value> {
    let data = load_favorites();
    if data.favorites.is_empty() {
        return Json(serde_json::json!({ "favorites": [], "total": 0 }));
    }

    let scan = sessions::scan_all_sessions();
    let session_map: HashMap<&str, &sessions::SessionSummary> =
        scan.sessions.iter().map(|s| (s.id.as_str(), s)).collect();

    let mut messages_cache: HashMap<String, Vec<session_loader::Message>> = HashMap::new();

    let enriched: Vec<serde_json::Value> = data
        .favorites
        .iter()
        .map(|fav| {
            let session = session_map.get(fav.session_id.as_str());

            let message = session.and_then(|s| {
                let msgs = messages_cache
                    .entry(fav.session_id.clone())
                    .or_insert_with(|| {
                        session_loader::load_messages(std::path::Path::new(&s.file_path))
                            .unwrap_or_default()
                    });
                msgs.iter().find(|m| m.id == fav.message_id)
            });

            let mut obj = serde_json::json!({
                "id": fav.id,
                "sessionId": fav.session_id,
                "messageId": fav.message_id,
                "createdAt": fav.created_at,
            });
            if let Some(label) = &fav.label {
                obj["label"] = serde_json::json!(label);
            }
            if let Some(s) = session {
                obj["sessionTitle"] = serde_json::json!(s.title);
                obj["sessionSource"] = serde_json::json!(s.source);
                obj["sessionCwd"] = serde_json::json!(s.cwd);
            }
            if let Some(m) = message {
                obj["message"] = serde_json::to_value(m).unwrap_or_default();
            }
            obj
        })
        .collect();

    tracing::info!(total = enriched.len(), "list_favorites → ok (enriched)");
    Json(serde_json::json!({
        "favorites": enriched,
        "total": enriched.len(),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddFavoriteBody {
    session_id: String,
    message_id: String,
    label: Option<String>,
}

async fn add_favorite(Json(body): Json<AddFavoriteBody>) -> Json<serde_json::Value> {
    tracing::info!(
        session_id = %body.session_id,
        message_id = %body.message_id,
        label = body.label.as_deref().unwrap_or(""),
        "add_favorite request",
    );
    let mut data = load_favorites();

    if data
        .favorites
        .iter()
        .any(|f| f.session_id == body.session_id && f.message_id == body.message_id)
    {
        tracing::warn!(session_id = %body.session_id, message_id = %body.message_id, "add_favorite → duplicate");
        return Json(serde_json::json!({ "error": "already exists" }));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let item = FavoriteItem {
        id: id.clone(),
        session_id: body.session_id,
        message_id: body.message_id,
        label: body.label,
        created_at: now,
    };

    data.favorites.push(item.clone());

    if let Err(e) = save_favorites(&data) {
        tracing::error!(error = %e, "add_favorite → save failed");
        return Json(serde_json::json!({ "error": e }));
    }

    tracing::info!(id = %item.id, session_id = %item.session_id, "add_favorite → ok");
    Json(serde_json::json!({ "favorite": item }))
}

async fn remove_favorite(Path(id): Path<String>) -> Json<serde_json::Value> {
    tracing::info!(favorite_id = %id, "remove_favorite request");
    let mut data = load_favorites();
    let before = data.favorites.len();
    data.favorites.retain(|f| f.id != id);

    if data.favorites.len() == before {
        tracing::warn!(favorite_id = %id, "remove_favorite → not found");
        return Json(serde_json::json!({ "error": "not found" }));
    }

    if let Err(e) = save_favorites(&data) {
        tracing::error!(error = %e, "remove_favorite → save failed");
        return Json(serde_json::json!({ "error": e }));
    }

    tracing::info!(favorite_id = %id, "remove_favorite → ok");
    Json(serde_json::json!({ "ok": true }))
}

async fn session_favorites(Path(session_id): Path<String>) -> Json<serde_json::Value> {
    let data = load_favorites();
    let matches: Vec<&FavoriteItem> = data
        .favorites
        .iter()
        .filter(|f| f.session_id == session_id)
        .collect();

    tracing::info!(session_id = %session_id, count = matches.len(), "session_favorites → ok");
    Json(serde_json::json!({ "favorites": matches }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_favorites_file_roundtrip() {
        let data = FavoritesFile {
            favorites: vec![FavoriteItem {
                id: "f1".to_string(),
                session_id: "s1".to_string(),
                message_id: "m1".to_string(),
                label: Some("important".to_string()),
                created_at: "2026-05-01T10:00:00Z".to_string(),
            }],
        };

        let json = serde_json::to_string(&data).unwrap();
        let parsed: FavoritesFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.favorites.len(), 1);
        assert_eq!(parsed.favorites[0].id, "f1");
        assert_eq!(parsed.favorites[0].label, Some("important".to_string()));
    }

    #[test]
    fn test_empty_file_returns_default() {
        let data: FavoritesFile = serde_json::from_str("{}").unwrap_or_default();
        assert!(data.favorites.is_empty());
    }

    #[test]
    fn test_favorites_file_default() {
        let data = FavoritesFile::default();
        assert!(data.favorites.is_empty());
        let json = serde_json::to_string(&data).unwrap();
        assert!(json.contains("favorites"));
    }

    #[test]
    fn test_favorite_item_optional_label() {
        let item = FavoriteItem {
            id: "f1".to_string(),
            session_id: "s1".to_string(),
            message_id: "m1".to_string(),
            label: None,
            created_at: "2026-05-01T10:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&item).unwrap();
        assert!(!json.contains("label"));
    }

    #[test]
    fn test_favorites_multiple_items() {
        let data = FavoritesFile {
            favorites: vec![
                FavoriteItem {
                    id: "f1".to_string(),
                    session_id: "s1".to_string(),
                    message_id: "m1".to_string(),
                    label: Some("first".to_string()),
                    created_at: "2026-05-01T10:00:00Z".to_string(),
                },
                FavoriteItem {
                    id: "f2".to_string(),
                    session_id: "s2".to_string(),
                    message_id: "m2".to_string(),
                    label: None,
                    created_at: "2026-05-02T10:00:00Z".to_string(),
                },
            ],
        };
        let json = serde_json::to_string(&data).unwrap();
        let parsed: FavoritesFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.favorites.len(), 2);
        assert_eq!(parsed.favorites[0].session_id, "s1");
        assert_eq!(parsed.favorites[1].session_id, "s2");
    }

    #[test]
    fn test_favorites_camel_case_serialization() {
        let item = FavoriteItem {
            id: "f1".to_string(),
            session_id: "s1".to_string(),
            message_id: "m1".to_string(),
            label: Some("test".to_string()),
            created_at: "2026-05-01T10:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("sessionId"));
        assert!(json.contains("messageId"));
        assert!(json.contains("createdAt"));
    }

    #[test]
    fn test_malformed_json_returns_default() {
        let data: FavoritesFile = serde_json::from_str("not json").unwrap_or_default();
        assert!(data.favorites.is_empty());
    }
}
