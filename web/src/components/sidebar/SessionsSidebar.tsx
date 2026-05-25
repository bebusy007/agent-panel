import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Search, Plus, X, RotateCw, Layers, ChevronsDownUp } from 'lucide-react';
import { api } from '@/lib/api';
import { SIDEBAR_SESSION_LIMIT } from '@/lib/constants';
import { invalidateAsyncCache, useCachedAsync } from '@/lib/hooks';
import { useAppEvent } from '@/lib/events';
import {
  buildProjectFolders,
  autoExpandForSession,
  normalizeCwd,
  folderHasSource,
} from '@/lib/sidebar-groups';
import {
  loadExpandedProjects,
  saveExpandedProjects,
  loadPinnedCwds,
  savePinnedCwds,
  loadRemovedCwds,
  saveRemovedCwds,
} from '@/lib/sidebar-state';
import { ProjectFolderItem } from './ProjectFolderItem';
import { cn, describeSessionSource } from '@/lib/utils';
import type { SessionSource } from '@/lib/api';

const ALL_SOURCES: SessionSource[] = ['claude-code', 'cursor-agent', 'codex'];

export function SessionsSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // SessionsView uses `?id=` to open the drawer; we treat it as "the focused
  // session" so the sidebar can highlight + auto-expand the right folder.
  const focusedSessionId = searchParams.get('id') || undefined;

  // Server data — cached so the sidebar mounts instantly on
  // /sessions after a detail-page round trip (no spinner / re-fetch
  // flash).
  const { data: sessionsData, refetch } = useCachedAsync(
    'sidebar:sessions',
    () => api.sessionsList({ limit: SIDEBAR_SESSION_LIMIT }),
    [],
  );
  const { data: favoritesData, refetch: refetchFavs } = useCachedAsync(
    'sidebar:favorites',
    () => api.favoritesList(),
    [],
  );

  // Re-fetch the session + favorites lists whenever any other component
  // (SessionsView, SessionDetailView, FavoritesView) reports a mutation.
  // Prevents the "I deleted in detail view, sidebar still shows the row
  // until I refresh manually" problem the user flagged.
  useAppEvent('sessions:changed', () => {
    invalidateAsyncCache('sidebar:sessions');
    refetch();
    refetchFavs();
  });
  useAppEvent('favorites:changed', () => {
    invalidateAsyncCache('sidebar:favorites');
    refetchFavs();
  });

  // UI state. Folder expand / pinned / removed cwds go to
  // localStorage because they're long-lived preferences. Search
  // query + source filters used to be in sessionStorage to survive
  // a detail-page round trip, but now Layout keeps the sidebar
  // mounted across detail overlays so plain useState is enough.
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpandedProjects());
  const [pinned, setPinned] = useState<string[]>(() => loadPinnedCwds());
  const [removed, setRemoved] = useState<string[]>(() => loadRemovedCwds());
  const [query, setQuery] = useState('');
  const [activeSources, setActiveSources] = useState<Set<SessionSource>>(
    () => new Set(ALL_SOURCES),
  );

  useEffect(() => saveExpandedProjects(expanded), [expanded]);
  useEffect(() => savePinnedCwds(pinned), [pinned]);
  useEffect(() => saveRemovedCwds(removed), [removed]);

  // Clean stale removed cwds: if a removed cwd no longer has any
  // sessions in the latest scan, drop it from the removed list so it
  // doesn't block future sessions under that cwd from appearing.
  useEffect(() => {
    if (!sessionsData?.sessions?.length || removed.length === 0) return;
    const liveCwds = new Set(sessionsData.sessions.map((s) => normalizeCwd(s.cwd)));
    const stale = removed.filter((cwd) => !liveCwds.has(cwd));
    if (stale.length > 0) {
      setRemoved((prev) => prev.filter((c) => !stale.includes(c)));
    }
  }, [sessionsData]);

  // Derive favoriteSessionIds set
  const favSessionIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of favoritesData?.favorites ?? []) set.add(f.sessionId);
    return set;
  }, [favoritesData]);

  // Build the folder tree (filtered by active sources + query)
  const folders = useMemo(() => {
    const sessions = sessionsData?.sessions ?? [];
    const filtered = sessions.filter((s) => activeSources.has(s.source));
    const all = buildProjectFolders(filtered, favSessionIds, pinned, removed);
    if (query.trim().length < 2) return all;
    const q = query.toLowerCase();
    // Folder-level filter: keep folder if its label/cwd matches OR any of its
    // conversations match. For matching folders we keep ALL their convos so
    // users can still browse; for partially-matching ones we filter convos.
    const out: typeof all = [];
    for (const f of all) {
      const folderHit = (f.label + ' ' + f.cwd).toLowerCase().includes(q);
      const matched = f.conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.sessions.some((s) => (s.firstUserMessage ?? '').toLowerCase().includes(q)),
      );
      if (folderHit) {
        out.push(f);
      } else if (matched.length > 0) {
        out.push({ ...f, conversations: matched, conversationCount: matched.length });
      }
    }
    return out;
  }, [sessionsData, favSessionIds, pinned, removed, query, activeSources]);

  // Auto-expand the folder containing the focused session
  useEffect(() => {
    if (!focusedSessionId) return;
    setExpanded((prev) => autoExpandForSession(focusedSessionId, folders, prev) ?? prev);
  }, [focusedSessionId, folders]);

  // Auto-expand all when actively searching (so matches are visible)
  useEffect(() => {
    if (!query.trim()) return;
    setExpanded(new Set(folders.map((f) => f.folderKey)));
  }, [query, folders]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleSource = (s: SessionSource) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      // Don't allow zero — at least one always selected
      if (next.size === 0) return new Set(ALL_SOURCES);
      return next;
    });
  };
  const pinCwd = (cwd: string) => {
    const n = normalizeCwd(cwd);
    if (!n) return;
    setPinned((prev) => (prev.includes(n) ? prev : [...prev, n]));
  };
  const unpinCwd = (cwd: string) => {
    const n = normalizeCwd(cwd);
    setPinned((prev) => prev.filter((c) => c !== n));
  };
  const removeCwd = (cwd: string) => {
    const n = normalizeCwd(cwd);
    if (!n) return;
    setRemoved((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setPinned((prev) => prev.filter((c) => c !== n));
  };

  const onAllProjects = () => {
    // Clear `?id=` (close any open drawer) and land on /sessions.
    if (location.pathname !== '/sessions' || location.search) {
      navigate('/sessions');
    }
  };

  const totalSessions = (sessionsData?.sessions ?? []).filter((s) =>
    activeSources.has(s.source),
  ).length;
  const removedCount = removed.length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight">会话</h2>
          <span className="text-[10px] text-muted-foreground tabular-nums">{totalSessions}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Collapse-all: matches the IDE convention. We don't have
           *  an "expand all" twin because in this app expanding every
           *  folder dumps thousands of conversations into the DOM —
           *  the sidebar already auto-expands the folder of the
           *  active session, that's the meaningful direction. */}
          <button
            onClick={() => setExpanded(new Set())}
            title="收起全部文件夹"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-muted-foreground"
          >
            <ChevronsDownUp className="size-3.5" />
          </button>
          <button
            onClick={() => refetch()}
            title="重新扫描"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-muted-foreground"
          >
            <RotateCw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border px-2 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="筛选项目名 / 会话标题（≥2字符）"
            className="h-7 w-full rounded-md border border-border bg-background/40 pl-7 pr-7 text-xs text-fg placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              title="清空"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-muted-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Source filter pills */}
      <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
        {ALL_SOURCES.map((s) => {
          const on = activeSources.has(s);
          return (
            <button
              key={s}
              onClick={() => toggleSource(s)}
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors',
                on
                  ? 'bg-accent/15 text-fg ring-1 ring-inset ring-accent/30'
                  : 'bg-secondary/40 text-muted-foreground hover:bg-secondary',
              )}
              title={on ? `隐藏 ${describeSessionSource(s)}` : `显示 ${describeSessionSource(s)}`}
            >
              {sourceShortLabel(s)}
            </button>
          );
        })}
      </div>

      {/* All projects shortcut */}
      <button
        onClick={onAllProjects}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-fg',
          location.pathname === '/sessions' && !focusedSessionId && 'bg-secondary/60 text-fg',
        )}
      >
        <Layers className="size-3.5 text-muted-foreground" />
        <span>全部会话</span>
      </button>

      {/* Folder tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {folders.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {query ? '无匹配项目' : '无会话'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {folders
              .filter((f) => folderHasSource(f, activeSources))
              .map((folder) => (
                <ProjectFolderItem
                  key={folder.folderKey}
                  folder={folder}
                  expanded={expanded.has(folder.folderKey)}
                  onToggle={() => toggleExpand(folder.folderKey)}
                  pinned={pinned.includes(folder.cwd)}
                  onPin={() => pinCwd(folder.cwd)}
                  onUnpin={() => unpinCwd(folder.cwd)}
                  onRemove={() => removeCwd(folder.cwd)}
                  activeSessionId={focusedSessionId}
                  highlight={query}
                />
              ))}
          </div>
        )}
      </div>

      {removedCount > 0 && (
        <button
          onClick={() => setRemoved([])}
          className="border-t border-border px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-muted-foreground"
          title="恢复所有被移除的项目"
        >
          <Plus className="mr-1 inline size-3" />
          恢复 {removedCount} 个被移除的项目
        </button>
      )}
    </div>
  );
}

function sourceShortLabel(s: SessionSource): string {
  switch (s) {
    case 'claude-code':
      return 'CC';
    case 'cursor-agent':
      return 'Cursor·agent';
    case 'codex':
      return 'Codex';

    default:
      return s;
  }
}
