# Codex Desktop App: Architecture Study for Web GUI Design

> **Goal**: Extract the design decisions, data models, and protocol patterns from OpenAI's Codex CLI/desktop application that are relevant to building a web GUI for Claude Code conversations.
>
> **Date**: 2026-05-28
>
> **Repository**: `/Users/wangshujun/github-space/codex/` (OpenAI Codex)

---

## 1. Overall Architecture

Codex uses a **JSON-RPC daemon + thin client** architecture. The heavy lifting (model interaction, tool execution, thread management, sandboxing) lives in a long-lived `app-server` process. Frontends (TUI, VS Code extension) connect to this daemon over a transport (Unix domain socket, WebSocket, or stdio) and exchange typed JSON-RPC notifications and requests.

### Crate Map

```
codex-rs/
  core/                    # The engine: thread orchestration, tool dispatch, model calls
  core-api/                # Public facade re-exporting core types for consumers
  app-server/              # JSON-RPC daemon (main.rs) that wraps ThreadManager
  app-server-protocol/     # Protocol definitions (types, requests, notifications)
  app-server-client/       # Typed Rust client for app-server
  app-server-transport/    # Transport layer (stdio, Unix socket, WebSocket)
  tui/                     # Ratatui-based terminal UI
    src/
      chatwidget/          # All chat rendering logic (protocol.rs, streaming.rs, etc.)
      bottom_pane/         # Composer, slash commands, popup overlays
      history_cell/        # Transcript cell types (exec, patches, MCP, messages, plans, etc.)
      diff_render.rs       # Unified diff rendering with syntax highlighting
      diff_model.rs        # FileChange model (Add/Delete/Update)
      token_usage.rs       # Token counting and context window math
  exec/                    # Sandboxed command execution
  execpolicy/              # Command allow/deny rules
  sandboxing/              # Filesystem sandbox implementation
  protocol/                # Low-level protocol types (EventMsg, Op, ThreadId, etc.)
  thread-store/            # Persistent thread storage (SQLite state DB + JSONL rollouts)
```

### Architectural Flow

```
[User Input] 
    |
    v
[TUI / chatwidget] --JSON-RPC over Unix socket--> [app-server daemon]
    |                                                    |
    |  ServerNotification (events pushed to client)      |  ThreadManager
    |  ClientRequest (approval responses, settings)        |    -> core/CodexThread
    |                                                    |    -> Responses API
    v                                                    v
[Ratatui rendering]                              [OpenAI API / model providers]
```

The key insight: **the server pushes typed notifications to the client, not raw streaming JSON**. This is fundamentally different from Claude Code CLI's stream-json approach.

---

## 2. Protocol Design (app-server-protocol)

The protocol lives in `codex-rs/app-server-protocol/src/protocol/v2/`. It defines a rich set of types covering every aspect of a conversation.

### 2.1 ThreadItem: The Central Data Model

**File**: `codex-rs/app-server-protocol/src/protocol/v2/item.rs`

```rust
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ThreadItem {
    UserMessage { id: String, content: Vec<UserInput> },
    HookPrompt { id: String, fragments: Vec<HookPromptFragment> },
    AgentMessage { id: String, text: String, phase: Option<MessagePhase>, memory_citation: Option<MemoryCitation> },
    Plan { id: String, text: String },                              // EXPERIMENTAL
    Reasoning { id: String, summary: Vec<String>, content: Vec<String> },
    CommandExecution { id, command, cwd, process_id, source, status, command_actions, aggregated_output, exit_code, duration_ms },
    FileChange { id: String, changes: Vec<FileUpdateChange>, status: PatchApplyStatus },
    McpToolCall { id, server, tool, status, arguments, result, error, duration_ms },
    DynamicToolCall { id, namespace, tool, arguments, status, content_items, success, duration_ms },
    CollabAgentToolCall { id, tool, status, sender_thread_id, receiver_thread_ids, prompt, model, reasoning_effort, agents_states },
    WebSearch { id: String, query: String, action: Option<WebSearchAction> },
    ImageView { id, path },
    ImageGeneration { id, status, revised_prompt, result, saved_path },
    EnteredReviewMode { id, review },
    ExitedReviewMode { id, review },
    ContextCompaction { id },
}
```

**All 17 item variants**. This tagged union drives rendering decisions in the TUI. Every item has a unique `id`. The `type` field serves as a discriminator in JSON, making it easy for any frontend to pattern-match.

#### UserInput Sub-types

```rust
pub enum UserInput {
    Text { text: String, text_elements: Vec<TextElement> },
    Image { detail: Option<ImageDetail>, url: String },
    LocalImage { detail: Option<ImageDetail>, path: PathBuf },
    Skill { name: String, path: PathBuf },
    Mention { name: String, path: String },
}
```

UserInput supports rich composable inputs beyond plain text: images (URLs and local files), skill references, and file mentions. `text_elements` encode inline spans (e.g., file references, image embeds) within a single text block using byte ranges.

#### CommandExecution Detail

The `CommandExecution` item is the richest variant:

