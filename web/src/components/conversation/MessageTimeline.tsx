import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSession } from '@/components/session/SessionContext';
import { ToolCard } from '@/components/tool-cards/ToolCard';
import { UserMessage } from '@/components/conversation/UserMessage';
import { AssistantMessage } from '@/components/conversation/AssistantMessage';
import { SystemNotice } from '@/components/conversation/SystemNotice';
import { StreamingBlock } from '@/components/conversation/StreamingBlock';
import type { StreamingState } from '@/lib/conversation/types';
import { useAutoScroll } from '@/lib/conversation/use-auto-scroll';
import { canonicalTool } from '@/lib/tool-aliases';
import { centerMarkInScroller } from '@/lib/highlight';
import { turnIndexForMessage } from '@/lib/turn-grouping';
import type { AdaptedTimelineEntry } from '@/lib/conversation/history-adapter';
import type { Message, SubagentMeta } from '@/lib/api';
import {
  ESTIMATE_DEFAULT_HEIGHT,
  ESTIMATE_META_HEIGHT,
  ESTIMATE_TOOL_HEIGHT,
  SHORT_TEXT_THRESHOLD,
  MEDIUM_TEXT_THRESHOLD,
  SCROLL_SIGNAL_COOLDOWN_MS,
  TURN_FLUSH_DEBOUNCE_MS,
  SCROLL_TO_MSG_DELAY_MS,
  SCROLL_SNAP_DELAY_1_MS,
  SCROLL_SNAP_DELAY_2_MS,
  SCROLL_TICK_MS,
  MAX_RETRY_FRAMES,
  SCROLL_ANCHOR_OFFSET,
} from '@/lib/constants';

interface MessageTimelineProps {
  entries: AdaptedTimelineEntry[];
  scrollToMessageId?: string | null;
  streamingEntry?: StreamingState | null;
}

// ── Minimal adapter for ToolCard / toggleFav backward compat ──

function toMsg(entry: AdaptedTimelineEntry): Message {
  return {
    id: entry.id,
    role:
      entry.kind === 'user'
        ? 'user'
        : entry.kind === 'assistant'
          ? 'assistant'
          : entry.kind === 'tool'
            ? 'tool_use'
            : entry.kind === 'system'
              ? 'system'
              : 'meta',
    text: entry.text ?? undefined,
    toolName: entry.toolName ?? undefined,
    toolInput: (entry.toolInput as Message['toolInput']) ?? undefined,
    toolOutput: entry.toolOutput ?? undefined,
    toolUseId: entry.toolUseId ?? undefined,
    toolStatus: entry.toolStatus ?? undefined,
    timestamp: entry.timestamp ?? undefined,
    model: entry.model ?? undefined,
    images: undefined,
    raw: (entry.raw as Message['raw']) ?? undefined,
    agentHash: undefined,
  };
}

// ── Tool result pairing on timeline entries (for ToolCard backward compat) ──

function pairTimelineToolResults(entries: AdaptedTimelineEntry[]) {
  const resultByToolUseId = new Map<string, Message>();

  for (const entry of entries) {
    if (
      entry.kind === 'tool' &&
      entry.toolUseId &&
      entry.toolOutput != null &&
      entry.toolInput != null
    ) {
      resultByToolUseId.set(entry.toolUseId, {
        id: `${entry.id}-result`,
        role: 'tool_result',
        toolOutput: entry.toolOutput,
        toolUseId: entry.toolUseId,
        toolStatus: entry.toolStatus ?? 'success',
      });
    }
  }

  return resultByToolUseId;
}

// ── Component ──

