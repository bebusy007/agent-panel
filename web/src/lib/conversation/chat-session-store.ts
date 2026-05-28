import type { ChatEvent, ServerMessage, SlashCommandInfo, McpServerInfo } from './types';

// ── Session phase ──

export type SessionPhase =
  | 'empty'
  | 'connecting'
  | 'connected'
  | 'running'
  | 'idle'
  | 'error'
  | 'disconnected';

export const ACTIVE_PHASES: Set<SessionPhase> = new Set(['connected', 'running', 'idle']);

// ── Usage ──

export interface UsageState {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  modelUsage?: Record<string, unknown>;
}

// ── Store state ──

export interface ChatSessionState {
  phase: SessionPhase;
  sessionId: string | null;
  epoch: number;
  reconnectToken: string | null;
  error: string | null;
  seq: number;

  // Streaming
  streamingText: string;
  thinkingText: string;
  thinkingStartMs: number;
  thinkingEndMs: number;

  // Usage
  usage: UsageState;
  currentTurnStartMs: number | null;

  // Permissions
  pendingPermissions: ChatPermissionRequest[];

  // Metadata
  model: string | null;
  slashCommands: SlashCommandInfo[];
  mcpServers: McpServerInfo[];
  cliVersion: string;
  permissionMode: string;
  cwd: string;

  // Rate limit
  rateLimit: { status: string; utilization?: number; resetsAt?: number } | null;
  compactCount: number;

  // Dedup guards
  _seenMessageIds: Set<string>;
  _seenToolIds: Set<string>;
}

interface ChatPermissionRequest {
  request_id: string;
  tool_name: string;
  tool_input?: unknown;
  suggestions?: unknown[];
}

// ── Actions ──

export type ChatAction =
  | { type: 'CONNECT_START' }
  | { type: 'CONNECTED'; sessionId: string; epoch: number; reconnectToken?: string; seq: number }
  | { type: 'DISCONNECT' }
  | { type: 'ERROR'; code: string; message: string }
  | { type: 'SERVER_EVENT'; event: ChatEvent }
  | { type: 'SEND_MESSAGE'; text: string; uuid: string }
  | { type: 'TURN_INTERRUPTED' }
  | { type: 'RESET' };

// ── Initial state ──

export const INITIAL_USAGE: UsageState = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cost: 0,
};

export const INITIAL_STATE: ChatSessionState = {
  phase: 'empty',
  sessionId: null,
  epoch: 0,
  reconnectToken: null,
  error: null,
  seq: 0,
  streamingText: '',
  thinkingText: '',
  thinkingStartMs: 0,
  thinkingEndMs: 0,
  usage: { ...INITIAL_USAGE },
  currentTurnStartMs: null,
  pendingPermissions: [],
  model: null,
  slashCommands: [],
  mcpServers: [],
  cliVersion: '',
  permissionMode: '',
  cwd: '',
  rateLimit: null,
  compactCount: 0,
  _seenMessageIds: new Set(),
  _seenToolIds: new Set(),
};

// ── Reducer ──

export function chatReducer(state: ChatSessionState, action: ChatAction): ChatSessionState {
  switch (action.type) {
    case 'CONNECT_START':
      return { ...state, phase: 'connecting', error: null };
    case 'CONNECTED':
      return {
        ...state,
        phase: 'idle',
        sessionId: action.sessionId,
        epoch: action.epoch,
        reconnectToken: action.reconnectToken ?? null,
        seq: action.seq,
        error: null,
      };
    case 'DISCONNECT':
      return { ...state, phase: 'disconnected', streamingText: '', thinkingText: '' };
    case 'ERROR':
      return { ...state, phase: 'error', error: action.message };
    case 'SEND_MESSAGE':
      return { ...state, phase: 'running', currentTurnStartMs: Date.now() };
    case 'TURN_INTERRUPTED':
      return {
        ...state,
        phase: 'idle',
        streamingText: '',
        thinkingText: '',
        thinkingEndMs: state.thinkingStartMs ? Date.now() : 0,
      };
    case 'RESET':
      return { ...INITIAL_STATE };
    case 'SERVER_EVENT':
      return reduceServerEvent(state, action.event);
  }
}

function reduceServerEvent(state: ChatSessionState, event: ChatEvent): ChatSessionState {
  switch (event.kind) {
    case 'session_init':
      return {
        ...state,
        model: event.model ?? state.model,
        slashCommands: event.slash_commands ?? state.slashCommands,
        mcpServers: event.mcp_servers ?? state.mcpServers,
        cliVersion: event.cli_version ?? state.cliVersion,
        permissionMode: event.permission_mode ?? state.permissionMode,
        cwd: event.cwd ?? state.cwd,
      };
    case 'system_status':
      return { ...state, phase: 'running' };
    case 'message_start':
    case 'content_block_start':
    case 'content_block_stop':
      return state;
    case 'text_delta':
      return {
        ...state,
        phase: 'running',
        streamingText: state.streamingText + event.text,
        thinkingEndMs:
          state.thinkingStartMs && !state.thinkingEndMs ? Date.now() : state.thinkingEndMs,
      };
    case 'thinking_delta':
      return {
        ...state,
        phase: 'running',
        thinkingText: state.thinkingText + event.text,
        thinkingStartMs: state.thinkingStartMs || Date.now(),
      };
    case 'signature_delta':
    case 'tool_input_delta':
      return state;
    case 'assistant_message':
      if (state._seenMessageIds.has(event.message_id)) return state;
      state._seenMessageIds.add(event.message_id);
      return {
        ...state,
        streamingText: '',
        thinkingText: '',
        thinkingStartMs: 0,
        thinkingEndMs: 0,
      };
    case 'user_message_echo':
      return state;
    case 'tool_result':
      return state;
    case 'permission_request':
      return { ...state, pendingPermissions: [...state.pendingPermissions, event] };
    case 'hook_callback':
    case 'elicitation_request':
      return state;
    case 'message_delta':
    case 'usage_update':
      return {
        ...state,
        usage: {
          inputTokens: (event as any).input_tokens ?? state.usage.inputTokens,
          outputTokens: (event as any).output_tokens ?? state.usage.outputTokens,
          cacheReadTokens: (event as any).cache_read_tokens ?? state.usage.cacheReadTokens,
          cacheWriteTokens: (event as any).cache_write_tokens ?? state.usage.cacheWriteTokens,
          cost: (event as any).cost ?? state.usage.cost,
          modelUsage: (event as any).model_usage ?? state.usage.modelUsage,
        },
      };
    case 'turn_complete':
      return {
        ...state,
        phase: 'idle',
        pendingPermissions: [],
        streamingText: '',
        thinkingText: '',
      };
    case 'compact_boundary':
      return { ...state, compactCount: state.compactCount + 1 };
    case 'rate_limit':
      return {
        ...state,
        rateLimit: {
          status: event.status,
          utilization: event.utilization,
          resetsAt: event.resets_at,
        },
      };
    case 'task_notification':
    case 'raw':
      return state;
    default:
      return state;
  }
}

// ── Derived helpers ──

export function isRunning(state: ChatSessionState): boolean {
  return state.phase === 'running';
}
export function isConnected(state: ChatSessionState): boolean {
  return ACTIVE_PHASES.has(state.phase);
}
