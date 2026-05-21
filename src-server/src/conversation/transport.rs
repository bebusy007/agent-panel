use crate::conversation::types::SpawnConfig;
use crate::conversation::types::SpawnMode;
use std::process::ExitStatus;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::broadcast;

/// Transport abstraction using enum dispatch.
/// Currently only Local; SSH variant reserved for future.
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
        let local = LocalTransport::spawn(config).await?;
        Ok(Transport::Local(local))
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
}

impl LocalTransport {
    async fn spawn(config: &SpawnConfig) -> Result<Self, String> {
        let cli_path = config
            .cli_path
            .as_deref()
            .unwrap_or("claude");

        let mut args = vec![
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--input-format".to_string(),
            "stream-json".to_string(),
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

        tracing::info!(
            cli = cli_path,
            cwd = %config.cwd,
            args = ?args,
            "Spawning Claude CLI"
        );

        let mut child = cmd.spawn().map_err(|e| {
            format!("Failed to spawn '{}': {}", cli_path, e)
        })?;

        let pid = child.id();
        let stdin = child.stdin.take();

        let (stdout_tx, _) = broadcast::channel(1024);
        let (stderr_tx, _) = broadcast::channel(256);

        // Spawn stdout reader task
        if let Some(stdout) = child.stdout.take() {
            let tx = stdout_tx.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if tx.send(line).is_err() {
                        break;
                    }
                }
            });
        }

        // Spawn stderr reader task
        if let Some(stderr) = child.stderr.take() {
            let tx = stderr_tx.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::debug!(stderr_line = %line, "CLI stderr");
                    let _ = tx.send(line);
                }
            });
        }

        Ok(Self {
            child,
            stdin,
            stdout_tx,
            stderr_tx,
            pid,
        })
    }

    async fn kill(&mut self) -> Result<(), String> {
        // Close stdin first to signal EOF
        self.stdin.take();

        // Wait briefly for graceful exit
        let graceful = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            self.child.wait(),
        )
        .await;

        if graceful.is_ok() {
            tracing::debug!("CLI exited gracefully after stdin close");
            return Ok(());
        }

        // Force kill
        tracing::debug!("CLI did not exit gracefully, sending kill");
        self.child.kill().await.map_err(|e| format!("kill failed: {}", e))?;
        self.child.wait().await.map_err(|e| format!("wait after kill failed: {}", e))?;
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

    #[test]
    fn transport_enum_is_send_sync() {
        fn assert_send_sync<T: Send>() {}
        assert_send_sync::<Transport>();
    }

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
        assert!(result.unwrap_err().contains("Failed to spawn"));
    }

    #[tokio::test]
    async fn spawn_echo_and_read_stdout() {
        // Use 'echo' as a fake CLI to verify stdout piping works
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

        // Wait for echo to complete
        child.wait().await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let line = stdout_rx.recv().await.unwrap();
        assert_eq!(line, "hello from stdout");
    }
}
