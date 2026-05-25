/// 测试工具模块
///
/// 提供共享的测试辅助函数，供 #[cfg(test)] 模块使用。
///
/// 用法：
/// ```rust
/// #[cfg(test)]
/// mod tests {
///     use crate::test_utils::*;
///
///     #[tokio::test]
///     async fn test_something() {
///         let (server, _dir) = create_test_server();
///         // ...
///     }
/// }
/// ```
use axum_test::TestServer;
use std::path::PathBuf;
use tempfile::TempDir;
use tokio::sync::broadcast;

use crate::router;

/// 创建隔离的测试服务器
pub fn create_test_server() -> (TestServer, TempDir) {
    let dir = TempDir::new().expect("failed to create temp dir");
    let (tx, _) = broadcast::channel(256);
    let api = router::build_api_router(tx, dir.path().to_str().unwrap().to_string(), None);
    let server = TestServer::new(api.into_make_service());
    (server, dir)
}

/// 创建测试用的 JSONL session 文件
pub fn create_test_session_file(dir: &PathBuf, filename: &str, content: &str) -> PathBuf {
    let file_path = dir.join(filename);
    std::fs::write(&file_path, content).expect("failed to write test session file");
    file_path
}

/// 生成最小可用的 session JSONL 内容
pub fn sample_session_jsonl() -> String {
    let mut lines = Vec::new();

    lines.push(
        serde_json::json!({
            "type": "summary",
            "session_id": "test-session-001",
            "cwd": "/test/project",
            "git_branch": "main",
            "model": "claude-sonnet-4",
            "timestamp": "2026-01-01T00:00:00Z"
        })
        .to_string(),
    );

    lines.push(
        serde_json::json!({
            "type": "message",
            "uuid": "msg-001",
            "message": {
                "role": "user",
                "content": "Hello, test!"
            },
            "timestamp": "2026-01-01T00:00:01Z"
        })
        .to_string(),
    );

    lines.push(
        serde_json::json!({
            "type": "message",
            "uuid": "msg-002",
            "message": {
                "role": "assistant",
                "content": "Hi! This is a test response."
            },
            "timestamp": "2026-01-01T00:00:02Z"
        })
        .to_string(),
    );

    lines.join("\n")
}