```rust
CommandExecution {
    id: String,
    command: String,           // The raw shell command
    cwd: AbsolutePathBuf,      // Working directory
    process_id: Option<String>, // PTY process identifier
    source: CommandExecutionSource,  // Agent | UserShell | UnifiedExecStartup | UnifiedExecInteraction
    status: CommandExecutionStatus,  // InProgress | Completed | Failed | Declined
    command_actions: Vec<CommandAction>, // Parsed: Read | ListFiles | Search | Unknown
    aggregated_output: Option<String>,
    exit_code: Option<i32>,
    duration_ms: Option<i64>,
}
```

The `source` field distinguishes between commands the agent issued, commands the user typed directly into a shell, and unified-exec interactions (a long-running terminal the agent can use interactively). The `command_actions` field provides best-effort parsing to categorize what the command does (reading files, listing directories, searching, or unknown).

#### FileChange Detail

```rust
FileChange {
    id: String,
    changes: Vec<FileUpdateChange>,
    status: PatchApplyStatus,  // InProgress | Completed | Failed | Declined
}

FileUpdateChange {
    path: String,
    kind: PatchChangeKind,     // Add | Delete | Update { move_path: Option<PathBuf> }
    diff: String,              // Unified diff string
}
```

### 2.2 Notification/Event System

**File**: `codex-rs/app-server-protocol/src/protocol/v2/item.rs`

The server emits a lifecycle of notifications for every item. Rather than a single "stream event" type, Codex uses specific notification types for each lifecycle phase:

#### Item Lifecycle Events
```rust
ItemStartedNotification      { item: ThreadItem, thread_id, turn_id, started_at_ms }
ItemCompletedNotification    { item: ThreadItem, thread_id, turn_id, completed_at_ms }
```

Every item starts and completes. The `ThreadItem` is embedded directly in both notifications, meaning the client receives a *snapshot* of state at each transition.

#### Streaming Delta Events
```rust
AgentMessageDeltaNotification           { thread_id, turn_id, item_id, delta: String }
PlanDeltaNotification                   { thread_id, turn_id, item_id, delta: String }
ReasoningSummaryTextDeltaNotification   { thread_id, turn_id, item_id, delta, summary_index }
ReasoningTextDeltaNotification          { thread_id, turn_id, item_id, delta, content_index }
ReasoningSummaryPartAddedNotification   { thread_id, turn_id, item_id, summary_index }
CommandExecutionOutputDeltaNotification { thread_id, turn_id, item_id, delta }
FileChangePatchUpdatedNotification      { thread_id, turn_id, item_id, changes }
TerminalInteractionNotification         { thread_id, turn_id, item_id, process_id, stdin }
```

Agent messages stream character-by-character via `AgentMessageDeltaNotification`. Commands stream output via `CommandExecutionOutputDeltaNotification`. File patches update incrementally via `FileChangePatchUpdatedNotification`. Reasoning content has its own dedicated delta channel with indexing for multi-part summaries. Terminal interactions (user typing into a long-running process) have their own notification type.

#### Guardian/Auto-Review Events
```rust
ItemGuardianApprovalReviewStartedNotification   { thread_id, turn_id, started_at_ms, review_id, target_item_id, review, action }
ItemGuardianApprovalReviewCompletedNotification { thread_id, turn_id, started_at_ms, completed_at_ms, review_id, target_item_id, decision_source, review, action }
```

These track the lifecycle of automatic approval reviews performed by the Guardian subagent.

#### Thread/Turn Lifecycle Events
```rust
ThreadStartedNotification          { thread: Thread }
ThreadStatusChangedNotification    { thread_id, status: ThreadStatus }
ThreadClosedNotification           { thread_id }
ThreadArchivedNotification         { thread_id }
ThreadUnarchivedNotification       { thread_id }
ThreadNameUpdatedNotification      { thread_id, thread_name }
ThreadGoalUpdatedNotification      { thread_id, turn_id, goal }
ThreadGoalClearedNotification      { thread_id }
ThreadSettingsUpdatedNotification  { thread_id, thread_settings }
ThreadTokenUsageUpdatedNotification { thread_id, turn_id, token_usage }
TurnStartedNotification            { thread_id, turn: Turn }
TurnCompletedNotification          { thread_id, turn: Turn }
TurnDiffUpdatedNotification        { thread_id, turn_id, diff }
TurnPlanUpdatedNotification        { thread_id, turn_id, explanation, plan: Vec<TurnPlanStep> }
ContextCompactedNotification       { thread_id, turn_id }  // deprecated
```

#### Error/Debug Events
```rust
ErrorNotification            { error: TurnError, will_retry: bool, thread_id, turn_id }
WarningNotification          { thread_id, message }
GuardianWarningNotification  { thread_id, message }
DeprecationNoticeNotification { summary, details }
ServerRequestResolvedNotification { thread_id, request_id }
```

### 2.3 Client-to-Server Requests

The `ServerRequest` enum defines requests the server sends to the client that require a response:

```rust
// In protocol_requests.rs dispatch:
ServerRequest::CommandExecutionRequestApproval { params, .. }
ServerRequest::FileChangeRequestApproval      { params, .. }
ServerRequest::McpServerElicitationRequest    { request_id, params }
ServerRequest::PermissionsRequestApproval      { params, .. }
ServerRequest::ToolRequestUserInput           { params, .. }
ServerRequest::DynamicToolCall                { .. }
ServerRequest::AttestationGenerate            { .. }
ServerRequest::ChatgptAuthTokensRefresh       { .. }
ServerRequest::ApplyPatchApproval             { .. }  // Legacy
ServerRequest::ExecCommandApproval            { .. }  // Legacy
```

