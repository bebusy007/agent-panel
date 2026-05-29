// ── Server → Client messages ──

export type ServerMessage =
  | ServerStateChange
  | ServerConnected
  | ServerEvent_
  | ServerError
  | ServerDisconnected;

export interface ServerStateChange {
  type: 'state_change';
  state: 'spawned' | 'idle';
  reason?: string;
}

export interface ServerConnected {
  type: 'connected';
  epoch: number;
  session_id: string;
  seq: number;
  reconnect_token?: string;
}

export interface ServerEvent_ {
  type: 'event';
  seq: number;
  event: ChatEvent;
}

export interface ServerError {
  type: 'error';
  code: string;
  message: string;
}

export interface ServerDisconnected {
  type: 'disconnected';
  reason: string;
}

// ── Client → Server messages ──

export type ClientMessage =
  | ClientUserMessage
  | ClientPermissionResponse
  | ClientInterrupt
  | ClientDisconnect
  | ClientRewind;

export interface ClientUserMessage {
  type: 'user_message';
  text: string;
  attachments?: AttachmentData[];
}

export interface ClientPermissionResponse {
  type: 'permission_response';
  request_id: string;
  decision: 'allow' | 'deny';
}

export interface ClientInterrupt {
  type: 'interrupt';
}

export interface ClientDisconnect {
  type: 'disconnect';
}

export interface ClientRewind {
  type: 'rewind_files';
  request_id: string;
  user_message_id: string;
  dry_run?: boolean;
  files?: string[];
}

// ── ChatEvent variants ──

export type ChatEvent =
  | ChatSessionInit
  | ChatSystemStatus
  | ChatMessageStart
  | ChatMessageDelta
  | ChatContentBlockStart
  | ChatTextDelta
  | ChatThinkingDelta
  | ChatSignatureDelta
  | ChatToolInputDelta
  | ChatContentBlockStop
  | ChatAssistantMessage
  | ChatUserMessageEcho
  | ChatToolResult
  | ChatPermissionRequest
  | ChatHookCallback
  | ChatElicitationRequest
  | ChatUsageUpdate
  | ChatTurnComplete
  | ChatCompactBoundary
  | ChatRateLimit
  | ChatTaskNotification
  | ChatRaw;

export interface ChatSessionInit {
  kind: 'session_init';
  session_id: string;
  model?: string;
  slash_commands?: SlashCommandInfo[];
  mcp_servers?: McpServerInfo[];
  tools?: string[];
  cli_version?: string;
  permission_mode?: string;
  cwd?: string;
}

export interface ChatSystemStatus {
  kind: 'system_status';
  status: string;
}

export interface ChatMessageStart {
  kind: 'message_start';
  message_id: string;
  model?: string;
}

export interface ChatMessageDelta {
  kind: 'message_delta';
  stop_reason?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface ChatContentBlockStart {
  kind: 'content_block_start';
  index: number;
  block_type: string;
  tool_use_id?: string;
  tool_name?: string;
}

export interface ChatTextDelta {
  kind: 'text_delta';
  text: string;
}

export interface ChatThinkingDelta {
  kind: 'thinking_delta';
  text: string;
}

export interface ChatSignatureDelta {
  kind: 'signature_delta';
  signature: string;
}

export interface ChatToolInputDelta {
  kind: 'tool_input_delta';
  tool_use_id: string;
  json_delta: string;
}

export interface ChatContentBlockStop {
  kind: 'content_block_stop';
  index: number;
}

export interface ChatAssistantMessage {
  kind: 'assistant_message';
  message_id: string;
  model?: string;
  text?: string;
  thinking_text?: string;
  thinking_signature?: string;
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  stop_reason?: string;
  usage?: MessageUsage;
}

export interface ChatUserMessageEcho {
  kind: 'user_message_echo';
  uuid: string;
}

export interface ChatToolResult {
  kind: 'tool_result';
  tool_use_id: string;
  output?: string;
  is_error?: boolean;
  interrupted?: boolean;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
}

export interface ChatPermissionRequest {
  kind: 'permission_request';
  request_id: string;
  tool_name: string;
  tool_input?: unknown;
  suggestions?: unknown[];
}

export interface ChatHookCallback {
  kind: 'hook_callback';
  request_id: string;
  hook_name: string;
  hook_event: string;
  data: unknown;
}

export interface ChatElicitationRequest {
  kind: 'elicitation_request';
  request_id: string;
  mcp_server: string;
  message: string;
  schema?: unknown;
}

export interface ChatUsageUpdate {
  kind: 'usage_update';
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost?: number;
  model_usage?: Record<string, unknown>;
}

export interface ChatTurnComplete {
  kind: 'turn_complete';
  stop_reason?: string;
  error?: string;
  is_error?: boolean;
  terminal_reason?: string;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
}

export interface ChatCompactBoundary {
  kind: 'compact_boundary';
  compact_kind?: string;
}

export interface ChatRateLimit {
  kind: 'rate_limit';
  status: string;
  utilization?: number;
  resets_at?: number;
  limit_type?: string;
}

export interface ChatTaskNotification {
  kind: 'task_notification';
  task_id: string;
  status: string;
  message: string;
  tool_use_id?: string;
  output_file?: string;
}

export interface ChatRaw {
  kind: 'raw';
  raw_type: string;
  data: unknown;
}

// ── Supporting types ──

export interface SlashCommandInfo {
  name: string;
  description?: string;
  aliases?: string[];
  is_skill?: boolean;
}

export interface McpServerInfo {
  name: string;
  status?: string;
}

export interface MessageUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  service_tier?: string;
}

export interface TurnUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost?: number;
  duration_ms?: number;
  model_usage?: Record<string, unknown>;
}

export interface AttachmentData {
  filename: string;
  media_type: string;
  content_base64: string;
}

// ── Connection state ──

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error';

// ── Streaming state (shared between hooks and components) ──

export interface StreamingState {
  streamingText: string;
  thinkingText: string;
  thinkingStartMs: number;
  thinkingEndMs: number;
  model?: string | null;
}
