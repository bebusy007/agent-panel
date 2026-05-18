/**
 * Application-wide numeric constants.
 *
 * Every "magic number" used in business logic lives here so that
 * the intent is clear, duplicates are impossible, and changes
 * propagate automatically.
 */

// ── Timing / Delays ─────────────────────────────────────────────

/** "Copied!" feedback auto-dismiss (ms). */
export const COPY_FEEDBACK_MS = 1200;

/** Longer copy feedback used in detail panels (ms). */
export const COPY_FEEDBACK_LONG_MS = 1500;

/** Copy feedback on update banner (ms). */
export const COPY_FEEDBACK_UPDATE_MS = 2000;

/** Minimum splash-screen display time during boot (ms). */
export const BOOT_MIN_DISPLAY_MS = 600;

/** Maximum time to wait for server health before showing the app (ms). */
export const BOOT_TIMEOUT_MS = 5000;

/** Tooltip hover delay (ms). */
export const TOOLTIP_DELAY_MS = 300;

/** Suppression window after a programmatic scroll signal (ms). */
export const SCROLL_SIGNAL_COOLDOWN_MS = 400;

/** Debounce interval before flushing turn-index to React state (ms). */
export const TURN_FLUSH_DEBOUNCE_MS = 150;

/** Delay before executing scrollToIndex after a navigation (ms). */
export const SCROLL_TO_MSG_DELAY_MS = 300;

/** First snap-to-bottom retry delay (ms). */
export const SCROLL_SNAP_DELAY_1_MS = 320;

/** Second snap-to-bottom retry delay (ms). */
export const SCROLL_SNAP_DELAY_2_MS = 700;

/** Delay before scheduling a requestAnimationFrame tick (ms). */
export const SCROLL_TICK_MS = 60;

/** Max requestAnimationFrame retries when waiting for DOM elements. */
export const MAX_RETRY_FRAMES = 12;

/** Pixel threshold for scroll-anchor detection. */
export const SCROLL_ANCHOR_OFFSET = 20;

// ── Text / Truncation Limits ────────────────────────────────────

/** Title preview truncation (chars). */
export const TITLE_PREVIEW_MAX_LEN = 200;

/** First message preview truncation (chars). */
export const FIRST_MSG_PREVIEW_MAX_LEN = 400;

/** Inline tool-input preview truncation (chars). */
export const TOOL_INPUT_PREVIEW_LEN = 80;

/** Assistant text preview in subagent messages (chars). */
export const ASSISTANT_TEXT_PREVIEW_LEN = 2000;

/** User text preview in subagent messages (chars). */
export const USER_TEXT_PREVIEW_LEN = 500;

/** Edit card tail output truncation (chars). */
export const EDIT_TAIL_MAX_LEN = 800;

/** Session ID display truncation (chars). */
export const SESSION_ID_DISPLAY_LEN = 12;

/** Generic value truncation in the right sidebar (chars). */
export const RIGHT_SIDEBAR_VALUE_MAX_LEN = 60;

// ── Thresholds / Limits ─────────────────────────────────────────

/** Lines above which a message body is considered "long". */
export const LONG_MESSAGE_LINE_THRESHOLD = 12;

/** Chars above which a message body is considered "long". */
export const LONG_MESSAGE_CHAR_THRESHOLD = 1200;

/** Divisor for the "X百字" compact label. */
export const CHAR_PER_HUNDRED = 100;

/** Max code size (chars) before skipping syntax highlighting. */
export const HIGHLIGHT_SIZE_LIMIT = 200_000;

/** Max line count before skipping syntax highlighting. */
export const HIGHLIGHT_LINE_LIMIT = 2000;

/** Max sessions to load in the sidebar list. */
export const SIDEBAR_SESSION_LIMIT = 2000;

/** Default chips shown before "show more" in collapsible project chips. */
export const DEFAULT_COLLAPSED_CHIP_LIMIT = 12;

/** Sort rank for unknown session sources (higher = later). */
export const FALLBACK_SOURCE_RANK = 99;

// ── Virtual List Estimates (px) ─────────────────────────────────

/** Estimated height for a session card in the virtual list. */
export const ESTIMATE_SESSION_ITEM_HEIGHT = 130;

/** Estimated height for a detail-view row. */
export const ESTIMATE_DETAIL_ROW_HEIGHT = 200;

/** Estimated height for a meta / thinking block. */
export const ESTIMATE_META_HEIGHT = 34;

/** Estimated height for a tool_use / tool_result block. */
export const ESTIMATE_TOOL_HEIGHT = 52;

/** Fallback estimated height for a generic message. */
export const ESTIMATE_DEFAULT_HEIGHT = 60;

/** Extra height added when images are present. */
export const IMAGE_STRIP_EXTRA_HEIGHT = 172;

/** Text length below which a short height estimate is used. */
export const SHORT_TEXT_THRESHOLD = 80;

/** Text length below which a medium height estimate is used. */
export const MEDIUM_TEXT_THRESHOLD = 400;

// ── Layout ──────────────────────────────────────────────────────

/** Width of the resume dropdown menu (px). */
export const RESUME_MENU_WIDTH = 380;

/** Masonry breakpoint: 4→3 columns. */
export const MASONRY_BREAKPOINT_XL = 1600;

/** Masonry breakpoint: 3→2 columns. */
export const MASONRY_BREAKPOINT_LG = 1100;

/** Masonry breakpoint: 2→1 column. */
export const MASONRY_BREAKPOINT_SM = 680;

/** Default weeks shown in the activity wall heatmap. */
export const DEFAULT_ACTIVITY_WEEKS = 26;
