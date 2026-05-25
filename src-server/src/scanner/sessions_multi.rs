//! Multi-provider session scanners: Cursor Agent, Cursor Composer, Codex, Claude History.
//!
//! Each provider stores sessions in a different format/location.
//! This module scans all of them and returns unified SessionSummary entries.

use super::sessions::SessionSummary;
use rayon::prelude::*;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use walkdir::WalkDir;

/// Safely truncate a string at a char boundary.
fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

// ============================================================
// Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
// ============================================================

pub fn scan_codex_sessions() -> Vec<SessionSummary> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let sessions_dir = home.join(".codex").join("sessions");
    if !sessions_dir.is_dir() {
        return vec![];
    }

    // Recursively find all rollout-*.jsonl files
    let files: Vec<PathBuf> = WalkDir::new(&sessions_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_str().unwrap_or("");
            name.starts_with("rollout-") && name.ends_with(".jsonl")
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    let results: Vec<SessionSummary> = files
        .par_iter()
        .filter_map(|path| scan_codex_file(path))
        .collect();
    tracing::info!(count = results.len(), "codex session scan complete");
    results
}

fn scan_codex_file(file_path: &PathBuf) -> Option<SessionSummary> {
    let meta = fs::metadata(file_path).ok()?;
    if meta.len() == 0 {
        return None;
    }

    let file = fs::File::open(file_path).ok()?;
    let reader = BufReader::new(file);

    let mut first_user_text: Option<String> = None;
    let mut cwd: Option<String> = None;
    let mut model: Option<String> = None;
    let mut session_id: Option<String> = None;
    let mut started_at: Option<String> = None;
    let mut last_activity: Option<String> = None;
    let mut message_count: u32 = 0;

    for line in reader.lines().flatten() {
        if line.is_empty() {
            continue;
        }
        let entry: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let payload = entry.get("payload");
        let ts = entry.get("timestamp").and_then(|v| v.as_str());

        if let Some(t) = ts {
            if started_at.is_none() {
                started_at = Some(t.to_string());
            }
            last_activity = Some(t.to_string());
        }

        match msg_type {
            "session_meta" => {
                if let Some(p) = payload {
                    cwd = p.get("cwd").and_then(|v| v.as_str()).map(|s| s.to_string());
                    model = p
                        .get("model_provider")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    session_id = p.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                }
            }
            "event_msg" => {
                let sub_type = payload
                    .and_then(|p| p.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if sub_type == "user_message" {
                    message_count += 1;
                    if first_user_text.is_none() {
                        // Codex puts the user text directly in payload.message (string)
                        // or sometimes in payload.message.content
                        let text = payload.and_then(|p| p.get("message")).and_then(|m| {
                            if let Some(s) = m.as_str() {
                                return Some(s.to_string());
                            }
                            if let Some(c) = m.get("content") {
                                if let Some(s) = c.as_str() {
                                    return Some(s.to_string());
                                }
                            }
                            None
                        });
                        if let Some(t) = text {
                            if !t.trim().is_empty() {
                                first_user_text = Some(
                                    safe_truncate(&t, crate::constants::FIRST_MESSAGE_MAX_LEN)
                                        .to_string(),
                                );
                            }
                        }
                    }
                }
            }
            "response_item" => {
                message_count += 1;
            }
            _ => {}
        }
    }

    // Extract ID from filename: rollout-2026-03-11T18-04-38-<uuid>.jsonl → uuid
    let file_name = file_path.file_stem()?.to_str()?;
    let id = extract_codex_id(file_name)
        .or(session_id.as_deref())
        .unwrap_or(file_name)
        .to_string();

    let title = first_user_text.as_deref().unwrap_or("(无标题)");

    Some(SessionSummary {
        id: format!("codex:{}", id),
        source: "codex".to_string(),
        title: safe_truncate(title, crate::constants::TITLE_MAX_LEN).to_string(),
        file_path: file_path.to_string_lossy().to_string(),
        project_dir: "codex".to_string(),
        first_user_message: first_user_text,
        cwd,
        git_branch: None,
        model,
        session_id_raw: Some(id),
        started_at,
        last_activity,
        message_count,
        size_bytes: meta.len(),
        subagent_count: 0,
        tokens_total: None,
        tokens_input: None,
        tokens_output: None,
        tokens_cache_read: None,
        tokens_cache_write: None,
        estimated_cost_usd: None,
    })
}

/// Extract UUID from Codex rollout filename.
/// Pattern: rollout-2026-03-11T18-04-38-019cdc5b-0523-7772-b0f7-fef74bde9bca
fn extract_codex_id(file_stem: &str) -> Option<&str> {
    if file_stem.len() >= crate::constants::UUID_LEN {
        let candidate = &file_stem[file_stem.len() - crate::constants::UUID_LEN..];
        // Quick check: char at positions 8, 13, 18, 23 should be '-'
        let bytes = candidate.as_bytes();
        if bytes[8] == b'-' && bytes[13] == b'-' && bytes[18] == b'-' && bytes[23] == b'-' {
            return Some(candidate);
        }
    }
    None
}

// ============================================================
// Cursor: ~/.cursor/projects/*/agent-transcripts/*/*.jsonl
// ============================================================

pub fn scan_cursor_sessions() -> Vec<SessionSummary> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let cursor_dir = home.join(".cursor");
    if !cursor_dir.is_dir() {
        return vec![];
    }

    let mut jsonl_files: Vec<PathBuf> = Vec::new();

    // Primary path: ~/.cursor/projects/*/agent-transcripts/*/*.jsonl
    let projects_dir = cursor_dir.join("projects");
    if projects_dir.is_dir() {
        let files: Vec<PathBuf> = WalkDir::new(&projects_dir)
            .max_depth(4)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension().and_then(|s| s.to_str()) == Some("jsonl")
                    && e.path().to_string_lossy().contains("agent-transcripts")
            })
            .map(|e| e.path().to_path_buf())
            .collect();
        jsonl_files.extend(files);
    }

    let results: Vec<SessionSummary> = jsonl_files
        .par_iter()
        .filter_map(|path| scan_cursor_file(path))
        .collect();
    tracing::info!(count = results.len(), "cursor session scan complete");
    results
}

