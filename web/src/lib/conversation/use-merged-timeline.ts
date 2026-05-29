import { useMemo } from 'react';
import type { AdaptedTimelineEntry } from './history-adapter';
import type { ChatSessionState } from './chat-session-store';

/**
 * Derive the streaming entry from ChatSessionStore for MessageTimeline.
 *
 * mergeTimelines() (timeline-merger.ts) is ready for when the store builds
 * live TimelineEntry[] — that wire-up belongs to Phase 3 when the reducer
 * is extended to build structured entries from raw ChatEvents.
 * For Phase 2, history entries render through MessageTimeline and streaming
 * text renders through StreamingBlock.
 */
export function useMergedTimeline(
  historyEntries: AdaptedTimelineEntry[],
  chatState: ChatSessionState | null,
): {
  entries: AdaptedTimelineEntry[];
  streamingEntry: {
    streamingText: string;
    thinkingText: string;
    thinkingStartMs: number;
    thinkingEndMs: number;
    model?: string | null;
  } | null;
} {
  const streamingEntry = useMemo(() => {
    if (!chatState) return null;
    const { streamingText, thinkingText, thinkingStartMs, thinkingEndMs, model } = chatState;
    if (!streamingText && !thinkingText) return null;
    return { streamingText, thinkingText, thinkingStartMs, thinkingEndMs, model };
  }, [chatState]);

  return { entries: historyEntries, streamingEntry };
}
