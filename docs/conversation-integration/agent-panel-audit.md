# Agent Panel Codebase Audit

> Date: 2026-05-28
> Purpose: Foundation analysis for conversation integration feature planning
> Repository: /Users/wangshujun/workspace/agent-panel/

---

## 1. Project Structure

### Backend (Rust) — `src-server/`

```
src-server/src/
  main.rs               # Axum HTTP server, starts on port 7788, serves SPA + API
  constants.rs          # Application-wide numeric constants
  models/
    mod.rs              # Module declarations
    session.rs          # SessionSummary model (TypeScript-generatable via ts-rs)
    skill.rs            # SkillSummary model
  router/
    mod.rs              # Router assembly — merges all sub-routers into /api
    sessions.rs         # GET/POST session endpoints
    ws.rs               # WebSocket endpoint (/api/ws)
    search.rs           # POST /api/search/messages
    skills.rs           # GET /api/skills, /api/skills/:id
    mcps.rs             # GET /api/mcps, /api/mcps/:name
    extensions.rs       # GET /api/extensions/{hooks,agents,plugins,commands,summary}
    stats.rs            # GET /api/stats, /api/stats/activity
    usage.rs            # GET /api/usage/overview
    favorites.rs        # CRUD for /api/favorites/*
    images.rs           # GET image serving + POST /api/open-folder
    resume.rs           # POST /api/sessions/resume (terminal/IDE resume)
    trash.rs            # POST sessions/trash, /restore, /permanent-delete; GET trash/list
    logs.rs             # POST /api/logs (ingest), GET /api/logs/files, /api/logs/content
    health.rs           # GET /api/health
    version.rs          # GET /api/version
    sources.rs          # GET /api/sources
    log_level.rs        # Dynamic log level
    *_tests.rs          # Integration tests
  scanner/
    mod.rs              # Module declarations
    session_loader.rs   # Message loading + parsing (core: JSONL -> Message[])
    sessions.rs         # Session scanning — SessionSummary per file, caching
    sessions_multi.rs   # Multi-provider: Codex + Cursor scanning
    extensions.rs       # Hooks/agents/plugins scanner
    mcps.rs             # MCP server scanner
    skills.rs           # Skills scanner
  search/
    mod.rs              # SearchHit, SearchFilters, SearchResponse types
    full_text.rs        # Full-text search engine (aho-corasick)
    index.rs            # Search index
    tests.rs
  watcher/
    mod.rs              # File watcher (notify) — broadcasts events via broadcast::channel
  logging.rs            # Logging initialization
  panic_hook.rs         # Crash reporter
  test_utils.rs         # Test helpers
```

### Frontend (React) — `web/src/`

