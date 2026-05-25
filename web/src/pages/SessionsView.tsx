import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { emitAppEvent } from '@/lib/events';
import {
  Trash2,
  RefreshCw,
  X,
  Check,
  ArrowDown,
  ArrowUp,
  RotateCw,
  User,
  Bot,
  MessageSquare,
  Search,
  ChevronDown,
} from 'lucide-react';
import { api, type RustSessionSummary, type RustSearchHit } from '@/lib/api';
import { invalidateAsyncCache, useCachedAsync, useDebounced } from '@/lib/hooks';
import { useOverlayNavigate } from '@/lib/use-detail-nav';
import { SearchBar } from '@/components/SearchBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { VirtualSessionList } from '@/components/VirtualSessionList';
import { cleanupPromptPreview } from '@/lib/text-cleanup';
import { cn, describeSessionSource, formatRelative, formatTokens, sourceColor } from '@/lib/utils';

type SortKey = 'lastActivity' | 'startedAt' | 'messageCount' | 'tokensTotal';
type SortDir = 'desc' | 'asc';
type MessageTypeFilter = 'all' | 'user' | 'assistant';

const SORT_LABELS: Record<SortKey, string> = {
  lastActivity: '最近活跃',
  startedAt: '创建时间',
  messageCount: '消息数',
  tokensTotal: 'Token 消耗',
};

const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: 'lastActivity', dir: 'desc' };

function sortValue(s: RustSessionSummary, key: SortKey): number | string | undefined {
  switch (key) {
    case 'lastActivity':
      return s.lastActivity || '';
    case 'startedAt':
      return s.startedAt || s.lastActivity || '';
    case 'messageCount':
      return s.messageCount ?? 0;
    case 'tokensTotal':
      return s.tokensTotal;
  }
}

function compareSessions(
  a: RustSessionSummary,
  b: RustSessionSummary,
  key: SortKey,
  dir: SortDir,
): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === undefined && vb === undefined) return 0;
  if (va === undefined) return 1;
  if (vb === undefined) return -1;
  let cmp: number;
  if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
  else cmp = String(va).localeCompare(String(vb));
  return dir === 'asc' ? cmp : -cmp;
}

const PAGE_SIZE = 200;

