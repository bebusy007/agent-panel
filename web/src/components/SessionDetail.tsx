import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Copy,
  Check,
  Search as SearchIcon,
  Download,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Trash2,
  X,
  Star,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  cn,
  copyToClipboard,
  describeSessionSource,
  formatRelative,
  roleColor,
  roleLabel,
  sourceColor,
} from '@/lib/utils';
import { highlightJsx, highlightDom, centerMarkInScroller } from '@/lib/highlight';
import {
  ESTIMATE_DETAIL_ROW_HEIGHT,
  SCROLL_TO_MSG_DELAY_MS,
  SCROLL_SNAP_DELAY_1_MS,
  SCROLL_SNAP_DELAY_2_MS,
  SCROLL_TICK_MS,
  MAX_RETRY_FRAMES,
  COPY_FEEDBACK_MS,
  LONG_MESSAGE_LINE_THRESHOLD,
  LONG_MESSAGE_CHAR_THRESHOLD,
  TOOL_INPUT_PREVIEW_LEN,
} from '@/lib/constants';
import { ResumeMenu } from './ResumeMenu';
import { ToolCard } from './tool-cards/ToolCard';
import { emitAppEvent } from '@/lib/events';
import type { Message, MessageRole, SessionFull, SubagentMeta } from '@/lib/api';
import { canonicalTool } from '@/lib/tool-aliases';
import { pairToolResults } from '@/lib/tool-result-pairing';
import { useSession } from './session/SessionContext';
import { MessageToolbar } from './session/MessageToolbar';
import { MessageTimeline } from './conversation/MessageTimeline';
import { ConnectBar } from './conversation/ConnectBar';
import { messagesToTimeline } from '@/lib/conversation/history-adapter';
import { useChatConnection } from '@/lib/conversation/use-chat-connection';
import { useMergedTimeline } from '@/lib/conversation/use-merged-timeline';

/**
 * SessionDetail — when used inside a SessionProvider (the normal case in
 * SessionDetailView), it acts as a thin shell composing MessageToolbar +
 * MessageStream. When used standalone (legacy), it falls back to the old
 * self-contained behaviour.
 *
 * The `hideHeader` prop controls whether the legacy header is shown.
 * In the new SessionDetailView flow, `hideHeader` is always true and the
 * page-level header lives in SessionDetailView itself.
 */
export function SessionDetail({
  id,
  onTrash,
  scrollToMessageId,
  scrollSignal: _legacyScrollSignal,
  hideHeader,
  onMessagesLoaded,
}: {
  id: string;
  onTrash?: () => void;
  scrollToMessageId?: string | null;
  scrollSignal?: { messageId: string; nonce: number } | null;
  hideHeader?: boolean;
  onMessagesLoaded?: (messages: Message[]) => void;
}) {
  // When wrapped in SessionProvider (the normal path), delegate to the
  // context-driven components. We detect this by trying the context hook
  // with a fallback.
  return hideHeader ? (
    <ContextDrivenDetail
      scrollToMessageId={scrollToMessageId}
      onMessagesLoaded={onMessagesLoaded}
    />
  ) : (
    <LegacySessionDetail
      id={id}
      onTrash={onTrash}
      scrollToMessageId={scrollToMessageId}
      onMessagesLoaded={onMessagesLoaded}
    />
  );
}