```
web/src/
  App.tsx               # Routes, Modal Route Pattern for overlays
  main.tsx              # React entry point
  index.css             # Global CSS, design tokens, dark/light mode
  lib/
    api.ts              # Complete API client (types + functions matching Rust)
    constants.ts        # Numeric JS constants
    ansi.ts             # ANSI → HTML rendering (ansi-to-html)
    highlight.tsx       # Highlight.js React integration + DOM highlighting
    highlight-shared.ts
    role-theme.ts       # Role color/icon themes (user, assistant, etc.)
    tool-aliases.ts     # Cross-agent tool name normalization
    tool-colors.ts      # Tool-specific color palettes
    tool-rendering.ts   # Render helpers (language detection, path shortening)
    tool-result-pairing.ts # Pair tool_use <-> tool_result by toolUseId
    turn-grouping.ts    # Message stream → turn segmentation
    hooks.ts            # useAsync, useCachedAsync, useDebounced
    events.ts           # CustomEvent bus (sessions:changed, favorites:changed)
    file-entries.ts     # Extract file Read/Write/Edit from messages
    text-cleanup.ts     # Cleanup prompt text (strip Cursor/Claude XML wrappers)
    xml-tag-parser.ts   # Parse <system-reminder> etc.
    xml-tag-registry.ts # XML tag registry for SystemXmlBlock
    typography.ts       # Typography helpers
    utils.ts            # General utilities (date formatting, CN, clipboard)
    use-detail-nav.ts   # Overlay navigation with backgroundLocation
    use-drag-resize.ts  # Drag-to-resize panels
    use-session-search.ts # In-session search state management
    sidebar-state.ts    # Sidebar width/collapse persistence
    sidebar-groups.ts   # Sidebar grouping logic
    logger.ts           # Client-side logger
    schemas/
      index.ts, session.ts # Zod schemas (lightweight)
  pages/
    Dashboard.tsx       # Overview page (stats, heatmap, recent sessions)
    SessionsView.tsx    # Sessions list + full-text search
    SessionDetailView.tsx # Session detail: TurnSidebar + SessionDetail + RightSidebar
    SessionsTrashView.tsx # Trash management
    SkillsView.tsx      # Skills browser
    SkillDetailView.tsx
    MCPsView.tsx        # MCP server list
    MCPDetailView.tsx
    ExtensionsView.tsx  # Extensions/hooks/agents/plugins
    AgentDetailView.tsx
    FavoritesView.tsx   # Favorited messages
    UsageView.tsx       # Token usage analytics
    SettingsView.tsx    # App settings
    LogsView.tsx        # Log viewer
    NotFound.tsx        # 404 page
  components/
    Layout.tsx          # App shell: IconRail + SidebarPanel + main + overlay
    SessionDetail.tsx   # Message list (legacy + context-driven modes)
    ResumeMenu.tsx      # "Resume" popup with terminal/IDE commands
    SearchBar.tsx       # Search input
    VirtualSessionList.tsx # Virtualized session list
    MasonryGrid.tsx     # CSS column masonry layout
    SessionItem.tsx     # Session card
    SourceBar.tsx       # Horizontal source distribution bar
    StatsCard.tsx       # Stat counter card
    SkillCard/SkillDetail.tsx
    MCPCard/MCPDetail.tsx
    FilterChips.tsx     # Filter chip component
    CollapsibleProjectChips.tsx
    ConfirmDialog.tsx   # Confirmation modal
    ErrorBoundary.tsx   # React error boundary
    GlobalLoading.tsx   # Global loading screen
    ThemeProvider.tsx   # Dark/light theme toggle
    ActivityWall.tsx    # Activity visualization
    InPaneSearch.tsx    # In-pane search for Skills/MCPs
    UpdateBanner.tsx    # Update notification banner
    sidebar/
      IconRail.tsx      # Vertical icon rail (leftmost)
      SidebarPanel.tsx  # Session list sidebar panel
      SessionsSidebar.tsx # Session list in sidebar
      ProjectFolderItem.tsx
    session/
      SessionContext.tsx # React context for session detail state
      MessageBlock.tsx  # Individual message rendering (context-driven)
      MessageStream.tsx # Virtualized message list with scroll tracking
      MessageToolbar.tsx # Role filter + search bar
      TurnSidebar.tsx   # Turn navigation sidebar
      RightSidebar.tsx  # Right panel (tools/files/info/context tabs)
      MetaBlock.tsx     # Meta message block
      CollapsibleBody.tsx # Long message collapse/expand
      MarkdownWithHighlight.tsx # Markdown + search highlight
      ImageThumbnail.tsx / ImageThumbnailStrip.tsx / ImageLightbox.tsx
      SystemXmlBlock.tsx # Renders <system-reminder>, <command-message> etc.
    tool-cards/
      ToolCard.tsx      # Dispatcher: canonical tool -> specialized card
      ToolCardHeader.tsx # Tool card header (name, status, pretty/raw toggle)
      RawJsonView.tsx   # Raw JSON view for all tools
      IdBadge.tsx       # UUID/ToolUseId badge
      cards/
        BashCard.tsx    # Bash: command + ANSI-colored output
        ReadCard.tsx    # Read: file path + line-numbered code highlighting
        EditCard.tsx    # Edit/MultiEdit: unified diff with line numbers
        WriteCard.tsx   # Write: code content + syntax highlighting
        GrepCard.tsx    # Grep/Glob/LS: pattern + results
        WebFetchCard.tsx # WebFetch/WebSearch: URL + markdown response
        TaskCard.tsx    # Task/Agent: subagent info, expandable conversation
        TodoWriteCard.tsx # TodoWrite: rendered todo list
        ExitPlanModeCard.tsx
        AskUserQuestionCard.tsx # Questions + options (read-only, historical)
        DefaultCard.tsx # Fallback: JSON input + smart output (XML/markdown/text)
        SubagentMessages.tsx # Subagent message rendering
    ui/
      badge.tsx, button.tsx, card.tsx, dialog.tsx, dropdown-menu.tsx,
      input.tsx, separator.tsx, skeleton.tsx, switch.tsx, tabs.tsx, tooltip.tsx
    usage/
      HeatmapCalendar.tsx # GitHub-style heatmap
```

---

## 2. Backend API — Complete Endpoint Catalog

All routes mounted at `/api`. Built in `router/mod.rs`:

```rust
pub fn build_api_router(...) -> Router {
    Router::new()
        .merge(logs::routes(log_dir))
        .merge(health::routes())
        .merge(skills::routes())
        .merge(search::routes())
        .merge(sessions::routes())
        .merge(images::routes())
        .merge(mcps::routes())
        .merge(extensions::routes())
        .merge(stats::routes())
        .merge(favorites::routes())
        .merge(usage::routes())
        .merge(trash::routes())
        .merge(resume::routes())
        .merge(sources::routes())
        .merge(version::routes())
        .merge(ws::routes(watcher_tx));
    // Conditionally adds log_level::routes()
}
```

### Complete endpoint table

| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | `{status, server, version}` |
| GET | `/version` | `{version, name, runtime}` |
| GET | `/stats` | `{totals: {skills, mcps, sessions, hooks, agents, plugins, sources, totalTokens, totalCostUsd}, scanTimeMs}` |
| GET | `/stats/activity?weeks=N` | `{weeks, days[], totals}` |
| GET | `/skills` | `{skills: SkillSummary[], total}` |
| GET | `/skills/:id` | `{skill: SkillSummary}` or `{error}` |
| GET | `/mcps` | `{mcps: McpSummary[], total}` |
| GET | `/mcps/:name` | `{mcp: McpSummary}` or `{error}` |
| GET | `/sessions?source=&q=&limit=&sort_by=` | `{total, sessions: SessionSummary[], scanTimeMs}` |
| GET | `/sessions/projects` | `{projects: [{projectDir, sessionCount, totalTokens, lastActivity}]}` |
| GET | `/sessions/search?q=&limit=` | `{q, hits: SearchHit[], total, searchTimeMs}` |
| GET | `/sessions/health` | `{status, sessionCount, scanTimeMs}` |
| **POST** | `/sessions/refresh` | `{ok, sessionCount, scanTimeMs}` |
| **GET** | `/sessions/:id` | `{session, messages, messageCount, subagents, resumeHints}` |
| GET | `/sessions/:id/search?q=&limit=` | `{q, hits[], total}` |
| GET | `/sessions/:id/export.md` | Markdown file |
| GET | `/sessions/:id/subagent/:agent_hash` | `{meta, messages}` |
| GET | `/sessions/:session_id/images/:message_id/:index?cache_path=` | Image bytes (PNG/JPEG/GIF/WebP) |
| **POST** | `/sessions/trash` | `{trashed[], errors[]}` (body: `{filePaths[]}`) |
| **POST** | `/sessions/restore` | `{restored[], errors[]}` |
| **POST** | `/sessions/permanent-delete` | `{deleted[], errors[]}` |
| GET | `/sessions/trash/list` | `{items[], total}` |
| **POST** | `/sessions/resume` | `{ok, mode, hints}` or `{error}` (body: `{sessionId, mode}`) |
| **POST** | `/search/messages` | `{query, hits: SearchHit[], totalMatches, searchTimeMs}` (body: `{query, filters?, limit?, offset?}`) |
| GET | `/extensions/hooks` | `{hooks: HookEntry[]}` |
| GET | `/extensions/agents` | `{agents: AgentEntry[]}` |
| GET | `/extensions/plugins` | `{plugins: PluginEntry[]}` |
| GET | `/extensions/commands` | `{commands: CommandEntry[], total}` |
| GET | `/extensions/summary` | `{hooks, agents, plugins}` |
| GET | `/usage/overview?source=&days=` | `{totalSessions, totalTokens, totalCostUsd, totalMessages, activeDays, currentStreak, longestStreak, daily[], heatmap[], byModel[], bySource[]}` |
| GET | `/favorites` | `{favorites[], total}` (enriched with session/message data) |
| **POST** | `/favorites` | `{favorite}` or `{error}` |
| **DELETE** | `/favorites/:id` | `{ok}` or `{error}` |
| **DELETE** | `/favorites/by-message/:session_id/:message_id` | `{ok}` or `{error}` |
| GET | `/favorites/session/:session_id` | `{favorites[]}` |
| **POST** | `/open-folder` | `{ok}` or error (body: `{path}`) |
| GET | `/sources` | `{sources: [{type, count}]}` |
| **POST** | `/logs` | 204 No Content (ingests frontend log entries) |
| GET | `/logs/files` | `{files: LogFileInfo[]}` |
| GET | `/logs/content?file=` | `{file, entries[], totalLines}` |
| **GET (WS)** | `/ws` | WebSocket upgrade — streams file-change events |

### Key API Observations

- **No POST/PUT for creating sessions** — the app is entirely read-only for session data. Sessions are read from `~/.claude/projects/` and other directories.
- **No POST for sending messages** — there is no endpoint for sending user prompts to AI agents.
- **No server-sent events** — only WebSocket for file watcher events.
- **WebSocket endpoint** (`/ws`) streams `WatchEvent` objects: `{kind: "session_changed"|"skills_changed"|"agents_changed"|"plugins_changed"|"settings_changed", paths: string[]}`.
- **Resume endpoint** — `/sessions/resume` does NOT run Claude or an AI agent. It launches a terminal (iTerm/Terminal/Ghostty) or IDE (VS Code/Cursor) via `osascript` on macOS, or opens `code`/`cursor` CLI on other platforms. It is a convenience to help users continue a past session in their regular terminal/IDE.

---

## 3. Session Data Model

### Message struct (`scanner/session_loader.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,                        // "{uuid}-b{N}" or "codex-{N}" or "cursor-{N}"
    pub role: String,                      // "user" | "assistant" | "tool_use" | "tool_result" | "system" | "meta"
    pub text: Option<String>,              // Message body text (markdown for assistant)
    pub tool_name: Option<String>,         // Only tool_use: "Bash", "Read", etc.
    pub tool_input: Option<serde_json::Value>, // Only tool_use: input JSON
    pub tool_output: Option<String>,       // Only tool_result: output text
    pub tool_use_id: Option<String>,       // Links tool_result to tool_use (Claude assignment)
    pub tool_status: Option<String>,       // "error" | null = success
    pub timestamp: Option<String>,         // ISO 8601
    pub model: Option<String>,             // Model name (e.g. "claude-sonnet-4")
    pub images: Option<Vec<ImageMeta>>,    // Attached images
    pub raw: Option<serde_json::Value>,    // Original JSONL entry for raw view
    pub agent_hash: Option<String>,        // Subagent ID from toolUseResult.agentId
}

