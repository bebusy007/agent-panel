//! Skills scanner — scans all skill sources:
//! 1. ~/.claude/skills/ (user skills)
//! 2. ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/ (installed plugins)
//! 3. ~/.claude/plugins/marketplaces/<marketplace>/(plugins|external_plugins)/<plugin>/skills/ (marketplace)
//!
//! Each skill is a directory containing a SKILL.md with YAML frontmatter.

use crate::models::skill::SkillSummary;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;

/// Scan all skill sources and return deduplicated results.
pub fn scan_skills() -> Vec<SkillSummary> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let claude_dir = home.join(".claude");
    let mut skills = Vec::new();
    let mut installed_keys: HashSet<String> = HashSet::new();

    // 1. User skills: ~/.claude/skills/
    let user_root = claude_dir.join("skills");
    if user_root.is_dir() {
        for skill in scan_skills_dir(&user_root, "user", None) {
            skills.push(skill);
        }
    }

    // 2. Plugin cache: ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/
    let cache_root = claude_dir.join("plugins").join("cache");
    if cache_root.is_dir()
        && let Ok(marketplaces) = fs::read_dir(&cache_root) {
            for mp_entry in marketplaces.flatten() {
                let mp_name = mp_entry.file_name().to_string_lossy().to_string();
                if mp_name.starts_with('.') {
                    continue;
                }
                let mp_dir = mp_entry.path();
                if !mp_dir.is_dir() {
                    continue;
                }

                if let Ok(plugins) = fs::read_dir(&mp_dir) {
                    for plugin_entry in plugins.flatten() {
                        let plugin_name = plugin_entry.file_name().to_string_lossy().to_string();
                        if plugin_name.starts_with('.') {
                            continue;
                        }
                        let plugin_dir = plugin_entry.path();
                        if !plugin_dir.is_dir() {
                            continue;
                        }

                        // Find latest version dir
                        if let Ok(versions) = fs::read_dir(&plugin_dir) {
                            for ver_entry in versions.flatten() {
                                let ver_name = ver_entry.file_name().to_string_lossy().to_string();
                                if ver_name.starts_with('.') {
                                    continue;
                                }
                                let skills_dir = ver_entry.path().join("skills");
                                if !skills_dir.is_dir() {
                                    continue;
                                }

                                let source_label = format!("plugin:{mp_name}/{plugin_name}");
                                for skill in
                                    scan_skills_dir(&skills_dir, &source_label, Some(&mp_name))
                                {
                                    let key = format!("{mp_name}/{plugin_name}/{}", skill.name);
                                    installed_keys.insert(key);
                                    skills.push(skill);
                                }
                            }
                        }
                    }
                }
            }
        }

    // 3. Marketplace: ~/.claude/plugins/marketplaces/<mp>/(plugins|external_plugins)/<plugin>/skills/
    let market_root = claude_dir.join("plugins").join("marketplaces");
    if market_root.is_dir()
        && let Ok(marketplaces) = fs::read_dir(&market_root) {
            for mp_entry in marketplaces.flatten() {
                let mp_name = mp_entry.file_name().to_string_lossy().to_string();
                if mp_name.starts_with('.') {
                    continue;
                }
                let mp_dir = mp_entry.path();
                if !mp_dir.is_dir() {
                    continue;
                }

                for bucket in &["plugins", "external_plugins"] {
                    let bucket_dir = mp_dir.join(bucket);
                    if !bucket_dir.is_dir() {
                        continue;
                    }

                    if let Ok(plugins) = fs::read_dir(&bucket_dir) {
                        for plugin_entry in plugins.flatten() {
                            let plugin_name =
                                plugin_entry.file_name().to_string_lossy().to_string();
                            if plugin_name.starts_with('.') {
                                continue;
                            }
                            let skills_dir = plugin_entry.path().join("skills");
                            if !skills_dir.is_dir() {
                                continue;
                            }

                            let source_label = format!("marketplace:{mp_name}/{plugin_name}");
                            for skill in scan_skills_dir(&skills_dir, &source_label, Some(&mp_name))
                            {
                                let key = format!("{mp_name}/{plugin_name}/{}", skill.name);
                                // Deduplicate: skip marketplace copy if already installed
                                if installed_keys.contains(&key) {
                                    continue;
                                }
                                skills.push(skill);
                            }
                        }
                    }
                }
            }
        }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    tracing::info!(count = skills.len(), "skill scan complete");
    skills
}