function ContextDrivenDetail({
  scrollToMessageId,
  onMessagesLoaded,
}: {
  scrollToMessageId?: string | null;
  onMessagesLoaded?: (messages: Message[]) => void;
}) {
  const { id: sessionId, messages, loading, error, refetch } = useSession();
  const chat = useChatConnection();
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const prevPhaseRef = useRef(chat.state.phase);

  // Refetch session data after TurnComplete (running → idle)
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = chat.state.phase;
    if (prev === 'running' && chat.state.phase === 'idle') {
      const timer = setTimeout(() => refetch(), 500);
      return () => clearTimeout(timer);
    }
  }, [chat.state.phase, refetch]);

  const historyEntries = useMemo(() => messagesToTimeline(messages), [messages]);
  const { entries: timelineEntries, streamingEntry } = useMergedTimeline(
    historyEntries,
    chat.state,
  );

  useEffect(() => {
    if (messages.length > 0) {
      onMessagesLoaded?.(messages);
    }
  }, [messages, onMessagesLoaded]);

  // Auto-connect when chat sessionId differs from page sessionId
  // (e.g. after navigating from /sessions/new → real session_id)
  useEffect(() => {
    if (
      chat.state.phase === 'idle' &&
      chat.state.sessionId &&
      chat.state.sessionId !== sessionIdRef.current
    ) {
      window.history.replaceState(null, '', `/sessions/${chat.state.sessionId}`);
      sessionIdRef.current = chat.state.sessionId;
    }
  }, [chat.state.sessionId, chat.state.phase]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="p-6 text-sm text-red-300">加载失败：{error.message}</div>;

  return (
    <div className="flex flex-col h-full">
      <MessageToolbar />
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageTimeline
          entries={timelineEntries}
          scrollToMessageId={scrollToMessageId}
          streamingEntry={streamingEntry}
        />
      </div>
      <ConnectBar
        phase={chat.state.phase}
        error={chat.state.error}
        canInput={chat.state.phase !== 'connecting'}
        onConnect={() => chat.connect(sessionId)}
        onDisconnect={() => chat.disconnect()}
        onCancelConnect={() => chat.disconnect()}
        onRetry={() => chat.connect(sessionId)}
        onSend={(text) => chat.sendMessage(text)}
        onStop={() => chat.interrupt()}
      />
    </div>
  );
}

// ─── Legacy self-contained mode (used when NOT inside SessionProvider) ───

type FilterRole = MessageRole | 'subagent';
const ALL_FILTERS: FilterRole[] = [
  'user',
  'assistant',
  'tool_use',
  'subagent',
  'tool_result',
  'system',
];

function filterLabel(r: FilterRole): string {
  if (r === 'subagent') return 'Subagent';
  return roleLabel(r);
}