pub struct ImageMeta {
    pub index: u32,
    pub media_type: String,                // "image/png", "image/jpeg", etc.
    pub source_type: String,               // "base64", "file_ref"
    pub cache_path: Option<String>,
    pub file_path: Option<String>,
}
```

### SessionSummary struct (`scanner/sessions.rs`)

```rust
pub struct SessionSummary {
    pub id: String,                        // File stem (UUID from filename)
    pub source: String,                    // "claude-code" | "codex" | "cursor-agent" | "cursor-composer"
    pub title: String,                     // Truncated first user message
    pub file_path: String,                 // Absolute path to .jsonl file
    pub project_dir: String,               // Project directory name
    pub first_user_message: Option<String>,
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub model: Option<String>,
    pub session_id_raw: Option<String>,    // Original session UUID from JSONL
    pub started_at: Option<String>,        // ISO 8601
    pub last_activity: Option<String>,     // ISO 8601
    pub message_count: u32,
    pub size_bytes: u64,
    pub subagent_count: u32,
    pub tokens_total: Option<u64>,
    pub tokens_input: Option<u64>,
    pub tokens_output: Option<u64>,
    pub tokens_cache_read: Option<u64>,
    pub tokens_cache_write: Option<u64>,
    pub estimated_cost_usd: Option<f64>,
}
```

### How messages are loaded

`session_loader::load_messages()` reads a `.jsonl` file line by line. For each line:

1. Parse JSONL entry, get `type` field
2. **Claude Code format**: type = `"user" | "assistant" | "tool_use" | "tool_result" | "system"`
   - Standard messages: extract `message.content[]` blocks into multiple `Message` structs
   - `system` with content text stays as `role="system"`; empty system entries become `role="meta"`
   - `thinking`-only assistant entries become `text: "(thinking)"`
3. **Non-standard types** (`"permission-mode"`, `"ai-title"`, `"attachment"`, `"last-prompt"`, `"queue-operation"`, etc.) become `role="meta"` entries
4. **Codex format**: `type = "event_msg"` → user_message/agent_message → role=user/assistant
5. **Cursor format**: `type` field is empty or `"file-history-snapshot"`, uses `role` field + `message.content[]` blocks

### How turns are built (`turn-grouping.ts`)

```typescript
export interface TurnEntry {
  index: number;              // Zero-based turn index
  userMessage?: Message;      // The user message that starts this turn
  userMessageIndex: number;   // Index in original messages array (or -1)
  preview: string;            // First line of user prompt, <= 60 chars
  messageCount: number;       // Messages in this turn
  toolCount: number;          // tool_use count
  hasError: boolean;          // Any tool_status === "error"
  subagentCount: number;      // Task/Agent tool_use calls
}
```

A new turn starts at each `role="user"` message. Prior system/meta messages are swept into a synthetic "turn 0". All assistant/tool messages between user messages belong to that turn.

### How search works

- **Cross-session search** (`POST /search/messages`): Uses `aho-corasick` algorithm in Rust. Scans session JSONL files with filters for messageType, projects, date range, hasToolCalls, hasErrors, hasFileChanges. Returns `SearchHit[]` with session_id, message_id, role, snippet, score.
- **In-session search** (`use-session-search.ts`): Client-side substring matching on filtered messages. Navigates matches with prev/next. Tracks search matches across cumulative offsets.
- **Session title search** (`GET /sessions?q=`): Client-side filter on title, cwd, first_user_message.
- **Session search from list** (`GET /sessions/search?q=`): Delegates to full-text search engine.

---

## 4. Frontend State Management

### SessionContext (`components/session/SessionContext.tsx`)

Full state:

```typescript
interface SessionContextValue {
  // Data
  id: string;
  loading: boolean;
  error: Error | null;
  summary: SessionSummary | undefined;
  resumeHints: ResumeHints | undefined;
  subagents: SubagentMeta[];
  messages: Message[];
  messageCount: number;
  turns: TurnEntry[];

  // Search
  search: SessionSearchState;  // { search, setSearch, searchOpen, setSearchOpen,
                               //   selectedRoles, toggleRole, filtered, searchActive,
                               //   searchMatchTotal, searchActiveIndex, navigateSearch, navTarget }

  // Turn navigation
  activeTurnIndex: number;
  setActiveTurnIndex: (i: number) => void;
  scrollSignal: { messageId: string; nonce: number } | null;
  scrollToMessage: (messageId: string) => void;

  // Turn panel layout
  turnPanelWidth: number;
  turnPanelCollapsed: boolean;
  toggleTurnPanel: () => void;
  onTurnPanelResizeStart: (e: React.MouseEvent) => void;
  onTurnPanelResizeDoubleClick: () => void;

  // Right panel
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  rightPanelWidth: number;
  onRightPanelResizeStart: (e: React.MouseEvent) => void;
  onRightPanelResizeDoubleClick: () => void;

  // Expand/collapse
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;

