/// Search API 集成测试

#[cfg(test)]
mod tests {
    use crate::test_utils::*;

    #[tokio::test]
    async fn test_search_no_results() {
        let (server, _dir, _guard) = create_test_server();
        let res = server
            .post("/search/messages")
            .json(&serde_json::json!({ "query": "zzz-nonexistent-query-xyz-12345" }))
            .await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body.get("hits").is_some());
        assert!(body.get("totalMatches").is_some());
    }

    #[tokio::test]
    async fn test_search_with_filters() {
        let (server, _dir, _guard) = create_test_server();
        let res = server
            .post("/search/messages")
            .json(&serde_json::json!({
                "query": "test",
                "filters": {
                    "messageType": "user"
                }
            }))
            .await;
        res.assert_status_ok();
    }
}