function messageBodyText(m: Message): string {
  switch (m.role) {
    case 'assistant':
      return m.text || '';
    case 'tool_use':
      return m.toolInput != null
        ? typeof m.toolInput === 'string'
          ? m.toolInput
          : JSON.stringify(m.toolInput, null, 2)
        : '';
    case 'tool_result':
      return m.toolOutput || m.text || '';
    default:
      return m.text || '';
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let from = 0;
  while (from < h.length) {
    const idx = h.indexOf(n, from);
    if (idx < 0) break;
    count++;
    from = idx + n.length;
  }
  return count;
}

function LegacySessionDetail({
  id,
  onTrash,
  scrollToMessageId,
  onMessagesLoaded,
}: {
  id: string;
  onTrash?: () => void;
  scrollToMessageId?: string | null;
  onMessagesLoaded?: (messages: Message[]) => void;
}) {
  const [data, setData] = useState<SessionFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Set<FilterRole>>(new Set(ALL_FILTERS));
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [searchNavNonce, setSearchNavNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .sessionDetail(id)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        onMessagesLoaded?.(d.messages);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => !cancelled && setLoading(false));
    api
      .favoritesForSession(id)
      .then((r) => {
        if (!cancelled) setFavIds(new Set(r.favorites.map((f) => f.messageId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleFav = async (m: Message) => {
    if (!data) return;
    const isFav = favIds.has(m.id);
    if (isFav) {
      await api.favoritesRemoveByMessage(id, m.id);
      setFavIds((s) => {
        const next = new Set(s);
        next.delete(m.id);
        return next;
      });
    } else {
      await api.favoritesAdd({ sessionId: id, messageId: m.id });
      setFavIds((s) => new Set(s).add(m.id));
    }
    emitAppEvent('favorites:changed');
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    let arr = data.messages;
    if (selectedRoles.size < ALL_FILTERS.length) {
      arr = arr.filter((m) => {
        const isSubagent = m.role === 'tool_use' && canonicalTool(m.toolName) === 'Task';
        if (isSubagent) return selectedRoles.has('subagent');
        if (m.role === 'tool_result' && m.toolUseId) {
          const parent = data.messages.find(
            (p) => p.role === 'tool_use' && p.toolUseId === m.toolUseId,
          );
          if (parent && canonicalTool(parent.toolName) === 'Task')
            return selectedRoles.has('subagent');
        }
        return selectedRoles.has(m.role);
      });
    }
    if (search.trim().length >= 2) {
      const q = search.toLowerCase();
      arr = arr.filter((m) => {
        if (m.text?.toLowerCase().includes(q)) return true;
        if (m.toolName?.toLowerCase().includes(q)) return true;
        if (m.toolOutput?.toLowerCase().includes(q)) return true;
        if (typeof m.toolInput === 'string' && m.toolInput.toLowerCase().includes(q)) return true;
        if (m.toolInput && typeof m.toolInput !== 'string') {
          try {
            if (JSON.stringify(m.toolInput).toLowerCase().includes(q)) return true;
          } catch {}
        }
        return false;
      });
    }
    return arr;
  }, [data, selectedRoles, search]);

  const { messageCounts, cumOffsets, searchMatchTotal } = useMemo(() => {
    const q = search.trim();
    if (q.length < 2)
      return { messageCounts: [] as number[], cumOffsets: [0], searchMatchTotal: 0 };
    const counts = filtered.map((m) => countOccurrences(messageBodyText(m), q));
    const offsets: number[] = [0];
    for (let i = 0; i < counts.length; i++) offsets.push(offsets[i]! + counts[i]!);
    return {
      messageCounts: counts,
      cumOffsets: offsets,
      searchMatchTotal: offsets[offsets.length - 1]!,
    };
  }, [filtered, search]);

  useEffect(() => {
    setSearchActiveIndex(searchMatchTotal > 0 ? 0 : -1);
    setSearchNavNonce((n) => n + 1);
  }, [search, searchMatchTotal]);

  const navigateSearch = useCallback(
    (direction: 'next' | 'prev') => {
      if (searchMatchTotal <= 0) return;
      setSearchActiveIndex((cur) => {
        if (cur < 0) return 0;
        if (direction === 'next') return cur + 1 >= searchMatchTotal ? 0 : cur + 1;
        return cur - 1 < 0 ? searchMatchTotal - 1 : cur - 1;
      });
      setSearchNavNonce((n) => n + 1);
    },
    [searchMatchTotal],
  );

  const navTarget = useMemo(() => {
    if (searchActiveIndex < 0 || cumOffsets.length < 2) return null;
    for (let i = 0; i < messageCounts.length; i++) {
      if (searchActiveIndex >= cumOffsets[i]! && searchActiveIndex < cumOffsets[i + 1]!) {
        return { msgIdx: i, localIdx: searchActiveIndex - cumOffsets[i]!, nonce: searchNavNonce };
      }
    }
    return null;
  }, [searchActiveIndex, cumOffsets, messageCounts, searchNavNonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => {
          document.getElementById('session-detail-search')?.focus();
        }, 0);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const toggleRole = (r: FilterRole) =>
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) {
        if (next.size === 1) return prev;
        next.delete(r);
      } else {
        next.add(r);
      }
      return next;
    });

  if (loading) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  if (error) return <div className="p-6 text-sm text-red-300">加载失败：{error.message}</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">未找到</div>;

  const summary = data.session;
  const searchActive = !!search.trim();

  return (
    <div className="flex flex-col h-full">
      <header className="px-5 pt-3 pb-3 border-b border-border space-y-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset font-medium',
              sourceColor(summary.source),
            )}
          >
            {describeSessionSource(summary.source)}
          </span>
          {summary.model && (
            <span className="text-[11px] font-mono text-muted-foreground">{summary.model}</span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {formatRelative(summary.lastActivity)}
          </span>
        </div>
        {summary.cwd && (
          <div className="flex items-center gap-2 text-xs">
            <code className="font-mono text-muted-foreground bg-background px-2 py-1 rounded border border-border break-all flex-1">
              {summary.cwd?.replace(/^\/Users\/[^\/]+/, '~') || summary.cwd}
            </code>
            <CopyButton text={summary.cwd} />
            {summary.gitBranch && (
              <span className="font-mono text-[11px] text-muted-foreground">
                @ {summary.gitBranch}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <ResumeMenu session={summary} />
          <a
            href={api.sessionExportUrl(summary.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-fg hover:border-border transition-colors"
          >
            <Download className="size-3" /> 导出 .md
          </a>
          {onTrash && (
            <button
              onClick={onTrash}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="size-3" /> 移到回收站
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">
            显示
          </span>
          {ALL_FILTERS.map((r) => {
            const on = selectedRoles.has(r);
            return (
              <button
                key={r}
                onClick={() => toggleRole(r)}
                className={cn(
                  'text-[11px] rounded-full px-2 py-0.5 border transition-colors',
                  r === 'subagent'
                    ? on
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                      : 'border-border bg-card text-muted-foreground hover:border-cyan-500/30'
                    : on
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-border bg-card text-muted-foreground hover:border-border',
                )}
              >
                {filterLabel(r)}
              </button>
            );
          })}
          <button
            onClick={() => setSearchOpen((o) => !o)}
            className={cn(
              'ml-auto inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-0.5 border transition-colors',
              searchOpen
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border text-muted-foreground hover:border-border',
            )}
            title="在此对话内搜索 (Cmd+F)"
          >
            <SearchIcon className="size-3" /> 内搜
          </button>
        </div>
        {searchOpen && (
          <div className="flex items-center gap-2">
            <input
              id="session-detail-search"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  navigateSearch(e.shiftKey ? 'prev' : 'next');
                }
              }}
              placeholder="搜索当前对话消息内容（≥2字符）"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-border"
            />
            {searchActive && searchMatchTotal > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {searchActiveIndex >= 0 ? searchActiveIndex + 1 : 0}/{searchMatchTotal}
              </span>
            )}
            {searchActive && searchMatchTotal === 0 && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">无匹配</span>
            )}
            <button
              onClick={() => navigateSearch('prev')}
              disabled={searchMatchTotal === 0}
              className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="上一个 (Shift+Enter)"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              onClick={() => navigateSearch('next')}
              disabled={searchMatchTotal === 0}
              className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="下一个 (Enter)"
            >
              <ChevronDown className="size-4" />
            </button>
            <button
              onClick={() => {
                setSearch('');
                setSearchOpen(false);
              }}
              className="text-muted-foreground hover:text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">
          共 {data.messageCount} 条消息，当前显示 {filtered.length} 条
          {searchActive && searchMatchTotal > 0 && (
            <>
              {' '}
              ，命中 <span className="text-muted-foreground">{searchMatchTotal}</span> 处
            </>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">没有匹配的消息</div>
        ) : (
          <LegacyVirtualizedMessages
            messages={filtered}
            expanded={expanded}
            onToggle={(msgId) =>
              setExpanded((s) => {
                const next = new Set(s);
                next.has(msgId) ? next.delete(msgId) : next.add(msgId);
                return next;
              })
            }
            highlight={search}
            searchActive={searchActive}
            favIds={favIds}
            onToggleFav={handleToggleFav}
            scrollToMessageId={scrollToMessageId}
            navTarget={navTarget}
            subagents={data.subagents ?? []}
            sessionId={id}
          />
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        copyToClipboard(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="text-muted-foreground hover:text-muted-foreground shrink-0"
      title="复制"
    >
      {done ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  );
}

interface LegacyNavTarget {
  msgIdx: number;
  localIdx: number;
  nonce: number;
}

function LegacyVirtualizedMessages({
  messages,
  expanded,
  onToggle,
  highlight,
  searchActive,
  favIds,
  onToggleFav,
  scrollToMessageId,
  navTarget,
  subagents,
  sessionId,
}: {
  messages: Message[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  highlight?: string;
  searchActive: boolean;
  favIds: Set<string>;
  onToggleFav: (m: Message) => void;
  scrollToMessageId?: string | null;
  navTarget: LegacyNavTarget | null;
  subagents?: SubagentMeta[];
  sessionId?: string;
}) {
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

  const { resultByToolUseId, hiddenIds } = useMemo(() => pairToolResults(messages), [messages]);

  const visibleMessages = useMemo(() => {
    if (hiddenIds.size === 0) return messages;
    return messages.filter((m) => !hiddenIds.has(m.id));
  }, [messages, hiddenIds]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATE_DETAIL_ROW_HEIGHT,
    overscan: 4,
    measureElement: (el) => el?.getBoundingClientRect().height ?? ESTIMATE_DETAIL_ROW_HEIGHT,
  });

  const findVisibleIndex = (msgId: string): number => {
    let idx = visibleMessages.findIndex((m) => m.id === msgId);
    if (idx >= 0) return idx;
    if (hiddenIds.has(msgId)) {
      const result = messages.find((m) => m.id === msgId);
      if (result?.toolUseId) {
        const parent = messages.find(
          (m) => m.role === 'tool_use' && m.toolUseId === result.toolUseId,
        );
        if (parent) idx = visibleMessages.findIndex((m) => m.id === parent.id);
      }
    }
    return idx;
  };

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!scrollToMessageId || scrolled) return;
    const idx = findVisibleIndex(scrollToMessageId);
    if (idx < 0) return;
    const timer = setTimeout(() => {
      rowVirtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
      setScrolled(true);
    }, SCROLL_TO_MSG_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId, visibleMessages, scrolled, rowVirtualizer]);

  useEffect(() => {
    if (!navTarget || !parentRef.current) return;
    const { msgIdx, localIdx } = navTarget;
    const total = visibleMessages.length;
    const isNearEnd = msgIdx >= total - 3;
    const align: 'start' | 'center' | 'end' = msgIdx <= 2 ? 'start' : isNearEnd ? 'end' : 'center';
    rowVirtualizer.scrollToIndex(msgIdx, { align, behavior: 'smooth' });
    if (isNearEnd && parentRef.current) {
      const el = parentRef.current;
      let cancelledPatch = false;
      const snap = () => {
        if (!cancelledPatch) el.scrollTop = el.scrollHeight;
      };
      const t1 = setTimeout(snap, SCROLL_SNAP_DELAY_1_MS);
      const t2 = setTimeout(snap, SCROLL_SNAP_DELAY_2_MS);
      (parentRef.current as any).__spClearTailPatch = () => {
        cancelledPatch = true;
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else if (parentRef.current) {
      const fn = (parentRef.current as any).__spClearTailPatch;
      if (fn) fn();
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
              {m.role === 'tool_use' ? (
                <ToolCard
                  tool={m}
                  result={pairedResult}
                  favorited={favIds.has(m.id)}
                  onToggleFav={() => onToggleFav(m)}
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
                <LegacyMessageBlock
                  m={m}
                  expanded={expanded.has(m.id)}
                  searchActive={searchActive}
                  onToggle={() => onToggle(m.id)}
                  highlight={highlight}
                  favorited={favIds.has(m.id)}
                  onToggleFav={() => onToggleFav(m)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegacyMessageBlock({
  m,
  expanded,
  searchActive,
  onToggle,
  highlight,
  favorited,
  onToggleFav,
}: {
  m: Message;
  expanded: boolean;
  searchActive: boolean;
  onToggle: () => void;
  highlight?: string;
  favorited: boolean;
  onToggleFav: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const text = m.text || m.toolOutput || '';
    if (!text) return;
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };
  const isFold = m.role === 'tool_use' || m.role === 'tool_result';
  const bodyText = m.text || '';
  const lineCount = bodyText ? bodyText.split('\n').length : 0;
  const isAssistantOrUser =
    m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'meta';
  const longThreshold =
    lineCount > LONG_MESSAGE_LINE_THRESHOLD || bodyText.length > LONG_MESSAGE_CHAR_THRESHOLD;
  const longMode = isAssistantOrUser && longThreshold && !searchActive;
  const longExpanded = expanded;
  const showBody = !isFold || expanded || searchActive;
  const canToggle = isFold || longMode;

  return (
    <div className={cn('group relative rounded-lg border px-3.5 py-2.5', roleColor(m.role))}>
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onClick={onToggle}
          disabled={!canToggle}
          className={cn(
            'text-[11px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1',
            canToggle
              ? 'hover:bg-secondary cursor-pointer text-muted-foreground'
              : 'cursor-default text-muted-foreground',
          )}
        >
          {canToggle &&
            ((isFold ? showBody : longExpanded) ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            ))}
          {roleLabel(m.role)}
          {m.toolName && (
            <span className="font-mono normal-case ml-1 text-muted-foreground">{m.toolName}</span>
          )}
          {longMode && (
            <span className="ml-1 rounded bg-secondary px-1 py-px text-[9px] font-normal tabular-nums text-muted-foreground">
              {lineCount > 12 ? `${lineCount}行` : `${Math.ceil(bodyText.length / 100)}百字`}
            </span>
          )}
        </button>
        {m.timestamp && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date(m.timestamp).toLocaleString()}
          </span>
        )}
        <button
          onClick={onToggleFav}
          className={cn(
            'transition-all',
            favorited
              ? 'text-amber-400 hover:text-amber-300'
              : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-amber-400',
          )}
          title={favorited ? '取消收藏' : '收藏'}
        >
          <Star className={cn('size-3.5', favorited && 'fill-current')} />
        </button>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-muted-foreground transition-opacity"
          title="复制全文"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </button>
      </div>
      {showBody && (
        <>
          {m.role === 'assistant' && m.text ? (
            <LegacyCollapsibleBody longMode={longMode} expanded={longExpanded} onExpand={onToggle}>
              <LegacyMarkdownWithHighlight text={m.text} highlight={highlight} />
            </LegacyCollapsibleBody>
          ) : m.role === 'tool_use' ? (
            <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto bg-background rounded p-2 border border-border">
              {highlight
                ? highlightJsx(JSON.stringify(m.toolInput, null, 2), highlight)
                : JSON.stringify(m.toolInput, null, 2)}
            </pre>
          ) : m.role === 'tool_result' ? (
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto bg-background rounded p-2 border border-border max-h-96 overflow-y-auto">
              {highlight
                ? highlightJsx(m.toolOutput || m.text || '', highlight)
                : m.toolOutput || m.text || ''}
            </pre>
          ) : (
            <LegacyCollapsibleBody longMode={longMode} expanded={longExpanded} onExpand={onToggle}>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {highlight ? highlightJsx(m.text || '', highlight) : m.text}
              </div>
            </LegacyCollapsibleBody>
          )}
        </>
      )}
      {!showBody && (
        <div className="text-[11px] text-muted-foreground line-clamp-1">
          {highlight
            ? highlightJsx(
                m.text ||
                  m.toolOutput ||
                  (m.toolInput ? JSON.stringify(m.toolInput).slice(0, TOOL_INPUT_PREVIEW_LEN) : ''),
                highlight,
              )
            : m.text ||
              m.toolOutput ||
              (m.toolInput ? JSON.stringify(m.toolInput).slice(0, TOOL_INPUT_PREVIEW_LEN) : '')}
        </div>
      )}
    </div>
  );
}

function LegacyCollapsibleBody({
  longMode,
  expanded,
  onExpand,
  children,
}: {
  longMode: boolean;
  expanded: boolean;
  onExpand: () => void;
  children: React.ReactNode;
}) {
  if (!longMode) return <>{children}</>;
  if (expanded)
    return (
      <div className="space-y-1">
        {children}
        <div className="pt-1">
          <button
            onClick={onExpand}
            className="text-[11px] text-muted-foreground hover:text-muted-foreground"
          >
            ↑ 收起
          </button>
        </div>
      </div>
    );
  return (
    <div className="relative">
      <div className="max-h-[10rem] overflow-hidden">{children}</div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-bg-surface to-transparent" />
      <button
        onClick={onExpand}
        className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm transition-colors hover:border-border hover:text-fg"
      >
        ↓ 展开
      </button>
    </div>
  );
}

function LegacyMarkdownWithHighlight({ text, highlight }: { text: string; highlight?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current || !highlight?.trim()) return;
    const result = highlightDom(containerRef.current, highlight);
    return result.cleanup;
  }, [highlight, text]);
  return (
    <div className="md-body" ref={containerRef}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