  // Favorites
  favIds: Set<string>;
  toggleFav: (m: Message) => Promise<void>;
}
```

**Data flow**: `SessionProvider(id)` → calls `api.sessionDetail(id)` + `api.favoritesForSession(id)` on mount → sets `data: SessionFull` → builds `turns` via `buildTurns(messages)` → children consume via `useSession()`.

### API Client (`lib/api.ts`)

Defines full TypeScript types mirroring Rust structs:

- `RustSessionSummary` — session metadata
- `RustMessage` — individual message
- `RustSearchHit` — search result
- `RustSkillSummary`, `RustMcpSummary`, `RustFavoriteItem`, etc.
- `ResumeHints` — resume command suggestions
- `SessionFull` — session detail response: `{session, messages, messageCount, subagents?, resumeHints?}`
- `SubagentMeta` — subagent metadata

Functions use `fetch()` with deduplication of in-flight GET requests and error logging.

### Event bus (`lib/events.ts`)

Lightweight CustomEvent-based pub/sub:
- `emitAppEvent('sessions:changed')` — triggers refresh of session lists
- `emitAppEvent('favorites:changed')` — triggers favorite list refresh
- `useAppEvent(name, handler)` — hook for subscribing

---

## 5. UI Components — Detailed Analysis

### SessionDetail.tsx

Two rendering modes:

1. **Context-driven** (when `hideHeader=true`): Delegates to `MessageToolbar` + `MessageStream`, consuming `useSession()` context.

2. **Legacy self-contained mode** (standalone): Own state management with `selectedRoles`, `search`, `expanded`, `favIds`, `searchActiveIndex`, `searchNavNonce`. Renders filter bar with role chips + in-pane search bar.

Both modes use `@tanstack/react-virtual` for virtualized scrolling. Tool cards dispatched by `pairToolResults(messages)` which pairs `tool_use`<->`tool_result` by `toolUseId` and hides paired results from the list.

### MessageBlock.tsx (context-driven)

Renders individual non-tool messages with:
- Role icon + label, toolName badge, long message line/chars count
- XML tag detection (e.g. `<system-reminder>`) → renders `SystemXmlBlock`
- Expander for long messages (>12 lines or >1200 chars)
- Markdown rendering for assistant messages (`ReactMarkdown` with `remarkGfm` + `rehypeHighlight`)
- Image thumbnail strip below message
- Copy, favorite buttons (opacity 0 → visible on hover)
- Search highlighting via DOM manipulation (`<mark>` elements)
- Subagent message expansion support

### MessageStream.tsx

Virtualized message list with:
- `@tanstack/react-virtual` row virtualizer with dynamic `estimateSize`
- Scroll-driven turn tracking: computes turn index on scroll via `requestAnimationFrame`, debounces to React state (150ms idle)
- One-shot scroll to message / continuous scroll signal
- Search nav target support with center-in-viewport
- Snap-to-bottom patches for near-end scroll positions

### MessageToolbar.tsx

Role filter bar: `user`, `assistant`, `tool_use`, `subagent`, `tool_result`, `system`, `meta`, `image` — toggleable chips with color themes from `getRoleTheme()`.

### TurnSidebar.tsx

Left-side panel showing turn list:
- Each row: turn number badge, preview text (2-line clamp), message count, tool count, subagent count, error indicator
- Active turn indicator (cyan highlight + chevron)
- Collapsed mode: `MiniTurnRail` — 8px wide, only shows turn numbers

### RightSidebar.tsx

Right-side panel with 4 tabs:

1. **Tools tab**: Filterable list of tool_use calls with status dots (success/error/pending), filter chips per tool type, click to scroll
2. **Files tab**: Grouped by turn, shows file actions (R=read, W=write, E=edit), clickable paths
3. **Info tab**: Session metadata (source, ID, model, cwd, branch, message count, tokens, size, timestamps)
4. **Context tab**: Cumulative token chart (bar chart of token growth over messages)

### ResumeMenu.tsx

Popover menu with "Resume" button that:
1. Fetches resume hints via `api.sessionResume(sessionId, 'copy')`
2. Shows terminal command (copiable), working directory, "Open in Terminal" button
3. Calls `api.sessionResume(sessionId, 'terminal')` to launch terminal via osascript
4. Runs `claude --resume <id>`, `codex --resume <id>`, or `cursor` commands

---

## 6. Tool Card System

### Dispatch (`ToolCard.tsx`)

```typescript
function renderPretty(canon: string, tool: Message, result?: Message, ...) {
  switch (canon) {
    case 'Read':           return <ReadCard />
    case 'Edit': case 'MultiEdit': return <EditCard />
    case 'Write':          return <WriteCard />
    case 'Bash':           return <BashCard />
    case 'Grep': case 'Glob': case 'LS': return <GrepCard />
    case 'WebFetch': case 'WebSearch': return <WebFetchCard />
    case 'TodoWrite':      return <TodoWriteCard />
    case 'Task':           return <TaskCard />  // Also: "Agent" aliased to "Task"
    case 'ExitPlanMode':   return <ExitPlanModeCard />
    case 'AskUserQuestion': return <AskUserQuestionCard />
    default:               return <DefaultCard />
  }
}
```

Each card receives `tool: Message` and optionally `result: Message` (paired tool_result).

### Pretty/Raw view toggle

`ToolCardHeader` has a segmented control: "美化" / "原始". State `view: 'pretty' | 'raw'`. When `view === 'raw'`, renders `RawJsonView` which shows Input JSON + Output JSON + optional Raw payload in a two-pane layout.

### Supported tool types (fully)

| Canonical | Raw names (any source) |
|-----------|------------------------|
| Read | Read, read_file, ReadFile |
| Write | Write, write_file, create_file, Delete, delete_file |
| Edit | Edit, edit_file, MultiEdit, apply_patch, StrReplace |
| Bash | Bash, Shell, shell, run_terminal_cmd, exec_command |
| Grep | Grep, grep_search, search_files, codebase_search, rg |
| Glob | Glob, file_search |
| LS | LS, list_dir, list_directory |
| WebFetch | WebFetch |
| WebSearch | WebSearch, web_search |
| Task | Task, Agent |
| TodoWrite | TodoWrite, todo_write |
| ExitPlanMode | ExitPlanMode |
| AskUserQuestion | AskUserQuestion, AskQuestion |
| Skill | Skill |
| Unknown | Everything else (falls to DefaultCard) |

### BashCard ANSI rendering

`BashCard` uses `ansi-to-html` library directly in `lib/ansi.ts`:

```typescript
const converter = new AnsiToHtml({ fg: 'inherit', bg: 'transparent', newline: false, escapeXML: true });
export function ansiToHtml(s: string): string;
export function hasAnsiCodes(s: string): boolean; // regex: /\x1b\[[0-9;]*[a-zA-Z]/
export function stripAnsi(s: string): string;
```

Only renders ANSI if `hasAnsiCodes` is true and output is under 200KB. Falls back to escaped plain text otherwise.

### Key card behaviors

- **ReadCard**: Line-numbered code with highlight.js syntax coloring, supports structured `tool_use_result.file` from Claude
- **EditCard**: Unified diff via `structuredPatch` from `diff` library, per-line +/- coloring with highlight.js
- **WriteCard**: Code content with highlight.js, special handling for markdown files (renders as markdown)
- **GrepCard**: Pattern + path header, match results in `<pre>`
- **WebFetchCard**: URL link + prompt + markdown-rendered response
- **TaskCard**: Subagent header (agent type badge, hash badge, description, message count), prompt view, result markdown, expandable `SubagentMessages` (fetches from `/api/sessions/:id/subagent/:hash`)
- **AskUserQuestionCard**: Read-only historical view with question + options list (selected answers highlighted)
- **DefaultCard**: JSON input + smart output detection (XML tags → SystemXmlBlock, markdown detection, JSON formatting)

---

## 7. Pages & Routing

### App.tsx — Route table

```typescript
// Base routes (with BackgroundLocation support for Modal Route Pattern)
<Routes location={background || location}>
  <Route path="/" element={<Dashboard />} />
  <Route path="/skills" element={<SkillsView />} />
  <Route path="/skills/:id" element={<SkillDetailView />} />
  <Route path="/mcps" element={<MCPsView />} />
  <Route path="/mcps/:id" element={<MCPDetailView />} />
  <Route path="/extensions" element={<ExtensionsView />} />
  <Route path="/agents/:id" element={<AgentDetailView />} />
  <Route path="/usage" element={<UsageView />} />
  <Route path="/sessions" element={<SessionsView />} />
  <Route path="/sessions/trash" element={<SessionsTrashView />} />
  <Route path="/sessions/:id" element={<SessionDetailView />} />
  <Route path="/favorites" element={<FavoritesView />} />
  <Route path="/settings" element={<SettingsView />} />
  <Route path="/settings/logs" element={<LogsView />} />
  <Route path="*" element={<NotFound />} />