The first five are actively handled by the TUI. The rest are stubbed out (TUI shows "not implemented" for dynamic tool calls).

### 2.4 ThreadGoal / ThreadGoalStatus

```rust
pub enum ThreadGoalStatus {
    Active,
    Paused,
    Blocked,
    UsageLimited,
    BudgetLimited,
    Complete,
}

pub struct ThreadGoal {
    pub thread_id: String,
    pub objective: String,
    pub status: ThreadGoalStatus,
    pub token_budget: Option<i64>,
    pub tokens_used: i64,
    pub time_used_seconds: i64,
    pub created_at: i64,
    pub updated_at: i64,
}
```

Goals track long-running agent tasks with token budgets, time tracking, and lifecycle status. The TUI can set goals via `/goal <objective>` and display progress. The client (and web GUI) should display goal status prominently.

### 2.5 Turn Lifecycle

```rust
pub enum TurnStatus { Completed, Interrupted, Failed, InProgress }

// Starting a turn: turn/start
pub struct TurnStartParams {
    pub thread_id: String,
    pub input: Vec<UserInput>,
    // Optional overrides for this turn: model, cwd, sandbox_policy, approval_policy,
    // reasoning_effort, collaboration_mode, permissions, etc.
}

// Steering an in-progress turn: turn/steer
pub struct TurnSteerParams {
    pub thread_id: String,
    pub input: Vec<UserInput>,
    pub expected_turn_id: String,  // Required precondition
}

// Interrupting: turn/interrupt
pub struct TurnInterruptParams {
    pub thread_id: String,
    pub turn_id: String,
}
```

**Steering** is a key differentiator from Claude Code. Users can inject additional instructions mid-turn via `turn/steer`. This requires a precondition `expected_turn_id` to prevent races. The TUI queues steer inputs when a turn is running and flushes them in order.

### 2.6 Turn Plan Steps

```rust
pub struct TurnPlanStep {
    pub step: String,
    pub status: TurnPlanStepStatus,  // Pending | InProgress | Completed
}
```

The agent emits `update_plan` calls during a turn. These are broadcast as `TurnPlanUpdatedNotification` and rendered as a task checklist in the TUI.

---

## 3. Tool Execution and Approval

### 3.1 Command Execution Approval Flow

**Approval Decision Types**:
```rust
pub enum CommandExecutionApprovalDecision {
    Accept,                          // One-time approval
    AcceptForSession,               // Approve for this session
    AcceptWithExecpolicyAmendment { execpolicy_amendment }, // Create a persistent rule
    ApplyNetworkPolicyAmendment { network_policy_amendment }, // Allow/deny network host
    Decline,                         // Deny, agent continues turn
    Cancel,                          // Deny and interrupt the turn
}
```

**Approval Request Params**:
```rust
pub struct CommandExecutionRequestApprovalParams {
    pub thread_id: String,
    pub turn_id: String,
    pub item_id: String,
    pub started_at_ms: i64,
    pub approval_id: Option<String>,          // For zsh-exec-bridge sub-approvals
    pub reason: Option<String>,               // e.g., "needs network access"
    pub network_approval_context: Option<NetworkApprovalContext>,
    pub command: Option<String>,
    pub cwd: Option<AbsolutePathBuf>,
    pub command_actions: Option<Vec<CommandAction>>,  // Parsed actions for display
    pub additional_permissions: Option<AdditionalPermissionProfile>,
    pub proposed_execpolicy_amendment: Option<ExecPolicyAmendment>,
    pub proposed_network_policy_amendments: Option<Vec<NetworkPolicyAmendment>>,
    pub available_decisions: Option<Vec<CommandExecutionApprovalDecision>>,
}
```

The approval params are rich: they include parsed command actions (Read, ListFiles, Search, Unknown) so the UI can show a friendly summary instead of a raw shell command. They also surface proposed policy amendments (execpolicy and network rules) so the user can create persistent allow/deny rules from the approval prompt.

The `available_decisions` field lets the server constrain which decisions the client should present. This is experimental.

### 3.2 File Change Approval Flow

**Approval Decision Types**:
```rust
pub enum FileChangeApprovalDecision {
    Accept,            // Approve these changes
    AcceptForSession,  // Approve these files for session
    Decline,           // Deny, agent continues
    Cancel,            // Deny and interrupt
}
```

**Approval Request Params**:
```rust
pub struct FileChangeRequestApprovalParams {
    pub thread_id: String,
    pub turn_id: String,
    pub item_id: String,
    pub started_at_ms: i64,
    pub reason: Option<String>,
    pub grant_root: Option<PathBuf>,  // Unstable: request write access to a root
}
```

### 3.3 Permission Profiles

**SandboxProfile / SandboxPolicy**:
```rust
pub enum SandboxPolicy {
    DangerFullAccess,
    ReadOnly { network_access: bool },
    ExternalSandbox { network_access: NetworkAccess },
    WorkspaceWrite { writable_roots, network_access, exclude_tmpdir_env_var, exclude_slash_tmp },
}
```

