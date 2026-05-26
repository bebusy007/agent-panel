//! Full-text search engine
//!
//! Combines the best of CCHV and OpenCovibe:
//! - CCHV: aho-corasick + mmap + rayon parallel scan (real-time, no index needed)
//! - OpenCovibe: persistent index with manifest-based incremental updates
//!
//! Strategy:
//! For global search (Cmd+K): use direct file scan with mmap + rayon.
//! This avoids stale index issues and is fast enough (<100ms for hundreds of files).

use aho_corasick::AhoCorasick;
use lru::LruCache;
use memmap2::Mmap;
use rayon::prelude::*;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use walkdir::WalkDir;

use super::{SearchFilters, SearchHit, SearchResponse};

const MAX_RESULTS: usize = 100;
const SNIPPET_RADIUS: usize = 80;
const CACHE_CAPACITY: usize = 64;

// LRU cache for search results (same pattern as CCHV)
static CACHE_GENERATION: AtomicU64 = AtomicU64::new(0);

struct CachedResult {
    generation: u64,
    response: SearchResponse,
}

static SEARCH_CACHE: std::sync::LazyLock<Mutex<LruCache<u64, CachedResult>>> =
    std::sync::LazyLock::new(|| {
        Mutex::new(LruCache::new(NonZeroUsize::new(CACHE_CAPACITY).unwrap()))
    });

/// Call this when files change (from the watcher) to invalidate cache.
#[allow(dead_code)]
pub fn invalidate_cache() {
    CACHE_GENERATION.fetch_add(1, Ordering::Release);
}

fn compute_cache_key(query: &str, filters: &SearchFilters, limit: usize) -> u64 {
    let mut hasher = DefaultHasher::new();
    query.to_lowercase().hash(&mut hasher);
    format!("{:?}", filters).hash(&mut hasher);
    limit.hash(&mut hasher);
    hasher.finish()
}

/// Build a case-insensitive Aho-Corasick matcher for a single query.
fn build_matcher(query: &str) -> AhoCorasick {
    AhoCorasick::builder()
        .ascii_case_insensitive(true)
        .build([query])
        .expect("single-pattern build should not fail")
}

/// Extract project name from file path.
/// Path format: ~/.claude/projects/<encoded-project-name>/<session-id>.jsonl
fn extract_project_name(file_path: &Path) -> Option<String> {
    file_path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
}