</Routes>

// Overlay routes (detail-on-top of list)
<Routes>
  <Route path="/sessions/:id" element={<SessionDetailView />} />
  <Route path="/skills/:id" element={<SkillDetailView />} />
  <Route path="/mcps/:id" element={<MCPDetailView />} />
  <Route path="/agents/:id" element={<AgentDetailView />} />
</Routes>
```

### SessionDetailView layout

```
┌──────────────────────────────────────────────────────┐
│ PageHeader (back, source badge, title, resume,       │
│             export .md, trash, toggle right panel)   │
├───────┬────────────────────────┬─────────────────────┤
│ Turn  │ SessionDetail          │ RightSidebar        │
│ Side- │ ┌─────────────────┐    │ (tools/files/info   │
│ bar   │ │ MessageToolbar  │    │  /context tabs)     │
│ (or   │ │ (role filters   │    │                     │
│ Mini  │ │  + in-pane      │    │                     │
│ Rail) │ │  search)        │    │                     │
│       │ ├─────────────────┤    │                     │
│       │ │ MessageStream   │    │                     │
│       │ │ (virtualized    │    │                     │
│       │ │  message list)  │    │                     │
│       │ └─────────────────┘    │                     │
│       │                        │                     │
├───────┴────────────────────────┴─────────────────────┤
│ (Turn panel & right panel are resizable + collapsible)│
└──────────────────────────────────────────────────────┘
```

### SessionsView

Search-driven view: when idle shows empty state prompting to search. When search active (>= 2 chars), shows:
- Title matches (client-side filter on session title/cwd)
- Message matches (backend full-text via `api.searchMessages()`)
- Filters: message type (all/user/assistant), project dropdown
- Pagination with "Load More" button

### Dashboard

Overview page: 5 stat cards (Skills/MCPs/Sessions/Favorites/Sources), GitHub-style activity heatmap, source distribution bars, recent sessions list.

---

## 8. Design System

### CSS Variables (`index.css`)

**Dark mode** (default):
- Background: `#0d0d14` → Cards: `rgba(255,255,255,0.05)` → Foreground: `#f5f5fa`
- Primary/accent: `#34d399` (emerald)
- Muted foreground: `#78788a`
- Border: `rgba(255,255,255,0.1)`
- Status colors: `#34d399` (success), `#fbbf24` (warning), `#60a5fa` (info)

