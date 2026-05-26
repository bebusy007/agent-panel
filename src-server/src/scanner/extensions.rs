//! Extensions scanner — hooks, agents, commands, installed plugins.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookEntry {
    pub event: String,
    pub commands: Vec<String>,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntry {
    pub name: String,
    pub file_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginEntry {
    pub name: String,
    pub scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_path: Option<String>,
}

/// Scan hooks from settings.json
pub fn scan_hooks() -> Vec<HookEntry> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let settings_path = home.join(".claude").join("settings.json");
    let results = scan_hooks_from_file(&settings_path, "user");
    tracing::info!(count = results.len(), "hooks scan complete");
    results
}

fn scan_hooks_from_file(path: &Path, scope: &str) -> Vec<HookEntry> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let hooks = match json.get("hooks").and_then(|v| v.as_object()) {
        Some(h) => h,
        None => return vec![],
    };

    let mut results = Vec::new();

    for (event, config) in hooks {
        let commands: Vec<String> = if let Some(arr) = config.as_array() {
            arr.iter()
                .filter_map(|v| {
                    v.get("command")
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string())
                })
                .collect()
        } else if let Some(obj) = config.as_object() {
            obj.get("command")
                .and_then(|c| c.as_str())
                .map(|s| vec![s.to_string()])
                .unwrap_or_default()
        } else {
            vec![]
        };

        if !commands.is_empty() {
            results.push(HookEntry {
                event: event.clone(),
                commands,
                scope: scope.to_string(),
            });
        }
    }

    results
}

/// Scan custom agents from ~/.claude/agents/
pub fn scan_agents() -> Vec<AgentEntry> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let agents_dir = home.join(".claude").join("agents");
    if !agents_dir.is_dir() {
        return vec![];
    }

    let mut results = Vec::new();

    if let Ok(entries) = fs::read_dir(&agents_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            let content = fs::read_to_string(&path).unwrap_or_default();
            let description = extract_first_paragraph(&content);

            results.push(AgentEntry {
                name,
                file_path: path.to_string_lossy().to_string(),
                description,
            });
        }
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));
    tracing::info!(count = results.len(), "agents scan complete");
    results
}

/// Scan installed plugins from ~/.claude/plugins/installed_plugins.json
pub fn scan_plugins() -> Vec<PluginEntry> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let installed_file = home
        .join(".claude")
        .join("plugins")
        .join("installed_plugins.json");
    let content = match fs::read_to_string(&installed_file) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let plugins = match json.get("plugins").and_then(|v| v.as_object()) {
        Some(p) => p,
        None => return vec![],
    };

    let mut results = Vec::new();

    for (name, entries) in plugins {
        if let Some(arr) = entries.as_array() {
            for entry in arr {
                let scope = entry
                    .get("scope")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let version = entry
                    .get("version")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let install_path = entry
                    .get("installPath")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                results.push(PluginEntry {
                    name: name.clone(),
                    scope,
                    version,
                    install_path,
                });
            }
        }
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));
    tracing::info!(count = results.len(), "plugins scan complete");
    results
}

fn extract_first_paragraph(content: &str) -> Option<String> {
    let mut lines = content.lines();
    // Skip frontmatter if present
    if let Some(first) = lines.next()
        && first.trim() == "---"
    {
        // Skip until closing ---
        for line in lines.by_ref() {
            if line.trim() == "---" {
                break;
            }
        }
    }
    // Skip empty lines and headings
    let text: String = lines
        .skip_while(|l| l.trim().is_empty() || l.starts_with('#'))
        .take_while(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if text.is_empty() { None } else { Some(text) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_scan_hooks() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("settings.json");
        let content = r#"{
            "hooks": {
                "PreToolUse": [
                    {"command": "echo pre-tool"},
                    {"command": "validate.sh"}
                ],
                "PostToolUse": [
                    {"command": "notify.sh"}
                ]
            }
        }"#;
        fs::write(&file, content).unwrap();

        let result = scan_hooks_from_file(&file, "test");
        assert_eq!(result.len(), 2);

        let pre = result.iter().find(|h| h.event == "PreToolUse").unwrap();
        assert_eq!(pre.commands.len(), 2);
        assert_eq!(pre.commands[0], "echo pre-tool");
    }

    #[test]
    fn test_scan_hooks_no_hooks_key() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("settings.json");
        fs::write(&file, r#"{"permissions": {}}"#).unwrap();

        let result = scan_hooks_from_file(&file, "test");
        assert!(result.is_empty());
    }

    #[test]
    fn test_scan_agents() {
        let dir = TempDir::new().unwrap();
        let agents_dir = dir.path().join("agents");
        fs::create_dir_all(&agents_dir).unwrap();
        fs::write(
            agents_dir.join("reviewer.md"),
            "# Reviewer\n\nReviews code changes.\n",
        )
        .unwrap();
        fs::write(agents_dir.join("tester.md"), "Runs tests automatically.\n").unwrap();

        // Can't test scan_agents directly (hardcoded home), but test extraction
        let content = "# Reviewer\n\nReviews code changes.\n";
        let desc = extract_first_paragraph(content);
        assert_eq!(desc, Some("Reviews code changes.".to_string()));
    }

    #[test]
    fn test_extract_first_paragraph_with_frontmatter() {
        let content =
            "---\nname: test\n---\n\n# Title\n\nFirst real paragraph here.\n\nSecond para.";
        let desc = extract_first_paragraph(content);
        assert_eq!(desc, Some("First real paragraph here.".to_string()));
    }
}