**SandboxMode (user-facing selection)**:
```rust
pub enum SandboxMode {
    ReadOnly,          // Agent can read workspace, cannot write or access network
    WorkspaceWrite,    // Agent can read/write in workspace
    DangerFullAccess,  // Full access (YOLO mode)
}
```

**AskForApproval policy**:
```rust
pub enum AskForApproval {
    UnlessTrusted,    // Skip approval for trusted commands
    OnFailure,        // Ask only when a command fails
    OnRequest,        // Ask whenever agent requests
    Granular { sandbox_approval, rules, skill_approval, request_permissions, mcp_elicitations },
    Never,            // Auto-approve everything (YOLO)
}
```

**ActivePermissionProfile**:
```rust
pub struct ActivePermissionProfile {
    pub id: String,              // Profile identifier (":workspace", ":read-only", custom)
    pub extends: Option<String>, // Parent profile for layered permissions
}
```

Permission profiles are a newer, more granular system layered on top of SandboxMode. They support named profiles, inheritance via `extends`, and precise file system + network access control entries.

### 3.4 Guardian / Auto-Review System

The Guardian system performs automatic risk assessments on approval requests before (or instead of) showing them to the user:

```rust
pub enum ApprovalsReviewer {
    User,        // Show approval requests to the user (default)
    AutoReview,  // Use Guardian subagent to auto-decide
}
```

**Guardian Assessment Actions** (the types of actions being reviewed):
```rust
pub enum GuardianApprovalReviewAction {
    Command { source: GuardianCommandSource, command: String, cwd },
    Execve { source, program, argv, cwd },
    ApplyPatch { cwd, files },
    NetworkAccess { target, host, protocol, port },
    McpToolCall { server, tool_name, connector_id, connector_name, tool_title },
    RequestPermissions { reason, permissions },
}
```

**Risk Assessment**:
```rust
pub enum GuardianRiskLevel { Low, Medium, High, Critical }
pub enum GuardianApprovalReviewStatus { InProgress, Approved, Denied, TimedOut, Aborted }

pub struct GuardianApprovalReview {
    pub status: GuardianApprovalReviewStatus,
    pub risk_level: Option<GuardianRiskLevel>,
    pub user_authorization: Option<GuardianUserAuthorization>,
    pub rationale: Option<String>,
}
```

The TUI tracks pending Guardian reviews in `PendingGuardianReviewStatus` and displays them in the status footer. Review denial is tracked in `RecentAutoReviewDenials` and users can overrule via `/approve`.

---

## 4. TUI Chat Widget Design (codex-rs/tui/src/chatwidget/)

### 4.1 Transcript Rendering Approach

**File**: `chatwidget/transcript.rs`

The TUI does NOT maintain a simple list of Message objects. Instead it uses a hybrid approach:

- **History cells**: Completed items are converted into `HistoryCell` trait objects (in `history_cell/` module) and pushed into a scrollable transcript. These are fully rendered widgets that know their own dimensions.
- **Active cell**: The currently-in-progress item lives in `transcript.active_cell: Option<Box<dyn HistoryCell>>`. It can be updated in-place (e.g., appending command output) and re-rendered without re-rendering the full transcript.
- **Stream tail**: During agent message streaming, the `StreamingAgentTailCell` / `StreamingPlanTailCell` show the most recent lines live, managed by `StreamController` / `PlanStreamController`.
- **Consolidation**: When streaming completes, streamed output is consolidated into a markdown cell (`ConsolidateAgentMessage`) that can re-render at any width.

**HistoryCell trait** (conceptual): Every transcript element implements a `display_lines(width) -> Vec<Line>` method and a `desired_height(width) -> u16` method. This makes the transcript strictly composable.

**Cell types** (from `history_cell/` directory):
- `exec.rs` -- Command execution cells (start, output, completion, unified exec)
- `messages.rs` -- User messages, agent messages, markdown cells
- `patches.rs` -- File patch/change display with inline diffs
- `mcp.rs` -- MCP tool call cells
- `plans.rs` -- Proposed plan cells
- `session.rs` -- Session header with model info, permissions, sandbox status
- `separators.rs` -- "Final message" separator between work output and agent response
- `search.rs` -- Web search call cells
- `approvals.rs` -- Approval request display
- `notices.rs` -- Deprecation notices
- `request_user_input.rs` -- Tool-requested user input prompts
- `hook_cell.rs` -- Hook lifecycle display

### 4.2 Streaming Handling

**File**: `chatwidget/streaming.rs`

The streaming system uses a dual-controller pattern:

```rust
// Agent message streaming
self.stream_controller: Option<StreamController>  // Owner of stream state
self.adaptive_chunking: AdaptiveChunking           // Balances smooth vs catch-up pacing

// Plan streaming  
self.plan_stream_controller: Option<PlanStreamController>

// Reasoning
self.reasoning_buffer: String       // Current reasoning block for status header
self.full_reasoning_buffer: String  // Accumulated for final reasoning cell
```

**StreamController** receives `push(&delta)` calls and buffers lines. It supports two modes:
- **Smooth mode**: Commits one line per tick (frame-based animation)
- **Catch-up mode**: Drains larger batches when the queue grows too large

The **CommitTickScope** pattern determines whether a tick runs in smooth or catch-up mode. This prevents jank during fast streaming while still feeling responsive.

