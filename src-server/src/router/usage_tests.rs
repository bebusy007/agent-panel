/// Usage API 集成测试

#[cfg(test)]
mod tests {
    use crate::test_utils::*;

    #[tokio::test]
    async fn test_usage_overview_default() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/usage/overview").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body.get("totalSessions").is_some());
        assert!(body.get("totalTokens").is_some());
        assert!(body.get("daily").is_some());
        assert!(body.get("byModel").is_some());
        assert!(body.get("bySource").is_some());
    }

    #[tokio::test]
    async fn test_usage_overview_with_source_filter() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/usage/overview?source=claude-code").await;
        res.assert_status_ok();
    }

    #[tokio::test]
    async fn test_usage_overview_with_days_filter() {
        let (server, _dir, _guard) = create_test_server();
        let res = server.get("/usage/overview?days=7").await;
        res.assert_status_ok();
    }
}
