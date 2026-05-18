import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSession } from "./SessionContext";
import { MessageBlock } from "./MessageBlock";
import { MetaBlock, ThinkingBlock } from "./MetaBlock";
import { ToolCard } from "../tool-cards/ToolCard";
import { canonicalTool } from "@/lib/tool-aliases";
import { centerMarkInScroller } from "@/lib/highlight";
import { turnIndexForMessage } from "@/lib/turn-grouping";
import type { Message, SubagentMeta } from "@/lib/api";
import { pairToolResults } from "@/lib/tool-result-pairing";
import type { NavTarget } from "@/lib/use-session-search";
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
} from "@/lib/constants";

interface Props {
  scrollToMessageId?: string | null;
}

export function MessageStream({ scrollToMessageId }: Props) {
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

  const { resultByToolUseId, hiddenIds } = useMemo(
    () => pairToolResults(filtered),
    [filtered],
  );

  const visibleMessages = useMemo(() => {
    if (hiddenIds.size === 0) return filtered;
    return filtered.filter((m) => !hiddenIds.has(m.id));
  }, [filtered, hiddenIds]);

  const parentRef = useRef<HTMLDivElement>(null);

  // Stable key per item so the virtualizer can track items across
  // filter changes and reuse cached measurements for items that
  // survived the filter.
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
        case "meta":
          return ESTIMATE_META_HEIGHT;
        case "tool_use":
          return ESTIMATE_TOOL_HEIGHT;
        case "tool_result":
          return ESTIMATE_TOOL_HEIGHT;
        case "user": {
          const len = m.text?.length ?? 0;
          const base = len < SHORT_TEXT_THRESHOLD ? 72 : len < MEDIUM_TEXT_THRESHOLD ? 100 : 160;
          return base + imageExtra;
        }
        case "assistant": {
          if (m.text === "(thinking)") return ESTIMATE_META_HEIGHT;
          const len = m.text?.length ?? 0;
          const base = len < SHORT_TEXT_THRESHOLD ? 72 : len < MEDIUM_TEXT_THRESHOLD ? 120 : 200;
          return base + imageExtra;
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

  // NOTE: do NOT call rowVirtualizer.measure() on filter changes.
  // measure() wipes itemSizeCache, forcing every off-screen item back to
  // the 200px estimate and creating huge gaps. The virtualizer already
  // detects count/getItemKey changes via its internal memos and rebuilds
  // measurements while preserving cached sizes for items that survive
  // the filter.

  // Bug 2 fix: find the best visible index for a message id. If the
  // exact id is not in the visible list (e.g. user messages filtered
  // out), scan the original allMessages forward from that id's position
  // to find the nearest message that IS visible.
  const visibleIdSet = useMemo(
    () => new Set(visibleMessages.map((m) => m.id)),
    [visibleMessages],
  );

  const findVisibleIndex = useCallback(
    (msgId: string): number => {
      // Direct hit
      let idx = visibleMessages.findIndex((m) => m.id === msgId);
      if (idx >= 0) return idx;

      // Prefix match: search returns raw UUID but session loader appends
      // "-{lineIndex}" suffix. Match messages whose id starts with the
      // search messageId (e.g. "abc-123" matches "abc-123-5").
      if (msgId.length >= 36) {
        idx = visibleMessages.findIndex((m) => m.id.startsWith(msgId));
        if (idx >= 0) return idx;
      }

      // Hidden tool_result → resolve to parent tool_use
      if (hiddenIds.has(msgId)) {
        const result = filtered.find((m) => m.id === msgId);
        if (result?.toolUseId) {
          const parent = filtered.find(
            (m) => m.role === "tool_use" && m.toolUseId === result.toolUseId,
          );
          if (parent) {
            idx = visibleMessages.findIndex((m) => m.id === parent.id);
            if (idx >= 0) return idx;
          }
        }
      }

      // Fallback: the target message itself is not visible (filtered out).
      // Find its position in allMessages, then scan forward/backward to
      // find the nearest message that IS in the visible list.
      let origIdx = allMessages.findIndex((m) => m.id === msgId);
      if (origIdx < 0 && msgId.length >= 36) {
        origIdx = allMessages.findIndex((m) => m.id.startsWith(msgId));
      }
      if (origIdx >= 0) {
        for (let delta = 1; delta < allMessages.length; delta++) {
          const fwd = origIdx + delta;
          if (fwd < allMessages.length && visibleIdSet.has(allMessages[fwd]!.id)) {
            return visibleMessages.findIndex((m) => m.id === allMessages[fwd]!.id);
          }
          const bwd = origIdx - delta;
          if (bwd >= 0 && visibleIdSet.has(allMessages[bwd]!.id)) {
            return visibleMessages.findIndex((m) => m.id === allMessages[bwd]!.id);
          }
        }
      }

      return -1;
    },
    [visibleMessages, hiddenIds, filtered, allMessages, visibleIdSet],
  );

  // Map each visible message back to its index in the original allMessages
  // array, so we can feed turnIndexForMessage() during scroll tracking.
  const visibleToOriginalIndex = useMemo(() => {
    const idToOriginal = new Map<string, number>();
    for (let i = 0; i < allMessages.length; i++) {
      idToOriginal.set(allMessages[i]!.id, i);
    }
    return visibleMessages.map((m) => idToOriginal.get(m.id) ?? 0);
  }, [allMessages, visibleMessages]);

  // Scroll-driven turn tracking. We compute the turn index on every
  // scroll frame in a ref (zero re-renders), then flush to React state
  // only after scrolling stops (idle 150ms). This eliminates the flicker
  // caused by re-rendering the entire Context tree every frame.
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
        if (item.start <= scrollTop + SCROLL_ANCHOR_OFFSET) {
          anchorIndex = item.index;
        } else {
          break;
        }
      }

      const origIdx = visibleToOriginalIndex[anchorIndex] ?? 0;
      const turnIdx = turnIndexForMessage(turns, origIdx);

      if (turnIdx !== scrollTrackRef.current) {
        scrollTrackRef.current = turnIdx;

        // Debounce the React state update: clear any pending flush and
        // schedule a new one. Only fires after scrolling pauses 150ms.
        if (flushTimerRef.current !== null) {
          clearTimeout(flushTimerRef.current);
        }
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

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
    };
  }, [turns, visibleMessages, visibleToOriginalIndex, rowVirtualizer, setActiveTurnIndex]);

  // One-shot scroll to message (favorites jump)
  const scrolledRef = useRef(false);
  useEffect(() => {
    scrolledRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (!scrollToMessageId || scrolledRef.current) return;
    const idx = findVisibleIndex(scrollToMessageId);
    if (idx < 0) return;
    const timer = setTimeout(() => {
      rowVirtualizer.scrollToIndex(idx, {
        align: "start",
        behavior: "smooth",
      });
      scrolledRef.current = true;
    }, SCROLL_TO_MSG_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId, visibleMessages]);

  // Continuous scroll signal (TurnSidebar clicks, RightSidebar clicks)
  useEffect(() => {
    if (!scrollSignal) return;
    const idx = findVisibleIndex(scrollSignal.messageId);
    if (idx < 0) return;
    const timer = setTimeout(() => {
      rowVirtualizer.scrollToIndex(idx, {
        align: "start",
        behavior: "smooth",
      });
    }, SCROLL_TICK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollSignal?.nonce, scrollSignal?.messageId]);

  // Search nav target: scroll + highlight active mark
  useEffect(() => {
    if (!navTarget || !parentRef.current) return;
    const { msgIdx, localIdx } = navTarget;
    const total = visibleMessages.length;
    const isNearEnd = msgIdx >= total - 3;
    const align: "start" | "center" | "end" =
      msgIdx <= 2 ? "start" : isNearEnd ? "end" : "center";
    rowVirtualizer.scrollToIndex(msgIdx, { align, behavior: "smooth" });

    if (isNearEnd && parentRef.current) {
      const el = parentRef.current;
      let cancelledScrollPatch = false;
      const snapToBottom = () => {
        if (cancelledScrollPatch) return;
        el.scrollTop = el.scrollHeight;
      };
      const t1 = setTimeout(snapToBottom, SCROLL_SNAP_DELAY_1_MS);
      const t2 = setTimeout(snapToBottom, SCROLL_SNAP_DELAY_2_MS);
      (
        parentRef.current as HTMLElement & {
          __spClearTailPatch?: () => void;
        }
      ).__spClearTailPatch = () => {
        cancelledScrollPatch = true;
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else if (parentRef.current) {
      const fn = (
        parentRef.current as HTMLElement & {
          __spClearTailPatch?: () => void;
        }
      ).__spClearTailPatch;
      if (fn) fn();
    }

    let cancelled = false;
    let attempts = 0;
    const apply = () => {
      if (cancelled || !parentRef.current) return;
      parentRef.current
        .querySelectorAll<HTMLElement>("mark.search-mark-active")
        .forEach((el) => el.classList.remove("search-mark-active"));
      const row = parentRef.current.querySelector<HTMLElement>(
        `[data-index="${msgIdx}"]`,
      );
      if (!row) {
        if (attempts++ < MAX_RETRY_FRAMES) requestAnimationFrame(apply);
        return;
      }
      const marks = row.querySelectorAll<HTMLElement>("mark.search-mark");
      if (marks.length <= localIdx) {
        if (attempts++ < MAX_RETRY_FRAMES) requestAnimationFrame(apply);
        return;
      }
      const target = marks[localIdx]!;
      target.classList.add("search-mark-active");
      centerMarkInScroller(target);
    };
    const timer = setTimeout(() => requestAnimationFrame(apply), SCROLL_TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTarget?.msgIdx, navTarget?.localIdx, navTarget?.nonce]);

  if (visibleMessages.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground text-center">
        没有匹配的消息
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto px-4 py-3">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const m = visibleMessages[vi.index]!;
          const pairedResult =
            m.role === "tool_use" && m.toolUseId
              ? resultByToolUseId.get(m.toolUseId)
              : undefined;
          return (
            <div
              key={m.id}
              data-index={vi.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
              }}
              className="pb-3"
            >
              {m.role === "meta" ? (
                <MetaBlock m={m} />
              ) : m.role === "assistant" && m.text === "(thinking)" ? (
                <ThinkingBlock m={m} />
              ) : m.role === "tool_use" ? (
                <ToolCard
                  tool={m}
                  result={pairedResult}
                  favorited={favIds.has(m.id)}
                  onToggleFav={() => toggleFav(m)}
                  subagentMeta={
                    canonicalTool(m.toolName) === "Task"
                      ? (pairedResult?.agentHash
                            ? subagentLookup.get(`hash::${pairedResult.agentHash}`)
                            : undefined) ??
                        subagentLookup.get(
                          `${(m.toolInput as Record<string, unknown>)?.subagent_type ?? (m.toolInput as Record<string, unknown>)?.subagentType ?? ""}::${(m.toolInput as Record<string, unknown>)?.description ?? ""}`,
                        ) ??
                        (() => {
                          const out = pairedResult?.toolOutput ?? "";
                          const nm = out.match(/^name:\s*(.+)/m);
                          return nm ? subagentLookup.get(`type::${nm[1].trim()}`) : undefined;
                        })()
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
