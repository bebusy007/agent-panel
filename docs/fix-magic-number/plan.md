# Plan: Eliminate Magic Numbers from Frontend & Backend

## Context

Code review identified widespread magic numbers across both Rust backend and React frontend. Numeric literals like `300`, `80`, `1200`, `50`, `86400`, `256` etc. are used directly in business logic without names, making the code hard to understand, maintain, and keep consistent. This plan extracts all meaningful magic numbers into named constants with clear comments.

## Scope

**In scope**: All numeric literals used in logic, timeouts, limits, thresholds, buffer sizes, etc.

**Out of scope** (per user's instruction): Numbers that appear purely in CSS/styling contexts (Tailwind classes, inline `style` objects for layout).

## Approach: Two constants files, one per layer

### 1. Backend: `src-server/src/constants.rs`

New module file, added to `mod.rs`. All constants are `pub const` with doc-comments.

| Constant | Value | Used In | Meaning |
|---|---|---|---|
| `LOG_RETENTION_DAYS` | 14 | logging.rs:37 | Daily log file rotation retention |
| `ERROR_LOG_RETENTION_DAYS` | 30 | logging.rs:62 | Error log file retention |
| `WATCHER_BROADCAST_CAPACITY` | 256 | watcher/mod.rs:29 | Broadcast channel buffer for file watcher events |
| `WATCHER_KEEPALIVE_SECS` | 60 | watcher/mod.rs:95 | Watcher thread sleep interval (keepalive) |
| `TITLE_MAX_LEN` | 80 | sessions.rs:484, sessions_multi.rs:149,281,350 | Session title truncation limit |
| `FIRST_MESSAGE_MAX_LEN` | 300 | sessions.rs:436, sessions_multi.rs:124,258,353 | First user message preview truncation |
| `SKILL_DESC_MAX_LEN` | 200 | skills.rs:192 | Skill description truncation limit |
| `SUBAGENT_DESC_MAX_LEN` | 120 | session_loader.rs:733 | Subagent description truncation |
| `SNIPPET_RADIUS_SMALL` | 60 | session_loader.rs:799 | Search snippet context radius (in-session) |
| `CURSOR_SCAN_LINES` | 100 | sessions_multi.rs:237 | Max lines to scan per Cursor session file |
| `UUID_LEN` | 36 | sessions_multi.rs:175, images.rs:136 | Standard UUID string length (8-4-4-4-12) |
| `IMAGE_CACHE_MAX_AGE` | 86400 | images.rs:47,77 | HTTP Cache-Control max-age for images (1 day) |
| `EXPORT_TOOL_OUTPUT_MAX_LEN` | 500 | router/sessions.rs:132 | Tool output truncation in MD export |
| `DEFAULT_PAGE_LIMIT` | 50 | router/sessions.rs:236,326 | Default pagination limit for session list/search |
| `MIN_SEARCH_QUERY_LEN` | 2 | router/sessions.rs:232 | Minimum query length for cross-session search |
| `DEFAULT_ACTIVITY_WEEKS` | 52 | router/stats.rs:68 | Default weeks for activity heatmap |
| `STREAK_LOOKBACK_DAYS` | 365 | router/usage.rs:330 | Max days to walk for streak calculation |
| `TIMESTAMP_PREFIX_LEN` | 10 | router/usage.rs:129 | Length of "YYYY-MM-DD" date prefix |
| `MS_PER_SECOND` | 1000.0 | session_loader.rs:132 | Milliseconds per second (duration display) |
| `PERCENT_MULTIPLIER` | 100.0 | router/usage.rs:257 | Percentage calculation multiplier |

Note: `MAX_RESULTS` (100), `SNIPPET_RADIUS` (80), `CACHE_CAPACITY` (64) already defined in `search/full_text.rs` — no change needed. `CACHE_VERSION` (1) already defined in `sessions.rs` — no change needed.

### 2. Frontend: `web/src/lib/constants.ts`

New file with grouped, exported constants.

#### Timing / Delays

| Constant | Value | Used In | Meaning |
|---|---|---|---|
| `COPY_FEEDBACK_MS` | 1200 | MessageBlock:44, SessionItem:55, ToolCardHeader:196, RawJsonView:49, ImageLightbox:147 | "Copied!" feedback duration |
| `COPY_FEEDBACK_LONG_MS` | 1500 | SkillDetail:43, MCPDetail:31, ResumeMenu:55 | Longer copy feedback |
| `COPY_FEEDBACK_UPDATE_MS` | 2000 | UpdateBanner:33 | Copy feedback on update banner |
| `BOOT_MIN_DISPLAY_MS` | 600 | App.tsx:51 | Minimum splash screen display time |
| `BOOT_TIMEOUT_MS` | 5000 | App.tsx:69 | Max time to wait for server during boot |
| `TOOLTIP_DELAY_MS` | 300 | main.tsx:19 | Tooltip hover delay |
| `SCROLL_SIGNAL_COOLDOWN_MS` | 400 | MessageStream:189 | Scroll signal suppression window |
| `TURN_FLUSH_DEBOUNCE_MS` | 150 | MessageStream:231 | Turn sidebar update debounce |
| `SCROLL_TO_MSG_DELAY_MS` | 300 | MessageStream:264, SessionDetail:470 | Delay before scrollToIndex |
| `SCROLL_SNAP_DELAY_1_MS` | 320 | MessageStream:301, SessionDetail:486 | First snap-to-bottom retry |
| `SCROLL_SNAP_DELAY_2_MS` | 700 | MessageStream:302, SessionDetail:486 | Second snap-to-bottom retry |
| `SCROLL_TICK_MS` | 60 | MessageStream:279,344, SessionDetail:502 | RAF scheduling delay |
| `MAX_RETRY_FRAMES` | 12 | MessageStream:332,337, SessionDetail:495,497 | Max requestAnimationFrame retries for DOM query |
| `SCROLL_ANCHOR_OFFSET` | 20 | MessageStream:210 | Scroll anchor detection threshold (px) |

#### Text / Truncation Limits

| Constant | Value | Used In | Meaning |
|---|---|---|---|
| `TITLE_PREVIEW_MAX_LEN` | 200 | SessionItem:111 | Title display truncation |
| `FIRST_MSG_PREVIEW_MAX_LEN` | 400 | SessionItem:144 | First message preview truncation |
| `TOOL_INPUT_PREVIEW_LEN` | 80 | MessageBlock:184,191, ToolCardHeader:83 | Tool input inline preview truncation |
| `ASSISTANT_TEXT_PREVIEW_LEN` | 2000 | SubagentMessages:55 | Assistant text in subagent view |
| `USER_TEXT_PREVIEW_LEN` | 500 | SubagentMessages:63 | User text in subagent view |
| `EDIT_TAIL_MAX_LEN` | 800 | EditCard:177 | Edit card tool output tail truncation |
| `SESSION_ID_DISPLAY_LEN` | 12 | RightSidebar:336 | Session ID display truncation |
| `RIGHT_SIDEBAR_VALUE_MAX_LEN` | 60 | RightSidebar:481 | Generic value truncation in sidebar |

#### Thresholds / Limits

| Constant | Value | Used In | Meaning |
|---|---|---|---|
| `LONG_MESSAGE_LINE_THRESHOLD` | 12 | MessageBlock:58, SessionDetail:542 | Lines above which message is "long" |
| `LONG_MESSAGE_CHAR_THRESHOLD` | 1200 | MessageBlock:58, SessionDetail:542 | Chars above which message is "long" |
| `CHAR_PER_HUNDRED` | 100 | MessageBlock:103 | Divisor for "X百字" label |
| `HIGHLIGHT_SIZE_LIMIT` | 200_000 | ReadCard:97 | Max code size for syntax highlighting |
| `HIGHLIGHT_LINE_LIMIT` | 2000 | ReadCard:97 | Max lines for syntax highlighting |
| `SIDEBAR_SESSION_LIMIT` | 2000 | SessionsSidebar:45 | Max sessions to load in sidebar |
| `DEFAULT_COLLAPSED_CHIP_LIMIT` | 12 | CollapsibleProjectChips:23 | Default chips before "show more" |
| `FALLBACK_SOURCE_RANK` | 99 | ProjectFolderItem:241 | Unknown source sort rank |

#### Virtual List Estimates

| Constant | Value | Used In | Meaning |
|---|---|---|---|
| `ESTIMATE_SESSION_ITEM_HEIGHT` | 130 | VirtualSessionList:45,47 | Estimated session card height |
| `ESTIMATE_DETAIL_ROW_HEIGHT` | 200 | SessionDetail:448,449 | Estimated detail row height |
| `ESTIMATE_META_HEIGHT` | 34 | MessageStream:78,89 | Meta/thinking block height |
| `ESTIMATE_TOOL_HEIGHT` | 52 | MessageStream:80,82 | Tool use/result block height |
| `ESTIMATE_DEFAULT_HEIGHT` | 60 | MessageStream:74,95 | Fallback message height |
| `IMAGE_STRIP_EXTRA_HEIGHT` | 172 | MessageStream:75 | Extra height for image strip |
| `SHORT_TEXT_THRESHOLD` | 80 | MessageStream:85,91 | Text length → short estimate |
| `MEDIUM_TEXT_THRESHOLD` | 400 | MessageStream:85,91 | Text length → medium estimate |

#### Layout

| Constant | Value | Used In | Meaning |
|---|---|---|---|
| `RESUME_MENU_WIDTH` | 380 | ResumeMenu:27 | Resume dropdown menu width |
| `MASONRY_BREAKPOINT_XL` | 1600 | MasonryGrid:6 | 4→3 columns breakpoint |
| `MASONRY_BREAKPOINT_LG` | 1100 | MasonryGrid:7 | 3→2 columns breakpoint |
| `MASONRY_BREAKPOINT_SM` | 680 | MasonryGrid:8 | 2→1 column breakpoint |
| `DEFAULT_ACTIVITY_WEEKS` | 26 | ActivityWall:16 | Default weeks for activity wall |

## Files to Create

1. **`src-server/src/constants.rs`** — All backend constants with doc-comments
2. **`web/src/lib/constants.ts`** — All frontend constants, grouped by category

## Files to Modify

### Backend (~10 files)
- `src-server/src/main.rs` — add `mod constants;`
- `src-server/src/logging.rs` — replace 14, 30
- `src-server/src/watcher/mod.rs` — replace 256, 60
- `src-server/src/scanner/sessions.rs` — replace 300, 80
- `src-server/src/scanner/sessions_multi.rs` — replace 300, 80, 100, 36
- `src-server/src/scanner/session_loader.rs` — replace 120, 60, 1000.0
- `src-server/src/scanner/skills.rs` — replace 200
- `src-server/src/router/images.rs` — replace 86400, 36
- `src-server/src/router/sessions.rs` — replace 50, 500, 2
- `src-server/src/router/stats.rs` — replace 52
- `src-server/src/router/usage.rs` — replace 10, 365, 100.0

### Frontend (~15 files)
- `web/src/main.tsx` — replace 300
- `web/src/App.tsx` — replace 600, 5000
- `web/src/components/VirtualSessionList.tsx` — replace 130
- `web/src/components/SessionDetail.tsx` — replace 200, 300, 320, 700, 60, 12, 1200, 80
- `web/src/components/SessionItem.tsx` — replace 1200, 200, 400
- `web/src/components/session/MessageBlock.tsx` — replace 1200, 12, 1200, 80, 100
- `web/src/components/session/MessageStream.tsx` — replace 60, 172, 34, 52, 80, 400, 150, 300, etc.
- `web/src/components/session/ImageLightbox.tsx` — replace 1200
- `web/src/components/session/RightSidebar.tsx` — replace 12, 60
- `web/src/components/tool-cards/ToolCardHeader.tsx` — replace 1200, 80
- `web/src/components/tool-cards/RawJsonView.tsx` — replace 1200
- `web/src/components/tool-cards/cards/SubagentMessages.tsx` — replace 2000, 500
- `web/src/components/tool-cards/cards/EditCard.tsx` — replace 800
- `web/src/components/tool-cards/cards/ReadCard.tsx` — replace 200_000, 2000
- `web/src/components/ResumeMenu.tsx` — replace 380, 1500
- `web/src/components/MasonryGrid.tsx` — replace 1600, 1100, 680
- `web/src/components/ActivityWall.tsx` — replace 26
- `web/src/components/CollapsibleProjectChips.tsx` — replace 12
- `web/src/components/sidebar/SessionsSidebar.tsx` — replace 2000
- `web/src/components/sidebar/ProjectFolderItem.tsx` — replace 99
- `web/src/components/UpdateBanner.tsx` — replace 2000
- `web/src/components/SkillDetail.tsx` — replace 1500
- `web/src/components/MCPDetail.tsx` — replace 1500

## Verification

1. `cd src-server && cargo check` — Rust compiles
2. `cd web && npx tsc --noEmit` — TypeScript type-checks
3. `cd src-server && cargo test` — All Rust tests pass
4. `cd web && npx vitest run` — All frontend tests pass
5. Spot-check: grep for remaining bare numeric literals >1 in non-CSS contexts
