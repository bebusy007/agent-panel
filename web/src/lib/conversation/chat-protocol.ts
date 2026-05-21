// ── Server → Client messages ──

export type ServerMessage =
  | ServerStateChange
  | ServerConnected
  | ServerEvent
  | ServerError
  | ServerDisconnected;

export interface ServerStateChange {
  type: "state_change";
  state: SessionState;
  reason?: string;
}

export interface ServerConnected {
  type: "connected";
  epoch: number;
  session_id: string;
  reconnect_token?: string;
}

export interface ServerEvent {
  type: "event";
  event_type: ChatEvent["event_type"];
  [key: string]: unknown;
}

export interface ServerError {
  type: "error";
  code: string;
  message: string;
}

export interface ServerDisconnected {
  type: "disconnected";
  reason: string;
}

export type SessionState = "spawned" | "idle";

// ── Client → Server messages ──

export type ClientMessage =
  | ClientUserMessage
  | ClientPermissionResponse
  | ClientInterrupt
  | ClientDisconnect;

export interface ClientUserMessage {
  type: "user_message";
  text: string;
  attachments?: AttachmentData[];
}

export interface ClientPermissionResponse {
  type: "permission_response";
  request_id: string;
  decision: PermissionDecision;
}

export interface ClientInterrupt {
  type: "interrupt";
}

export interface ClientDisconnect {
  type: "disconnect";
}

export type PermissionDecision = "allow" | "deny";

// ── ChatEvent variants ──

export type ChatEvent =
  | ChatSessionInit
  | ChatThinkingDelta
  | ChatTextDelta
  | ChatToolUseStart
  | ChatToolInputDelta
  | ChatToolUseEnd
  | ChatToolResult
  | ChatPermissionRequest
  | ChatUsageUpdate
  | ChatTurnComplete
  | ChatAssistantMessage
  | ChatUserMessageEcho
  | ChatRaw;

export interface ChatSessionInit {
  event_type: "session_init";
  session_id: string;
  model?: string;
  slash_commands: SlashCommandInfo[];
}

export interface ChatThinkingDelta {
  event_type: "thinking_delta";
  text: string;
}

export interface ChatTextDelta {
  event_type: "text_delta";
  text: string;
}

export interface ChatToolUseStart {
  event_type: "tool_use_start";
  tool_use_id: string;
  tool_name: string;
}

export interface ChatToolInputDelta {
  event_type: "tool_input_delta";
  tool_use_id: string;
  json_delta: string;
}

export interface ChatToolUseEnd {
  event_type: "tool_use_end";
  tool_use_id: string;
}

export interface ChatToolResult {
  event_type: "tool_result";
  tool_use_id: string;
  output?: string;
  is_error?: boolean;
}

export interface ChatPermissionRequest {
  event_type: "permission_request";
  request_id: string;
  tool_name: string;
  tool_input?: unknown;
  suggestions?: unknown[];
}

export interface ChatUsageUpdate {
  event_type: "usage_update";
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost?: number;
  model_usage?: Record<string, unknown>;
}

export interface ChatTurnComplete {
  event_type: "turn_complete";
  stop_reason?: string;
  error?: string;
}

export interface ChatAssistantMessage {
  event_type: "assistant_message";
  message_id: string;
}

export interface ChatUserMessageEcho {
  event_type: "user_message_echo";
  uuid: string;
}

export interface ChatRaw {
  event_type: "raw";
  data: unknown;
}

// ── Supporting types ──

export interface SlashCommandInfo {
  name: string;
  description?: string;
  aliases?: string[];
  is_skill?: boolean;
}

export interface AttachmentData {
  filename: string;
  media_type: string;
  content_base64: string;
}

// ── Connection state (frontend state machine) ──

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

// ── Error codes ──

export const ERROR_CODES = {
  ALREADY_CONNECTED: "already_connected",
  CLI_NOT_FOUND: "cli_not_found",
  AUTH_FAILED: "auth_failed",
  VERSION_MISMATCH: "version_mismatch",
  QUOTA_EXCEEDED: "quota_exceeded",
  MODEL_UNAVAILABLE: "model_unavailable",
  UNKNOWN_ERROR: "unknown_error",
} as const;
