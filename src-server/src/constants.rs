//! Application-wide numeric constants.
//!
//! Every "magic number" used in business logic lives here so that
//! the intent is clear, duplicates are impossible, and changes
//! propagate automatically.

// ── Logging ─────────────────────────────────────────────────────

/// Daily log rotation — keep 14 days of general logs.
pub const LOG_RETENTION_DAYS: usize = 14;

/// Error-only log rotation — keep 30 days for post-mortem.
pub const ERROR_LOG_RETENTION_DAYS: usize = 30;

// ── File watcher ────────────────────────────────────────────────

/// Broadcast channel capacity for file-change events pushed to WS clients.
pub const WATCHER_BROADCAST_CAPACITY: usize = 256;

/// Keep-alive sleep interval (seconds) for the watcher thread.
pub const WATCHER_KEEPALIVE_SECS: u64 = 60;

// ── Text truncation ─────────────────────────────────────────────

/// Session title display limit (bytes). Titles beyond this are truncated with "…".
pub const TITLE_MAX_LEN: usize = 80;

/// First user message preview limit (bytes).
pub const FIRST_MESSAGE_MAX_LEN: usize = 300;

/// Skill description truncation limit (bytes).
pub const SKILL_DESC_MAX_LEN: usize = 200;

/// Subagent description truncation limit (chars).
pub const SUBAGENT_DESC_MAX_LEN: usize = 120;

// ── Search ──────────────────────────────────────────────────────

/// Context radius (chars) around a match in in-session search snippets.
pub const SNIPPET_RADIUS_SMALL: usize = 60;

/// Minimum query length for cross-session full-text search.
pub const MIN_SEARCH_QUERY_LEN: usize = 2;

// ── Scanner limits ──────────────────────────────────────────────

/// Max lines to scan per Cursor session file (quick metadata extraction).
pub const CURSOR_SCAN_LINES: usize = 100;

/// Standard UUID string length: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
pub const UUID_LEN: usize = 36;

// ── Session scan cache ──────────────────────────────────────────

/// Time-to-live for the in-memory session scan cache (seconds).
/// Requests within this window reuse the cached result without re-scanning.
pub const SESSION_CACHE_TTL_SECS: u64 = 5;

// ── HTTP / API ──────────────────────────────────────────────────

/// HTTP `Cache-Control: max-age` for served images (1 day in seconds).
pub const IMAGE_CACHE_MAX_AGE: u32 = 86400;

/// Tool output truncation in Markdown export.
pub const EXPORT_TOOL_OUTPUT_MAX_LEN: usize = 500;

/// Default pagination limit for session list / search endpoints.
pub const DEFAULT_PAGE_LIMIT: usize = 50;

// ── Usage & activity ────────────────────────────────────────────

/// Default number of weeks for the activity heatmap endpoint.
pub const DEFAULT_ACTIVITY_WEEKS: u32 = 52;

/// Max days to walk backwards when computing usage streaks.
pub const STREAK_LOOKBACK_DAYS: u32 = 365;

/// Length of the "YYYY-MM-DD" date prefix extracted from timestamps.
pub const TIMESTAMP_PREFIX_LEN: usize = 10;

/// Fast-scan marker string used to locate timestamps in raw JSONL lines.
pub const TIMESTAMP_MARKER: &str = "\"timestamp\":\"";

// ── Unit conversions ────────────────────────────────────────────

/// Milliseconds per second — used when displaying durations.
pub const MS_PER_SECOND: f64 = 1000.0;

/// Multiplier to convert a 0–1 ratio to a percentage.
pub const PERCENT_MULTIPLIER: f64 = 100.0;