/// Scan a single skills directory (each subdirectory should contain SKILL.md).
fn scan_skills_dir(dir: &Path, source: &str, marketplace: Option<&str>) -> Vec<SkillSummary> {
    let mut results = Vec::new();

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            // Also handle flat .md files directly in the skills dir
            if path.extension().and_then(|s| s.to_str()) == Some("md")
                && let Some(skill) = parse_skill_file(&path, source, marketplace) {
                    results.push(skill);
                }
            continue;
        }

        // Look for SKILL.md inside the directory
        let skill_file = path.join("SKILL.md");
        if skill_file.is_file()
            && let Some(skill) = parse_skill_file(&skill_file, source, marketplace) {
                results.push(skill);
            }
    }

    results
}

/// Parse a single SKILL.md file, extracting frontmatter metadata.
fn parse_skill_file(
    file_path: &Path,
    source: &str,
    marketplace: Option<&str>,
) -> Option<SkillSummary> {
    let content = fs::read_to_string(file_path).ok()?;
    let file_size = fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
    let symlink_to = fs::read_link(file_path)
        .ok()
        .map(|p| p.to_string_lossy().to_string());

    // Derive name from parent dir name (if SKILL.md) or file stem
    let name = if file_path.file_name().and_then(|s| s.to_str()) == Some("SKILL.md") {
        file_path.parent()?.file_name()?.to_str()?.to_string()
    } else {
        file_path.file_stem()?.to_str()?.to_string()
    };

    let (description, triggers, cli_commands) = parse_frontmatter(&content);

    Some(SkillSummary {
        id: format!("{}:{}", source, name),
        name,
        source: source.to_string(),
        marketplace: marketplace.map(|s| s.to_string()),
        description,
        triggers,
        cli_commands,
        symlink_to,
        file_size,
        file_path: file_path.to_string_lossy().to_string(),
    })
}

