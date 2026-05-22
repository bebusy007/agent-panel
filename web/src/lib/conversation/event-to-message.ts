import type { ChatEvent } from "./chat-protocol";
import type { ChatSessionState } from "./chat-session-store";

/**
 * Represents a message compatible with the existing RustMessage interface,
 * derived from live ChatEvents during an active conversation.
 */
export interface LiveMessage {
  id: string;
  role: string;
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  toolUseId?: string;
  toolStatus?: string;
  timestamp?: string;
  model?: string;
  isLive?: boolean;
}

/**
 * Flush the current streaming state into messages.
 * Called on TurnComplete or AssistantMessage to materialize streaming text.
 */
export function flushStreamingToMessages(
  state: ChatSessionState,
  messageId?: string
): LiveMessage[] {
  const messages: LiveMessage[] = [];

  if (state.thinkingText) {
    messages.push({
      id: `thinking_${messageId || Date.now()}`,
      role: "assistant",
      text: "(thinking)",
      timestamp: new Date().toISOString(),
      isLive: true,
    });
  }

  if (state.streamingText) {
    messages.push({
      id: messageId || `ast_${Date.now()}`,
      role: "assistant",
      text: state.streamingText,
      model: state.model || undefined,
      timestamp: new Date().toISOString(),
      isLive: true,
    });
  }

  return messages;
}

/**
 * Convert a ChatEvent into zero or more LiveMessages to append to the list.
 * Some events (TextDelta, ThinkingDelta) don't produce messages — they update
 * streaming state in the store. This function handles events that DO produce
 * discrete messages.
 */
export function eventToMessages(event: ChatEvent): LiveMessage[] {
  switch (event.event_type) {
    case "tool_use_start":
      return [{
        id: event.tool_use_id,
        role: "tool_use",
        toolName: event.tool_name,
        toolUseId: event.tool_use_id,
        toolInput: undefined,
        toolStatus: "running",
        timestamp: new Date().toISOString(),
        isLive: true,
      }];

    case "tool_result":
      return [{
        id: `result_${event.tool_use_id}`,
        role: "tool_result",
        toolUseId: event.tool_use_id,
        toolOutput: event.output || "",
        toolStatus: event.is_error ? "error" : "success",
        timestamp: new Date().toISOString(),
        isLive: true,
      }];

    default:
      return [];
  }
}

/**
 * Create an optimistic user message to show immediately in the list.
 */
export function createOptimisticUserMessage(text: string, uuid: string): LiveMessage {
  return {
    id: uuid,
    role: "user",
    text,
    timestamp: new Date().toISOString(),
    isLive: true,
  };
}

/**
 * Update a tool_use message's input (called on ToolInputDelta).
 * Returns a new message with updated toolInput if found, or null.
 */
export function updateToolInput(
  messages: LiveMessage[],
  toolUseId: string,
  jsonDelta: string
): LiveMessage[] {
  return messages.map((m) => {
    if (m.role === "tool_use" && m.toolUseId === toolUseId) {
      const currentInput = typeof m.toolInput === "string" ? m.toolInput : "";
      const newInput = currentInput + jsonDelta;
      let parsed: unknown;
      try {
        parsed = JSON.parse(newInput);
      } catch {
        parsed = newInput;
      }
      return { ...m, toolInput: parsed };
    }
    return m;
  });
}