**Interrupt deferral**: When a stream is active, non-stream events (command output, MCP completions) are deferred into an `InterruptManager` queue to preserve ordering. They flush when the stream ends.

**Agent message completion**: On `ItemCompleted`, the stream is finalized. The live tail is cleared, and the accumulated markdown is consolidated into a single `AgentMarkdownCell` that can re-render at any width. This is critical for resize handling.

**Plan streaming**: Similar to agent streaming but rendered with a dedicated `ProposedPlanCell`. The plan's "thinking" content shows in the transcript while the plan remains in progress.

**Reasoning**: Reasoning deltas do NOT stream to the transcript. Instead, they extract bold text (`**header**`) from the reasoning buffer to update the status header. At completion, the full reasoning buffer is rendered as a collapsed `ReasoningSummaryCell`.

### 4.3 Tool Rendering (tool_lifecycle.rs)

**File**: `chatwidget/tool_lifecycle.rs`

Non-command tools follow a consistent pattern:

1. **ItemStarted** notification arrives -> creates or activates an in-progress cell
2. During execution, output/updates flow via dedicated delta notifications
3. **ItemCompleted** notification arrives -> cell transitions to completed state, flushes to history

**Tool-specific patterns**:

- **Patch apply** (`on_patch_apply_begin`): Renders `PatchEventCell` showing the files being changed and inline diffs
- **MCP tool call** (`on_mcp_tool_call_started/completed`): Creates `McpToolCallCell` showing server, tool name, arguments. On completion, shows result or error with timing.
- **Web search** (`on_web_search_begin/end`): Shows `WebSearchCell` with query and action (Search, OpenPage, FindInPage)
- **Image generation**: Shows path and revised prompt
- **Image view** (`on_view_image_tool_call`): Shows the path to the image
- **Collab agent** (`on_collab_agent_tool_call`): Shows spawn/send/resume/close events with agent metadata

The key pattern is that `defer_or_handle` is used throughout: if a stream is active, the event is queued; otherwise it's handled immediately.

### 4.4 Command Execution Lifecycle (command_lifecycle.rs)

**File**: `chatwidget/command_lifecycle.rs`

Commands follow a distinct lifecycle with special handling for "unified exec" (interactive terminal) mode:

1. **Command started** (`on_command_execution_started`):
   - If `source == UnifiedExecStartup`, track the process for later interaction
   - Parse `command_actions` to categorize (Read, ListFiles, Search, Unknown)
   - Defer or immediately create `ExecCell`

2. **Output delta** (`on_exec_command_output_delta`): Append output to the active `ExecCell` in-place

3. **Terminal interaction** (`on_terminal_interaction`): 
   - Empty stdin = polling for background output -> show "Waiting for background terminal" in status
   - Non-empty stdin = user typed something -> render as `UnifiedExecInteraction` cell

4. **Command completed** (`on_command_execution_completed`):
   - Flush any wait streak
   - Transition `ExecCell` to completed
   - Track unified exec process end

**UnifiedExecWaitStreak**: When a background terminal is running but the user is just polling, consecutive empty interactions are coalesced into a wait streak rather than creating duplicate cells.

### 4.5 Permission Popups

**File**: `chatwidget/permission_popups.rs`, `permissions_menu.rs`

The TUI presents permission selection as a `SelectionView` popup with preset approval modes:

**Built-in presets** (conceptual):
| ID | Label | Description |
|----|-------|-------------|
| `read-only` | Read Only | Agent can browse and answer questions about code |
| `auto` | Auto / Default | Agent can run commands and edit files, with approval |
| `full-access` | Full Access | Full workspace and network access (YOLO) |
| `auto` + `AutoReview` | Auto-review | Guardian subagent auto-approves when safe |

**Permission profiles mode**: When `explicit_permission_profile_mode` is enabled, the popup shows named profiles (`:workspace`, `:danger-no-sandbox`, `:read-only`, plus custom profiles) instead of simple presets.

Each selection item has:
- `name`, `description` -- Display labels
- `is_current` -- Whether this matches the active config
- `actions` -- Callbacks to apply the selection
- `disabled_reason` -- Why this option is unavailable (e.g., enterprise policy)
- `dismiss_on_select` -- Close popup on selection

### 4.6 Status Display

**File**: `chatwidget/status_state.rs`, `status_controls.rs`

The status indicator is a bottom-of-screen bar showing current state:

```rust
struct StatusIndicatorState {
    header: String,      // e.g., "Working", "Thinking", "Reviewing approval request"
    details: Option<String>,  // Extended detail text
    details_max_lines: usize,
}
```

**Status lifecycle during a turn**:
1. Turn starts -> "Working" with working indicator animation
2. Reasoning arrives -> Extract bold header, show "Thinking: [header]"
3. Command runs -> Status shows command being executed
4. Guardian review -> "Reviewing approval request" with risk details
5. Background terminal wait -> "Waiting for background terminal"
6. Commentary completes -> Stream finishes, status indicator restored
7. Turn ends -> Status cleared

**Terminal title** reflects a simplified version via `TerminalTitleStatusKind`: Working, WaitingForBackgroundTerminal, Thinking.

### 4.7 Slash Commands

**File**: `slash_command.rs`

There are **47 slash commands** covering every aspect of the experience:

