import type {
  ChatEvent,
  ChatUsageUpdate,
  ChatPermissionRequest,
  SlashCommandInfo,
  ServerMessage,
} from "./chat-protocol";

// ── Timeline entry types ──

export type TimelineEntry =
  | UserTimelineEntry
  | AssistantTimelineEntry
  | ToolTimelineEntry
  | SystemTimelineEntry;

export interface UserTimelineEntry {
  kind: "user";
  id: string;
  text: string;
  uuid?: string;
  ts: number;
  optimistic?: boolean;
}

export interface AssistantTimelineEntry {
  kind: "assistant";
  id: string;
  messageId: string;
  text: string;
  thinkingText?: string;
  thinkingDurationMs?: number;
  ts: number;
}

export interface ToolTimelineEntry {
  kind: "tool";
  id: string;
  toolUseId: string;
  toolName: string;
  input: string;
  status: "running" | "success" | "error" | "permission_prompt";
  output?: string;
  isError?: boolean;
  permissionRequestId?: string;
  ts: number;
}

export interface SystemTimelineEntry {
  kind: "system";
  id: string;
  text: string;
  ts: number;
}

// ── Session phase ──

export type SessionPhase =
  | "empty"
  | "connecting"
  | "connected"
  | "running"
  | "idle"
  | "error"
  | "disconnected";

// ── Usage ──

export interface UsageState {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  modelUsage?: Record<string, unknown>;
}

export interface TurnUsage extends UsageState {
  turnIndex: number;
  durationMs: number;
}

// ── Store state ──

export interface ChatSessionState {
  phase: SessionPhase;
  sessionId: string | null;
  epoch: number;
  reconnectToken: string | null;

  // Timeline
  timeline: TimelineEntry[];
  streamingText: string;
  thinkingText: string;
  thinkingStartMs: number | null;
  thinkingEndMs: number | null;

  // Tool tracking
  activeToolId: string | null;

  // Usage
  usage: UsageState;
  turnUsages: TurnUsage[];
  currentTurnStartMs: number | null;

  // Permissions
  pendingPermissions: ChatPermissionRequest[];

  // Metadata
  model: string | null;
  slashCommands: SlashCommandInfo[];

  // Error
  error: string | null;
}

// ── Actions ──

export type ChatAction =
  | { type: "CONNECT_START" }
  | { type: "CONNECTED"; sessionId: string; epoch: number; reconnectToken?: string }
  | { type: "DISCONNECT" }
  | { type: "ERROR"; code: string; message: string }
  | { type: "SERVER_EVENT"; event: ChatEvent }
  | { type: "SEND_MESSAGE"; text: string; uuid: string }
  | { type: "TURN_INTERRUPTED" }
  | { type: "RESET" };

// ── Initial state ──

export const INITIAL_USAGE: UsageState = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cost: 0,
};

export const INITIAL_STATE: ChatSessionState = {
  phase: "empty",
  sessionId: null,
  epoch: 0,
  reconnectToken: null,
  timeline: [],
  streamingText: "",
  thinkingText: "",
  thinkingStartMs: null,
  thinkingEndMs: null,
  activeToolId: null,
  usage: { ...INITIAL_USAGE },
  turnUsages: [],
  currentTurnStartMs: null,
  pendingPermissions: [],
  model: null,
  slashCommands: [],
  error: null,
};

// ── Reducer ──

export function chatReducer(
  state: ChatSessionState,
  action: ChatAction
): ChatSessionState {
  switch (action.type) {
    case "CONNECT_START":
      return { ...state, phase: "connecting", error: null };

    case "CONNECTED":
      return {
        ...state,
        phase: "idle",
        sessionId: action.sessionId,
        epoch: action.epoch,
        reconnectToken: action.reconnectToken ?? null,
        error: null,
      };

    case "DISCONNECT":
      return { ...state, phase: "disconnected" };

    case "ERROR":
      return { ...state, phase: "error", error: action.message };

    case "SEND_MESSAGE":
      return reduceSendMessage(state, action.text, action.uuid);

    case "TURN_INTERRUPTED":
      return reduceTurnInterrupted(state);

    case "RESET":
      return { ...INITIAL_STATE };

    case "SERVER_EVENT":
      return reduceServerEvent(state, action.event);
  }
}