**Light mode** (`.light` class):
- Background: `#ffffff` → Cards: `#f3f4f5` → Foreground: `#111111`
- Primary/accent: `#059669`
- Muted foreground: `#888888`
- Border: `#e8e9eb`

**Tool colors** (dark/light):
- `--tool-read`: `#60a5fa` / `#2563eb`
- `--tool-write`: `#fbbf24` / `#d97706`
- `--tool-bash`: `#34d399` / `#16a34a`
- `--tool-search`: `#a78bfa` / `#7c3aed`
- `--tool-web`: `#38bdf8` / `#0284c7`
- `--tool-agent`: `#2dd4bf` / `#0d9488`
- `--tool-task`: `#818cf8` / `#4f46e5`
- `--tool-question`: `#fcd34d` / `#ca8a04`
- `--tool-skill`: `#fb7185` / `#e11d48`

**Terminal variables** (for BashCard): background, foreground, border, command label/text colors.

**Typography**: User-adjustable CSS variables:
- `--text-h1: 24px`, `--text-h2: 16px`, `--text-body: 14px`, `--text-caption: 12px`, `--text-label: 11px`, `--text-sub: 10px`
- Type utility classes: `.typo-h1`, `.typo-h2`, `.typo-body`, `.typo-caption`, `.typo-label`, `.typo-sub`

**Shadows**: `--shadow-e1` through `e4`, `--shadow-glow`

**Dark/light mode support**: Full support via CSS variable swap on `.light` class. Theme toggling via `ThemeProvider`.

---

## 9. Key Libraries & Dependencies

### Frontend — `web/package.json`

| Dependency | Purpose |
|------------|---------|
| `react` / `react-dom` 18.3 | Core UI framework |
| `react-router-dom` 7.1 | Client-side routing (Modal Route Pattern) |
| `@tanstack/react-virtual` 3.13 | Virtual scrolling for session lists + message streams |
| `react-markdown` 9.0 + `remark-gfm` 4.0 + `rehype-highlight` 7.0 | Markdown rendering for assistant messages |
| `highlight.js` 11.11 | Code syntax highlighting |
| `ansi-to-html` 0.7 | ANSI escape code → HTML for terminal output |
| `diff` 9.0 | Unified diff generation for EditCard |
| `lucide-react` 0.469 | Icon library |
| `react-masonry-css` 1.0 | CSS column-based masonry for Skills/MCPs grids |
| `@radix-ui/react-*` | Headless UI primitives (dialog, dropdown-menu, tabs, tooltip, switch, separator, slot, label) |
| `zod` 4.4 | Schema validation (used in `lib/schemas/`) |
| Tailwind CSS 3.4 | Utility-first CSS framework |
| Vite 6.0 | Build tool |

### Backend — `src-server/Cargo.toml`

| Dependency | Purpose |
|------------|---------|
| `axum` 0.8 (with `ws` feature) | HTTP + WebSocket server framework |
| `tokio` 1 (full) | Async runtime |
| `tower-http` 0.6 (fs, cors, compression-gzip, trace, request-id) | HTTP middleware |
| `serde` / `serde_json` 1 | Serialization |
| `aho-corasick` 1 | Multi-pattern full-text search |
| `memmap2` 0.9 | Memory-mapped file I/O for search |
| `rayon` 1 | Parallel iteration (session scanning) |
| `walkdir` 2 | Recursive directory traversal |
| `notify` 8 | File system watcher |
| `chrono` 0.4 | Date/time handling |
| `tracing` / `tracing-subscriber` 0.1/0.3 | Structured logging |
| `base64` 0.22 | Base64 decode for inline images |
| `ts-rs` 12 | TypeScript type generation from Rust |
| `rust-embed` 8 | Embed static files |
| `clap` 4 | CLI argument parsing |
| `open` 5 | Open browser on start |

---

## 10. Gap Analysis — What's MISSING for Conversation Integration

### What EXISTS (reusable):

1. **Session data model** (`Message`, `SessionSummary`, `TurnEntry`) — complete and well-tested
2. **Message rendering** (`MessageBlock`, `MessageStream`, virtual scrolling) — production quality
3. **Tool card system** (12 card types) — comprehensive visualization of tool calls
4. **Turn navigation** (`TurnSidebar`, scroll tracking) — works well
5. **Search** — cross-session full-text + in-session filtering
6. **Favorites** — CRUD API + UI
7. **Session export** (Markdown)
8. **Resume/terminal integration** — but does NOT run an agent
9. **Design system** — CSS variables, color tokens, dark/light mode
10. **Layout system** — three-panel resizable layout
11. **WebSocket connection** (`/api/ws`) — streams file-change events, but NO message/stream events
12. **State management pattern** — `SessionProvider` context pattern is clean and well-abstracted

