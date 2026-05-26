//! Resume — open a terminal / IDE to continue a session.
//! macOS only for terminal (uses osascript for iTerm/Terminal/Ghostty).
//! IDE opens via `open -a` on macOS or `code` CLI fallback.

use axum::{Json, Router, routing::post};
use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::scanner::sessions;

pub fn routes() -> Router {
    Router::new().route("/sessions/resume", post(resume_session))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResumeRequest {
    session_id: String,
    #[serde(default = "default_mode")]
    mode: String,
}

fn default_mode() -> String {
    "copy".to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeHints {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ide_command: Option<String>,
}

pub fn build_resume_hints(
    source: &str,
    cwd: Option<&str>,
    session_id_raw: Option<&str>,
) -> ResumeHints {
    let cwd_quoted = cwd.map(shell_quote);

    match source {
        "claude-code" => {
            let cmd = if let Some(sid) = session_id_raw {
                format!("claude --resume {}", sid)
            } else {
                "claude -c".to_string()
            };
            let terminal_cmd = cwd_quoted.as_ref().map(|c| format!("cd {} && {}", c, cmd));
            ResumeHints {
                command: Some(cmd),
                terminal_command: terminal_cmd,
                ide_command: cwd.map(|c| format!("code {}", shell_quote(c))),
            }
        }
        "codex" => {
            let cmd = if let Some(sid) = session_id_raw {
                format!("codex --resume {}", sid)
            } else {
                "codex".to_string()
            };
            let terminal_cmd = cwd_quoted.as_ref().map(|c| format!("cd {} && {}", c, cmd));
            ResumeHints {
                command: Some(cmd),
                terminal_command: terminal_cmd,
                ide_command: cwd.map(|c| format!("code {}", shell_quote(c))),
            }
        }
        "cursor-agent" | "cursor-composer" => ResumeHints {
            command: cwd.map(|c| format!("cursor {}", shell_quote(c))),
            terminal_command: cwd.map(|c| format!("cursor {}", shell_quote(c))),
            ide_command: cwd.map(|c| format!("cursor {}", shell_quote(c))),
        },
        _ => ResumeHints {
            command: cwd.map(|c| format!("cd {}", shell_quote(c))),
            terminal_command: cwd.map(|c| format!("cd {}", shell_quote(c))),
            ide_command: cwd.map(|c| format!("code {}", shell_quote(c))),
        },
    }
}

async fn resume_session(Json(body): Json<ResumeRequest>) -> Json<serde_json::Value> {
    tracing::info!(session_id = %body.session_id, mode = %body.mode, "resume_session request");
    let result = sessions::scan_all_sessions();
    let session = match result.sessions.iter().find(|s| s.id == body.session_id) {
        Some(s) => s,
        None => return Json(serde_json::json!({ "error": "session not found" })),
    };

    let hints = build_resume_hints(
        &session.source,
        session.cwd.as_deref(),
        session.session_id_raw.as_deref(),
    );

    match body.mode.as_str() {
        "copy" => Json(serde_json::json!({ "ok": true, "mode": "copy", "hints": hints })),
        "terminal" => {
            if cfg!(not(target_os = "macos")) {
                return Json(
                    serde_json::json!({ "error": "terminal resume is only supported on macOS" }),
                );
            }
            let cmd = match &hints.terminal_command {
                Some(c) => c.clone(),
                None => {
                    return Json(serde_json::json!({ "error": "no cwd available for terminal" }));
                }
            };
            let terminal = detect_terminal();
            match open_terminal(&terminal, &cmd) {
                Ok(_) => Json(
                    serde_json::json!({ "ok": true, "mode": "terminal", "terminal": terminal, "hints": hints }),
                ),
                Err(e) => {
                    tracing::warn!(session_id = %body.session_id, mode = "terminal", error = %e, "resume failed");
                    Json(serde_json::json!({ "error": e, "hints": hints }))
                }
            }
        }
        "ide" => {
            let cwd = match &session.cwd {
                Some(c) => c.clone(),
                None => return Json(serde_json::json!({ "error": "no cwd available for IDE" })),
            };
            match open_ide(&session.source, &cwd) {
                Ok(via) => Json(
                    serde_json::json!({ "ok": true, "mode": "ide", "via": via, "hints": hints }),
                ),
                Err(e) => {
                    tracing::warn!(session_id = %body.session_id, mode = "ide", error = %e, "resume failed");
                    Json(serde_json::json!({ "error": e, "hints": hints }))
                }
            }
        }
        other => Json(serde_json::json!({ "error": format!("unknown mode: {}", other) })),
    }
}

fn select_ide(source: &str) -> Option<&'static str> {
    match source {
        "cursor-agent" | "cursor-composer" => Some("Cursor"),
        _ => {
            if std::path::Path::new("/Applications/Visual Studio Code.app").exists() {
                Some("Visual Studio Code")
            } else if std::path::Path::new("/Applications/Cursor.app").exists() {
                Some("Cursor")
            } else {
                None
            }
        }
    }
}

fn open_ide(source: &str, cwd: &str) -> Result<String, String> {
    if let Some(app) = select_ide(source) {
        let status = Command::new("open")
            .arg("-a")
            .arg(app)
            .arg(cwd)
            .status()
            .map_err(|e| format!("failed to open {}: {}", app, e))?;

        if status.success() {
            return Ok(app.to_string());
        }
        return Err(format!("open -a {} failed", app));
    }

    let status = Command::new("code")
        .arg(cwd)
        .status()
        .map_err(|e| format!("failed to run `code`: {}", e))?;
    if status.success() {
        return Ok("code-cli".to_string());
    }
    Err("no IDE found (tried VS Code, Cursor, code CLI)".to_string())
}

fn detect_terminal() -> String {
    let checks = [
        ("/Applications/iTerm.app", "iTerm"),
        ("/Applications/Ghostty.app", "Ghostty"),
    ];

    for (path, name) in checks {
        if std::path::Path::new(path).exists() {
            return name.to_string();
        }
    }

    "Terminal".to_string()
}

fn build_osascript(terminal: &str, command: &str) -> String {
    let escaped = command.replace('\\', "\\\\").replace('"', "\\\"");
    match terminal {
        "iTerm" => format!(
            r#"tell application "iTerm"
  activate
  if (count of windows) = 0 then
    create window with default profile
  else
    tell current window to create tab with default profile
  end if
  tell current session of current window to write text "{escaped}"
end tell"#
        ),
        "Ghostty" => format!(
            r#"tell application "Ghostty" to activate
delay 0.3
tell application "System Events"
  keystroke "t" using {{command down}}
  delay 0.2
  keystroke "{escaped}"
  key code 36
end tell"#
        ),
        _ => format!(
            r#"tell application "Terminal"
  activate
  do script "{escaped}"
end tell"#
        ),
    }
}

fn open_terminal(terminal: &str, command: &str) -> Result<(), String> {
    let osa = build_osascript(terminal, command);

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&osa)
        .output()
        .map_err(|e| format!("failed to run osascript: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("osascript failed: {}", stderr));
    }

    Ok(())
}

fn shell_quote(s: &str) -> String {
    if s.contains(' ') || s.contains('\'') || s.contains('"') || s.contains('$') {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_quote_simple() {
        assert_eq!(shell_quote("/home/user/project"), "/home/user/project");
    }

    #[test]
    fn test_shell_quote_with_spaces() {
        assert_eq!(
            shell_quote("/home/user/my project"),
            "'/home/user/my project'"
        );
    }

    #[test]
    fn test_shell_quote_with_special_chars() {
        assert_eq!(shell_quote("test$var"), "'test$var'");
    }

    #[test]
    fn test_detect_terminal() {
        let term = detect_terminal();
        assert!(["iTerm", "Ghostty", "Terminal"].contains(&term.as_str()));
    }

    #[test]
    fn test_resume_hints_claude_code() {
        let hints = build_resume_hints("claude-code", Some("/home/user/proj"), Some("abc-123"));
        assert_eq!(hints.command, Some("claude --resume abc-123".to_string()));
        assert_eq!(
            hints.terminal_command,
            Some("cd /home/user/proj && claude --resume abc-123".to_string())
        );
        assert!(hints.ide_command.unwrap().contains("code"));
    }

    #[test]
    fn test_resume_hints_codex() {
        let hints = build_resume_hints("codex", Some("/work"), Some("xyz"));
        assert_eq!(hints.command, Some("codex --resume xyz".to_string()));
        assert_eq!(
            hints.terminal_command,
            Some("cd /work && codex --resume xyz".to_string())
        );
    }

    #[test]
    fn test_resume_hints_cursor() {
        let hints = build_resume_hints("cursor-agent", Some("/proj"), None);
        assert!(hints.command.unwrap().contains("cursor"));
    }

    #[test]
    fn test_resume_hints_no_cwd() {
        let hints = build_resume_hints("claude-code", None, Some("abc"));
        assert_eq!(hints.command, Some("claude --resume abc".to_string()));
        assert_eq!(hints.terminal_command, None);
    }

    #[test]
    fn test_resume_hints_codex_no_session_id() {
        let hints = build_resume_hints("codex", Some("/work"), None);
        assert_eq!(hints.command, Some("codex".to_string()));
        assert_eq!(
            hints.terminal_command,
            Some("cd /work && codex".to_string())
        );
    }

    #[test]
    fn test_resume_hints_claude_no_session_id() {
        let hints = build_resume_hints("claude-code", Some("/proj"), None);
        assert_eq!(hints.command, Some("claude -c".to_string()));
    }

    #[test]
    fn test_resume_hints_unknown_source() {
        let hints = build_resume_hints("unknown-source", Some("/dir"), None);
        assert_eq!(hints.command, Some("cd /dir".to_string()));
        assert!(hints.ide_command.unwrap().contains("code"));
    }

    #[test]
    fn test_resume_hints_unknown_no_cwd() {
        let hints = build_resume_hints("unknown-source", None, None);
        assert_eq!(hints.command, None);
        assert_eq!(hints.terminal_command, None);
        assert_eq!(hints.ide_command, None);
    }

    #[test]
    fn test_resume_hints_cursor_composer() {
        let hints = build_resume_hints("cursor-composer", Some("/proj"), None);
        assert!(hints.command.unwrap().contains("cursor"));
    }

    #[test]
    fn test_shell_quote_with_single_quote() {
        let result = shell_quote("it's");
        assert!(result.contains("'\\''"));
    }

    #[test]
    fn test_shell_quote_double_quote() {
        let result = shell_quote("say \"hi\"");
        assert!(result.starts_with('\''));
    }

    #[test]
    fn test_build_osascript_iterm() {
        let osa = build_osascript("iTerm", "cd /proj && claude -c");
        assert!(osa.contains("iTerm"));
        assert!(osa.contains("write text"));
        assert!(osa.contains("cd /proj && claude -c"));
    }

    #[test]
    fn test_build_osascript_ghostty() {
        let osa = build_osascript("Ghostty", "cd /proj && claude -c");
        assert!(osa.contains("Ghostty"));
        assert!(osa.contains("keystroke"));
        assert!(osa.contains("key code 36"));
    }

    #[test]
    fn test_build_osascript_terminal_default() {
        let osa = build_osascript("Terminal", "ls -la");
        assert!(osa.contains("Terminal"));
        assert!(osa.contains("do script"));
        assert!(osa.contains("ls -la"));
    }

    #[test]
    fn test_build_osascript_escaping() {
        let osa = build_osascript("Terminal", r#"echo "hello\" world"#);
        assert!(osa.contains(r#"echo \"hello\\\" world"#));
    }

    #[test]
    fn test_select_ide_cursor_agent() {
        assert_eq!(select_ide("cursor-agent"), Some("Cursor"));
    }

    #[test]
    fn test_select_ide_cursor_composer() {
        assert_eq!(select_ide("cursor-composer"), Some("Cursor"));
    }

    #[test]
    fn test_select_ide_claude_code() {
        let result = select_ide("claude-code");
        assert!(
            result == Some("Visual Studio Code") || result == Some("Cursor") || result.is_none()
        );
    }
}
