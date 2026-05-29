use crate::conversation::types::{SpawnConfig, SpawnMode};
use std::process::ExitStatus;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::broadcast;

/// Transport abstraction using enum dispatch for future SSH support.
pub enum Transport {
    Local(LocalTransport),
}

impl std::fmt::Debug for Transport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Transport::Local(t) => write!(f, "Transport::Local(pid={:?})", t.pid),
        }
    }
}

impl Transport {
    pub async fn spawn(config: &SpawnConfig) -> Result<Self, String> {
        LocalTransport::spawn(config).await.map(Transport::Local)
    }

    pub fn take_stdin(&mut self) -> Option<ChildStdin> {
        match self {
            Transport::Local(t) => t.stdin.take(),
        }
    }

    pub fn stdout_rx(&self) -> broadcast::Receiver<String> {
        match self {
            Transport::Local(t) => t.stdout_tx.subscribe(),
        }
    }

    pub fn stderr_rx(&self) -> broadcast::Receiver<String> {
        match self {
            Transport::Local(t) => t.stderr_tx.subscribe(),
        }
    }

    pub async fn kill(&mut self) -> Result<(), String> {
        match self {
            Transport::Local(t) => t.kill().await,
        }
    }

    pub async fn wait(&mut self) -> Result<ExitStatus, String> {
        match self {
            Transport::Local(t) => t.wait().await,
        }
    }

    pub fn pid(&self) -> Option<u32> {
        match self {
            Transport::Local(t) => t.pid,
        }
    }
}

pub struct LocalTransport {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout_tx: broadcast::Sender<String>,
    stderr_tx: broadcast::Sender<String>,
    pid: Option<u32>,
    stdout_handle: Option<tokio::task::JoinHandle<()>>,
    stderr_handle: Option<tokio::task::JoinHandle<()>>,
}

