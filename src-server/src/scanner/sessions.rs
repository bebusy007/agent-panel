//! Session scanner — scans ~/.claude/projects/ for session JSONL files.
//!
//! Produces a SessionSummary per file with rich metadata extracted in a single pass.
//! Uses per-project `.session_cache.json` for incremental scanning.

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};
use walkdir::WalkDir;

const CACHE_VERSION: u32 = 1;

/// A summarized session, produced from scanning a single .jsonl file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub source: String,
    pub title: String,
    pub file_path: String,
    pub project_dir: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_user_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id_raw: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity: Option<String>,
    pub message_count: u32,
    pub size_bytes: u64,
    pub subagent_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_input: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_output: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_cache_read: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_cache_write: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_usd: Option<f64>,
}

// ── Cache structures ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct ProjectCache {
    version: u32,
    entries: HashMap<String, CacheEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CacheEntry {
    mtime_secs: u64,
    size: u64,
    byte_offset: u64,
    summary: SessionSummary,
}

enum ScanStrategy {
    UseCached(SessionSummary),
    Incremental { offset: u64, cached: SessionSummary },
    FullParse,
}

fn load_project_cache(project_dir: &Path) -> Option<ProjectCache> {
    let cache_path = project_dir.join(".session_cache.json");
    let content = fs::read_to_string(&cache_path).ok()?;
    let cache: ProjectCache = serde_json::from_str(&content).ok()?;
    if cache.version != CACHE_VERSION {
        return None;
    }
    Some(cache)
}

fn save_project_cache(project_dir: &Path, cache: &ProjectCache) {
    let cache_path = project_dir.join(".session_cache.json");
    if let Ok(json) = serde_json::to_string(cache) {
        let _ = fs::write(&cache_path, json);
    }
}

fn file_mtime_secs(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn determine_strategy(
    file_name: &str,
    file_size: u64,
    mtime_secs: u64,
    cache: &Option<ProjectCache>,
) -> ScanStrategy {
    if let Some(pc) = cache
        && let Some(entry) = pc.entries.get(file_name) {
            if entry.mtime_secs == mtime_secs && entry.size == file_size {
                return ScanStrategy::UseCached(entry.summary.clone());
            }
            if file_size > entry.size && entry.byte_offset > 0 {
                return ScanStrategy::Incremental {
                    offset: entry.byte_offset,
                    cached: entry.summary.clone(),
                };
            }
        }
    ScanStrategy::FullParse
}

// ── In-memory scan cache ─────────────────────────────────────────

struct ScanCache {
    result: ScanResult,
    created_at: Instant,
}

static SCAN_CACHE: Mutex<Option<ScanCache>> = Mutex::new(None);

/// Invalidate the in-memory session scan cache.
/// Call this when the file watcher detects session changes.
pub fn invalidate_scan_cache() {
    if let Ok(mut guard) = SCAN_CACHE.lock() {
        *guard = None;
    }
}

// ── Scanning ─────────────────────────────────────────────────────

/// Scan all sessions from all providers (Claude Code, Codex, Cursor).
/// Results are cached in memory for `SESSION_CACHE_TTL_SECS` to avoid
/// redundant filesystem I/O on rapid sequential requests.
pub fn scan_all_sessions() -> ScanResult {
    let ttl = Duration::from_secs(crate::constants::SESSION_CACHE_TTL_SECS);

    // Try to return cached result
    if let Ok(guard) = SCAN_CACHE.lock()
        && let Some(ref cache) = *guard
            && cache.created_at.elapsed() < ttl {
                return cache.result.clone();
            }

    let result = scan_all_sessions_uncached();

    // Store in cache
    if let Ok(mut guard) = SCAN_CACHE.lock() {
        *guard = Some(ScanCache {
            result: result.clone(),
            created_at: Instant::now(),
        });
    }

    result
}

/// Perform the actual filesystem scan (bypasses cache).
fn scan_all_sessions_uncached() -> ScanResult {
    let start = Instant::now();

    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return ScanResult::empty(),
    };

    // 1. Claude Code sessions (~/.claude/projects/) — recursive per project
    let projects_path = home.join(".claude").join("projects");
    let mut sessions: Vec<SessionSummary> = if projects_path.is_dir() {
        scan_claude_projects(&projects_path)
    } else {
        vec![]
    };

    // 2. Codex sessions
    let codex_sessions = super::sessions_multi::scan_codex_sessions();
    sessions.extend(codex_sessions);

    // 3. Cursor sessions
    let cursor_sessions = super::sessions_multi::scan_cursor_sessions();
    sessions.extend(cursor_sessions);

    let scan_time_ms = start.elapsed().as_millis() as u64;

    let by_source = |s: &str| sessions.iter().filter(|sess| sess.source == s).count();
    tracing::info!(
        total = sessions.len(),
        elapsed_ms = scan_time_ms,
        claude_code = by_source("claude-code"),
        cursor_agent = by_source("cursor-agent"),
        cursor_composer = by_source("cursor-composer"),
        codex = by_source("codex"),
        "session scan complete",
    );

    ScanResult {
        sessions,
        scan_time_ms,
    }
}

