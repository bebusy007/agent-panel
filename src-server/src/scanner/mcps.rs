//! MCP (Model Context Protocol) server scanner.
//!
//! Scans multiple sources for MCP server configurations:
//! 1. ~/.claude/settings.json → mcpServers
//! 2. Project-level .claude/settings.json → mcpServers
//! 3. Cursor settings (~/.cursor/mcp.json)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSummary {
    pub server_name: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub tool_count: u32,
    pub tool_names: Vec<String>,
    pub resource_count: u32,
    #[serde(default)]
    pub configured_in: Vec<String>,
}

/// Scan all MCP sources and return deduplicated server list.
pub fn scan_mcps() -> Vec<McpSummary> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let mut servers: HashMap<String, McpSummary> = HashMap::new();

    // 1. ~/.claude/settings.json
    let claude_settings = home.join(".claude").join("settings.json");
    if let Some(mcps) = read_mcp_servers(&claude_settings, "claude-user") {
        for mcp in mcps {
            merge_mcp(&mut servers, mcp);
        }
    }

    // 2. Project-level settings (scan all project dirs)
    let projects_dir = home.join(".claude").join("projects");
    if projects_dir.is_dir()
        && let Ok(entries) = fs::read_dir(&projects_dir)
    {
        for entry in entries.flatten() {
            let settings_file = entry.path().join("settings.json");
            if settings_file.is_file() {
                let source = format!("project:{}", entry.file_name().to_string_lossy());
                if let Some(mcps) = read_mcp_servers(&settings_file, &source) {
                    for mcp in mcps {
                        merge_mcp(&mut servers, mcp);
                    }
                }
            }
        }
    }

    // 3. Cursor MCP config
    let cursor_mcp = home.join(".cursor").join("mcp.json");
    if let Some(mcps) = read_mcp_servers(&cursor_mcp, "cursor") {
        for mcp in mcps {
            merge_mcp(&mut servers, mcp);
        }
    }

    let mut result: Vec<McpSummary> = servers.into_values().collect();
    result.sort_by(|a, b| a.server_name.cmp(&b.server_name));
    tracing::info!(count = result.len(), "mcp scan complete");
    result
}

fn merge_mcp(map: &mut HashMap<String, McpSummary>, mcp: McpSummary) {
    let entry = map.entry(mcp.server_name.clone()).or_insert(mcp.clone());
    if !entry.configured_in.contains(&mcp.source) {
        entry.configured_in.push(mcp.source.clone());
    }
    // Keep the most detailed version
    if entry.tool_count < mcp.tool_count {
        entry.tool_count = mcp.tool_count;
        entry.tool_names = mcp.tool_names;
    }
}

fn read_mcp_servers(path: &Path, source: &str) -> Option<Vec<McpSummary>> {
    let content = fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;

    let mcp_servers = json.get("mcpServers")?.as_object()?;
    let mut results = Vec::new();

    for (name, config) in mcp_servers {
        let command = config
            .get("command")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let url = config
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Build description from command/url
        let description = if let Some(ref cmd) = command {
            let args = config
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default();
            Some(format!("{} {}", cmd, args).trim().to_string())
        } else {
            url.clone()
        };

        results.push(McpSummary {
            server_name: name.clone(),
            source: source.to_string(),
            description,
            command,
            url,
            tool_count: 0,
            tool_names: vec![],
            resource_count: 0,
            configured_in: vec![source.to_string()],
        });
    }

    Some(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_read_mcp_servers_from_settings() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("settings.json");
        let content = r#"{
            "mcpServers": {
                "playwright": {
                    "command": "npx",
                    "args": ["@anthropic/mcp-playwright"]
                },
                "filesystem": {
                    "command": "mcp-fs",
                    "args": ["/home/user"]
                }
            }
        }"#;
        let mut f = fs::File::create(&file).unwrap();
        f.write_all(content.as_bytes()).unwrap();

        let result = read_mcp_servers(&file, "test").unwrap();
        assert_eq!(result.len(), 2);

        let pw = result
            .iter()
            .find(|m| m.server_name == "playwright")
            .unwrap();
        assert_eq!(pw.command, Some("npx".to_string()));
        assert_eq!(pw.source, "test");
        assert!(
            pw.description
                .as_ref()
                .unwrap()
                .contains("@anthropic/mcp-playwright")
        );
    }

    #[test]
    fn test_read_mcp_servers_no_mcp_key() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("settings.json");
        fs::write(&file, r#"{"permissions": {}}"#).unwrap();

        let result = read_mcp_servers(&file, "test");
        assert!(result.is_none());
    }

    #[test]
    fn test_merge_deduplicates() {
        let mut map: HashMap<String, McpSummary> = HashMap::new();

        let mcp1 = McpSummary {
            server_name: "test-server".to_string(),
            source: "user".to_string(),
            description: Some("desc".to_string()),
            command: Some("cmd".to_string()),
            url: None,
            tool_count: 3,
            tool_names: vec!["a".to_string(), "b".to_string(), "c".to_string()],
            resource_count: 0,
            configured_in: vec!["user".to_string()],
        };

        let mcp2 = McpSummary {
            server_name: "test-server".to_string(),
            source: "project:x".to_string(),
            description: Some("desc".to_string()),
            command: Some("cmd".to_string()),
            url: None,
            tool_count: 1,
            tool_names: vec!["a".to_string()],
            resource_count: 0,
            configured_in: vec!["project:x".to_string()],
        };

        merge_mcp(&mut map, mcp1);
        merge_mcp(&mut map, mcp2);

        let entry = map.get("test-server").unwrap();
        assert_eq!(entry.configured_in.len(), 2);
        assert_eq!(entry.tool_count, 3); // keeps the richer one
    }

    #[test]
    fn test_url_based_mcp() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("settings.json");
        let content = r#"{
            "mcpServers": {
                "remote-server": {
                    "url": "https://mcp.example.com/sse"
                }
            }
        }"#;
        fs::write(&file, content).unwrap();

        let result = read_mcp_servers(&file, "test").unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0].url,
            Some("https://mcp.example.com/sse".to_string())
        );
        assert_eq!(result[0].command, None);
    }
}
