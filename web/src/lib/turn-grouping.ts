/**
 * Carve a session's flat message list into "turns" — each user message
 * starts a new turn, and subsequent assistant / tool messages belong to it.
 * The turn sidebar in SessionDetailView uses this to give a clickable
 * outline of the conversation.
 *
 * Pure function, no React. Easy to unit-test.
 */

import type { Message } from '@/lib/api';
import { cleanupPromptPreview } from '@/lib/text-cleanup';
import { canonicalTool } from '@/lib/tool-aliases';

export interface TurnEntry {
  /** Zero-based turn index; equals position in the returned array. */
  index: number;
  /** The user message that opens this turn. May be undefined for sessions
   *  that start with a system / assistant message (very rare). */
  userMessage?: Message;
  /** Index of `userMessage` in the original messages array, or -1. */
  userMessageIndex: number;
  /** Concise label — first line of the user prompt, ≤ 60 chars. */
  preview: string;
  /** Total messages belonging to this turn (user + assistant + tools). */
  messageCount: number;
  /** Tool-use messages count, for the per-turn chip. */
  toolCount: number;
  /** True if any message in this turn is a tool with toolStatus === "error". */
  hasError: boolean;
  /** Number of subagent (Task/Agent) tool_use calls in this turn. */
  subagentCount: number;
}

/** Split the message stream into turns. */
export function buildTurns(messages: Message[]): TurnEntry[] {
  const turns: TurnEntry[] = [];
  let cur: TurnEntry | null = null;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    // System / meta lines at the very start get swept into a "turn 0".
    if (m.role === 'user') {
      cur = {
        index: turns.length,
        userMessage: m,
        userMessageIndex: i,
        preview: previewOf(m.text || ''),
        messageCount: 1,
        toolCount: 0,
        hasError: false,
        subagentCount: 0,
      };
      turns.push(cur);
      continue;
    }

    if (!cur) {
      // No user message yet — bucket leading system / assistant in a synthetic
      // turn 0 so the sidebar still shows them.
      cur = {
        index: turns.length,
        userMessage: undefined,
        userMessageIndex: -1,
        preview: '(系统消息)',
        messageCount: 0,
        toolCount: 0,
        hasError: false,
        subagentCount: 0,
      };
      turns.push(cur);
    }

    cur.messageCount++;
    if (m.role === 'tool_use') {
      cur.toolCount++;
      if (canonicalTool(m.toolName) === 'Task') cur.subagentCount++;
    }
    if (m.role === 'tool_result' && m.toolStatus === 'error') cur.hasError = true;
  }

  return turns;
}

/**
 * Given a message index in the original messages array, return the turn
 * index it belongs to. Uses the fact that turns are sorted by
 * userMessageIndex — the message belongs to the last turn whose
 * userMessageIndex <= msgIndex.
 */
export function turnIndexForMessage(turns: TurnEntry[], msgIndex: number): number {
  let best = 0;
  for (let i = 0; i < turns.length; i++) {
    const start = turns[i]!.userMessageIndex === -1 ? 0 : turns[i]!.userMessageIndex;
    if (start <= msgIndex) best = i;
    else break;
  }
  return best;
}

function previewOf(text: string): string {
  // cleanupPromptPreview strips Cursor's <user_query>…</user_query>
  // wrapper, Claude Code's <command-message>/<command-name> envelopes,
  // and friends — without that, every Cursor turn label looks like
  // "<user_query>" because the wrapper is the literal first line.
  return cleanupPromptPreview(text, 60);
}
