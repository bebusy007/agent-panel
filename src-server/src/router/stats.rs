use axum::{extract::Query, routing::get, Json, Router};
use serde::Deserialize;
use crate::scanner::{skills, mcps, sessions, extensions};

pub fn routes() -> Router {
    Router::new()
        .route("/stats", get(get_stats))
        .route("/stats/activity", get(get_activity))
}

async fn get_stats() -> Json<serde_json::Value> {
    let skills_list = skills::scan_skills();
    let mcps_list = mcps::scan_mcps();
    let sessions_result = sessions::scan_all_sessions();
    let hooks = extensions::scan_hooks();
    let agents = extensions::scan_agents();
    let plugins = extensions::scan_plugins();

    // Count unique sources
    let mut sources = std::collections::HashSet::new();
    for s in &sessions_result.sessions {
        sources.insert(s.source.as_str());
    }

    // Total tokens
    let total_tokens: u64 = sessions_result.sessions.iter()
        .filter_map(|s| s.tokens_total)
        .sum();

    // Total cost
    let total_cost: f64 = sessions_result.sessions.iter()
        .filter_map(|s| s.estimated_cost_usd)
        .sum();

    tracing::info!(
        skills = skills_list.len(),
        mcps = mcps_list.len(),
        sessions = sessions_result.sessions.len(),
        hooks = hooks.len(),
        agents = agents.len(),
        total_tokens = total_tokens,
        scan_time_ms = sessions_result.scan_time_ms,
        "get_stats → ok",
    );

    Json(serde_json::json!({
        "totals": {
            "skills": skills_list.len(),
            "mcps": mcps_list.len(),
            "sessions": sessions_result.sessions.len(),
            "hooks": hooks.len(),
            "agents": agents.len(),
            "plugins": plugins.len(),
            "sources": sources.len(),
            "totalTokens": total_tokens,
            "totalCostUsd": total_cost,
        },
        "scanTimeMs": sessions_result.scan_time_ms,
    }))
}

#[derive(Deserialize)]
struct ActivityParams {
    #[serde(default = "default_weeks")]
    weeks: u32,
}

fn default_weeks() -> u32 { crate::constants::DEFAULT_ACTIVITY_WEEKS }

async fn get_activity(Query(params): Query<ActivityParams>) -> Json<serde_json::Value> {
    tracing::info!(weeks = params.weeks, "get_activity request");
    let sessions_result = sessions::scan_all_sessions();
    let mut daily: std::collections::HashMap<String, DayStats> = std::collections::HashMap::new();

    for s in &sessions_result.sessions {
        let day = s.last_activity.as_deref()
            .unwrap_or("")
            .get(..10)
            .unwrap_or("")
            .to_string();
        if day.is_empty() { continue; }

        let entry = daily.entry(day).or_insert(DayStats { tokens: 0, sessions: 0, messages: 0 });
        entry.tokens += s.tokens_total.unwrap_or(0);
        entry.sessions += 1;
        entry.messages += s.message_count;
    }

    // Filter to requested weeks
    let cutoff = chrono::Utc::now() - chrono::Duration::weeks(params.weeks as i64);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

    let mut days: Vec<serde_json::Value> = daily.into_iter()
        .filter(|(date, _)| date.as_str() >= cutoff_str.as_str())
        .map(|(date, stats)| serde_json::json!({
            "date": date,
            "tokens": stats.tokens,
            "sessions": stats.sessions,
            "messages": stats.messages,
        }))
        .collect();

    days.sort_by(|a, b| a["date"].as_str().unwrap_or("").cmp(b["date"].as_str().unwrap_or("")));

    let total_tokens: u64 = days.iter().map(|d| d["tokens"].as_u64().unwrap_or(0)).sum();
    let total_sessions: u32 = days.iter().map(|d| d["sessions"].as_u64().unwrap_or(0) as u32).sum();

    Json(serde_json::json!({
        "weeks": params.weeks,
        "days": days,
        "totals": {
            "tokens": total_tokens,
            "sessions": total_sessions,
        }
    }))
}

struct DayStats {
    tokens: u64,
    sessions: u32,
    messages: u32,
}