/// Scan all project directories under ~/.claude/projects/.
fn scan_claude_projects(projects_path: &Path) -> Vec<SessionSummary> {
    let project_dirs: Vec<PathBuf> = WalkDir::new(projects_path)
        .min_depth(1)
        .max_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
        .map(|e| e.path().to_path_buf())
        .collect();

    project_dirs
        .par_iter()
        .flat_map(|project_dir| scan_single_project(project_dir))
        .collect()
}

/// Scan a single project directory: find all .jsonl files (recursive),
/// apply cache, count subagents.
fn scan_single_project(project_dir: &Path) -> Vec<SessionSummary> {
    let cache = load_project_cache(project_dir);

    let project_dir_name = project_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    // Collect all .jsonl files recursively, excluding subagents/ and dot-files
    let file_entries: Vec<(PathBuf, u64, u64)> = WalkDir::new(project_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let path = e.path();
            let name = e.file_name().to_str().unwrap_or("");
            path.extension().and_then(|s| s.to_str()) == Some("jsonl")
                && !name.starts_with('.')
                && !path.to_string_lossy().contains("/subagents/")
        })
        .filter_map(|e| {
            let path = e.path().to_path_buf();
            let meta = fs::metadata(&path).ok()?;
            if meta.len() == 0 {
                return None;
            }
            let mtime = file_mtime_secs(&path);
            Some((path, meta.len(), mtime))
        })
        .collect();

    let summaries: Vec<SessionSummary> = file_entries
        .par_iter()
        .filter_map(|(path, size, mtime)| {
            let file_name = path.file_name()?.to_str()?.to_string();
            let strategy = determine_strategy(&file_name, *size, *mtime, &cache);

            let mut summary = match strategy {
                ScanStrategy::UseCached(s) => s,
                ScanStrategy::Incremental { offset, cached } => {
                    summarize_incremental(path, offset, cached, &project_dir_name).ok()??
                }
                ScanStrategy::FullParse => summarize_file(path, &project_dir_name).ok()??,
            };

            // Count subagents
            let stem = path.file_stem()?.to_str()?;
            let subagent_dir = path.parent()?.join(stem).join("subagents");
            if subagent_dir.is_dir() {
                summary.subagent_count = fs::read_dir(&subagent_dir)
                    .map(|entries| {
                        entries
                            .flatten()
                            .filter(|e| {
                                let n = e.file_name();
                                let n = n.to_str().unwrap_or("");
                                n.starts_with("agent-") && n.ends_with(".jsonl")
                            })
                            .count() as u32
                    })
                    .unwrap_or(0);
            }

            Some(summary)
        })
        .collect();

    // Build and save updated cache
    let mut new_cache = ProjectCache {
        version: CACHE_VERSION,
        entries: HashMap::new(),
    };
    for (path, size, mtime) in &file_entries {
        if let Some(file_name) = path.file_name().and_then(|s| s.to_str())
            && let Some(summary) = summaries
                .iter()
                .find(|s| s.file_path == path.to_string_lossy())
            {
                new_cache.entries.insert(
                    file_name.to_string(),
                    CacheEntry {
                        mtime_secs: *mtime,
                        size: *size,
                        byte_offset: *size,
                        summary: summary.clone(),
                    },
                );
            }
    }
    save_project_cache(project_dir, &new_cache);

    summaries
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub sessions: Vec<SessionSummary>,
    pub scan_time_ms: u64,
}