export function MessageTimeline({
  entries,
  scrollToMessageId,
  streamingEntry,
}: MessageTimelineProps) {
  const {
    id: sessionId,
    messages: allMessages,
    subagents,
    turns,
    setActiveTurnIndex,
    search: { filtered, search, navTarget },
    scrollSignal,
    expanded,
    toggleExpanded,
    favIds,
    toggleFav,
  } = useSession();

  const filteredIdSet = useMemo(() => new Set(filtered.map((m) => m.id)), [filtered]);

  // When a role/search filter is active (filtered != all messages), apply it
  // only to history entries. Live entries are never filtered — they're from the
  // current turn and always belong in the timeline.
  const filterActive = filtered.length < allMessages.length;
  const visibleEntries = useMemo(() => {
    if (!filterActive) return entries;
    return entries.filter((e) => filteredIdSet.has(e.id) || e.isLive);
  }, [entries, filteredIdSet, filterActive]);

  const resultByToolUseId = useMemo(() => pairTimelineToolResults(entries), [entries]);

  const subagentLookup = useMemo(() => {
    if (!subagents?.length) return new Map<string, SubagentMeta>();
    const m = new Map<string, SubagentMeta>();
    for (const sa of subagents) {
      m.set(`${sa.agentType}::${sa.description}`, sa);
      m.set(`hash::${sa.agentHash}`, sa);
      if (!m.has(`type::${sa.agentType}`)) m.set(`type::${sa.agentType}`, sa);
    }
    return m;
  }, [subagents]);

  const parentRef = useRef<HTMLDivElement>(null);

  const getItemKey = useCallback(
    (index: number) => visibleEntries[index]?.id ?? index,
    [visibleEntries],
  );

  const estimateSize = useCallback(
    (index: number) => {
      const e = visibleEntries[index];
      if (!e) return ESTIMATE_DEFAULT_HEIGHT;
      switch (e.kind) {
        case 'system':
          return ESTIMATE_META_HEIGHT;
        case 'tool':
          return ESTIMATE_TOOL_HEIGHT;
        case 'user': {
          const len = e.text?.length ?? 0;
          return len < SHORT_TEXT_THRESHOLD ? 72 : len < MEDIUM_TEXT_THRESHOLD ? 100 : 160;
        }
        case 'assistant': {
          const len = e.text?.length ?? 0;
          return len < SHORT_TEXT_THRESHOLD ? 72 : len < MEDIUM_TEXT_THRESHOLD ? 120 : 200;
        }
        default:
          return ESTIMATE_DEFAULT_HEIGHT;
      }
    },
    [visibleEntries],
  );

  const autoScroll = useAutoScroll(parentRef, {
    isStreaming: !!streamingEntry,
  });

  // Mark new message on entry count change
  const prevEntryCount = useRef(entries.length);
  useEffect(() => {
    if (entries.length > prevEntryCount.current) {
      autoScroll.markNewMessage();
    }
    prevEntryCount.current = entries.length;
  }, [entries.length, autoScroll]);

  const rowVirtualizer = useVirtualizer({
    count: visibleEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 4,
    getItemKey,
  });

  // ── findVisibleIndex ──

  const visibleIdSet = useMemo(() => new Set(visibleEntries.map((e) => e.id)), [visibleEntries]);

  const findVisibleIndex = useCallback(
    (msgId: string): number => {
      let idx = visibleEntries.findIndex((e) => e.id === msgId);
      if (idx >= 0) return idx;
      if (msgId.length >= 36) {
        idx = visibleEntries.findIndex((e) => e.id.startsWith(msgId));
        if (idx >= 0) return idx;
      }
      // Search in all entries for the target, then find nearest visible
      let origIdx = entries.findIndex((e) => e.id === msgId);
      if (origIdx < 0 && msgId.length >= 36) {
        origIdx = entries.findIndex((e) => e.id.startsWith(msgId));
      }
      if (origIdx >= 0) {
        for (let delta = 1; delta < entries.length; delta++) {
          const fwd = origIdx + delta;
          if (fwd < entries.length && visibleIdSet.has(entries[fwd]!.id)) {
            return visibleEntries.findIndex((e) => e.id === entries[fwd]!.id);
          }
          const bwd = origIdx - delta;
          if (bwd >= 0 && visibleIdSet.has(entries[bwd]!.id)) {
            return visibleEntries.findIndex((e) => e.id === entries[bwd]!.id);
          }
        }
      }
      return -1;
    },
    [visibleEntries, entries, visibleIdSet],
  );

  // ── Scroll-driven turn tracking ──

  const visibleToOriginalIndex = useMemo(() => {
    const idToOriginal = new Map<string, number>();
    for (let i = 0; i < allMessages.length; i++) {
      idToOriginal.set(allMessages[i]!.id, i);
    }
    return visibleEntries.map((e) => idToOriginal.get(e.id) ?? 0);
  }, [allMessages, visibleEntries]);

  const scrollTrackRef = useRef<number>(0);
  const isScrollSignalRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isScrollSignalRef.current = true;
    const t = setTimeout(() => {
      isScrollSignalRef.current = false;
    }, SCROLL_SIGNAL_COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [scrollSignal?.nonce]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    let rafId: number | null = null;

    const computeTurn = () => {
      rafId = null;
      if (isScrollSignalRef.current) return;
      if (turns.length === 0 || visibleEntries.length === 0) return;
      const scrollTop = el.scrollTop;
      const items = rowVirtualizer.getVirtualItems();
      if (items.length === 0) return;
      let anchorIndex = items[0]!.index;
      for (const item of items) {
        if (item.start <= scrollTop + SCROLL_ANCHOR_OFFSET) anchorIndex = item.index;
        else break;
      }
      const origIdx = visibleToOriginalIndex[anchorIndex] ?? 0;
      const turnIdx = turnIndexForMessage(turns, origIdx);
      if (turnIdx !== scrollTrackRef.current) {
        scrollTrackRef.current = turnIdx;
        if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          setActiveTurnIndex(turnIdx);
        }, TURN_FLUSH_DEBOUNCE_MS);
      }
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(computeTurn);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
    };
  }, [turns, visibleEntries, visibleToOriginalIndex, rowVirtualizer, setActiveTurnIndex]);

  // ── Scroll-to-message (one-shot) ──

  const scrolledRef = useRef(false);
  useEffect(() => {
    scrolledRef.current = false;
  }, [sessionId, scrollToMessageId]);

  useEffect(() => {
    if (!scrollToMessageId || scrolledRef.current) return;
    const idx = findVisibleIndex(scrollToMessageId);
    if (idx < 0) return;
    const timer = setTimeout(() => {
      rowVirtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
      scrolledRef.current = true;
    }, SCROLL_TO_MSG_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId, visibleEntries]);

  // ── Scroll signal (continuous) ──

  useEffect(() => {
    if (!scrollSignal) return;
    const idx = findVisibleIndex(scrollSignal.messageId);
    if (idx < 0) return;
    const timer = setTimeout(() => {
      rowVirtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
    }, SCROLL_TICK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollSignal?.nonce, scrollSignal?.messageId]);

  // ── Search nav targeting ──

  useEffect(() => {
    if (!navTarget || !parentRef.current) return;
    const { msgIdx, localIdx } = navTarget;
    const total = visibleEntries.length;
    const isNearEnd = msgIdx >= total - 3;
    const align: 'start' | 'center' | 'end' = msgIdx <= 2 ? 'start' : isNearEnd ? 'end' : 'center';
    rowVirtualizer.scrollToIndex(msgIdx, { align, behavior: 'smooth' });

    if (isNearEnd && parentRef.current) {
      const el = parentRef.current;
      let cancelledScrollPatch = false;
      const snapToBottom = () => {
        if (cancelledScrollPatch) return;
        el.scrollTop = el.scrollHeight;
      };
      const t1 = setTimeout(snapToBottom, SCROLL_SNAP_DELAY_1_MS);
      const t2 = setTimeout(snapToBottom, SCROLL_SNAP_DELAY_2_MS);
      (parentRef.current as any).__spClearTailPatch = () => {
        cancelledScrollPatch = true;
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else if (parentRef.current) {
      (parentRef.current as any).__spClearTailPatch?.();
    }

    let cancelled = false;
    let attempts = 0;
    const apply = () => {
      if (cancelled || !parentRef.current) return;
      parentRef.current
        .querySelectorAll<HTMLElement>('mark.search-mark-active')
        .forEach((el) => el.classList.remove('search-mark-active'));
      const row = parentRef.current.querySelector<HTMLElement>(`[data-index="${msgIdx}"]`);
      if (!row) {
        if (attempts++ < MAX_RETRY_FRAMES) requestAnimationFrame(apply);
        return;
      }
      const marks = row.querySelectorAll<HTMLElement>('mark.search-mark');
      if (marks.length <= localIdx) {
        if (attempts++ < MAX_RETRY_FRAMES) requestAnimationFrame(apply);
        return;
      }
      const target = marks[localIdx]!;
      target.classList.add('search-mark-active');
      centerMarkInScroller(target);
    };
    const timer = setTimeout(() => requestAnimationFrame(apply), SCROLL_TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTarget?.msgIdx, navTarget?.localIdx, navTarget?.nonce]);

  // ── Render ──

  if (visibleEntries.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground text-center">没有匹配的消息</div>;
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto px-4 py-3">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const entry = visibleEntries[vi.index]!;
          const favMsg = toMsg(entry);

          return (
            <div
              key={entry.id}
              data-index={vi.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
              }}
              className="pb-3"
            >
              {entry.kind === 'user' ? (
                <UserMessage
                  entry={entry}
                  expanded={expanded.has(entry.id)}
                  onToggle={() => toggleExpanded(entry.id)}
                  highlight={search}
                  favorited={favIds.has(entry.id)}
                  onToggleFav={() => toggleFav(favMsg)}
                />
              ) : entry.kind === 'assistant' ? (
                <AssistantMessage
                  entry={entry}
                  expanded={expanded.has(entry.id)}
                  onToggle={() => toggleExpanded(entry.id)}
                  highlight={search}
                  favorited={favIds.has(entry.id)}
                  onToggleFav={() => toggleFav(favMsg)}
                />
              ) : entry.kind === 'tool' ? (
                <ToolCard
                  tool={favMsg}
                  result={entry.toolUseId ? resultByToolUseId.get(entry.toolUseId) : undefined}
                  favorited={favIds.has(entry.id)}
                  onToggleFav={() => toggleFav(favMsg)}
                  subagentMeta={
                    entry.toolName && canonicalTool(entry.toolName) === 'Task'
                      ? (subagentLookup.get(
                          `${(entry.toolInput as Record<string, unknown>)?.subagent_type ?? (entry.toolInput as Record<string, unknown>)?.subagentType ?? ''}::${(entry.toolInput as Record<string, unknown>)?.description ?? ''}`,
                        ) ??
                        (() => {
                          const out = entry.toolOutput ?? '';
                          const nm = out.match(/^name:\s*(.+)/m);
                          return nm ? subagentLookup.get(`type::${nm[1].trim()}`) : undefined;
                        })())
                      : undefined
                  }
                  sessionId={sessionId}
                />
              ) : entry.kind === 'system' ? (
                <SystemNotice entry={entry} />
              ) : (
                <div className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap bg-background rounded p-2 border border-border">
                  {JSON.stringify(entry.raw ?? entry, null, 2)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {autoScroll.unseenCount > 0 && (
        <div className="sticky bottom-2 flex justify-center z-10">
          <button
            onClick={() => autoScroll.scrollToBottom()}
            className="px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-xs shadow-lg hover:bg-accent/90 transition-all"
          >
            ↓ {autoScroll.unseenCount} 条新消息
          </button>
        </div>
      )}
      {streamingEntry && (
        <div className="mt-2">
          <StreamingBlock streaming={streamingEntry} />
        </div>
      )}
    </div>
  );
}
