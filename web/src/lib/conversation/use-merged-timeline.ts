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
  // Streaming updates are high-frequency — don't cache, always recompute
  const st = chatState;
  const streamingEntry: StreamingState | null = !st
    ? null
    : !st.streamingText && !st.thinkingText
      ? null
      : {
          streamingText: st.streamingText,
          thinkingText: st.thinkingText,
          thinkingStartMs: st.thinkingStartMs,
          thinkingEndMs: st.thinkingEndMs,
          model: st.model,
        };

  const live = st?.liveEntries;
  const entries = useMemo(() => {
    if (!live || live.length === 0) return historyEntries;
    return mergeTimelines(historyEntries, live);
  }, [historyEntries, live]);

  return useMemo(() => ({ entries, streamingEntry }), [entries, streamingEntry]);
}
