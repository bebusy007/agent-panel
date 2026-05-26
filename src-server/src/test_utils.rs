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

/// 创建隔离的测试服务器，将 HOME 重定向到临时目录以隔离文件 I/O。
/// 返回 TestHomeGuard，drop 时自动恢复原始 HOME。
pub fn create_test_server() -> (TestServer, TempDir, TestHomeGuard) {
    let dir = TempDir::new().expect("failed to create temp dir");
    let guard = TestHomeGuard::new(dir.path().to_path_buf());
    let (tx, _) = broadcast::channel(256);
    let api = router::build_api_router(tx, dir.path().to_string_lossy().to_string(), None);
    let server = TestServer::new(api.into_make_service());
    (server, dir, guard)
}

/// 保存并设置 HOME 到临时目录，drop 时自动恢复
pub struct TestHomeGuard {
    original: Option<String>,
}

impl TestHomeGuard {
    fn new(temp_home: std::path::PathBuf) -> Self {
        let original = std::env::var("HOME").ok();
        // SAFETY: 仅在测试环境使用，guard drop 时恢复
        unsafe { std::env::set_var("HOME", temp_home) };
        TestHomeGuard { original }
    }
}

impl Drop for TestHomeGuard {
    fn drop(&mut self) {
        // 清除扫描缓存，防止其他测试读到临时 HOME 下的过期数据
        crate::scanner::sessions::invalidate_scan_cache();
        match &self.original {
            Some(orig) => unsafe { std::env::set_var("HOME", orig) },
            None => unsafe { std::env::remove_var("HOME") },
        }
    }
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