impl LocalTransport {
    async fn spawn(config: &SpawnConfig) -> Result<Self, String> {
        let cli_path = config.cli_path.as_deref().unwrap_or("claude");

        let mut args = vec![
            "--print".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--input-format".to_string(),
            "stream-json".to_string(),
            "--include-partial-messages".to_string(),
            "--verbose".to_string(),
            "--permission-prompt-tool".to_string(),
            "stdio".to_string(),
        ];

        match &config.mode {
            SpawnMode::Resume { session_id } => {
                args.push("--resume".to_string());
                args.push(session_id.clone());
            }
            SpawnMode::New => {}
        }

        if let Some(model) = &config.model {
            args.push("--model".to_string());
            args.push(model.clone());
        }

        if let Some(mode) = &config.permission_mode {
            args.push("--permission-mode".to_string());
            args.push(mode.clone());
        }

        let mut cmd = Command::new(cli_path);
        cmd.args(&args)
            .current_dir(&config.cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        tracing::info!(cli = cli_path, cwd = %config.cwd, args = ?args, "Spawning Claude CLI");

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn '{}': {}", cli_path, e))?;

        let pid = child.id();
        let stdin = child.stdin.take();

        let (stdout_tx, _) = broadcast::channel(1024);
        let (stderr_tx, _) = broadcast::channel(256);

        // Spawn stdout reader task
        let stdout_handle = if let Some(stdout) = child.stdout.take() {
            let tx = stdout_tx.clone();
            Some(tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if tx.send(line).is_err() {
                        break;
                    }
                }
            }))
        } else {
            None
        };

        // Spawn stderr reader task
        let stderr_handle = if let Some(stderr) = child.stderr.take() {
            let tx = stderr_tx.clone();
            Some(tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::warn!(stderr_line = %line, "CLI stderr");
                    let _ = tx.send(line);
                }
            }))
        } else {
            None
        };

        Ok(Self {
            child,
            stdin,
            stdout_tx,
            stderr_tx,
            pid,
            stdout_handle,
            stderr_handle,
        })
    }

    async fn kill(&mut self) -> Result<(), String> {
        self.stdin.take();

        let graceful =
            tokio::time::timeout(std::time::Duration::from_secs(3), self.child.wait()).await;

        if let Ok(Ok(status)) = graceful {
            tracing::debug!(exit_code = ?status.code(), "CLI exited gracefully after stdin close");
            return Ok(());
        }

        // Abort reader tasks before force-kill
        if let Some(h) = self.stdout_handle.take() {
            h.abort();
        }
        if let Some(h) = self.stderr_handle.take() {
            h.abort();
        }

        tracing::debug!("CLI did not exit gracefully, sending kill");
        self.child
            .kill()
            .await
            .map_err(|e| format!("kill failed: {}", e))?;
        self.child
            .wait()
            .await
            .map_err(|e| format!("wait after kill failed: {}", e))?;
        Ok(())
    }

    async fn wait(&mut self) -> Result<ExitStatus, String> {
        self.child
            .wait()
            .await
            .map_err(|e| format!("wait failed: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn spawn_nonexistent_binary_returns_error() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("__nonexistent_binary_xyz__".to_string()),
        };
        let result = Transport::spawn(&config).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Failed to spawn"), "unexpected error: {}", err);
    }

    #[tokio::test]
    async fn spawn_echo_and_read_stdout() {
        let mut cmd = Command::new("echo");
        cmd.arg("hello from stdout")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn().unwrap();
        let (stdout_tx, mut stdout_rx) = broadcast::channel(16);

        if let Some(stdout) = child.stdout.take() {
            let tx = stdout_tx.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx.send(line);
                }
            });
        }

        child.wait().await.unwrap();
        drop(stdout_tx); // Close sender so reader task exits

        let mut lines = vec![];
        while let Ok(line) = stdout_rx.recv().await {
            lines.push(line);
        }
        assert_eq!(lines, vec!["hello from stdout"]);
    }

    #[tokio::test]
    async fn spawn_resume_builds_correct_args() {
        let config = SpawnConfig {
            mode: SpawnMode::Resume {
                session_id: "test-sid-123".into(),
            },
            cwd: "/tmp".to_string(),
            model: Some("sonnet".into()),
            permission_mode: Some("default".into()),
            cli_path: Some("echo".to_string()),
        };
        // echo will just print all args — use it to verify arg construction
        let t = Transport::spawn(&config).await.unwrap();
        let mut rx = t.stdout_rx();
        // echo writes and exits quickly; recv() blocks until sender dropped or line arrives
        let mut lines = vec![];
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        // Use try_recv for non-blocking reads since echo already exited
        loop {
            match rx.try_recv() {
                Ok(line) => lines.push(line),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty) => break,
                Err(tokio::sync::broadcast::error::TryRecvError::Closed) => break,
                Err(_) => break,
            }
        }
        let output = lines.join(" ");
        assert!(output.contains("--print"));
        assert!(output.contains("--output-format stream-json"));
        assert!(output.contains("--include-partial-messages"));
        assert!(output.contains("--resume test-sid-123"));
        assert!(output.contains("--model sonnet"));
    }

    #[tokio::test]
    async fn spawn_new_session_no_resume_flag() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("echo".to_string()),
        };
        let t = Transport::spawn(&config).await.unwrap();
        let mut rx = t.stdout_rx();
        let mut lines = vec![];
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        loop {
            match rx.try_recv() {
                Ok(line) => lines.push(line),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty) => break,
                Err(_) => break,
            }
        }
        let output = lines.join(" ");
        assert!(output.contains("--print"));
        // New session should NOT have --resume
        assert!(!output.contains("--resume"));
    }

    #[tokio::test]
    async fn spawn_no_model_or_permission_omits_flags() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("echo".to_string()),
        };
        let t = Transport::spawn(&config).await.unwrap();
        let mut rx = t.stdout_rx();
        let mut lines = vec![];
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        loop {
            match rx.try_recv() {
                Ok(line) => lines.push(line),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty) => break,
                Err(_) => break,
            }
        }
        let output = lines.join(" ");
        assert!(!output.contains("--model"));
        assert!(!output.contains("--permission-mode"));
    }

    #[tokio::test]
    async fn transport_pid_returns_some_for_spawned() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("echo".to_string()),
        };
        let t = Transport::spawn(&config).await.unwrap();
        let pid = t.pid();
        assert!(pid.is_some());
        assert!(pid.unwrap() > 0);
    }

    #[tokio::test]
    async fn transport_stderr_rx_available() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("echo".to_string()),
        };
        let t = Transport::spawn(&config).await.unwrap();
        let _rx = t.stderr_rx();
        // stderr receiver should be available even if no stderr output
    }

    #[tokio::test]
    async fn spawn_with_permission_mode() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: Some("default".into()),
            cli_path: Some("echo".to_string()),
        };
        let t = Transport::spawn(&config).await.unwrap();
        let mut rx = t.stdout_rx();
        let mut lines = vec![];
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        loop {
            match rx.try_recv() {
                Ok(line) => lines.push(line),
                Err(tokio::sync::broadcast::error::TryRecvError::Empty) => break,
                Err(_) => break,
            }
        }
        let output = lines.join(" ");
        assert!(output.contains("--permission-mode"));
        assert!(output.contains("default"));
    }

    #[tokio::test]
    async fn transport_take_stdin_returns_some() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("cat".to_string()),
        };
        let mut t = Transport::spawn(&config).await.unwrap();
        let stdin = t.take_stdin();
        assert!(stdin.is_some());
        // Taking stdin again should return None
        assert!(t.take_stdin().is_none());
    }

    #[tokio::test]
    async fn transport_wait_after_kill() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/tmp".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("sleep".to_string()),
        };
        let mut t = Transport::spawn(&config).await.unwrap();
        t.kill().await.unwrap();
        let status = t.wait().await.unwrap();
        assert!(!status.success());
    }

    #[tokio::test]
    async fn spawn_in_nonexistent_cwd() {
        let config = SpawnConfig {
            mode: SpawnMode::New,
            cwd: "/nonexistent/path/xyz".to_string(),
            model: None,
            permission_mode: None,
            cli_path: Some("echo".to_string()),
        };
        // echo should still work even with nonexistent cwd (it doesn't access files)
        let result = Transport::spawn(&config).await;
        assert!(result.is_ok());
    }
}
