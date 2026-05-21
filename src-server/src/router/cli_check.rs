use axum::{routing::get, Json, Router};
use serde::Serialize;

pub fn routes() -> Router {
    Router::new().route("/config/conversation/check", get(check_cli))
}

#[derive(Serialize)]
struct CliCheckResponse {
    cli_found: bool,
    cli_version: Option<String>,
    cli_path: Option<String>,
    auth_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

async fn check_cli() -> Json<CliCheckResponse> {
    // Find claude binary
    let cli_path = find_cli_path().await;

    let Some(path) = cli_path else {
        return Json(CliCheckResponse {
            cli_found: false,
            cli_version: None,
            cli_path: None,
            auth_status: "unknown".to_string(),
            error: Some("Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code".to_string()),
        });
    };

    // Check version
    let version = get_cli_version(&path).await;

    // Check auth
    let auth_status = check_auth_status(&path).await;

    let error = if let Some(ref v) = version {
        if !is_version_sufficient(v) {
            Some(format!(
                "CLI version {} is below minimum required v2.1.100. Please upgrade.",
                v
            ))
        } else {
            None
        }
    } else {
        Some("Could not determine CLI version".to_string())
    };

    Json(CliCheckResponse {
        cli_found: true,
        cli_version: version,
        cli_path: Some(path),
        auth_status,
        error,
    })
}

async fn find_cli_path() -> Option<String> {
    let output = tokio::process::Command::new("which")
        .arg("claude")
        .output()
        .await
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

async fn get_cli_version(cli_path: &str) -> Option<String> {
    let output = tokio::process::Command::new(cli_path)
        .arg("--version")
        .output()
        .await
        .ok()?;

    if output.status.success() {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // Extract version number: "2.1.146 (Claude Code)" → "2.1.146"
        let version = version_str
            .split_whitespace()
            .next()
            .unwrap_or(&version_str)
            .to_string();
        Some(version)
    } else {
        None
    }
}

async fn check_auth_status(cli_path: &str) -> String {
    let output = tokio::process::Command::new(cli_path)
        .args(["auth", "status"])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => "authenticated".to_string(),
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            if stderr.contains("not logged in") || stderr.contains("no auth") {
                "not_authenticated".to_string()
            } else {
                "unknown".to_string()
            }
        }
        Err(_) => "unknown".to_string(),
    }
}

fn is_version_sufficient(version: &str) -> bool {
    // Parse version like "2.1.146" and check >= 2.1.100
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() < 3 {
        return false;
    }

    let major: u32 = parts[0].parse().unwrap_or(0);
    let minor: u32 = parts[1].parse().unwrap_or(0);
    let patch: u32 = parts[2].parse().unwrap_or(0);

    if major > 2 {
        return true;
    }
    if major == 2 && minor > 1 {
        return true;
    }
    if major == 2 && minor == 1 && patch >= 100 {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_check_sufficient() {
        assert!(is_version_sufficient("2.1.100"));
        assert!(is_version_sufficient("2.1.146"));
        assert!(is_version_sufficient("2.2.0"));
        assert!(is_version_sufficient("3.0.0"));
    }

    #[test]
    fn version_check_insufficient() {
        assert!(!is_version_sufficient("2.1.99"));
        assert!(!is_version_sufficient("2.0.200"));
        assert!(!is_version_sufficient("1.5.0"));
    }

    #[test]
    fn version_check_malformed() {
        assert!(!is_version_sufficient(""));
        assert!(!is_version_sufficient("abc"));
        assert!(!is_version_sufficient("2.1"));
    }
}
