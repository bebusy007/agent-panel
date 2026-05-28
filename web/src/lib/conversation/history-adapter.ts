// Phase 1 Step 1.9: Convert API Message[] to TimelineEntry[]
// Note: TimelineEntry types are defined in Phase 2, so adapter returns a simplified
// representation for now. Full TimelineEntry rendering comes in Phase 2.

interface ApiMessage {
  id: string;
  role: string;
  text?: string | null;
  thinkingText?: string | null;
  messageId?: string | null;
  toolName?: string | null;
  toolInput?: unknown;
  toolOutput?: string | null;
  toolUseId?: string | null;
  toolStatus?: string | null;
  timestamp?: string | null;
  model?: string | null;
  costUsd?: number | null;
  usage?: ApiMessageUsage | null;
  durationMs?: number | null;
  stopReason?: string | null;
  images?: unknown[] | null;
  raw?: unknown;
  agentHash?: string | null;
  parentToolUseId?: string | null;
  cwd?: string | null;
  gitBranch?: string | null;
}

interface ApiMessageUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  serviceTier?: string | null;
}

export interface AdaptedTimelineEntry {
  kind: "user" | "assistant" | "tool" | "system" | "raw";
  id: string;
  role?: string;
  text?: string;
  thinkingText?: string;
  model?: string;
  costUsd?: number;
  usage?: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number };
  durationMs?: number;
  stopReason?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  toolUseId?: string;
  toolStatus?: string;
  timestamp?: string;
  raw?: unknown;
  isLive?: boolean;
}

/** Convert API Message[] to simplified TimelineEntry for Phase 2 rendering */
export function messagesToTimeline(messages: ApiMessage[]): AdaptedTimelineEntry[] {
  const result: AdaptedTimelineEntry[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    switch (msg.role) {
      case "user":
        result.push({ kind: "user", id: msg.id, text: msg.text ?? "", timestamp: msg.timestamp ?? undefined });
        break;

      case "assistant": {
        // Check if next message is a tool_result that pairs with a preceding tool_use
        result.push({
          kind: "assistant",
          id: msg.messageId || msg.id,
          text: msg.text ?? "",
          thinkingText: msg.thinkingText ?? undefined,
          model: msg.model ?? undefined,
          costUsd: msg.costUsd ?? undefined,
          usage: msg.usage ? {
            inputTokens: msg.usage.inputTokens ?? 0,
            outputTokens: msg.usage.outputTokens ?? 0,
            cacheReadInputTokens: msg.usage.cacheReadInputTokens ?? 0,
            cacheCreationInputTokens: msg.usage.cacheCreationInputTokens ?? 0,
          } : undefined,
          durationMs: msg.durationMs ?? undefined,
          stopReason: msg.stopReason ?? undefined,
          timestamp: msg.timestamp ?? undefined,
        });
        break;
      }

      case "tool_use": {
        // Look ahead for matching tool_result to merge
        const next = messages[i + 1];
        let output: string | undefined;
        let status: string | undefined;
        if (next?.role === "tool_result" && next.toolUseId === msg.toolUseId) {
          output = next.toolOutput ?? undefined;
          status = next.toolStatus ?? undefined;
          i++; // Consume the tool_result
        }
        result.push({
          kind: "tool",
          id: msg.toolUseId || msg.id,
          toolName: msg.toolName ?? "unknown",
          toolInput: msg.toolInput ?? undefined,
          toolOutput: output,
          toolUseId: msg.toolUseId ?? undefined,
          toolStatus: status || (output ? "success" : "running"),
          timestamp: msg.timestamp ?? undefined,
        });
        break;
      }

      case "tool_result":
        // tool_result alone (no preceding tool_use) — create standalone entry
        if (i === 0 || messages[i - 1]?.role !== "tool_use" || (messages[i - 1] as ApiMessage).toolUseId !== msg.toolUseId) {
          result.push({
            kind: "tool",
            id: msg.toolUseId || msg.id,
            toolOutput: msg.toolOutput ?? undefined,
            toolUseId: msg.toolUseId ?? undefined,
            toolStatus: msg.toolStatus ?? undefined,
            timestamp: msg.timestamp ?? undefined,
          });
        }
        break;

      case "system":
      case "meta":
        result.push({
          kind: "system",
          id: msg.id,
          text: msg.text ?? undefined,
          toolName: msg.toolName ?? undefined,
          timestamp: msg.timestamp ?? undefined,
        });
        break;

      default:
        result.push({
          kind: "raw",
          id: msg.id,
          role: msg.role,
          text: msg.text ?? undefined,
          raw: msg.raw ?? undefined,
          timestamp: msg.timestamp ?? undefined,
        });
    }
  }

  return result;
}
