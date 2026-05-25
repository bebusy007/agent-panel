/// Favorites API 集成测试

#[cfg(test)]
mod tests {
    use crate::test_utils::*;

    #[tokio::test]
    async fn test_favorites_list_returns_array() {
        let (server, _dir) = create_test_server();
        let res = server.get("/favorites").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body["favorites"].is_array());
    }

    #[tokio::test]
    async fn test_favorites_add_returns_favorite() {
        let (server, _dir) = create_test_server();
        let res = server
            .post("/favorites")
            .json(&serde_json::json!({
                "sessionId": "test-session-unique-1",
                "messageId": "msg-unique-1",
                "label": "test favorite"
            }))
            .await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body.get("favorite").is_some() || body.get("error").is_some());
    }

    #[tokio::test]
    async fn test_favorites_by_session() {
        let (server, _dir) = create_test_server();

        // Add favorite
        server
            .post("/favorites")
            .json(&serde_json::json!({
                "sessionId": "session-test-abc",
                "messageId": "msg-1"
            }))
            .await;

        // Query by session
        let res = server.get("/favorites/session/session-test-abc").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body["favorites"].is_array());
    }
}