- **Thread management**: New, Resume, Fork, Rename, Clear, Side/Btw (side conversation)
- **Agent control**: Model, Plan, Goal, Agent, Compact, Review, Stop
- **Permissions**: Permissions, ElevateSandbox, SandboxReadRoot, AutoReview
- **UI**: Theme, Pets, Keymap, Vim, Title, Statusline, Raw, Diff, Status
- **Integration**: Apps, Plugins, Mcp, Hooks, Skills, Memories, Ide, Realtime, Settings
- **Debug**: DebugConfig, Rollout, TestApproval, MemoryDrop, MemoryUpdate
- **Other**: Feedback, Logout, Quit/Exit, Personality, Mention, Copy

Each command has gating properties:
```rust
fn supports_inline_args() -> bool       // e.g., /review PR_STYLE
fn available_in_side_conversation() -> bool
fn available_during_task() -> bool       // Some commands work while agent is running
fn is_visible() -> bool                  // Platform/feature gated
```

**Dispatch** (in `slash_dispatch.rs`): Commands are dispatched from the composer. Some (`/goal`, `/plan`, `/raw`) have side effects before recording history. Commands submitted during a task that don't support it show an error or are queued.

### 4.8 Session Flow

**File**: `chatwidget/session_flow.rs`

When a thread is created or resumed, `handle_thread_session` is called:

1. Set thread_id, thread_name, cwd, workspace_roots
2. Apply permission profile from session snapshot
3. Apply approval_policy, approvals_reviewer, sandbox_policy
4. Sync collaboration mode and model
5. Render session header cell (model, permissions, sandbox status, tooltip)
6. Submit any initial_user_message (from CLI args)
7. Emit forked-thread event if applicable
8. Refresh skills, connectors, status surfaces

The `SessionConfiguredDisplay` enum controls whether the session header renders normally, quietly (for resume), or as a side conversation.

---

## 5. Diff Rendering

### 5.1 FileChange Model

**File**: `codex-rs/tui/src/diff_model.rs`

```rust
pub enum FileChange {
    Add { content: String },
    Delete { content: String },
    Update { unified_diff: String, move_path: Option<PathBuf> },
}
```

FileEdit data model -- canonical version. The `Update` variant stores a raw unified diff string plus an optional move path.

**Parallel from app-server protocol**:
```rust
pub enum PatchChangeKind {
    Add,
    Delete,
    Update { move_path: Option<PathBuf> },
}
```

### 5.2 Diff Rendering Approach

**File**: `codex-rs/tui/src/diff_render.rs` (~800+ lines)

The diff renderer is one of the most sophisticated parts of the TUI:

**Theme-aware backgrounds**: The renderer probes the terminal's background color to determine whether it's light or dark, then selects an appropriate palette:
- **Dark**: Muted green (`#213A2B`) for additions, muted red (`#4A221D`) for deletions
- **Light**: GitHub-inspired pastels (`#dafbe1` green / `#ffebe9` red) with distinct gutter backgrounds

**Color level fallback**: Three tiers:
1. **TrueColor**: Full RGB backgrounds + syntax highlighting
2. **ANSI-256**: Indexed color approximations
3. **ANSI-16**: Foreground-color-only styling (no backgrounds)

**Syntax highlighting for diffs**: For `Update` hunks, content is syntax-highlighted using `syntect`. The renderer highlights each hunk as a concatenated block to preserve parser state across lines (important for multi-line strings, block comments). Cross-hunk state is intentionally NOT preserved.

**Syntax-theme scope backgrounds**: When the active syntax theme defines backgrounds for `markup.inserted` / `markup.deleted` scopes, those override the hardcoded palette at TrueColor/ANSI-256 levels.

**Line wrapping**: Long lines are hard-wrapped at the available width. Syntax-highlighted spans split at character boundaries with styles preserved.

**Rendering output**: Each diff line has:
- Right-aligned line number
- Gutter sign (`+` / `-` / ` `)
- Content text (potentially syntax-highlighted)
- Background color behind the full line

### 5.3 Diff Theming Architecture

```rust
enum DiffTheme { Dark, Light }
enum DiffColorLevel { TrueColor, Ansi256, Ansi16 }
enum RichDiffColorLevel { TrueColor, Ansi256 }  // ANSI-16 excluded for backgrounds

struct ResolvedDiffBackgrounds { add: Option<Color>, del: Option<Color> }
struct DiffRenderStyleContext { theme: DiffTheme, color_level: DiffColorLevel, diff_backgrounds: ResolvedDiffBackgrounds }
```

The `DiffRenderStyleContext` is computed once per `render_change` call and threaded through all line-rendering helpers. This avoids re-querying theme colors per-line.

---

## 6. Token Usage and Context

### 6.1 TokenUsage Model

**File**: `codex-rs/tui/src/token_usage.rs`

```rust
pub struct TokenUsage {
    pub input_tokens: i64,
    pub cached_input_tokens: i64,
    pub output_tokens: i64,
    pub reasoning_output_tokens: i64,
    pub total_tokens: i64,
}
```

**Key computation methods**:
- `cached_input()`: `max(0, cached_input_tokens)`
- `non_cached_input()`: `max(0, input_tokens - cached_input)`
- `blended_total()`: `max(0, non_cached_input + max(0, output_tokens))` -- Used for display
- `tokens_in_context_window()`: Returns `total_tokens` (raw context size)