/// Parse YAML-like frontmatter from a SKILL.md file.
/// Extracts: name, description, triggers (from description keywords).
fn parse_frontmatter(content: &str) -> (Option<String>, Vec<String>, Vec<String>) {
    let mut description = None;
    let mut triggers = Vec::new();
    let mut cli_commands = Vec::new();

    // Check for frontmatter delimiters
    if !content.starts_with("---") {
        // No frontmatter — try to extract description from first paragraph
        let first_para = content
            .lines()
            .skip_while(|l| l.trim().is_empty() || l.starts_with('#'))
            .take_while(|l| !l.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if !first_para.is_empty() {
            description = Some(truncate_str(
                &first_para,
                crate::constants::SKILL_DESC_MAX_LEN,
            ));
        }
        return (description, triggers, cli_commands);
    }

    let after_first = &content[3..];
    let end_pos = match after_first.find("\n---") {
        Some(pos) => pos,
        None => return (description, triggers, cli_commands),
    };

    let frontmatter = &after_first[..end_pos];

    for line in frontmatter.lines() {
        let line = line.trim();

        if let Some(val) = line.strip_prefix("description:") {
            let val = val.trim().trim_matches('"').trim_matches('\'');
            if !val.is_empty() {
                description = Some(val.to_string());
            }
        }

        // Look for trigger patterns in description text
        // Common pattern: "当用户提到"xxx"、"yyy"时触发"
        if line.contains("触发") || line.contains("trigger") {
            // Extract quoted strings as triggers
            let mut in_quote = false;
            let mut current = String::new();
            for ch in line.chars() {
                match ch {
                    '"' | '\'' | '「' | '」' => {
                        if in_quote {
                            if !current.is_empty() {
                                triggers.push(current.clone());
                                current.clear();
                            }
                            in_quote = false;
                        } else {
                            in_quote = true;
                        }
                    }
                    _ if in_quote => current.push(ch),
                    _ => {}
                }
            }
        }
    }

    // Scan body for slash commands
    let body_start = 3 + end_pos + 4; // skip first --- + frontmatter + \n---
    if body_start < content.len() {
        let body = &content[body_start..];
        for line in body.lines() {
            let trimmed = line.trim();
            // Match patterns like: /command-name or `/<command>`
            if trimmed.starts_with('/') && !trimmed.starts_with("//") {
                let cmd = trimmed.split_whitespace().next().unwrap_or("");
                if cmd.len() > 1 && cmd.len() < 40 {
                    cli_commands.push(cmd.to_string());
                }
            }
            if let Some(start) = trimmed.find('`') {
                let rest = &trimmed[start + 1..];
                if rest.starts_with('/')
                    && let Some(end) = rest.find('`') {
                        let cmd = &rest[..end];
                        if cmd.len() > 1 && cmd.len() < 40 {
                            cli_commands.push(cmd.to_string());
                        }
                    }
            }
        }
    }

    (description, triggers, cli_commands)
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let boundary = s
            .char_indices()
            .take_while(|(i, _)| *i < max)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(max);
        format!("{}…", &s[..boundary])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_skill(dir: &TempDir, name: &str, content: &str) -> PathBuf {
        let skill_dir = dir.path().join(name);
        fs::create_dir_all(&skill_dir).unwrap();
        let file = skill_dir.join("SKILL.md");
        let mut f = fs::File::create(&file).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        file
    }

    #[test]
    fn test_parse_skill_with_frontmatter() {
        let dir = TempDir::new().unwrap();
        let content = r#"---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This skill does `/test-command` things.
"#;
        let file = write_skill(&dir, "test-skill", content);
        let skill = parse_skill_file(&file, "user", None).unwrap();

        assert_eq!(skill.name, "test-skill");
        assert_eq!(
            skill.description,
            Some("A test skill for unit testing".to_string())
        );
        assert_eq!(skill.source, "user");
        assert!(skill.cli_commands.contains(&"/test-command".to_string()));
    }

    #[test]
    fn test_parse_skill_without_frontmatter() {
        let dir = TempDir::new().unwrap();
        let content = "# My Skill\n\nThis is a description of the skill.\n\nMore details here.";
        let file = write_skill(&dir, "my-skill", content);
        let skill = parse_skill_file(&file, "user", None).unwrap();

        assert_eq!(skill.name, "my-skill");
        assert_eq!(
            skill.description,
            Some("This is a description of the skill.".to_string())
        );
    }

    #[test]
    fn test_parse_skill_with_triggers() {
        let dir = TempDir::new().unwrap();
        let content = r#"---
description: 火车票查询。当用户提到"火车票"、"高铁"、"动车"时触发。
---

# Train Ticket
"#;
        let file = write_skill(&dir, "train-ticket", content);
        let skill = parse_skill_file(&file, "user", None).unwrap();

        assert!(skill.triggers.contains(&"火车票".to_string()));
        assert!(skill.triggers.contains(&"高铁".to_string()));
        assert!(skill.triggers.contains(&"动车".to_string()));
    }

    #[test]
    fn test_scan_skills_dir() {
        let dir = TempDir::new().unwrap();

        // Create two skill dirs
        let s1_dir = dir.path().join("skill-a");
        fs::create_dir_all(&s1_dir).unwrap();
        fs::write(s1_dir.join("SKILL.md"), "---\ndescription: Skill A\n---\n").unwrap();

        let s2_dir = dir.path().join("skill-b");
        fs::create_dir_all(&s2_dir).unwrap();
        fs::write(s2_dir.join("SKILL.md"), "---\ndescription: Skill B\n---\n").unwrap();

        let results = scan_skills_dir(dir.path(), "test", None);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_skill_id_includes_source() {
        let dir = TempDir::new().unwrap();
        let content = "---\ndescription: test\n---\n";
        let file = write_skill(&dir, "my-skill", content);
        let skill = parse_skill_file(&file, "plugin:mcp/awesome", None).unwrap();

        assert_eq!(skill.id, "plugin:mcp/awesome:my-skill");
        assert_eq!(skill.source, "plugin:mcp/awesome");
    }

    #[test]
    fn test_empty_dir_returns_empty() {
        let dir = TempDir::new().unwrap();
        let results = scan_skills_dir(dir.path(), "test", None);
        assert!(results.is_empty());
    }

    #[test]
    fn test_flat_md_files() {
        let dir = TempDir::new().unwrap();
        // Write a .md file directly (not in a subdirectory)
        fs::write(
            dir.path().join("simple.md"),
            "---\ndescription: Simple skill\n---\n",
        )
        .unwrap();

        let results = scan_skills_dir(dir.path(), "user", None);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "simple");
    }
}