export default function SessionsView() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);

  const [params, setParams] = useSearchParams();
  const sortKey = ((params.get('sort') as SortKey) || DEFAULT_SORT.key) as SortKey;
  const sortDir = ((params.get('dir') as SortDir) || DEFAULT_SORT.dir) as SortDir;
  const setSort = (key: SortKey, dir: SortDir) => {
    const next = new URLSearchParams(params);
    if (key === DEFAULT_SORT.key && dir === DEFAULT_SORT.dir) {
      next.delete('sort');
      next.delete('dir');
    } else {
      next.set('sort', key);
      next.set('dir', dir);
    }
    setParams(next, { replace: true });
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [trashCount, setTrashCount] = useState(0);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: React.ReactNode;
    onConfirm: (cascadeIds: string[]) => Promise<void>;
    requireType?: string;
    tone?: 'default' | 'danger';
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search filters
  const [messageTypeFilter, setMessageTypeFilter] = useState<MessageTypeFilter>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');

  const listKey = `sessions:list`;
  const { data, loading, error, refetch } = useCachedAsync(
    listKey,
    () => api.sessionsList({ limit: 2000 }),
    [],
  );
  const projects = useCachedAsync('sessions:projects', () => api.sessionsProjects(), []);

  const refreshAll = () => {
    invalidateAsyncCache({ prefix: 'sessions:' });
    refetch();
    projects.refetch();
    api
      .trashList()
      .then((d) => setTrashCount(d.total))
      .catch(() => {});
    emitAppEvent('sessions:changed');
  };

  const sessions = data?.sessions ?? [];

  useEffect(() => {
    api
      .trashList()
      .then((d) => setTrashCount(d.total))
      .catch(() => {});
  }, []);

  // --- Session list (no search or < 2 chars) ---
  const sorted = useMemo(() => {
    const arr = [...sessions];
    arr.sort((a, b) => compareSessions(a, b, sortKey, sortDir));
    return arr;
  }, [sessions, sortKey, sortDir]);

  // --- Title match (client-side filter) ---
  const isSearchActive = debouncedQuery.trim().length >= 2;

  const titleMatches = useMemo(() => {
    if (!isSearchActive) return [];
    const q = debouncedQuery.toLowerCase();
    return sorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.cwd || '').toLowerCase().includes(q) ||
        (s.firstUserMessage || '').toLowerCase().includes(q),
    );
  }, [sorted, debouncedQuery, isSearchActive]);

  // --- Message search (backend full-text) ---
  const [messageHits, setMessageHits] = useState<RustSearchHit[]>([]);
  const [messageTotalMatches, setMessageTotalMatches] = useState(0);
  const [messageSearchTime, setMessageSearchTime] = useState(0);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const doSearch = useCallback(
    async (q: string, msgType: MessageTypeFilter, project: string, offset = 0, append = false) => {
      if (q.trim().length < 2) {
        if (!append) {
          setMessageHits([]);
          setMessageTotalMatches(0);
        }
        return;
      }
      if (!append) setMessageSearchLoading(true);
      else setLoadingMore(true);

      try {
        const filters: Record<string, unknown> = {};
        if (msgType !== 'all') filters.messageType = msgType;
        if (project !== 'all') {
          const dirName = project.split(/[\\/]/).pop() || project;
          filters.projects = [dirName];
        }
        const r = await api.searchMessages({
          query: q,
          filters: filters as any,
          limit: PAGE_SIZE,
          offset,
        });
        if (append) {
          setMessageHits((prev) => [...prev, ...r.hits]);
        } else {
          setMessageHits(r.hits);
        }
        setMessageTotalMatches(r.totalMatches);
        setMessageSearchTime(r.searchTimeMs);
        setLoadedOffset(offset + r.hits.length);
      } catch {
        /* ignore */
      } finally {
        if (!append) setMessageSearchLoading(false);
        else setLoadingMore(false);
      }
    },
    [],
  );

  // Trigger search when query/filters change
  useEffect(() => {
    setLoadedOffset(0);
    doSearch(debouncedQuery, messageTypeFilter, selectedProject, 0, false);
  }, [debouncedQuery, messageTypeFilter, selectedProject, doSearch]);

  const handleLoadMore = () => {
    doSearch(debouncedQuery, messageTypeFilter, selectedProject, loadedOffset, true);
  };

  const hasMore = messageTotalMatches > loadedOffset;

  // --- Actions ---
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };
  const openOverlay = useOverlayNavigate();
  const openDetail = (id: string) => openOverlay(`/sessions/${encodeURIComponent(id)}`);

  const handleSelect = (id: string, selectMode: 'click' | 'checkbox') => {
    if (selectMode === 'checkbox' || selectedIds.size > 0) {
      toggleCheckbox(id);
    } else {
      openDetail(id);
    }
  };
  const toggleCheckbox = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleAction = async (
    s: RustSessionSummary,
    action: 'hide' | 'show' | 'trash' | 'restore' | 'permanent',
  ) => {
    if (action === 'trash') {
      setConfirm({
        title: '移到回收站',
        description: (
          <>
            将「<span className="text-foreground">{s.title || s.id}</span>」移到回收站。
          </>
        ),
        tone: 'danger',
        onConfirm: async () => {
          const r = await api.sessionsTrash([s.filePath]);
          flash(r.errors.length === 0 ? '已移到回收站' : `失败: ${r.errors[0]}`);
          refreshAll();
        },
      });
      return;
    }
    if (action === 'restore') {
      const r = await api.sessionsRestore([s.filePath]);
      flash(r.errors.length === 0 ? '已恢复' : `失败: ${r.errors[0]}`);
      refreshAll();
      return;
    }
    if (action === 'permanent') {
      setConfirm({
        title: '永久删除',
        description: (
          <>
            将永久删除「<span className="text-foreground">{s.title || s.id}</span>」，无法恢复。
          </>
        ),
        requireType: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const r = await api.sessionsPermanentDelete([s.filePath]);
          flash(r.errors.length === 0 ? '已永久删除' : `失败: ${r.errors[0]}`);
          refreshAll();
        },
      });
      return;
    }
    flash('该功能暂不支持');
  };

  const handleBatchTrash = async () => {
    const ids = Array.from(selectedIds);
    const filePaths = sessions.filter((s) => ids.includes(s.id)).map((s) => s.filePath);
    setConfirm({
      title: `移到回收站 ${ids.length} 条`,
      description: `将 ${ids.length} 条会话移到回收站，可在回收站中恢复。`,
      tone: 'danger',
      onConfirm: async () => {
        const r = await api.sessionsTrash(filePaths);
        flash(
          `已处理 ${r.trashed.length}/${filePaths.length}` +
            (r.errors.length ? `，失败 ${r.errors.length}` : ''),
        );
        setSelectedIds(new Set());
        refreshAll();
      },
    });
  };

  const projectOptions = useMemo(
    () =>
      (projects.data?.projects || []).map((p) => ({
        value: p.projectDir,
        label: p.projectDir.replace(/^.*-/, '~/'),
      })),
    [projects.data],
  );

  const selectionMode = selectedIds.size > 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="typo-h1">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 <span className="text-foreground">{sessions.length}</span> 个会话
            {!isSearchActive && data?.scanTimeMs && (
              <> · 扫描 {(data.scanTimeMs / 1000).toFixed(1)}s</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isSearchActive && (
            <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden">
              <span className="text-[11px] text-muted-foreground px-2 py-1.5 bg-background/50 border-r border-border self-center">
                排序
              </span>
              <select
                value={sortKey}
                onChange={(e) => setSort(e.target.value as SortKey, sortDir)}
                className="bg-card text-xs px-2 py-1.5 outline-none focus:bg-secondary cursor-pointer"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSort(sortKey, sortDir === 'desc' ? 'asc' : 'desc')}
                className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border-l border-border"
              >
                {sortDir === 'desc' ? (
                  <ArrowDown className="size-3.5" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </button>
            </div>
          )}
          <Link
            to="/sessions/trash"
            className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors inline-flex items-center gap-1.5"
          >
            <Trash2 className="size-3.5" />
            回收站
            {trashCount > 0 && (
              <span className="ml-0.5 text-[10px] bg-amber-500/30 text-amber-200 px-1.5 rounded">
                {trashCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => refreshAll()}
            className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="size-3.5" /> 刷新
          </button>
        </div>
      </header>

      {/* Search bar */}
      <div className="space-y-2">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="搜索会话标题或全部消息内容…"
          resultCount={isSearchActive ? titleMatches.length + messageTotalMatches : undefined}
        />

        {/* Filters — show when search is active */}
        {isSearchActive && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Message type filter */}
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
              {[
                { key: 'all' as const, icon: MessageSquare, label: '全部' },
                { key: 'user' as const, icon: User, label: '用户' },
                { key: 'assistant' as const, icon: Bot, label: '助手' },
              ].map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setMessageTypeFilter(key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                    messageTypeFilter === key
                      ? 'bg-secondary text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="size-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Project filter */}
            {projectOptions.length > 0 && (
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-7 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none cursor-pointer"
              >
                <option value="all">全部项目</option>
                {projectOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}

            {/* Search stats */}
            {!messageSearchLoading && messageTotalMatches > 0 && (
              <span className="text-[11px] text-muted-foreground ml-auto">
                匹配 <span className="text-foreground tabular-nums">{messageTotalMatches}</span>{' '}
                条消息，{messageSearchTime}ms
              </span>
            )}
            {messageSearchLoading && (
              <span className="text-[11px] text-muted-foreground ml-auto inline-flex items-center gap-1">
                <RotateCw className="size-3 animate-spin" /> 搜索中…
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      {!isSearchActive ? (
        /* Empty state — sidebar already shows the session list */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="size-8 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">输入至少 2 个字符搜索全部消息内容</p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            支持搜索用户消息、助手回复、工具调用等全部内容
          </p>
        </div>
      ) : (
        /* Search results (mixed: title + message) */
        <div className="space-y-4">
          {/* Title matches */}
          {titleMatches.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                标题匹配 ({titleMatches.length})
              </div>
              <div className="space-y-1.5">
                {titleMatches.slice(0, 20).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openDetail(s.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-border hover:shadow-e1"
                  >
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                      标题
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset',
                        sourceColor(s.source),
                      )}
                    >
                      {describeSessionSource(s.source)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {cleanupPromptPreview(s.title, 120) || '(无标题)'}
                    </span>
                    {s.lastActivity && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelative(s.lastActivity)}
                      </span>
                    )}
                  </button>
                ))}
                {titleMatches.length > 20 && (
                  <div className="text-[11px] text-muted-foreground text-center py-1">
                    还有 {titleMatches.length - 20} 条标题匹配…
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Message matches */}
          <section>
            {(messageHits.length > 0 || messageSearchLoading) && (
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                消息匹配{!messageSearchLoading && ` (${messageTotalMatches})`}
              </div>
            )}

            {messageHits.length === 0 && !messageSearchLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground">无匹配消息</div>
            )}

            {messageHits.length > 0 && (
              <ul
                className={cn(
                  'space-y-1.5 transition-opacity',
                  messageSearchLoading && 'opacity-60',
                )}
              >
                {messageHits.map((h, i) => (
                  <li key={`${h.sessionId}-${h.messageId}-${i}`}>
                    <button
                      onClick={() =>
                        openOverlay(
                          `/sessions/${encodeURIComponent(h.sessionId)}?msg=${encodeURIComponent(h.messageId)}`,
                        )
                      }
                      className="group flex w-full items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-border hover:shadow-e1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                              h.role === 'user'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-purple-500/10 text-purple-300',
                            )}
                          >
                            {h.role === 'user' ? (
                              <User className="size-2.5" />
                            ) : (
                              <Bot className="size-2.5" />
                            )}
                            {h.role === 'user' ? '用户' : '助手'}
                          </span>
                          {h.projectName && (
                            <span className="truncate font-mono text-[10px] text-muted-foreground max-w-[200px]">
                              {h.projectName
                                .replace(/^-/, '')
                                .replace(/-/g, '/')
                                .replace(/^Users\/[^/]+\//, '~/')}
                            </span>
                          )}
                          {h.timestamp && (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
                              {formatRelative(h.timestamp)}
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground [&_mark]:bg-yellow-400/30 [&_mark]:text-foreground [&_mark]:rounded-sm [&_mark]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: h.snippet }}
                        />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Load more */}
            {hasMore && !messageSearchLoading && (
              <div className="pt-3 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-border disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <RotateCw className="size-3 animate-spin" /> 加载中…
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3" /> 加载更多（已显示 {messageHits.length}/
                      {messageTotalMatches}）
                    </>
                  )}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={async (cascadeIds) => {
            await confirm.onConfirm(cascadeIds);
            setConfirm(null);
          }}
          title={confirm.title}
          description={confirm.description}
          requireType={confirm.requireType}
          tone={confirm.tone}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm shadow-lg">
          <Check className="size-3.5 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}