**Context window math**: Uses a `BASELINE_TOKENS` constant of 12,000 to calculate "effective" remaining space:
```rust
fn percent_of_context_window_remaining(&self, context_window: i64) -> i64 {
    let effective_window = context_window - BASELINE_TOKENS;  // 12k baseline
    let used = max(0, self.total_tokens - BASELINE_TOKENS);
    let remaining = max(0, effective_window - used);
    round((remaining / effective_window) * 100)
}
```

This effectively treats the first 12K tokens as "free" overhead for system prompts, giving a more realistic view of remaining capacity.

### 6.2 TokenUsageInfo (per-thread)

```rust
pub struct TokenUsageInfo {
    pub total_token_usage: TokenUsage,   // Cumulative across all turns
    pub last_token_usage: TokenUsage,    // Most recent turn only
    pub model_context_window: Option<i64>, // Model's max context
}
```

Display format: `"Token usage: total=1234 input=1000 (+ 500 cached) output=234 (reasoning 50)"`

### 6.3 App-Server Protocol for Token Usage

```rust
pub struct ThreadTokenUsage {
    pub total: TokenUsageBreakdown,
    pub last: TokenUsageBreakdown,
    pub model_context_window: Option<i64>,
}

pub struct TokenUsageBreakdown {
    pub total_tokens: i64,
    pub input_tokens: i64,
    pub cached_input_tokens: i64,
    pub output_tokens: i64,
    pub reasoning_output_tokens: i64,
}
```

Token updates are pushed as `ThreadTokenUsageUpdatedNotification` after each turn.

---

## 7. Key Design Patterns (Differences from Claude Code's stream-json)

### 7.1 Typed Notifications vs. Raw Streaming

**Claude Code CLI** outputs a continuous stream of JSON objects to stdout, one per line (`stream-json`). Each object has a `type` field. The consumer must parse every line and pattern-match the type.

**Codex** uses structured, typed notifications:
- Each event type has its own Rust struct with known fields
- The `ServerNotification` enum dispatches to specific handlers via exhaustive pattern matching
- Delta events carry `thread_id`, `turn_id`, and `item_id` for precise routing
- Item lifecycle is explicit: `ItemStarted` -> [Delta] -> `ItemCompleted`

**Web GUI implication**: You should NOT replicate Claude Code's stream-json approach directly. Instead, consider an intermediate normalization layer that converts stream-json events into typed objects similar to Codex's `ThreadItem` / `ItemStartedNotification` / `ItemCompletedNotification` pattern. This gives you:
- Predictable lifecycle for every item type
- Easy state management (start creates placeholder, delta updates it, complete finalizes it)
- Clean separation between streaming content and structural events

### 7.2 Rich Item Model vs. Raw Tool Calls

Codex encodes every possible AI action as a `ThreadItem` variant with rich structured data:
- `CommandExecution` includes parsed `command_actions` (Read, ListFiles, Search, Unknown) for display
- `FileChange` includes structured `PatchChangeKind` (Add/Delete/Update) plus diff text
- `McpToolCall` carries server, tool name, arguments, result, error, and duration

**Web GUI implication**: You should build a similar rich item model for Claude Code conversations. Rather than just displaying raw JSON tool calls, parse them into typed items with:
- Human-readable action summaries (like `command_actions`)
- Status tracking (InProgress, Completed, Failed, Declined)
- Timing data (duration in ms)
- Structured diff information

### 7.3 Approval as a First-Class Protocol Concept

Codex has an entire approval subsystem:
- The server sends `CommandExecutionRequestApproval` as a typed request (not a generic notification)
- The client responds with a structured `CommandExecutionApprovalDecision` enum
- Policy amendments (execpolicy rules, network policy rules) are part of the decision flow
- Guardian auto-review runs alongside or instead of user approval

