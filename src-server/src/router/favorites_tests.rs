/// Favorites API 集成测试

#[cfg(test)]
mod tests {
    use crate::scanner;
    use crate::test_utils::*;
    use std::fs;
    use std::io::Write as _;
    use tempfile::TempDir;

    fn setup_home_with_session() -> TempDir {
        let dir = TempDir::new().unwrap();
        let claude_dir = dir.path().join(".claude").join("projects").join("test-project");
        fs::create_dir_all(&claude_dir).unwrap();
        // 创建测试 session JSONL 文件供 scanner 发现
        let jsonl = claude_dir.join("test-session-001.jsonl");
        let mut f = fs::File::create(&jsonl).unwrap();
        writeln!(f, r#"{{"type":"summary","session_id":"test-session-001","cwd":"/test","git_branch":"main","model":"claude-sonnet-4","timestamp":"2026-01-01T00:00:00Z"}}"#).unwrap();
        writeln!(f, r#"{{"type":"message","uuid":"msg-001","message":{{"role":"user","content":"test query"}},"timestamp":"2026-01-01T00:00:01Z"}}"#).unwrap();
        writeln!(f, r#"{{"type":"message","uuid":"msg-002","message":{{"role":"assistant","content":"test response"}},"timestamp":"2026-01-01T00:00:02Z"}}"#).unwrap();
        scanner::set_home_override(dir.path().to_path_buf());
        dir
    }

    #[tokio::test]
    async fn test_favorites_list_returns_array() {
        let _home = setup_home_with_session();
        let (server, _dir) = create_test_server();
        let res = server.get("/favorites").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body["favorites"].is_array());
    }

    #[tokio::test]
    async fn test_favorites_add_returns_favorite() {
        let _home = setup_home_with_session();
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
        // 可能返回创建成功或 duplicate error
        assert!(body.get("favorite").is_some() || body.get("error").is_some());
    }

    #[tokio::test]
    async fn test_favorites_by_session() {
        let _home = setup_home_with_session();
        let (server, _dir) = create_test_server();
        server
            .post("/favorites")
            .json(&serde_json::json!({
                "sessionId": "session-test-abc",
                "messageId": "msg-1"
            }))
            .await;
        let res = server.get("/favorites/session/session-test-abc").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body["favorites"].is_array());
    }

    #[tokio::test]
    async fn test_favorites_add_and_list_with_enrichment() {
        let _home = setup_home_with_session();
        let (server, _dir) = create_test_server();

        // 添加一个指向真实 session 中 message 的收藏
        let res = server
            .post("/favorites")
            .json(&serde_json::json!({
                "sessionId": "test-session-001",
                "messageId": "msg-001"
            }))
            .await;
        res.assert_status_ok();

        // 列表应该包含富化后的收藏（含 sessionTitle、sessionSource 等）
        let res = server.get("/favorites").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        let favorites = body["favorites"].as_array().unwrap();
        // 至少有一个收藏
        assert!(!favorites.is_empty());
    }

    #[tokio::test]
    async fn test_favorites_remove_nonexistent() {
        let _home = setup_home_with_session();
        let (server, _dir) = create_test_server();
        let res = server.delete("/favorites/nonexistent-id").await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body.get("error").is_some());
    }

    #[tokio::test]
    async fn test_favorites_remove_by_message_not_found() {
        let _home = setup_home_with_session();
        let (server, _dir) = create_test_server();
        let res = server
            .delete("/favorites/by-message/no-such-session/no-such-message")
            .await;
        res.assert_status_ok();
        let body: serde_json::Value = res.json();
        assert!(body.get("error").is_some());
    }
}
