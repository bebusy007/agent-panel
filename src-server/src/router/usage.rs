//! Usage overview — scans session JSONL files per-line to build accurate
//! daily token/message aggregates. Follows OpenCovibe's approach: each message's
//! tokens land on the day its timestamp indicates (NOT the session's last_activity).

use axum::{Json, Router, extract::Query, routing::get};
use rayon::prelude::*;
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use crate::scanner::sessions;

pub fn routes() -> Router {
    Router::new().route("/usage/overview", get(usage_overview))
}

#[derive(Deserialize)]
struct UsageParams {
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    days: Option<u32>,
}

// ── Per-file scan result ──

#[derive(Default)]
struct FileDaily {
    /// date → { model → TokenCounts }
    tokens_by_model: HashMap<String, HashMap<String, TokenCounts>>,
    /// date → message count
    messages: HashMap<String, u32>,
}

#[derive(Default, Clone)]
struct TokenCounts {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
}

// ── Scan a single JSONL file (OpenCovibe-style fast scan) ──

fn scan_file_daily(path: &PathBuf) -> FileDaily {
    let mut result = FileDaily::default();

    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return result,
    };
    let reader = BufReader::new(file);

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.len() < 20 {
            continue;
        }

        // Claude Code: messages have "type":"user"/"assistant", usage in message.usage
        // Codex: messages have "type":"event_msg" with sub-type, usage in payload.info.total_token_usage
        let has_cc_usage = line.contains("\"cache_read_input_tokens\"");
        let is_cc_message =
            line.contains("\"type\":\"user\"") || line.contains("\"type\":\"assistant\"");
        let is_codex_message =
            line.contains("\"user_message\"") || line.contains("\"agent_message\"");
        let has_codex_usage = line.contains("\"total_token_usage\"");

        if !is_cc_message && !has_cc_usage && !is_codex_message && !has_codex_usage {
            continue;
        }

        // Count messages
        if (is_cc_message || is_codex_message)
            && let Some(date) = extract_date_fast(&line)
        {
            *result.messages.entry(date).or_default() += 1;
        }

        if !has_cc_usage && !has_codex_usage {
            continue;
        }

        // Full parse for token extraction
        let entry: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let timestamp = match entry.get("timestamp").and_then(|v| v.as_str()) {
            Some(ts) if ts.len() >= 10 => &ts[..10],
            _ => continue,
        };

        // Claude Code format: message.usage.{input_tokens, output_tokens, ...}
        if has_cc_usage
            && let Some(message) = entry.get("message")
            && let Some(usage) = message.get("usage")
        {
            let model = message
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("<unknown>")
                .to_string();
            let inp = usage
                .get("input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let out = usage
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let cr = usage
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let cw = usage
                .get("cache_creation_input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            let tc = result
                .tokens_by_model
                .entry(timestamp.to_string())
                .or_default()
                .entry(model)
                .or_default();
            tc.input += inp;
            tc.output += out;
            tc.cache_read += cr;
            tc.cache_write += cw;
        }

        // Codex format: payload.info.last_token_usage.{input_tokens, output_tokens}
        if has_codex_usage
            && let Some(usage) = entry
                .get("payload")
                .and_then(|p| p.get("info"))
                .and_then(|i| i.get("last_token_usage"))
        {
            let inp = usage
                .get("input_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let out = usage
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            let tc = result
                .tokens_by_model
                .entry(timestamp.to_string())
                .or_default()
                .entry("codex".to_string())
                .or_default();
            tc.input += inp;
            tc.output += out;
        }
    }

    result
}

/// Fast extraction of date (YYYY-MM-DD) from a line containing "timestamp":"..."
fn extract_date_fast(line: &str) -> Option<String> {
    let marker = crate::constants::TIMESTAMP_MARKER;
    let pos = line.find(marker)? + marker.len();
    if pos + crate::constants::TIMESTAMP_PREFIX_LEN > line.len() {
        return None;
    }
    let date = &line[pos..pos + crate::constants::TIMESTAMP_PREFIX_LEN];
    if date.len() == crate::constants::TIMESTAMP_PREFIX_LEN
        && date.as_bytes()[4] == b'-'
        && date.as_bytes()[7] == b'-'
    {
        Some(date.to_string())
    } else {
        None
    }
}

// ── Response types ──

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DailyAggregate {
    date: String,
    input_tokens: u64,
    output_tokens: u64,
    message_count: u32,
    session_count: u32,
    cost_usd: f64,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ModelAggregate {
    model: String,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
    cost_usd: f64,
    pct: f64,
}

// ── Main handler ──

async fn usage_overview(Query(params): Query<UsageParams>) -> Json<serde_json::Value> {
    tracing::info!(
        source = params.source.as_deref().unwrap_or("all"),
        days = ?params.days,
        "usage_overview request",
    );
    let scan_result = sessions::scan_all_sessions();
    let mut sessions_list = scan_result.sessions;

    if let Some(source) = &params.source {
        sessions_list.retain(|s| &s.source == source);
    }

    // Scan claude-code + codex sessions (both have usage/message data in JSONL)
    let scannable: Vec<(&str, PathBuf)> = sessions_list
        .iter()
        .filter(|s| s.source == "claude-code" || s.source == "codex")
        .map(|s| (s.source.as_str(), PathBuf::from(&s.file_path)))
        .collect();
    let file_paths: Vec<PathBuf> = scannable.iter().map(|(_, p)| p.clone()).collect();

    // Parallel per-file scan
    let file_results: Vec<FileDaily> = file_paths.par_iter().map(scan_file_daily).collect();

    // Merge into daily aggregates
    let mut daily_map: BTreeMap<String, DailyBuilder> = BTreeMap::new();
    let mut daily_sessions: HashMap<String, HashSet<usize>> = HashMap::new();

    for (file_idx, fd) in file_results.iter().enumerate() {
        // Merge token data
        for (date, models) in &fd.tokens_by_model {
            let day = daily_map.entry(date.clone()).or_default();
            daily_sessions
                .entry(date.clone())
                .or_default()
                .insert(file_idx);

            for tc in models.values() {
                day.input_tokens += tc.input + tc.cache_read + tc.cache_write;
                day.output_tokens += tc.output;
            }
        }

        // Merge message counts
        for (date, count) in &fd.messages {
            let day = daily_map.entry(date.clone()).or_default();
            day.message_count += count;
            daily_sessions
                .entry(date.clone())
                .or_default()
                .insert(file_idx);
        }
    }

    // Cursor Agent: contribute session + message count from file mtime (no timestamp per line)
    for (cursor_idx, s) in sessions_list.iter().enumerate() {
        if s.source != "cursor-agent" {
            continue;
        }
        if let Some(ts) = s.last_activity.as_deref().or(s.started_at.as_deref())
            && ts.len() >= 10
        {
            let date = &ts[..10];
            let day = daily_map.entry(date.to_string()).or_default();
            day.message_count += s.message_count;
            daily_sessions
                .entry(date.to_string())
                .or_default()
                .insert(file_paths.len() + cursor_idx);
        }
    }

    // Apply days filter
    let cutoff = params.days.map(|d| {
        let dt = chrono::Utc::now() - chrono::Duration::days(d as i64);
        dt.format("%Y-%m-%d").to_string()
    });

    let date_in_range = |date: &str| -> bool { cutoff.as_ref().is_none_or(|c| date >= c.as_str()) };

    // Build daily list (filtered by date range)
    let daily: Vec<DailyAggregate> = daily_map
        .iter()
        .filter(|(date, _)| date_in_range(date))
        .map(|(date, d)| DailyAggregate {
            date: date.clone(),
            input_tokens: d.input_tokens,
            output_tokens: d.output_tokens,
            message_count: d.message_count,
            session_count: daily_sessions.get(date).map_or(0, |s| s.len() as u32),
            cost_usd: 0.0,
        })
        .collect();

    // Totals — derived from the filtered `daily` so they respond to days/source filters
    let total_tokens: u64 = daily.iter().map(|d| d.input_tokens + d.output_tokens).sum();
    let total_messages: u32 = daily.iter().map(|d| d.message_count).sum();
    let total_sessions: u32 = daily.iter().map(|d| d.session_count).sum();

    // Active days & streaks
    let active_days = daily
        .iter()
        .filter(|d| d.message_count > 0 || d.input_tokens > 0)
        .count();
    let (current_streak, longest_streak) = compute_streaks(&daily);

    // Model aggregates — also filtered by date range
    let mut filtered_model_map: HashMap<String, ModelBuilder> = HashMap::new();
    for (file_idx, fd) in file_results.iter().enumerate() {
        let _ = file_idx;
        for (date, models) in &fd.tokens_by_model {
            if !date_in_range(date) {
                continue;
            }
            for (model, tc) in models {
                let ma = filtered_model_map.entry(model.clone()).or_default();
                ma.input_tokens += tc.input;
                ma.output_tokens += tc.output;
                ma.cache_read += tc.cache_read;
                ma.cache_write += tc.cache_write;
            }
        }
    }

    let total_model_tokens: u64 = filtered_model_map
        .values()
        .map(|m| m.input_tokens + m.output_tokens + m.cache_read + m.cache_write)
        .sum();

    let mut by_model: Vec<ModelAggregate> = filtered_model_map
        .into_iter()
        .map(|(model, m)| {
            let tokens = m.input_tokens + m.output_tokens + m.cache_read + m.cache_write;
            let pct = if total_model_tokens > 0 {
                tokens as f64 / total_model_tokens as f64 * crate::constants::PERCENT_MULTIPLIER
            } else {
                0.0
            };
            ModelAggregate {
                model,
                input_tokens: m.input_tokens,
                output_tokens: m.output_tokens,
                cache_read_tokens: m.cache_read,
                cache_write_tokens: m.cache_write,
                cost_usd: 0.0,
                pct,
            }
        })
        .collect();
    by_model.sort_by(|a, b| {
        let ta = a.input_tokens + a.output_tokens + a.cache_read_tokens + a.cache_write_tokens;
        let tb = b.input_tokens + b.output_tokens + b.cache_read_tokens + b.cache_write_tokens;
        tb.cmp(&ta)
    });

    // By source — filter sessions by date range via last_activity
    let mut by_source: HashMap<String, u32> = HashMap::new();
    for s in &sessions_list {
        let in_range = s
            .last_activity
            .as_deref()
            .map(|ts| date_in_range(&ts[..ts.len().min(10)]))
            .unwrap_or(false);
        if in_range {
            *by_source.entry(s.source.clone()).or_default() += 1;
        }
    }
    let by_source_list: Vec<serde_json::Value> = by_source
        .iter()
        .map(|(source, count)| serde_json::json!({ "source": source, "count": count }))
        .collect();

    Json(serde_json::json!({
        "totalSessions": total_sessions,
        "totalTokens": total_tokens,
        "totalCostUsd": 0.0,
        "totalMessages": total_messages,
        "activeDays": active_days,
        "currentStreak": current_streak,
        "longestStreak": longest_streak,
        "daily": daily,
        "heatmap": daily,
        "byModel": by_model,
        "bySource": by_source_list,
    }))
}

#[derive(Default)]
struct DailyBuilder {
    input_tokens: u64,
    output_tokens: u64,
    message_count: u32,
}

#[derive(Default)]
struct ModelBuilder {
    input_tokens: u64,
    output_tokens: u64,
    cache_read: u64,
    cache_write: u64,
}

pub(crate) fn compute_streaks(daily: &[DailyAggregate]) -> (u32, u32) {
    if daily.is_empty() {
        return (0, 0);
    }

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let active_dates: HashSet<&str> = daily
        .iter()
        .filter(|d| d.message_count > 0 || d.input_tokens > 0)
        .map(|d| d.date.as_str())
        .collect();

    let mut current = 0u32;
    let mut longest = 0u32;
    let mut streak = 0u32;

    // Walk backwards from today
    let mut date = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Utc::now().date_naive());

    // Current streak: consecutive days ending today (or yesterday)
    let mut checking_current = true;
    for _ in 0..crate::constants::STREAK_LOOKBACK_DAYS {
        let ds = date.format("%Y-%m-%d").to_string();
        if active_dates.contains(ds.as_str()) {
            if checking_current {
                current += 1;
            }
            streak += 1;
            longest = longest.max(streak);
        } else {
            if checking_current && current == 0 {
                // Allow yesterday as start
            } else {
                checking_current = false;
            }
            longest = longest.max(streak);
            streak = 0;
        }
        date -= chrono::Duration::days(1);
    }
    longest = longest.max(streak);

    (current, longest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_extract_date_fast_valid() {
        let line = r#"{"timestamp":"2026-05-10T14:30:00Z","type":"user","message":"hello"}"#;
        assert_eq!(extract_date_fast(line), Some("2026-05-10".to_string()));
    }

    #[test]
    fn test_extract_date_fast_no_timestamp() {
        let line = r#"{"type":"user","message":"hello"}"#;
        assert_eq!(extract_date_fast(line), None);
    }

    #[test]
    fn test_extract_date_fast_malformed_date() {
        let line = r#"{"timestamp":"not-a-date","type":"user"}"#;
        assert_eq!(extract_date_fast(line), None);
    }

    #[test]
    fn test_extract_date_fast_short_timestamp() {
        let line = r#"{"timestamp":"20"}"#;
        assert_eq!(extract_date_fast(line), None);
    }

    #[test]
    fn test_compute_streaks_empty() {
        let daily: Vec<DailyAggregate> = vec![];
        let (current, longest) = compute_streaks(&daily);
        assert_eq!(current, 0);
        assert_eq!(longest, 0);
    }

    #[test]
    fn test_compute_streaks_single_old_day() {
        // A day older than STREAK_LOOKBACK_DAYS (365) won't be reached by the walker
        let daily = vec![DailyAggregate {
            date: "2020-01-01".to_string(),
            input_tokens: 100,
            output_tokens: 50,
            message_count: 5,
            session_count: 1,
            cost_usd: 0.0,
        }];
        let (current, longest) = compute_streaks(&daily);
        assert_eq!(current, 0);
        // Day is too old to be found in lookback, so longest is also 0
        assert_eq!(longest, 0);
    }

    #[test]
    fn test_compute_streaks_today() {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let daily = vec![DailyAggregate {
            date: today,
            input_tokens: 100,
            output_tokens: 50,
            message_count: 5,
            session_count: 1,
            cost_usd: 0.0,
        }];
        let (current, longest) = compute_streaks(&daily);
        assert_eq!(current, 1);
        assert_eq!(longest, 1);
    }

    #[test]
    fn test_compute_streaks_consecutive_days() {
        let today = chrono::Utc::now().date_naive();
        let yesterday = today - chrono::Duration::days(1);
        let day_before = today - chrono::Duration::days(2);
        let daily = vec![
            DailyAggregate {
                date: day_before.format("%Y-%m-%d").to_string(),
                input_tokens: 10,
                output_tokens: 5,
                message_count: 1,
                session_count: 1,
                cost_usd: 0.0,
            },
            DailyAggregate {
                date: yesterday.format("%Y-%m-%d").to_string(),
                input_tokens: 10,
                output_tokens: 5,
                message_count: 1,
                session_count: 1,
                cost_usd: 0.0,
            },
            DailyAggregate {
                date: today.format("%Y-%m-%d").to_string(),
                input_tokens: 10,
                output_tokens: 5,
                message_count: 1,
                session_count: 1,
                cost_usd: 0.0,
            },
        ];
        let (current, longest) = compute_streaks(&daily);
        assert_eq!(current, 3);
        assert_eq!(longest, 3);
    }

    #[test]
    fn test_compute_streaks_gap_breaks_streak() {
        let today = chrono::Utc::now().date_naive();
        let three_days_ago = today - chrono::Duration::days(3);
        let four_days_ago = today - chrono::Duration::days(4);
        let daily = vec![
            DailyAggregate {
                date: four_days_ago.format("%Y-%m-%d").to_string(),
                input_tokens: 10,
                output_tokens: 5,
                message_count: 1,
                session_count: 1,
                cost_usd: 0.0,
            },
            DailyAggregate {
                date: three_days_ago.format("%Y-%m-%d").to_string(),
                input_tokens: 10,
                output_tokens: 5,
                message_count: 1,
                session_count: 1,
                cost_usd: 0.0,
            },
            DailyAggregate {
                date: today.format("%Y-%m-%d").to_string(),
                input_tokens: 10,
                output_tokens: 5,
                message_count: 1,
                session_count: 1,
                cost_usd: 0.0,
            },
        ];
        let (current, longest) = compute_streaks(&daily);
        assert_eq!(current, 1);
        assert_eq!(longest, 2);
    }

    #[test]
    fn test_compute_streaks_zero_activity_day_ignored() {
        let today = chrono::Utc::now().date_naive();
        let daily = vec![DailyAggregate {
            date: today.format("%Y-%m-%d").to_string(),
            input_tokens: 0,
            output_tokens: 0,
            message_count: 0,
            session_count: 1,
            cost_usd: 0.0,
        }];
        let (current, longest) = compute_streaks(&daily);
        assert_eq!(current, 0);
        assert_eq!(longest, 0);
    }

    #[test]
    fn test_scan_file_daily_basic() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("session.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(
            f,
            r#"{{"timestamp":"2026-05-10T10:00:00Z","type":"user","message":"hello"}}"#
        )
        .unwrap();
        writeln!(f, r#"{{"timestamp":"2026-05-10T10:01:00Z","type":"assistant","message":{{"model":"claude-sonnet-4","usage":{{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":20,"cache_creation_input_tokens":10}}}}}}"#).unwrap();
        writeln!(
            f,
            r#"{{"timestamp":"2026-05-11T09:00:00Z","type":"user","message":"another day"}}"#
        )
        .unwrap();

        let path = std::path::PathBuf::from(file);
        let result = scan_file_daily(&path);
        assert_eq!(*result.messages.get("2026-05-10").unwrap_or(&0), 2);
        assert_eq!(*result.messages.get("2026-05-11").unwrap_or(&0), 1);
        let day_models = result.tokens_by_model.get("2026-05-10").unwrap();
        let tc = day_models.get("claude-sonnet-4").unwrap();
        assert_eq!(tc.input, 100);
        assert_eq!(tc.output, 50);
        assert_eq!(tc.cache_read, 20);
        assert_eq!(tc.cache_write, 10);
    }

    #[test]
    fn test_scan_file_daily_nonexistent() {
        let path = std::path::PathBuf::from("/tmp/nonexistent_session_file_xyz.jsonl");
        let result = scan_file_daily(&path);
        assert!(result.messages.is_empty());
        assert!(result.tokens_by_model.is_empty());
    }

    #[test]
    fn test_scan_file_daily_codex_format() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("codex.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        // user_message line triggers message count
        writeln!(f, r#"{{"timestamp":"2026-05-10T10:00:00Z","type":"event_msg","payload":{{"type":"user_message","message":"hi"}}}}"#).unwrap();
        // The code checks for "total_token_usage" substring, then parses payload.info.last_token_usage
        writeln!(f, r#"{{"timestamp":"2026-05-10T10:01:00Z","type":"response_item","payload":{{"info":{{"total_token_usage":{{"input_tokens":500}},"last_token_usage":{{"input_tokens":200,"output_tokens":80}}}}}}}}"#).unwrap();

        let path = std::path::PathBuf::from(file);
        let result = scan_file_daily(&path);
        assert_eq!(*result.messages.get("2026-05-10").unwrap_or(&0), 1);
        let day_models = result.tokens_by_model.get("2026-05-10");
        assert!(day_models.is_some());
        let codex_tc = day_models.unwrap().get("codex").unwrap();
        assert_eq!(codex_tc.input, 200);
        assert_eq!(codex_tc.output, 80);
    }

    #[test]
    fn test_scan_file_daily_short_lines_skipped() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("short.jsonl");
        let mut f = std::fs::File::create(&file).unwrap();
        writeln!(f, "short").unwrap();
        writeln!(f, "").unwrap();

        let path = std::path::PathBuf::from(file);
        let result = scan_file_daily(&path);
        assert!(result.messages.is_empty());
    }
}