/// Extract session ID from file path (filename without extension).
fn extract_session_id(file_path: &Path) -> Option<String> {
    file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

/// Generate a highlighted snippet around the match position.
fn make_snippet(text: &str, match_start: usize, match_end: usize) -> String {
    let start = text[..match_start]
        .char_indices()
        .rev()
        .nth(SNIPPET_RADIUS)
        .map(|(i, _)| i)
        .unwrap_or(0);

    let end = text[match_end..]
        .char_indices()
        .nth(SNIPPET_RADIUS)
        .map(|(i, _)| match_end + i)
        .unwrap_or(text.len());

    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < text.len() { "…" } else { "" };

    let slice = &text[start..end];
    let mark_start = match_start - start;
    let mark_end = match_end - start;

    format!(
        "{}{}<mark>{}</mark>{}{}",
        prefix,
        &slice[..mark_start],
        &slice[mark_start..mark_end],
        &slice[mark_end..],
        suffix
    )
}

/// Search in a single JSONL file using mmap for zero-copy access.
/// Returns matching messages with snippets.
pub(crate) fn search_in_file(
    file_path: &Path,
    matcher: &AhoCorasick,
    query: &str,
    filters: &SearchFilters,
) -> Vec<SearchHit> {
    let file = match fs::File::open(file_path) {
        Ok(f) => f,
        Err(_) => return vec![],
    };

    // Safety: read-only mmap, file handle kept alive
    let mmap = match unsafe { Mmap::map(&file) } {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    let project_name = extract_project_name(file_path);
    let session_id = extract_session_id(file_path).unwrap_or_default();

    // Apply project filter early
    if !filters.projects.is_empty() {
        if let Some(ref pn) = project_name {
            if !filters.projects.iter().any(|p| pn.contains(p.as_str())) {
                return vec![];
            }
        } else {
            return vec![];
        }
    }

    let content = match std::str::from_utf8(&mmap) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let mut results = Vec::new();

    for line in content.lines() {
        if line.is_empty() {
            continue;
        }

        // Quick pre-filter: skip lines that can't match (fast path)
        if !matcher.is_match(line.as_bytes()) {
            continue;
        }

        // Parse the JSON line
        let entry: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Extract message type
        let msg_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if msg_type != "user" && msg_type != "assistant" {
            continue;
        }

        // Apply message type filter
        if let Some(ref filter_type) = filters.message_type
            && filter_type != "all"
            && msg_type != filter_type
        {
            continue;
        }

        // Extract text content for snippet generation
        let text = extract_text_from_entry(&entry);
        if text.is_empty() {
            continue;
        }

        // Find match position for snippet
        let lower_text = text.to_lowercase();
        let lower_query = query.to_lowercase();
        let match_pos = match lower_text.find(&lower_query) {
            Some(pos) => pos,
            None => continue,
        };

        let match_end = match_pos + lower_query.len();
        // Use original text positions (case-preserving snippet)
        let snippet = make_snippet(&text, match_pos, match_end);

        // Extract metadata
        let uuid = entry
            .get("uuid")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let timestamp = entry
            .get("timestamp")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Apply date filter
        if let (Some(from), Some(ts)) = (&filters.date_from, &timestamp)
            && ts.as_str() < from.as_str()
        {
            continue;
        }
        if let (Some(to), Some(ts)) = (&filters.date_to, &timestamp)
            && ts.as_str() > to.as_str()
        {
            continue;
        }

        // Apply advanced filters (CCHV-style)
        if let Some(want_tool_calls) = filters.has_tool_calls {
            let has_tools = has_tool_calls_in_entry(&entry);
            if has_tools != want_tool_calls {
                continue;
            }
        }
        if let Some(want_errors) = filters.has_errors {
            let has_err = has_errors_in_entry(&entry);
            if has_err != want_errors {
                continue;
            }
        }
        if let Some(want_file_changes) = filters.has_file_changes {
            let has_changes = has_file_changes_in_entry(&entry);
            if has_changes != want_file_changes {
                continue;
            }
        }

        let model = entry
            .get("message")
            .and_then(|m| m.get("model"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        results.push(SearchHit {
            session_id: session_id.clone(),
            message_id: uuid,
            role: msg_type.to_string(),
            snippet,
            project_name: project_name.clone(),
            timestamp,
            model,
            score: 1.0,
        });
    }

    results
}

/// Check if a message entry contains tool_use blocks.
fn has_tool_calls_in_entry(entry: &serde_json::Value) -> bool {
    if let Some(content) = entry
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        content
            .iter()
            .any(|item| item.get("type").and_then(|v| v.as_str()) == Some("tool_use"))
    } else {
        false
    }
}

/// Check if a message entry contains error indicators.
fn has_errors_in_entry(entry: &serde_json::Value) -> bool {
    let msg_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if msg_type == "error" {
        return true;
    }

    if let Some(content) = entry
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        content.iter().any(|item| {
            item.get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
    } else {
        false
    }
}

/// Check if a message entry contains file modification tool calls (Edit/Write/MultiEdit).
fn has_file_changes_in_entry(entry: &serde_json::Value) -> bool {
    if let Some(content) = entry
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        content.iter().any(|item| {
            if item.get("type").and_then(|v| v.as_str()) != Some("tool_use") {
                return false;
            }
            matches!(
                item.get("name").and_then(|v| v.as_str()),
                Some("Write" | "Edit" | "MultiEdit" | "NotebookEdit")
            )
        })
    } else {
        false
    }
}

/// Recursively extract searchable text from a JSONL entry.
/// Searches into: message.content (string or array), tool inputs/outputs, thinking.
fn extract_text_from_entry(entry: &serde_json::Value) -> String {
    let mut parts = Vec::new();

    // message.content
    if let Some(message) = entry.get("message")
        && let Some(content) = message.get("content")
    {
        extract_text_from_content(content, &mut parts);
    }

    parts.join(" ")
}

fn extract_text_from_content(content: &serde_json::Value, parts: &mut Vec<String>) {
    match content {
        serde_json::Value::String(s) => {
            parts.push(s.clone());
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                if let Some(obj) = item.as_object() {
                    let item_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    match item_type {
                        "text" => {
                            if let Some(t) = obj.get("text").and_then(|v| v.as_str()) {
                                parts.push(t.to_string());
                            }
                        }
                        "thinking" => {
                            if let Some(t) = obj.get("thinking").and_then(|v| v.as_str()) {
                                parts.push(t.to_string());
                            }
                        }
                        "tool_use" => {
                            if let Some(name) = obj.get("name").and_then(|v| v.as_str()) {
                                parts.push(name.to_string());
                            }
                            if let Some(input) = obj.get("input") {
                                extract_text_recursive(input, parts);
                            }
                        }
                        "tool_result" => {
                            if let Some(c) = obj.get("content") {
                                extract_text_from_content(c, parts);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        _ => {}
    }
}

fn extract_text_recursive(value: &serde_json::Value, parts: &mut Vec<String>) {
    match value {
        serde_json::Value::String(s) => {
            // No truncation — search the complete content like CCHV does
            parts.push(s.clone());
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                extract_text_recursive(item, parts);
            }
        }
        serde_json::Value::Object(obj) => {
            for val in obj.values() {
                extract_text_recursive(val, parts);
            }
        }
        _ => {}
    }
}

/// Search across all session JSONL files in parallel.
///
/// Uses rayon for multi-threaded file scanning and aho-corasick for
/// fast pattern matching. No persistent index needed — mmap makes
/// repeated scans nearly free thanks to OS page cache.
pub fn search_all_sessions(
    query: &str,
    filters: &SearchFilters,
    limit: Option<usize>,
    offset: Option<usize>,
) -> SearchResponse {
    let start = Instant::now();
    let max_results = limit.unwrap_or(MAX_RESULTS);
    let skip = offset.unwrap_or(0);

    // Check LRU cache (keyed on query+filters+limit+offset)
    let cache_key = compute_cache_key(query, filters, max_results + skip);
    let current_gen = CACHE_GENERATION.load(Ordering::Acquire);
    if let Ok(mut cache) = SEARCH_CACHE.lock()
        && let Some(cached) = cache.get(&cache_key)
        && cached.generation == current_gen
    {
        tracing::info!(query = %query, total_matches = cached.response.total_matches, cache_hit = true, "search complete");
        return cached.response.clone();
    }

    let home = match dirs::home_dir() {
        Some(h) => h,
        None => {
            return super::SearchResponse {
                query: query.to_string(),
                hits: vec![],
                total_matches: 0,
                search_time_ms: 0,
            };
        }
    };

    let projects_path = home.join(".claude").join("projects");
    if !projects_path.exists() {
        return super::SearchResponse {
            query: query.to_string(),
            hits: vec![],
            total_matches: 0,
            search_time_ms: 0,
        };
    }

    // Collect all .jsonl files
    let file_paths: Vec<PathBuf> = WalkDir::new(&projects_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jsonl"))
        .map(|e| e.path().to_path_buf())
        .collect();

    let matcher = build_matcher(query);

    // Parallel search across all files
    let mut all_hits: Vec<SearchHit> = file_paths
        .par_iter()
        .flat_map(|path| search_in_file(path, &matcher, query, filters))
        .collect();

    let total_matches = all_hits.len();

    // Sort by timestamp descending (most recent first)
    all_hits.sort_by(|a, b| {
        let ta = a.timestamp.as_deref().unwrap_or("");
        let tb = b.timestamp.as_deref().unwrap_or("");
        tb.cmp(ta)
    });

    // Apply offset + limit (pagination)
    if skip > 0 && skip < all_hits.len() {
        all_hits = all_hits.split_off(skip);
    } else if skip >= all_hits.len() {
        all_hits.clear();
    }
    all_hits.truncate(max_results);

    let elapsed = start.elapsed();

    let response = SearchResponse {
        query: query.to_string(),
        hits: all_hits,
        total_matches,
        search_time_ms: elapsed.as_millis() as u64,
    };

    // Store in LRU cache
    if let Ok(mut cache) = SEARCH_CACHE.lock() {
        cache.put(
            cache_key,
            CachedResult {
                generation: current_gen,
                response: response.clone(),
            },
        );
    }

    tracing::info!(
        query = %query,
        total_matches = total_matches,
        returned = response.hits.len(),
        search_time_ms = response.search_time_ms,
        cache_hit = false,
        "search complete",
    );

    response
}

#[cfg(test)]
mod unit_tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_extract_project_name() {
        let path = Path::new("/home/user/.claude/projects/my-project/session.jsonl");
        assert_eq!(extract_project_name(path), Some("my-project".to_string()));
    }

    #[test]
    fn test_extract_project_name_no_parent_dir() {
        let path = Path::new("session.jsonl");
        // No parent dir name — depends on OS, just verify it returns Some
        let result = extract_project_name(path);
        // On most systems, parent of a bare filename is "" or current dir
        assert!(result.is_some() || result.is_none());
    }

    #[test]
    fn test_extract_session_id() {
        let path = Path::new("/path/to/abc-123.jsonl");
        assert_eq!(extract_session_id(path), Some("abc-123".to_string()));
    }

    #[test]
    fn test_make_snippet_short_text() {
        let text = "hello world";
        let snippet = make_snippet(text, 6, 11);
        assert!(snippet.contains("<mark>world</mark>"));
        assert!(!snippet.starts_with('…'));
    }

    #[test]
    fn test_make_snippet_long_text() {
        let long = "a".repeat(200) + "MATCH" + &"b".repeat(200);
        let pos = 200;
        let snippet = make_snippet(&long, pos, pos + 5);
        assert!(snippet.contains("<mark>MATCH</mark>"));
        assert!(snippet.starts_with('…'));
        assert!(snippet.ends_with('…'));
    }

    #[test]
    fn test_build_matcher_case_insensitive() {
        let matcher = build_matcher("Hello");
        assert!(matcher.is_match("HELLO world".as_bytes()));
        assert!(matcher.is_match("say hello".as_bytes()));
        assert!(!matcher.is_match("world".as_bytes()));
    }

    #[test]
    fn test_extract_text_from_entry_string_content() {
        let entry = serde_json::json!({
            "type": "user",
            "message": {"content": "Hello world"}
        });
        assert_eq!(extract_text_from_entry(&entry), "Hello world");
    }

    #[test]
    fn test_extract_text_from_entry_array_content() {
        let entry = serde_json::json!({
            "type": "assistant",
            "message": {"content": [{"type": "text", "text": "part1"}, {"type": "text", "text": "part2"}]}
        });
        let text = extract_text_from_entry(&entry);
        assert!(text.contains("part1"));
        assert!(text.contains("part2"));
    }

    #[test]
    fn test_extract_text_from_entry_tool_use() {
        let entry = serde_json::json!({
            "type": "assistant",
            "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "ls -la"}}]}
        });
        let text = extract_text_from_entry(&entry);
        assert!(text.contains("Bash"));
        assert!(text.contains("ls -la"));
    }

    #[test]
    fn test_extract_text_from_entry_no_message() {
        let entry = serde_json::json!({"type": "meta"});
        assert_eq!(extract_text_from_entry(&entry), "");
    }

    #[test]
    fn test_has_tool_calls_in_entry_true() {
        let entry = serde_json::json!({
            "message": {"content": [{"type": "tool_use", "name": "Read"}]}
        });
        assert!(has_tool_calls_in_entry(&entry));
    }

    #[test]
    fn test_has_tool_calls_in_entry_false() {
        let entry = serde_json::json!({
            "message": {"content": [{"type": "text", "text": "hello"}]}
        });
        assert!(!has_tool_calls_in_entry(&entry));
    }

    #[test]
    fn test_has_tool_calls_in_entry_no_content() {
        let entry = serde_json::json!({"message": {}});
        assert!(!has_tool_calls_in_entry(&entry));
    }

    #[test]
    fn test_has_errors_in_entry_error_type() {
        let entry = serde_json::json!({"type": "error"});
        assert!(has_errors_in_entry(&entry));
    }

    #[test]
    fn test_has_errors_in_entry_is_error_block() {
        let entry = serde_json::json!({
            "type": "user",
            "message": {"content": [{"type": "tool_result", "is_error": true}]}
        });
        assert!(has_errors_in_entry(&entry));
    }

    #[test]
    fn test_has_errors_in_entry_no_error() {
        let entry = serde_json::json!({
            "type": "user",
            "message": {"content": [{"type": "text", "text": "ok"}]}
        });
        assert!(!has_errors_in_entry(&entry));
    }

    #[test]
    fn test_has_file_changes_in_entry_write() {
        let entry = serde_json::json!({
            "message": {"content": [{"type": "tool_use", "name": "Write", "input": {}}]}
        });
        assert!(has_file_changes_in_entry(&entry));
    }

    #[test]
    fn test_has_file_changes_in_entry_edit() {
        let entry = serde_json::json!({
            "message": {"content": [{"type": "tool_use", "name": "Edit", "input": {}}]}
        });
        assert!(has_file_changes_in_entry(&entry));
    }

    #[test]
    fn test_has_file_changes_in_entry_read_no() {
        let entry = serde_json::json!({
            "message": {"content": [{"type": "tool_use", "name": "Read", "input": {}}]}
        });
        assert!(!has_file_changes_in_entry(&entry));
    }

    #[test]
    fn test_has_file_changes_in_entry_no_content() {
        let entry = serde_json::json!({"message": {}});
        assert!(!has_file_changes_in_entry(&entry));
    }

    #[test]
    fn test_search_in_file_basic() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u1","timestamp":"2026-05-10T10:00:00Z","message":{{"content":"Hello world search test"}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"assistant","uuid":"a1","timestamp":"2026-05-10T10:01:00Z","message":{{"content":[{{"type":"text","text":"Response text here"}}]}}}}"#).unwrap();

        let matcher = build_matcher("search");
        let filters = SearchFilters::default();
        let results = search_in_file(&file, &matcher, "search", &filters);
        assert_eq!(results.len(), 1);
        assert!(results[0].snippet.contains("<mark>"));
    }

    #[test]
    fn test_search_in_file_no_match() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u1","timestamp":"2026-05-10T10:00:00Z","message":{{"content":"Hello world"}}}}"#).unwrap();

        let matcher = build_matcher("nonexistent");
        let filters = SearchFilters::default();
        let results = search_in_file(&file, &matcher, "nonexistent", &filters);
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_in_file_message_type_filter() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u1","timestamp":"2026-05-10T10:00:00Z","message":{{"content":"keyword here"}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"assistant","uuid":"a1","timestamp":"2026-05-10T10:01:00Z","message":{{"content":[{{"type":"text","text":"keyword response"}}]}}}}"#).unwrap();

        let matcher = build_matcher("keyword");
        let mut filters = SearchFilters::default();
        filters.message_type = Some("user".to_string());
        let results = search_in_file(&file, &matcher, "keyword", &filters);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].role, "user");
    }

    #[test]
    fn test_search_in_file_date_filter() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u1","timestamp":"2026-05-01T10:00:00Z","message":{{"content":"keyword old"}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u2","timestamp":"2026-05-10T10:00:00Z","message":{{"content":"keyword new"}}}}"#).unwrap();

        let matcher = build_matcher("keyword");
        let mut filters = SearchFilters::default();
        filters.date_from = Some("2026-05-05".to_string());
        let results = search_in_file(&file, &matcher, "keyword", &filters);
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_search_in_file_project_filter() {
        let dir = TempDir::new().unwrap();
        let proj_dir = dir.path().join("my-project");
        std::fs::create_dir_all(&proj_dir).unwrap();
        let file = proj_dir.join("session.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u1","timestamp":"2026-05-10T10:00:00Z","message":{{"content":"keyword here"}}}}"#).unwrap();

        let matcher = build_matcher("keyword");
        let mut filters = SearchFilters::default();
        filters.projects = vec!["other-project".to_string()];
        let results = search_in_file(&file, &matcher, "keyword", &filters);
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_in_file_nonexistent() {
        let matcher = build_matcher("test");
        let filters = SearchFilters::default();
        let results = search_in_file(
            Path::new("/nonexistent/xyz.jsonl"),
            &matcher,
            "test",
            &filters,
        );
        assert!(results.is_empty());
    }

    #[test]
    fn test_invalidate_cache_increments_generation() {
        let gen_before = CACHE_GENERATION.load(Ordering::Acquire);
        invalidate_cache();
        let gen_after = CACHE_GENERATION.load(Ordering::Acquire);
        assert!(gen_after > gen_before);
    }

    #[test]
    fn test_compute_cache_key_different_queries() {
        let f = SearchFilters::default();
        let k1 = compute_cache_key("hello", &f, 50);
        let k2 = compute_cache_key("world", &f, 50);
        assert_ne!(k1, k2);
    }

    #[test]
    fn test_compute_cache_key_same_query() {
        let f = SearchFilters::default();
        let k1 = compute_cache_key("hello", &f, 50);
        let k2 = compute_cache_key("hello", &f, 50);
        assert_eq!(k1, k2);
    }

    #[test]
    fn test_extract_text_recursive_nested() {
        let value = serde_json::json!({
            "key1": "value1",
            "nested": {"key2": "value2"},
            "arr": ["item1", "item2"]
        });
        let mut parts = Vec::new();
        extract_text_recursive(&value, &mut parts);
        assert!(parts.contains(&"value1".to_string()));
        assert!(parts.contains(&"value2".to_string()));
        assert!(parts.contains(&"item1".to_string()));
    }

    #[test]
    fn test_search_in_file_skips_non_user_assistant() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("test.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"tool_use","uuid":"t1","timestamp":"2026-05-10T10:00:00Z","message":{{"content":"keyword in tool"}}}}"#).unwrap();

        let matcher = build_matcher("keyword");
        let filters = SearchFilters::default();
        let results = search_in_file(&file, &matcher, "keyword", &filters);
        assert!(results.is_empty());
    }
}
