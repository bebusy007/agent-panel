import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSession } from '@/components/session/SessionContext';
import { MessageBlock } from '@/components/session/MessageBlock';
import { MetaBlock, ThinkingBlock } from '@/components/session/MetaBlock';
import { ToolCard } from '@/components/tool-cards/ToolCard';
import { canonicalTool } from '@/lib/tool-aliases';
import { centerMarkInScroller } from '@/lib/highlight';
import { turnIndexForMessage } from '@/lib/turn-grouping';
import type { AdaptedTimelineEntry } from '@/lib/conversation/history-adapter';
import type { Message, SubagentMeta } from '@/lib/api';
import {
  ESTIMATE_DEFAULT_HEIGHT,
  ESTIMATE_META_HEIGHT,
  ESTIMATE_TOOL_HEIGHT,
  IMAGE_STRIP_EXTRA_HEIGHT,
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
}

// ── Adapter: convert AdaptedTimelineEntry → Message for legacy components ──

/** Minimal Message shape accepted by MessageBlock / ToolCard. */
type MessageLike = Message;

function entryToMessage(entry: AdaptedTimelineEntry): MessageLike {
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

// ── Tool result pairing on timeline entries ──

function pairTimelineToolResults(entries: AdaptedTimelineEntry[]): Map<string, MessageLike> {
  const resultByToolUseId = new Map<string, MessageLike>();

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

export function MessageTimeline({ entries, scrollToMessageId }: MessageTimelineProps) {
  const {
    id: sessionId,
    messages: allMessages,
    subagents,
    turns,
    setActiveTurnIndex,
    search: { filtered, search, searchActive, navTarget },
    scrollSignal,
    expanded,
    toggleExpanded,
    favIds,
    toggleFav,
  } = useSession();

  // Map filtered messages (from search/role filter) → entry ID set
  const filteredIdSet = useMemo(() => new Set(filtered.map((m) => m.id)), [filtered]);

  // Convert all timeline entries → Message-like for legacy rendering
  const entryMessages = useMemo(() => entries.map(entryToMessage), [entries]);

  const resultByToolUseId = useMemo(() => pairTimelineToolResults(entries), [entries]);

  const visibleMessages = useMemo(() => {
    let msgs = entryMessages;
    if (filteredIdSet.size < entryMessages.length)
      msgs = msgs.filter((m) => filteredIdSet.has(m.id));
    return msgs;
  }, [entryMessages, filteredIdSet]);

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
    (index: number) => visibleMessages[index]?.id ?? index,
    [visibleMessages],
  );

  const estimateSize = useCallback(
    (index: number) => {
      const m = visibleMessages[index];
      if (!m) return ESTIMATE_DEFAULT_HEIGHT;
      const imageExtra = (m.images?.length ?? 0) > 0 ? IMAGE_STRIP_EXTRA_HEIGHT : 0;
      switch (m.role) {
        case 'meta':
          return ESTIMATE_META_HEIGHT;
        case 'tool_use':
          return ESTIMATE_TOOL_HEIGHT;
        case 'tool_result':
          return ESTIMATE_TOOL_HEIGHT;
        case 'user': {
          const len = m.text?.length ?? 0;
          return (
            (len < SHORT_TEXT_THRESHOLD ? 72 : len < MEDIUM_TEXT_THRESHOLD ? 100 : 160) + imageExtra
          );
        }
        case 'assistant': {
          if (m.text === '(thinking)') return ESTIMATE_META_HEIGHT;
          const len = m.text?.length ?? 0;
          return (
            (len < SHORT_TEXT_THRESHOLD ? 72 : len < MEDIUM_TEXT_THRESHOLD ? 120 : 200) + imageExtra
          );
        }
        default:
          return ESTIMATE_DEFAULT_HEIGHT + imageExtra;
      }
    },
    [visibleMessages],
  );

  const rowVirtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 4,
    getItemKey,
  });

  // ── findVisibleIndex ──

  const visibleIdSet = useMemo(() => new Set(visibleMessages.map((m) => m.id)), [visibleMessages]);

  const findVisibleIndex = useCallback(
    (msgId: string): number => {
      let idx = visibleMessages.findIndex((m) => m.id === msgId);
      if (idx >= 0) return idx;
      if (msgId.length >= 36) {
        idx = visibleMessages.findIndex((m) => m.id.startsWith(msgId));
        if (idx >= 0) return idx;
      }
      // Search in all entry messages for the target, then find nearest visible
      let origIdx = entryMessages.findIndex((m) => m.id === msgId);
      if (origIdx < 0 && msgId.length >= 36) {
        origIdx = entryMessages.findIndex((m) => m.id.startsWith(msgId));
      }
      if (origIdx >= 0) {
        for (let delta = 1; delta < entryMessages.length; delta++) {
          const fwd = origIdx + delta;
          if (fwd < entryMessages.length && visibleIdSet.has(entryMessages[fwd]!.id)) {
            return visibleMessages.findIndex((m) => m.id === entryMessages[fwd]!.id);
          }
          const bwd = origIdx - delta;
          if (bwd >= 0 && visibleIdSet.has(entryMessages[bwd]!.id)) {
            return visibleMessages.findIndex((m) => m.id === entryMessages[bwd]!.id);
          }
        }
      }
      return -1;
    },
    [visibleMessages, entryMessages, visibleIdSet],
  );

  // ── Scroll-driven turn tracking ──

  const visibleToOriginalIndex = useMemo(() => {
    const idToOriginal = new Map<string, number>();
    for (let i = 0; i < allMessages.length; i++) {
      idToOriginal.set(allMessages[i]!.id, i);
    }
    return visibleMessages.map((m) => idToOriginal.get(m.id) ?? 0);
  }, [allMessages, visibleMessages]);

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
      if (turns.length === 0 || visibleMessages.length === 0) return;
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
  }, [turns, visibleMessages, visibleToOriginalIndex, rowVirtualizer, setActiveTurnIndex]);

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
  }, [scrollToMessageId, visibleMessages]);

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
    const total = visibleMessages.length;
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

  if (visibleMessages.length === 0) {
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
          const m = visibleMessages[vi.index]!;
          const pairedResult =
            m.role === 'tool_use' && m.toolUseId ? resultByToolUseId.get(m.toolUseId) : undefined;
          return (
            <div
              key={m.id}
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
              {m.role === 'meta' ? (
                <MetaBlock m={m} />
              ) : m.role === 'assistant' && m.text === '(thinking)' ? (
                <ThinkingBlock m={m} />
              ) : m.role === 'tool_use' ? (
                <ToolCard
                  tool={m}
                  result={pairedResult}
                  favorited={favIds.has(m.id)}
                  onToggleFav={() => toggleFav(m)}
                  subagentMeta={
                    canonicalTool(m.toolName) === 'Task'
                      ? ((pairedResult?.agentHash
                          ? subagentLookup.get(`hash::${pairedResult.agentHash}`)
                          : undefined) ??
                        subagentLookup.get(
                          `${(m.toolInput as Record<string, unknown>)?.subagent_type ?? (m.toolInput as Record<string, unknown>)?.subagentType ?? ''}::${(m.toolInput as Record<string, unknown>)?.description ?? ''}`,
                        ) ??
                        (() => {
                          const out = pairedResult?.toolOutput ?? '';
                          const nm = out.match(/^name:\s*(.+)/m);
                          return nm ? subagentLookup.get(`type::${nm[1].trim()}`) : undefined;
                        })())
                      : undefined
                  }
                  sessionId={sessionId}
                />
              ) : (
                <MessageBlock
                  m={m}
                  sessionId={sessionId}
                  expanded={expanded.has(m.id)}
                  searchActive={searchActive}
                  onToggle={() => toggleExpanded(m.id)}
                  highlight={search}
                  favorited={favIds.has(m.id)}
                  onToggleFav={() => toggleFav(m)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