/// Convert Cursor project directory name to a real filesystem path.
/// "Users-wangshujun-workspace-skill-panel" → "/Users/wangshujun/workspace/skill-panel"
/// Uses greedy matching: at each level, tries the longest hyphenated segment
/// that matches an existing directory, then recurses into it.
fn cursor_project_dir_to_cwd(project_dir: &str) -> Option<String> {
    if project_dir.chars().next()?.is_ascii_digit() {
        return None;
    }
    if project_dir.starts_with("var-folders") || project_dir.starts_with("private-") {
        return None;
    }
    let segments: Vec<&str> = project_dir.split('-').collect();
    let mut path = String::from("/");
    let mut i = 0;
    while i < segments.len() {
        let mut found = false;
        for end in (i + 1..=segments.len()).rev() {
            let candidate = segments[i..end].join("-");
            let base = if path.ends_with('/') {
                path.clone()
            } else {
                format!("{}/", path)
            };
            let test_path = format!("{}{}", base, candidate);
            if std::path::Path::new(&test_path).exists() {
                path = test_path;
                i = end;
                found = true;
                break;
            }
        }
        if !found {
            return None;
        }
    }
    if std::path::Path::new(&path).exists() {
        Some(path)
    } else {
        None
    }
}

fn scan_cursor_file(file_path: &PathBuf) -> Option<SessionSummary> {
    let meta = fs::metadata(file_path).ok()?;
    if meta.len() == 0 {
        return None;
    }

    let file = fs::File::open(file_path).ok()?;
    let reader = BufReader::new(file);

    let mut first_text: Option<String> = None;
    let mut message_count: u32 = 0;
    let mut last_ts: Option<String> = None;

    for line in reader
        .lines()
        .flatten()
        .take(crate::constants::CURSOR_SCAN_LINES)
    {
        if line.is_empty() {
            continue;
        }
        let entry: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        message_count += 1;
        if let Some(ts) = entry.get("timestamp").and_then(|v| v.as_str()) {
            last_ts = Some(ts.to_string());
        }

        if first_text.is_none() {
            let text = entry
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
                .and_then(|arr| {
                    arr.iter()
                        .find_map(|b| b.get("text").and_then(|t| t.as_str()))
                })
                .or_else(|| entry.get("content").and_then(|v| v.as_str()))
                .or_else(|| entry.get("text").and_then(|v| v.as_str()))
                .or_else(|| entry.get("query").and_then(|v| v.as_str()));
            if let Some(t) = text {
                let cleaned = super::session_loader::strip_cursor_tags(t);
                first_text = Some(
                    safe_truncate(&cleaned, crate::constants::FIRST_MESSAGE_MAX_LEN).to_string(),
                );
            }
        }
    }

    let path_str = file_path.to_string_lossy();
    let name = file_path.file_stem()?.to_str()?.to_string();

    let project_dir = path_str
        .split("/projects/")
        .nth(1)
        .and_then(|rest| rest.split('/').next())
        .unwrap_or("cursor")
        .to_string();

    // Derive cwd from project_dir: "Users-wangshujun-workspace-skill-panel" → "/Users/wangshujun/workspace/skill-panel"
    let cwd = cursor_project_dir_to_cwd(&project_dir);

    // Use file mtime as fallback timestamps when JSONL has none
    let file_mtime_str = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        });
    let started_at = file_mtime_str.clone();
    let last_activity = last_ts.or(file_mtime_str);

    Some(SessionSummary {
        id: format!("cursor-agent:{}", name),
        source: "cursor-agent".to_string(),
        title: safe_truncate(
            first_text.as_deref().unwrap_or("(Cursor session)"),
            crate::constants::TITLE_MAX_LEN,
        )
        .to_string(),
        file_path: file_path.to_string_lossy().to_string(),
        project_dir,
        first_user_message: first_text,
        cwd,
        git_branch: None,
        model: None,
        session_id_raw: Some(name),
        started_at,
        last_activity,
        message_count,
        size_bytes: meta.len(),
        subagent_count: 0,
        tokens_total: None,
        tokens_input: None,
        tokens_output: None,
        tokens_cache_read: None,
        tokens_cache_write: None,
        estimated_cost_usd: None,
    })
}