impl ScanResult {
    fn empty() -> Self {
        Self {
            sessions: vec![],
            scan_time_ms: 0,
        }
    }
}

/// Summarize a single .jsonl file in one pass (full parse).
fn summarize_file(file_path: &Path, project_dir: &str) -> Result<Option<SessionSummary>, String> {
    let meta = fs::metadata(file_path).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        return Ok(None);
    }

    let file = fs::File::open(file_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    let mut state = ParseState::default();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        process_line(&line, &mut state);
    }

    Ok(Some(build_summary(
        file_path,
        project_dir,
        meta.len(),
        &state,
    )))
}

/// Incremental parse: reuse cached summary, only parse new bytes from offset.
fn summarize_incremental(
    file_path: &Path,
    offset: u64,
    mut cached: SessionSummary,
    project_dir: &str,
) -> Result<Option<SessionSummary>, String> {
    let meta = fs::metadata(file_path).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        return Ok(None);
    }
    if meta.len() <= offset {
        // File didn't actually grow or shrunk — full reparse
        return summarize_file(file_path, project_dir);
    }

    let mut file = fs::File::open(file_path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    let mut new_messages: u32 = 0;
    let mut new_tokens_input: u64 = 0;
    let mut new_tokens_output: u64 = 0;
    let mut new_tokens_cache_read: u64 = 0;
    let mut new_tokens_cache_write: u64 = 0;
    let mut last_activity: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.is_empty() {
            continue;
        }
        let entry: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match msg_type {
            "user" | "assistant" | "tool_use" | "tool_result" => new_messages += 1,
            _ => {}
        }

        if let Some(ts) = entry.get("timestamp").and_then(|v| v.as_str()) {
            last_activity = Some(ts.to_string());
        }

        if let Some(usage) = entry.get("message").and_then(|m| m.get("usage")) {
            new_tokens_input += usage
                .get("input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            new_tokens_output += usage
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            new_tokens_cache_read += usage
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            new_tokens_cache_write += usage
                .get("cache_creation_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
        }
    }

    cached.message_count += new_messages;
    cached.size_bytes = meta.len();
    if let Some(ts) = last_activity {
        cached.last_activity = Some(ts);
    }

    let add_tokens = |existing: Option<u64>, delta: u64| -> Option<u64> {
        if delta == 0 {
            return existing;
        }
        Some(existing.unwrap_or(0) + delta)
    };
    cached.tokens_input = add_tokens(cached.tokens_input, new_tokens_input);
    cached.tokens_output = add_tokens(cached.tokens_output, new_tokens_output);
    cached.tokens_cache_read = add_tokens(cached.tokens_cache_read, new_tokens_cache_read);
    cached.tokens_cache_write = add_tokens(cached.tokens_cache_write, new_tokens_cache_write);
    let total_delta =
        new_tokens_input + new_tokens_output + new_tokens_cache_read + new_tokens_cache_write;
    cached.tokens_total = add_tokens(cached.tokens_total, total_delta);

    Ok(Some(cached))
}

// ── Parse helpers ────────────────────────────────────────────────

#[derive(Default)]
struct ParseState {
    first_user_text: Option<String>,
    cwd: Option<String>,
    git_branch: Option<String>,
    model: Option<String>,
    session_id_raw: Option<String>,
    started_at: Option<String>,
    last_activity: Option<String>,
    message_count: u32,
    tokens_input: u64,
    tokens_output: u64,
    tokens_cache_read: u64,
    tokens_cache_write: u64,
}

fn process_line(line: &str, state: &mut ParseState) {
    if line.is_empty() {
        return;
    }
    let entry: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return,
    };

    let msg_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match msg_type {
        "user" | "assistant" | "tool_use" | "tool_result" => {
            state.message_count += 1;
        }
        _ => {}
    }

    if state.first_user_text.is_none() && msg_type == "user"
        && let Some(text) = extract_text_from_message(&entry)
            && !text.trim().is_empty() {
                state.first_user_text =
                    Some(truncate(&text, crate::constants::FIRST_MESSAGE_MAX_LEN));
            }

    if state.cwd.is_none()
        && let Some(c) = entry.get("cwd").and_then(|v| v.as_str()) {
            state.cwd = Some(c.to_string());
        }
    if state.git_branch.is_none()
        && let Some(b) = entry.get("gitBranch").and_then(|v| v.as_str()) {
            state.git_branch = Some(b.to_string());
        }
    if state.session_id_raw.is_none()
        && let Some(s) = entry.get("sessionId").and_then(|v| v.as_str()) {
            state.session_id_raw = Some(s.to_string());
        }
    if state.model.is_none()
        && let Some(m) = entry
            .get("message")
            .and_then(|msg| msg.get("model"))
            .and_then(|v| v.as_str())
        {
            state.model = Some(m.to_string());
        }

    if let Some(ts) = entry.get("timestamp").and_then(|v| v.as_str()) {
        if state.started_at.is_none() {
            state.started_at = Some(ts.to_string());
        }
        state.last_activity = Some(ts.to_string());
    }

    if let Some(usage) = entry.get("message").and_then(|m| m.get("usage")) {
        state.tokens_input += usage
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        state.tokens_output += usage
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        state.tokens_cache_read += usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        state.tokens_cache_write += usage
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
    }
}

