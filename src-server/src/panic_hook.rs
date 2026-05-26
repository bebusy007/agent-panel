use std::io::Write;

/// 安装 panic hook，将 crash 信息写入 crash.log
///
/// crash.log 包含：时间戳、系统信息、panic 消息、完整 backtrace
/// 追加模式，不覆盖历史 crash 记录
pub fn install(log_dir: &std::path::Path) {
    let log_path = log_dir.join("crash.log");
    let default_hook = std::panic::take_hook();

    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");

        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "unknown panic".to_string()
        };

        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());

        let mut msg = String::new();
        msg.push_str("=== Crash Report ===\n");
        msg.push_str(&format!("Timestamp: {}\n", timestamp));
        msg.push_str(&format!(
            "OS: {} {}\n",
            std::env::consts::OS,
            std::env::consts::ARCH
        ));
        msg.push_str(&format!(
            "Thread: {:?} (id: {:?})\n",
            thread.name(),
            thread.id()
        ));
        msg.push_str(&format!("Location: {}\n", location));
        msg.push_str(&format!("Panic: {}\n", payload));
        msg.push_str(&format!(
            "Backtrace:\n{:?}\n",
            std::backtrace::Backtrace::force_capture()
        ));
        msg.push_str("=== End Crash Report ===\n\n");

        // 写入 crash.log（追加模式）
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = writeln!(f, "{}", msg);
        }

        // 同时输出到 stderr
        eprintln!("{}", msg);

        // 调用默认 hook（打印到 stderr）
        default_hook(info);
    }));

    // 确保 backtrace 在 release 模式下也可用
    if std::env::var("RUST_BACKTRACE").is_err() {
        // SAFETY: single-threaded startup phase, no concurrent access
        unsafe {
            std::env::set_var("RUST_BACKTRACE", "1");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_panic_hook_writes_crash_log() {
        let dir = TempDir::new().unwrap();
        let original = std::panic::take_hook();

        install(dir.path());

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            panic!("测试崩溃 test-panic-msg");
        }));
        assert!(result.is_err(), "catch_unwind 应该捕获到 panic");

        let crash_log = dir.path().join("crash.log");
        assert!(crash_log.exists(), "crash.log 应该被创建");

        let content = std::fs::read_to_string(&crash_log).unwrap();
        assert!(
            content.contains("=== Crash Report ==="),
            "应包含 Crash Report 头"
        );
        assert!(
            content.contains("test-panic-msg"),
            "应包含 panic 消息"
        );
        assert!(
            content.contains("=== End Crash Report ==="),
            "应包含 Crash Report 尾"
        );
        assert!(content.contains("Timestamp:"), "应包含时间戳");
        assert!(content.contains("Location:"), "应包含 panic 位置");
        assert!(content.contains("Backtrace:"), "应包含 backtrace");

        // 恢复原始 hook
        std::panic::set_hook(original);
    }

    #[test]
    fn test_panic_hook_appends_to_existing_crash_log() {
        let dir = TempDir::new().unwrap();
        let original = std::panic::take_hook();

        // 预写一个 crash.log 模拟历史崩溃
        std::fs::write(dir.path().join("crash.log"), "旧崩溃记录\n").unwrap();

        install(dir.path());

        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            panic!("新崩溃");
        }));

        let content = std::fs::read_to_string(dir.path().join("crash.log")).unwrap();
        assert!(content.contains("旧崩溃记录"), "应保留历史记录");
        assert!(content.contains("新崩溃"), "应追加新记录");

        std::panic::set_hook(original);
    }
}