### What is MISSING (need to build from scratch):

1. **Agent communication layer**: No mechanism to spawn/manage Claude Code CLI processes from the web app. Need:
   - Process spawning (child_process on Node.js or via Tauri commands)
   - RPC or MCP to communicate with running Claude Code
   - Or: direct integration with Anthropic SDK

2. **Real-time message streaming** (SSE or WebSocket for agent output): Current WebSocket only carries file-change events. Need a new channel for agent output streaming — a new Rust handler that spawns a Claude Code subprocess and pipes stdout to the WS client, OR a Node.js/Tauri bridge.

3. **User input UI**: No text input/chat input components exist. Need:
   - Textarea / chat input component
   - Send button
   - Multi-line support, keyboard shortcuts (Enter to send, Shift+Enter for newline)
   - File/image attachment UI

4. **Permission/approval UI**: No permission dialog or approval flow exists. Need:
   - Permission request overlay (when Claude asks to run Bash, edit files, etc.)
   - Allow/Deny/Allow All buttons
   - Timeout handling
   - Permission mode indicators ("auto", "approved", etc.)

5. **Slash command UI**: No slash command input, autocomplete, or registration system. Need:
   - Command detection (typing `/` in input)
   - Autocomplete dropdown with available commands
   - Command registration from Skills/Hooks

6. **Active session management**: No concept of "currently running" sessions. Need:
   - `is_running` flag on sessions
   - Session lifecycle events (started, completed, errored)
   - Proper cleanup on disconnect/crash
   - Token/cost tracking in real-time

7. **Agent output processing**: Current message loading happens from on-disk JSONL after the fact. For live streaming, need:
   - Real-time JSONL line streaming from agent process stdout
   - Incremental message building (partial assistant text)
   - Live tool_use/tool_result pair tracking
   - Streaming markdown rendering (partial content)

8. **Conversation context/plan UI**: No visualization of the agent's plan, task list, or current goals. Need:
   - `TodoWrite` live renderer (current TodoWriteCard is static)
   - Plan mode indicator
   - Current task/thinking display

9. **Multi-agent orchestration UI**: No UI for managing subagent spawning, task delegation visualization.

10. **Session creation flow**: Not needed — sessions are created by `claude` CLI. But need "New Session" entry point.

### Architecture options for integration:

**Option A — Tauri bridge**: Use `src-tauri/` (already present) to spawn Claude Code as a sidecar, pipe stdout to the frontend via Tauri events. Requires Tauri commands for process management.

**Option B — Rust backend process manager**: Add new axum WebSocket or SSE endpoint in the Rust server that manages Claude Code subprocesses. The Rust server spawns `claude` with `--print` or `--json` flag, parses the streaming JSONL output, and broadcasts to WS clients.

**Option C — External Node.js/Python bridge**: Add a separate service that manages Claude processes and communicates with the frontend via WebSocket. This would be a separate process from the Rust server.

### Files that would need modification:

- `src-server/src/router/ws.rs` — extend to handle agent streaming
- `src-server/src/router/mod.rs` — add new endpoints (agent spawn, permission, etc.)
- `src-server/Cargo.toml` — add `tokio::process` or new deps
- `web/src/App.tsx` — add new routes (new session, conversation view)
- `web/src/lib/api.ts` — add new API endpoints
- `web/src/components/session/SessionContext.tsx` — add live session state
- `web/src/components/session/MessageStream.tsx` — support incremental streaming
- `web/src/components/session/MessageToolbar.tsx` — minimal changes
- `web/src/pages/SessionDetailView.tsx` — add conversation input, permission overlays

### New files that would need creation:

- Agent process manager (Rust or JS)
- Chat input component (`ConversationInput.tsx`)
- Permission dialog (`PermissionDialog.tsx`)
- Slash command autocomplete (`SlashCommandMenu.tsx`)
- Live session hook (`useLiveSession.ts`)
- Streaming markdown renderer
- Agent plan/task view (`AgentPlanView.tsx`)
- Conversation view page (`ConversationView.tsx`) or modify `SessionDetailView.tsx`
- WebSocket/SSE client hook (`useAgentStream.ts`)

---

## Summary of Key Patterns Worth Preserving

1. **Backend-first type design**: Rust models define the truth; `ts-rs` generates TypeScript types; `api.ts` wraps them faithfully. Add new types to Rust first, then mirror in TS.

2. **Context-driven component architecture**: `SessionProvider` → `useSession()` pattern keeps the three-panel layout clean. Follow this for any conversation integration.

3. **Virtual scrolling**: `@tanstack/react-virtual` with dynamic size estimation is production-proven. Keep using it.

4. **Tool card dispatch pattern**: `canonicalTool()` → `renderPretty()` switch statement. Easy to add new tool types. Keep this pattern.

5. **CSS variable design tokens**: All colors/spacing/shadows come from CSS variables. Keep adding new tokens here rather than hardcoding.

6. **Modal Route Pattern**: Overlays keep list pages mounted. Good for conversation detail on top of session list.

7. **Incremental scanning with caching**: The Rust scanner's cache strategy (`SESSION_CACHE_TTL_SECS`, per-project `.session_cache.json`) is well thought out. Can be extended for active sessions.
