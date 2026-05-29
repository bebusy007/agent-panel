import { useMemo } from 'react';
import type { AdaptedTimelineEntry } from './history-adapter';
import type { ChatSessionState } from './chat-session-store';
import type { StreamingState } from './types';
import { mergeTimelines } from './timeline-merger';

export function useMergedTimeline(
  historyEntries: AdaptedTimelineEntry[],
  chatState: ChatSessionState | null,
): {
  entries: AdaptedTimelineEntry[];
  streamingEntry: StreamingState | null;
} {
  const streamingEntry: StreamingState | null = useMemo(() => {
    if (!chatState) return null;
    const { streamingText, thinkingText, thinkingStartMs, thinkingEndMs, model } = chatState;
    if (!streamingText && !thinkingText) return null;
    return { streamingText, thinkingText, thinkingStartMs, thinkingEndMs, model };
  }, [chatState]);

  const entries = useMemo(() => {
    if (!chatState || chatState.liveEntries.length === 0) {
      return historyEntries;
    }
    return mergeTimelines(historyEntries, chatState.liveEntries);
  }, [historyEntries, chatState?.liveEntries]);

  return useMemo(() => ({ entries, streamingEntry }), [entries, streamingEntry]);
}