fn build_summary(
    file_path: &Path,
    project_dir: &str,
    size_bytes: u64,
    state: &ParseState,
) -> SessionSummary {
    let id = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let title = truncate(
        state.first_user_text.as_deref().unwrap_or("(无标题)"),
        crate::constants::TITLE_MAX_LEN,
    );
    let tokens_total = state.tokens_input
        + state.tokens_output
        + state.tokens_cache_read
        + state.tokens_cache_write;

    SessionSummary {
        id,
        source: "claude-code".to_string(),
        title,
        file_path: file_path.to_string_lossy().to_string(),
        project_dir: project_dir.to_string(),
        first_user_message: state.first_user_text.clone(),
        cwd: state.cwd.clone(),
        git_branch: state.git_branch.clone(),
        model: state.model.clone(),
        session_id_raw: state.session_id_raw.clone(),
        started_at: state.started_at.clone(),
        last_activity: state.last_activity.clone(),
        message_count: state.message_count,
        size_bytes,
        subagent_count: 0,
        tokens_total: if tokens_total > 0 {
            Some(tokens_total)
        } else {
            None
        },
        tokens_input: if state.tokens_input > 0 {
            Some(state.tokens_input)
        } else {
            None
        },
        tokens_output: if state.tokens_output > 0 {
            Some(state.tokens_output)
        } else {
            None
        },
        tokens_cache_read: if state.tokens_cache_read > 0 {
            Some(state.tokens_cache_read)
        } else {
            None
        },
        tokens_cache_write: if state.tokens_cache_write > 0 {
            Some(state.tokens_cache_write)
        } else {
            None
        },
        estimated_cost_usd: None,
    }
}