function reduceSendMessage(
  state: ChatSessionState,
  text: string,
  uuid: string
): ChatSessionState {
  const entry: UserTimelineEntry = {
    kind: "user",
    id: uuid,
    text,
    uuid,
    ts: Date.now(),
    optimistic: true,
  };
  return {
    ...state,
    phase: "running",
    timeline: [...state.timeline, entry],
    currentTurnStartMs: Date.now(),
  };
}

function reduceTurnInterrupted(state: ChatSessionState): ChatSessionState {
  return {
    ...state,
    phase: "idle",
    streamingText: "",
    thinkingText: "",
    thinkingEndMs: state.thinkingStartMs ? Date.now() : null,
    activeToolId: null,
  };
}

function reduceServerEvent(
  state: ChatSessionState,
  event: ChatEvent
): ChatSessionState {
  switch (event.event_type) {
    case "session_init":
      return {
        ...state,
        model: event.model ?? state.model,
        slashCommands: event.slash_commands ?? state.slashCommands,
      };

    case "thinking_delta":
      return {
        ...state,
        phase: "running",
        thinkingText: state.thinkingText + event.text,
        thinkingStartMs: state.thinkingStartMs ?? Date.now(),
      };

    case "text_delta":
      return {
        ...state,
        phase: "running",
        streamingText: state.streamingText + event.text,
        thinkingEndMs:
          state.thinkingStartMs && !state.thinkingEndMs
            ? Date.now()
            : state.thinkingEndMs,
      };

    case "tool_use_start":
      return reduceToolStart(state, event.tool_use_id, event.tool_name);

    case "tool_input_delta":
      return reduceToolInputDelta(state, event.tool_use_id, event.json_delta);

    case "tool_use_end":
      return state; // No visual change until result arrives

    case "tool_result":
      return reduceToolResult(
        state,
        event.tool_use_id,
        event.output,
        event.is_error
      );

    case "permission_request":
      return reducePermissionRequest(state, event);

    case "usage_update":
      return reduceUsageUpdate(state, event);

    case "turn_complete":
      return reduceTurnComplete(state, event.stop_reason, event.error);

    case "assistant_message":
      return reduceAssistantMessage(state, event.message_id);

    case "user_message_echo":
      return reduceUserMessageEcho(state, event.uuid);

    case "raw":
      return state; // Ignore raw events in reducer

    default:
      return state;
  }
}

function reduceToolStart(
  state: ChatSessionState,
  toolUseId: string,
  toolName: string
): ChatSessionState {
  // Flush streaming text to assistant entry if any
  const newState = flushStreamingIfNeeded(state);

  const entry: ToolTimelineEntry = {
    kind: "tool",
    id: toolUseId,
    toolUseId,
    toolName,
    input: "",
    status: "running",
    ts: Date.now(),
  };

  return {
    ...newState,
    phase: "running",
    timeline: [...newState.timeline, entry],
    activeToolId: toolUseId,
  };
}

function reduceToolInputDelta(
  state: ChatSessionState,
  toolUseId: string,
  jsonDelta: string
): ChatSessionState {
  const timeline = state.timeline.map((entry) => {
    if (entry.kind === "tool" && entry.toolUseId === toolUseId) {
      return { ...entry, input: entry.input + jsonDelta };
    }
    return entry;
  });
  return { ...state, timeline };
}

function reduceToolResult(
  state: ChatSessionState,
  toolUseId: string,
  output: string | undefined,
  isError: boolean | undefined
): ChatSessionState {
  const timeline = state.timeline.map((entry) => {
    if (entry.kind === "tool" && entry.toolUseId === toolUseId) {
      return {
        ...entry,
        status: (isError ? "error" : "success") as ToolTimelineEntry["status"],
        output,
        isError: isError ?? false,
      };
    }
    return entry;
  });
  return { ...state, timeline, activeToolId: null };
}

function reducePermissionRequest(
  state: ChatSessionState,
  event: ChatPermissionRequest
): ChatSessionState {
  // Mark the tool as permission_prompt
  const timeline = state.timeline.map((entry) => {
    if (
      entry.kind === "tool" &&
      entry.status === "running"
    ) {
      return {
        ...entry,
        status: "permission_prompt" as const,
        permissionRequestId: event.request_id,
      };
    }
    return entry;
  });

  return {
    ...state,
    timeline,
    pendingPermissions: [...state.pendingPermissions, event],
  };
}