// ============================================================
// Claude History: ~/.claude/history.jsonl (prompts log)
// Kept for potential future prompt-search use, but no longer
// called from scan_all_sessions().
// ============================================================

pub fn scan_claude_history() -> Vec<SessionSummary> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return vec![],
    };

    let history_file = home.join(".claude").join("history.jsonl");
    if !history_file.is_file() {
        return vec![];
    }

    let file = match fs::File::open(&history_file) {
        Ok(f) => f,
        Err(_) => return vec![],
    };

    let reader = BufReader::new(file);
    let mut sessions: std::collections::HashMap<String, SessionSummary> =
        std::collections::HashMap::new();

    for line in reader.lines().flatten() {
        if line.is_empty() {
            continue;
        }
        let entry: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let session_id = entry
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if session_id.is_empty() {
            continue;
        }

        let display = entry.get("display").and_then(|v| v.as_str()).unwrap_or("");
        let timestamp = entry.get("timestamp").and_then(|v| v.as_u64()).map(|ts| {
            chrono::DateTime::from_timestamp(ts as i64 / crate::constants::MS_PER_SECOND as i64, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        });
        let project = entry
            .get("project")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let entry_session =
            sessions
                .entry(format!("history:{}", session_id))
                .or_insert(SessionSummary {
                    id: format!("history:{}", session_id),
                    source: "claude-history".to_string(),
                    title: safe_truncate(display, crate::constants::TITLE_MAX_LEN).to_string(),
                    file_path: history_file.to_string_lossy().to_string(),
                    project_dir: project.clone().unwrap_or_default(),
                    first_user_message: Some(
                        safe_truncate(display, crate::constants::FIRST_MESSAGE_MAX_LEN).to_string(),
                    ),
                    cwd: project,
                    git_branch: None,
                    model: None,
                    session_id_raw: Some(session_id),
                    started_at: timestamp.clone(),
                    last_activity: timestamp.clone(),
                    message_count: 0,
                    size_bytes: 0,
                    subagent_count: 0,
                    tokens_total: None,
                    tokens_input: None,
                    tokens_output: None,
                    tokens_cache_read: None,
                    tokens_cache_write: None,
                    estimated_cost_usd: None,
                });

        entry_session.message_count += 1;
        if let Some(ref ts) = timestamp {
            entry_session.last_activity = Some(ts.clone());
        }
    }

    let results: Vec<SessionSummary> = sessions.into_values().collect();
    tracing::info!(count = results.len(), "claude history scan complete");
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_scan_codex_file() {
        let dir = TempDir::new().unwrap();
        let file = dir
            .path()
            .join("rollout-2026-03-11T18-04-38-019cdc5b-0523-7772-b0f7-fef74bde9bca.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-03-11T10:04:41Z","type":"session_meta","payload":{{"id":"019cdc5b-0523-7772-b0f7-fef74bde9bca","cwd":"/home/test","model_provider":"openai"}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-03-11T10:05:00Z","type":"event_msg","payload":{{"type":"user_message","message":"hello codex","images":[],"text_elements":[]}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-03-11T10:06:00Z","type":"response_item","payload":{{"type":"message","text":"hi there"}}}}"#).unwrap();

        let result = scan_codex_file(&file);
        assert!(result.is_some());
        let s = result.unwrap();
        assert_eq!(s.source, "codex");
        assert_eq!(s.message_count, 2);
        assert_eq!(s.cwd, Some("/home/test".to_string()));
        assert_eq!(s.first_user_message, Some("hello codex".to_string()));
        assert_eq!(s.model, Some("openai".to_string()));
    }

    #[test]
    fn test_extract_codex_id() {
        let stem = "rollout-2026-03-11T18-04-38-019cdc5b-0523-7772-b0f7-fef74bde9bca";
        assert_eq!(
            extract_codex_id(stem),
            Some("019cdc5b-0523-7772-b0f7-fef74bde9bca")
        );
    }

    #[test]
    fn test_extract_codex_id_short() {
        assert_eq!(extract_codex_id("short"), None);
    }

    #[test]
    fn test_scan_codex_empty_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("rollout-empty.jsonl");
        fs::File::create(&file).unwrap();
        let result = scan_codex_file(&file);
        assert!(result.is_none());
    }

    #[test]
    fn test_safe_truncate_ascii() {
        assert_eq!(safe_truncate("hello world", 5), "hello");
    }

    #[test]
    fn test_safe_truncate_within_bounds() {
        assert_eq!(safe_truncate("hi", 10), "hi");
    }

    #[test]
    fn test_safe_truncate_multibyte() {
        let s = "你好世界";
        let result = safe_truncate(s, 6);
        assert_eq!(result, "你好");
    }

    #[test]
    fn test_safe_truncate_boundary() {
        let s = "abcé";
        let result = safe_truncate(s, 4);
        assert_eq!(result, "abc");
    }

    #[test]
    fn test_extract_codex_id_no_uuid_pattern() {
        let stem = "rollout-2026-03-11T18-04-38-nothinghere";
        assert_eq!(extract_codex_id(stem), None);
    }

    #[test]
    fn test_cursor_project_dir_to_cwd_starts_with_digit() {
        assert_eq!(cursor_project_dir_to_cwd("123-something"), None);
    }

    #[test]
    fn test_cursor_project_dir_to_cwd_var_folders() {
        assert_eq!(cursor_project_dir_to_cwd("var-folders-abc-def"), None);
    }

    #[test]
    fn test_cursor_project_dir_to_cwd_private() {
        assert_eq!(cursor_project_dir_to_cwd("private-var-folders"), None);
    }

    #[test]
    fn test_cursor_project_dir_to_cwd_valid_path() {
        // /tmp 在 macOS 和 Linux 上都存在，/Users 只在 macOS 存在
        let result = cursor_project_dir_to_cwd("tmp");
        assert_eq!(result, Some("/tmp".to_string()));
    }

    #[test]
    fn test_scan_codex_file_user_message_in_content() {
        let dir = TempDir::new().unwrap();
        let file = dir
            .path()
            .join("rollout-2026-01-01T00-00-00-aaaabbbb-cccc-dddd-eeee-ffffffffffff.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-01-01T00:00:00Z","type":"event_msg","payload":{{"type":"user_message","message":{{"content":"nested message"}}}}}}"#).unwrap();

        let result = scan_codex_file(&file);
        assert!(result.is_some());
        let s = result.unwrap();
        assert_eq!(s.first_user_message, Some("nested message".to_string()));
    }

    #[test]
    fn test_scan_codex_file_no_session_meta() {
        let dir = TempDir::new().unwrap();
        let file = dir
            .path()
            .join("rollout-2026-01-01T00-00-00-aaaabbbb-cccc-dddd-eeee-ffffffffffff.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-01-01T00:00:00Z","type":"event_msg","payload":{{"type":"user_message","message":"first msg"}}}}"#).unwrap();

        let result = scan_codex_file(&file);
        assert!(result.is_some());
        let s = result.unwrap();
        assert_eq!(s.cwd, None);
        assert_eq!(s.model, None);
    }

    #[test]
    fn test_scan_codex_file_response_item_counts() {
        let dir = TempDir::new().unwrap();
        let file = dir
            .path()
            .join("rollout-2026-02-01T00-00-00-11111111-2222-3333-4444-555555555555.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-02-01T10:00:00Z","type":"event_msg","payload":{{"type":"user_message","message":"q1"}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-02-01T10:01:00Z","type":"response_item","payload":{{"type":"message","text":"a1"}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-02-01T10:02:00Z","type":"event_msg","payload":{{"type":"user_message","message":"q2"}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-02-01T10:03:00Z","type":"response_item","payload":{{"type":"message","text":"a2"}}}}"#).unwrap();

        let result = scan_codex_file(&file).unwrap();
        assert_eq!(result.message_count, 4);
        assert_eq!(result.started_at, Some("2026-02-01T10:00:00Z".to_string()));
        assert_eq!(
            result.last_activity,
            Some("2026-02-01T10:03:00Z".to_string())
        );
    }

    #[test]
    fn test_scan_codex_file_empty_user_message_skipped() {
        let dir = TempDir::new().unwrap();
        let file = dir
            .path()
            .join("rollout-2026-01-01T00-00-00-aaaabbbb-1111-2222-3333-444444444444.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-01-01T00:00:00Z","type":"event_msg","payload":{{"type":"user_message","message":"   "}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-01-01T00:01:00Z","type":"event_msg","payload":{{"type":"user_message","message":"real message"}}}}"#).unwrap();

        let result = scan_codex_file(&file).unwrap();
        assert_eq!(result.first_user_message, Some("real message".to_string()));
    }

    #[test]
    fn test_scan_cursor_file_basic() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("cursor-session.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-05-10T10:00:00Z","role":"user","message":{{"content":[{{"type":"text","text":"Hello cursor"}}]}}}}"#).unwrap();
        writeln!(f, r#"{{"timestamp":"2026-05-10T10:01:00Z","role":"assistant","message":{{"content":[{{"type":"text","text":"Hi there"}}]}}}}"#).unwrap();

        let result = scan_cursor_file(&file);
        assert!(result.is_some());
        let s = result.unwrap();
        assert_eq!(s.source, "cursor-agent");
        assert_eq!(s.message_count, 2);
        assert!(s.first_user_message.is_some());
        assert!(s.first_user_message.unwrap().contains("Hello cursor"));
    }

    #[test]
    fn test_scan_cursor_file_empty() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("empty.jsonl");
        fs::File::create(&file).unwrap();
        let result = scan_cursor_file(&file);
        assert!(result.is_none());
    }

    #[test]
    fn test_scan_cursor_file_with_tags() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("cursor-tagged.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"role":"user","message":{{"content":[{{"type":"text","text":"<user_query>How to sort?</user_query>"}}]}}}}"#).unwrap();

        let result = scan_cursor_file(&file).unwrap();
        assert_eq!(result.first_user_message, Some("How to sort?".to_string()));
    }

    #[test]
    fn test_scan_cursor_file_query_field() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("cursor-query.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"query":"What is Rust?"}}"#).unwrap();

        let result = scan_cursor_file(&file).unwrap();
        assert_eq!(result.first_user_message, Some("What is Rust?".to_string()));
    }
}