fn extract_text_from_message(entry: &serde_json::Value) -> Option<String> {
    let content = entry.get("message")?.get("content")?;
    match content {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Array(arr) => {
            let mut parts = Vec::new();
            for item in arr {
                if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                    parts.push(text.to_string());
                }
            }
            if parts.is_empty() {
                None
            } else {
                Some(parts.join("\n"))
            }
        }
        _ => None,
    }
}

fn truncate(s: &str, max: usize) -> String {
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

    fn make_user_line(text: &str, ts: &str) -> String {
        format!(
            r#"{{"type":"user","timestamp":"{ts}","sessionId":"s1","cwd":"/home/test","message":{{"role":"user","content":"{text}"}}}}"#
        )
    }

    fn make_assistant_line(text: &str, ts: &str, tokens: u64) -> String {
        format!(
            r#"{{"type":"assistant","timestamp":"{ts}","message":{{"role":"assistant","model":"claude-sonnet-4","content":[{{"type":"text","text":"{text}"}}],"usage":{{"input_tokens":{tokens},"output_tokens":100}}}}}}"#
        )
    }

    fn write_session(dir: &TempDir, project: &str, session: &str, lines: &[String]) -> PathBuf {
        let proj_dir = dir.path().join(project);
        fs::create_dir_all(&proj_dir).unwrap();
        let file = proj_dir.join(format!("{session}.jsonl"));
        let mut f = fs::File::create(&file).unwrap();
        for line in lines {
            writeln!(f, "{}", line).unwrap();
        }
        file
    }

    #[test]
    fn test_summarize_basic() {
        let dir = TempDir::new().unwrap();
        let file = write_session(
            &dir,
            "proj-a",
            "sess-1",
            &[
                make_user_line("Hello world", "2026-05-01T10:00:00Z"),
                make_assistant_line("Hi there", "2026-05-01T10:01:00Z", 500),
            ],
        );

        let result = summarize_file(&file, "proj-a").unwrap().unwrap();
        assert_eq!(result.source, "claude-code");
        assert_eq!(result.id, "sess-1");
        assert_eq!(result.message_count, 2);
        assert_eq!(result.first_user_message, Some("Hello world".to_string()));
        assert_eq!(result.cwd, Some("/home/test".to_string()));
        assert_eq!(result.model, Some("claude-sonnet-4".to_string()));
        assert_eq!(result.tokens_total, Some(600));
        assert_eq!(result.started_at, Some("2026-05-01T10:00:00Z".to_string()));
        assert_eq!(
            result.last_activity,
            Some("2026-05-01T10:01:00Z".to_string())
        );
        assert_eq!(result.subagent_count, 0);
    }

    #[test]
    fn test_summarize_empty_file() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("p");
        fs::create_dir_all(&proj_dir).unwrap();
        let file = proj_dir.join("empty.jsonl");
        fs::File::create(&file).unwrap();

        let result = summarize_file(&file, "p").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_summarize_truncates_long_title() {
        let dir = TempDir::new().unwrap();
        let long_text = "a".repeat(200);
        let file = write_session(
            &dir,
            "p",
            "s",
            &[make_user_line(&long_text, "2026-05-01T10:00:00Z")],
        );

        let result = summarize_file(&file, "p").unwrap().unwrap();
        assert!(result.title.len() <= 84); // 80 + "…" (3 bytes in utf8)
    }

    #[test]
    fn test_token_accumulation() {
        let dir = TempDir::new().unwrap();
        let file = write_session(
            &dir,
            "p",
            "s",
            &[
                make_user_line("q1", "2026-05-01T10:00:00Z"),
                make_assistant_line("a1", "2026-05-01T10:01:00Z", 1000),
                make_user_line("q2", "2026-05-01T10:02:00Z"),
                make_assistant_line("a2", "2026-05-01T10:03:00Z", 2000),
            ],
        );

        let result = summarize_file(&file, "p").unwrap().unwrap();
        assert_eq!(result.message_count, 4);
        assert_eq!(result.tokens_total, Some(3200));
        assert_eq!(result.tokens_input, Some(3000));
        assert_eq!(result.tokens_output, Some(200));
    }

    #[test]
    fn test_scan_project_with_cache() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("test-project");
        fs::create_dir_all(&proj_dir).unwrap();

        // Write a session
        let file = proj_dir.join("sess-1.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, "{}", make_user_line("Hello", "2026-05-01T10:00:00Z")).unwrap();
        writeln!(
            f,
            "{}",
            make_assistant_line("Hi", "2026-05-01T10:01:00Z", 500)
        )
        .unwrap();

        // First scan — full parse
        let results1 = scan_single_project(&proj_dir);
        assert_eq!(results1.len(), 1);
        assert_eq!(results1[0].message_count, 2);

        // Cache should exist
        let cache_path = proj_dir.join(".session_cache.json");
        assert!(cache_path.exists());

        // Second scan — should use cache (same mtime/size)
        let results2 = scan_single_project(&proj_dir);
        assert_eq!(results2.len(), 1);
        assert_eq!(results2[0].message_count, 2);
    }

    #[test]
    fn test_subagent_counting() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("proj");
        fs::create_dir_all(&proj_dir).unwrap();

        // Main session
        let file = proj_dir.join("main-sess.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, "{}", make_user_line("Hello", "2026-05-01T10:00:00Z")).unwrap();

        // Subagents directory
        let sub_dir = proj_dir.join("main-sess").join("subagents");
        fs::create_dir_all(&sub_dir).unwrap();
        fs::File::create(sub_dir.join("agent-abc123.jsonl")).unwrap();
        fs::File::create(sub_dir.join("agent-def456.jsonl")).unwrap();
        fs::File::create(sub_dir.join("agent-ghi789.meta.json")).unwrap(); // not counted

        let results = scan_single_project(&proj_dir);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].subagent_count, 2);
    }

    #[test]
    fn test_invalidate_scan_cache() {
        // Ensure invalidate_scan_cache doesn't panic on empty cache
        invalidate_scan_cache();

        // After a scan, cache should be populated
        // (scan_all_sessions uses real home dir, so we test the
        //  invalidation mechanism in isolation via the static)
        {
            let guard = SCAN_CACHE.lock().unwrap();
            // After invalidation, should be None
            assert!(guard.is_none());
        }
    }

    #[test]
    fn test_truncate_short_string() {
        assert_eq!(truncate("hello", 80), "hello");
    }

    #[test]
    fn test_truncate_long_string() {
        let long = "a".repeat(200);
        let result = truncate(&long, 80);
        assert!(result.len() <= 84); // 80 + ellipsis
        assert!(result.ends_with('…'));
    }

    #[test]
    fn test_truncate_multibyte() {
        let s = "你好世界你好世界你好世界"; // each char is 3 bytes
        let result = truncate(s, 9); // should truncate after 3 chars (9 bytes)
        assert!(result.ends_with('…'));
    }

    #[test]
    fn test_extract_text_from_message_string_content() {
        let entry = serde_json::json!({
            "type": "user",
            "message": {"content": "Hello string"}
        });
        assert_eq!(
            extract_text_from_message(&entry),
            Some("Hello string".to_string())
        );
    }

    #[test]
    fn test_extract_text_from_message_array_content() {
        let entry = serde_json::json!({
            "type": "user",
            "message": {"content": [{"type": "text", "text": "part1"}, {"type": "text", "text": "part2"}]}
        });
        assert_eq!(
            extract_text_from_message(&entry),
            Some("part1\npart2".to_string())
        );
    }

    #[test]
    fn test_extract_text_from_message_no_message() {
        let entry = serde_json::json!({"type": "user"});
        assert_eq!(extract_text_from_message(&entry), None);
    }

    #[test]
    fn test_extract_text_from_message_empty_array() {
        let entry = serde_json::json!({
            "type": "user",
            "message": {"content": [{"type": "image"}]}
        });
        assert_eq!(extract_text_from_message(&entry), None);
    }

    #[test]
    fn test_determine_strategy_no_cache() {
        let strategy = determine_strategy("test.jsonl", 100, 1000, &None);
        assert!(matches!(strategy, ScanStrategy::FullParse));
    }

    #[test]
    fn test_determine_strategy_cached_match() {
        let summary = SessionSummary {
            id: "test".to_string(),
            source: "claude-code".to_string(),
            title: "t".to_string(),
            file_path: "/f".to_string(),
            project_dir: "p".to_string(),
            first_user_message: None,
            cwd: None,
            git_branch: None,
            model: None,
            session_id_raw: None,
            started_at: None,
            last_activity: None,
            message_count: 5,
            size_bytes: 100,
            subagent_count: 0,
            tokens_total: None,
            tokens_input: None,
            tokens_output: None,
            tokens_cache_read: None,
            tokens_cache_write: None,
            estimated_cost_usd: None,
        };
        let mut entries = HashMap::new();
        entries.insert(
            "test.jsonl".to_string(),
            CacheEntry {
                mtime_secs: 1000,
                size: 100,
                byte_offset: 100,
                summary: summary.clone(),
            },
        );
        let cache = Some(ProjectCache {
            version: CACHE_VERSION,
            entries,
        });
        let strategy = determine_strategy("test.jsonl", 100, 1000, &cache);
        assert!(matches!(strategy, ScanStrategy::UseCached(_)));
    }

    #[test]
    fn test_determine_strategy_incremental() {
        let summary = SessionSummary {
            id: "test".to_string(),
            source: "claude-code".to_string(),
            title: "t".to_string(),
            file_path: "/f".to_string(),
            project_dir: "p".to_string(),
            first_user_message: None,
            cwd: None,
            git_branch: None,
            model: None,
            session_id_raw: None,
            started_at: None,
            last_activity: None,
            message_count: 5,
            size_bytes: 100,
            subagent_count: 0,
            tokens_total: None,
            tokens_input: None,
            tokens_output: None,
            tokens_cache_read: None,
            tokens_cache_write: None,
            estimated_cost_usd: None,
        };
        let mut entries = HashMap::new();
        entries.insert(
            "test.jsonl".to_string(),
            CacheEntry {
                mtime_secs: 999,
                size: 100,
                byte_offset: 100,
                summary: summary.clone(),
            },
        );
        let cache = Some(ProjectCache {
            version: CACHE_VERSION,
            entries,
        });
        // File grew: size=200 > entry.size=100, offset=100 > 0
        let strategy = determine_strategy("test.jsonl", 200, 1001, &cache);
        assert!(matches!(strategy, ScanStrategy::Incremental { .. }));
    }

    #[test]
    fn test_determine_strategy_full_reparse_on_shrink() {
        let summary = SessionSummary {
            id: "test".to_string(),
            source: "claude-code".to_string(),
            title: "t".to_string(),
            file_path: "/f".to_string(),
            project_dir: "p".to_string(),
            first_user_message: None,
            cwd: None,
            git_branch: None,
            model: None,
            session_id_raw: None,
            started_at: None,
            last_activity: None,
            message_count: 5,
            size_bytes: 100,
            subagent_count: 0,
            tokens_total: None,
            tokens_input: None,
            tokens_output: None,
            tokens_cache_read: None,
            tokens_cache_write: None,
            estimated_cost_usd: None,
        };
        let mut entries = HashMap::new();
        entries.insert(
            "test.jsonl".to_string(),
            CacheEntry {
                mtime_secs: 999,
                size: 100,
                byte_offset: 100,
                summary: summary.clone(),
            },
        );
        let cache = Some(ProjectCache {
            version: CACHE_VERSION,
            entries,
        });
        // Size same but mtime changed — no growth, triggers FullParse
        let strategy = determine_strategy("test.jsonl", 100, 1001, &cache);
        assert!(matches!(strategy, ScanStrategy::FullParse));
    }

    #[test]
    fn test_summarize_incremental() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("inc-proj");
        fs::create_dir_all(&proj_dir).unwrap();

        // Write initial content
        let file = proj_dir.join("sess.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        let line1 = make_user_line("Hello", "2026-05-01T10:00:00Z");
        writeln!(f, "{}", line1).unwrap();
        drop(f);

        // Full parse first
        let initial = summarize_file(&file, "inc-proj").unwrap().unwrap();
        assert_eq!(initial.message_count, 1);
        let offset = fs::metadata(&file).unwrap().len();

        // Append more content
        let mut f = fs::OpenOptions::new().append(true).open(&file).unwrap();
        writeln!(
            f,
            "{}",
            make_assistant_line("Hi", "2026-05-01T10:01:00Z", 500)
        )
        .unwrap();
        writeln!(f, "{}", make_user_line("Thanks", "2026-05-01T10:02:00Z")).unwrap();
        drop(f);

        // Incremental parse
        let result = summarize_incremental(&file, offset, initial, "inc-proj")
            .unwrap()
            .unwrap();
        assert_eq!(result.message_count, 3);
        assert_eq!(
            result.last_activity,
            Some("2026-05-01T10:02:00Z".to_string())
        );
        assert_eq!(result.tokens_input, Some(500));
    }

    #[test]
    fn test_process_line_git_branch() {
        let line = r#"{"type":"attachment","timestamp":"2026-05-01T10:00:00Z","cwd":"/proj","gitBranch":"main"}"#;
        let mut state = ParseState::default();
        process_line(line, &mut state);
        assert_eq!(state.cwd, Some("/proj".to_string()));
        assert_eq!(state.git_branch, Some("main".to_string()));
    }

    #[test]
    fn test_process_line_session_id() {
        let line = r#"{"type":"user","timestamp":"2026-05-01T10:00:00Z","sessionId":"abc-123","message":{"content":"hi"}}"#;
        let mut state = ParseState::default();
        process_line(line, &mut state);
        assert_eq!(state.session_id_raw, Some("abc-123".to_string()));
        assert_eq!(state.message_count, 1);
    }

    #[test]
    fn test_process_line_empty() {
        let mut state = ParseState::default();
        process_line("", &mut state);
        assert_eq!(state.message_count, 0);
    }

    #[test]
    fn test_process_line_invalid_json() {
        let mut state = ParseState::default();
        process_line("not json at all", &mut state);
        assert_eq!(state.message_count, 0);
    }

    #[test]
    fn test_file_mtime_secs_nonexistent() {
        let result = file_mtime_secs(Path::new("/nonexistent/path/xyz"));
        assert_eq!(result, 0);
    }

    #[test]
    fn test_load_project_cache_nonexistent() {
        let dir = TempDir::new().unwrap();
        let result = load_project_cache(dir.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_load_project_cache_invalid_json() {
        let dir = TempDir::new().unwrap();
        let cache_path = dir.path().join(".session_cache.json");
        fs::write(&cache_path, "not json").unwrap();
        let result = load_project_cache(dir.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_load_project_cache_wrong_version() {
        let dir = TempDir::new().unwrap();
        let cache_path = dir.path().join(".session_cache.json");
        let bad_cache = serde_json::json!({"version": 999, "entries": {}});
        fs::write(&cache_path, bad_cache.to_string()).unwrap();
        let result = load_project_cache(dir.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_save_and_load_project_cache() {
        let dir = TempDir::new().unwrap();
        let cache = ProjectCache {
            version: CACHE_VERSION,
            entries: HashMap::new(),
        };
        save_project_cache(dir.path(), &cache);
        let loaded = load_project_cache(dir.path());
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap().version, CACHE_VERSION);
    }

    #[test]
    fn test_scan_result_empty() {
        let result = ScanResult::empty();
        assert!(result.sessions.is_empty());
        assert_eq!(result.scan_time_ms, 0);
    }
}