**Web GUI implication**: Claude Code CLI handles approvals by prompting on the terminal. A web GUI needs to intercept these approval prompts and render them in the UI. You need:
- A way to detect when the agent is waiting for approval (similar to `ThreadStatus::Active { WaitingOnApproval }`)
- Structured approval request rendering (showing what's being approved, why, and available decisions)
- Decision types beyond simple yes/no: per-session, per-file, with policy amendments
- A timeout/expiry mechanism for stale approval requests

### 7.4 Active Transcript Cell Pattern

Codex's `transcript.active_cell` pattern is elegant: instead of treating the transcript as an immutable list, it keeps ONE mutable "active cell" that can be updated in-place:

```rust
// Add a delta to the active command execution cell
if let Some(cell) = self.transcript.active_cell
    .as_mut()
    .and_then(|c| c.as_any_mut().downcast_mut::<ExecCell>())
{
    cell.append_output(call_id, delta);
    self.bump_active_cell_revision();
}
```

**Web GUI implication**: This maps naturally to React state management:
- Keep the transcript as an immutable array of completed items
- Keep ONE mutable "active item" state for the currently-streaming/executing item
- On completion, push to transcript array and clear active item
- Use a revision counter for cache invalidation of the active area

### 7.5 Stream Controller with Adaptive Chunking

Codex separates streaming concerns into a `StreamController` that buffers incoming deltas and a `CommitTickScope` that controls pacing:

```rust
enum CommitTickScope {
    AnyMode,      // Smooth + catch-up
    CatchUpOnly,  // Only drain if queue is backed up
}
```

**Web GUI implication**: For a web app, this translates to:
- Buffer incoming SSE/WebSocket deltas in a queue
- Use `requestAnimationFrame` to batch-render at display refresh rate
- Switch to "catch-up" mode (larger batches) when the queue grows beyond a threshold
- Never drop frames -- always render the latest content on the next frame

### 7.6 Thread Status as a State Machine

```rust
pub enum ThreadStatus {
    NotLoaded,
    Idle,
    SystemError,
    Active { active_flags: Vec<ThreadActiveFlag> },
}

pub enum ThreadActiveFlag {
    WaitingOnApproval,      // Server waiting for client to respond to approval request
    WaitingOnUserInput,     // Server waiting for tool-requested user input
}
```

**Web GUI implication**: Use thread status to drive UI affordances:
- Show a pulsing indicator when `Active`
- Show approval prompt when `WaitingOnApproval` flag is set
- Show input form when `WaitingOnUserInput` flag is set
- Disable certain actions when not `Idle`

### 7.7 Turn Steering (Mid-Turn Input)

Codex supports `turn/steer` -- injecting additional input while a turn is in progress. This requires:
- A `expected_turn_id` precondition to prevent races
- Input queueing in the TUI when a turn is already running
- Server-side deduplication

**Web GUI implication**: This is a powerful pattern. Users should be able to add context or corrections while the agent is working:
- Keep the input composer active during turns (with a visual distinction)
- Queue steer inputs if a previous steer hasn't been acknowledged yet
- Show queued steers as pending in the transcript

### 7.8 Permission Mode as a Slot-Filling UI

The TUI presents permission modes as a selection popup with named presets. Each preset maps to a combination of `AskForApproval` policy, `SandboxMode`, and `ApprovalsReviewer`. Custom profiles can be defined in `config.toml`.

**Web GUI implication**: A web GUI should present permissions as a dropdown or segmented control rather than freeform text. Options:
- Read Only (safe browsing)
- Auto / Default (approval-required mode)
- Auto-review (Guardian-managed)
- Full Access (YOLO)
- Custom profiles from project/user config

### 7.9 History Cell Architecture

Codex's `history_cell/` module defines ~12 cell types, each implementing the `HistoryCell` trait:

```rust
trait HistoryCell {
    fn display_lines(&self, width: u16) -> Vec<Line>;
    fn desired_height(&self, width: u16) -> u16;
}
```

Each cell is self-contained and knows how to render at any width. This enables:
- Resize handling without re-rendering the entire transcript
- Lazy rendering of off-screen content
- Clean separation of concerns (each cell type handles its own formatting)

**Web GUI implication**: Each "item type" in the web transcript should be a self-contained component:
```typescript
interface TranscriptItem {
  id: string;
  type: 'user_message' | 'agent_message' | 'command_execution' | 'file_change' | 'mcp_tool_call' | ...;
  status: 'in_progress' | 'completed' | 'failed' | 'declined';
  data: UserMessageData | AgentMessageData | CommandExecutionData | ...;
}
```

### 7.10 Deprecation and Warning Notifications

```rust
pub struct DeprecationNoticeNotification {
    pub summary: String,
    pub details: Option<String>,
}
pub struct WarningNotification {
    pub thread_id: Option<String>,
    pub message: String,
}
```

These are displayed as inline transcript cells rather than toast notifications. This ensures the user sees them in context and they persist in the transcript.

**Web GUI implication**: Render deprecation notices and warnings as inline cards in the conversation flow, not as ephemeral toasts that dismiss automatically.

---

## Summary: What to Steal for a Web GUI

| Concept | Codex Pattern | Web GUI Mapping |
|---------|--------------|-----------------|
| **Item model** | Typed `ThreadItem` enum with 17 variants | Typed conversation items with discriminators |
| **Streaming** | `AgentMessageDeltaNotification` with deltas | SSE/WebSocket events with incremental text |
| **Item lifecycle** | ItemStarted -> Deltas -> ItemCompleted | Create placeholder -> Accumulate -> Finalize |
| **Approval** | `CommandExecutionRequestApproval` with structured decisions | Modal/popup with decision buttons and policy options |
| **Active cell** | Single mutable `active_cell` updated in-place | Reactive state with one streaming/active entry |
| **Permission profiles** | Named profiles with inheritance | Dropdown/segmented control with preset options |
| **Thread status** | `ThreadStatus` state machine with active flags | UI affordances driven by status |
| **Turn steering** | `turn/steer` with `expected_turn_id` precondition | Keep composer active during turns, queue inputs |
| **Token display** | Context window math with baseline subtraction | Progress bar with percentage remaining |
| **Diff rendering** | Theme-aware unified diffs with syntax highlighting | Code diff component with add/delete styling |
| **Goal tracking** | `ThreadGoal` with budget, status, and time tracking | Progress bar with objective and budget display |
| **Plan display** | `TurnPlanStep` with Pending/InProgress/Completed | Checklist component with status indicators |
| **Warnings** | Inline transcript cells, not toasts | Inline cards in conversation flow |
| **Reasoning** | Status-header extraction, collapsible cell | Collapsible thinking block with header |
| **Slash commands** | 47 commands with gating properties | Command palette with availability filtering |
