use axum::{Json, Router, routing::get};
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
    let cli_path = find_cli_path().await;

    let Some(path) = cli_path else {
        return Json(CliCheckResponse {
            cli_found: false,
            cli_version: None,
            cli_path: None,
            auth_status: "unknown".to_string(),
            error: Some(
                "未检测到 Claude CLI，请运行 npm i -g @anthropic-ai/claude-code 安装".to_string(),
            ),
        });
    };

    let version = get_cli_version(&path).await;
    let auth_status = check_auth_status(&path).await;

    let error = if let Some(ref v) = version {
        if !is_version_sufficient(v) {
            Some(format!(
                "CLI 版本过低（当前 v{v}），需要 v2.1.100 或更高版本，请升级"
            ))
        } else {
            None
        }
    } else {
        Some("无法确定 CLI 版本".to_string())
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
        let v = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Some(v.split_whitespace().next().unwrap_or(&v).to_string())
    } else {
        None
    }
}

async fn check_auth_status(cli_path: &str) -> String {
    match tokio::process::Command::new(cli_path)
        .args(["auth", "status"])
        .output()
        .await
    {
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
    major == 2 && minor == 1 && patch >= 100
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_sufficient() {
        assert!(is_version_sufficient("2.1.100"));
        assert!(is_version_sufficient("2.1.153"));
        assert!(is_version_sufficient("2.2.0"));
        assert!(is_version_sufficient("3.0.0"));
    }

    #[test]
    fn version_insufficient() {
        assert!(!is_version_sufficient("2.1.99"));
        assert!(!is_version_sufficient("2.0.200"));
        assert!(!is_version_sufficient("1.5.0"));
    }
}
