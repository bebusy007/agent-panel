/// Session API 集成测试

#[cfg(test)]
mod tests {
    use crate::test_utils::*;

    #[tokio::test]
    async fn test_sessions_list_returns_array() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/sessions").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body["sessions"].is_array());
        assert!(body.get("total").is_some());
    }

    #[tokio::test]
    async fn test_session_detail_not_found() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/sessions/nonexistent-id-12345").await;
        let body: serde_json::Value = res.json();
        assert!(body.get("error").is_some() || body.get("summary").is_none());
    }

    #[tokio::test]
    async fn test_sessions_projects_returns_array() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/sessions/projects").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body["projects"].is_array());
    }

    #[tokio::test]
    async fn test_sessions_refresh_returns_ok() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.post("/sessions/refresh").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body.get("ok").is_some());
    }

    #[tokio::test]
    async fn test_sessions_health() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/sessions/health").await;
        res.assert_status_ok();
    }

    #[tokio::test]
    async fn test_session_export_not_found() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/sessions/nonexistent-id-12345/export.md").await;
        res.assert_status(axum::http::StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_trash_list_returns_array() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/sessions/trash/list").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body.get("items").is_some());
    }

    #[tokio::test]
    async fn test_trash_restore_empty() {
        let (server, _dir, _guard) = create_test_server();
        let res = server
            .post("/sessions/restore")
            .json(&serde_json::json!({ "filePaths": [] }))
            .await;
        res.assert_status_ok();
    }
}