function reduceUsageUpdate(
  state: ChatSessionState,
  event: ChatUsageUpdate
): ChatSessionState {
  return {
    ...state,
    usage: {
      inputTokens: event.input_tokens,
      outputTokens: event.output_tokens,
      cacheReadTokens: event.cache_read_tokens,
      cacheWriteTokens: event.cache_write_tokens,
      cost: event.cost ?? state.usage.cost,
      modelUsage: event.model_usage ?? state.usage.modelUsage,
    },
  };
}

function reduceTurnComplete(
  state: ChatSessionState,
  stopReason: string | undefined,
  error: string | undefined
): ChatSessionState {
  // Flush any remaining streaming text
  let newState = flushStreamingIfNeeded(state);

  // Record turn usage
  const turnDuration = newState.currentTurnStartMs
    ? Date.now() - newState.currentTurnStartMs
    : 0;

  const turnUsage: TurnUsage = {
    ...newState.usage,
    turnIndex: newState.turnUsages.length,
    durationMs: turnDuration,
  };

  return {
    ...newState,
    phase: error ? "error" : "idle",
    turnUsages: [...newState.turnUsages, turnUsage],
    currentTurnStartMs: null,
    activeToolId: null,
    pendingPermissions: [],
    error: error ?? null,
    thinkingText: "",
    thinkingStartMs: null,
    thinkingEndMs: null,
  };
}

function reduceAssistantMessage(
  state: ChatSessionState,
  messageId: string
): ChatSessionState {
  // Flush streaming to a proper assistant entry
  return flushStreamingIfNeeded(state, messageId);
}

function reduceUserMessageEcho(
  state: ChatSessionState,
  uuid: string
): ChatSessionState {
  // Mark optimistic user message as confirmed
  const timeline = state.timeline.map((entry) => {
    if (entry.kind === "user" && entry.uuid === uuid && entry.optimistic) {
      return { ...entry, optimistic: false };
    }
    return entry;
  });
  return { ...state, timeline };
}

// ── Helpers ──

function flushStreamingIfNeeded(
  state: ChatSessionState,
  messageId?: string
): ChatSessionState {
  if (!state.streamingText && !state.thinkingText) {
    return state;
  }

  if (!state.streamingText) {
    // Only thinking, no text yet — don't create entry
    return state;
  }

  const entry: AssistantTimelineEntry = {
    kind: "assistant",
    id: messageId || `ast_${Date.now()}`,
    messageId: messageId || "",
    text: state.streamingText,
    thinkingText: state.thinkingText || undefined,
    thinkingDurationMs:
      state.thinkingStartMs && state.thinkingEndMs
        ? state.thinkingEndMs - state.thinkingStartMs
        : undefined,
    ts: Date.now(),
  };

  return {
    ...state,
    timeline: [...state.timeline, entry],
    streamingText: "",
    thinkingText: "",
    thinkingStartMs: null,
    thinkingEndMs: null,
  };
}

// ── Derived state helpers ──

export function getContextUtilization(state: ChatSessionState): number {
  const cw = getContextWindow(state);
  if (cw <= 0) return 0;
  const used =
    state.usage.inputTokens +
    state.usage.cacheReadTokens +
    state.usage.cacheWriteTokens;
  if (used <= 0) return 0;
  return Math.min(used / cw, 1);
}

export function getContextWindow(state: ChatSessionState): number {
  if (!state.usage.modelUsage) return 0;
  let max = 0;
  for (const entry of Object.values(state.usage.modelUsage)) {
    const cw = (entry as { context_window?: number }).context_window;
    if (cw && cw > max) max = cw;
  }
  return max;
}

export function getContextWarningLevel(
  state: ChatSessionState
): "none" | "moderate" | "high" | "critical" {
  const u = getContextUtilization(state);
  if (u >= 0.9) return "critical";
  if (u >= 0.75) return "high";
  if (u >= 0.5) return "moderate";
  return "none";
}

export function isRunning(state: ChatSessionState): boolean {
  return state.phase === "running";
}

export function isConnected(state: ChatSessionState): boolean {
  return (
    state.phase === "connected" ||
    state.phase === "idle" ||
    state.phase === "running"
  );
}
