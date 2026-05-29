import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Message, SessionSummary, SessionFull, SubagentMeta, ResumeHints } from '@/lib/api';
import { buildTurns, type TurnEntry } from '@/lib/turn-grouping';
import { emitAppEvent } from '@/lib/events';
import { useSessionSearch, type SessionSearchState } from '@/lib/use-session-search';
import { useDragResize } from '@/lib/use-drag-resize';
import {
  TURN_PANEL_BOUNDS,
  loadTurnPanelWidth,
  saveTurnPanelWidth,
  loadTurnPanelCollapsed,
  saveTurnPanelCollapsed,
  RIGHT_PANEL_BOUNDS,
  loadRightPanelWidth,
  saveRightPanelWidth,
} from '@/lib/sidebar-state';

interface SessionContextValue {
  id: string;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  summary: SessionSummary | undefined;
  resumeHints: ResumeHints | undefined;
  subagents: SubagentMeta[];
  messages: Message[];
  messageCount: number;
  turns: TurnEntry[];

  search: SessionSearchState;

  activeTurnIndex: number;
  setActiveTurnIndex: (i: number) => void;
  scrollSignal: { messageId: string; nonce: number } | null;
  scrollToMessage: (messageId: string) => void;

  turnPanelWidth: number;
  turnPanelCollapsed: boolean;
  toggleTurnPanel: () => void;
  onTurnPanelResizeStart: (e: React.MouseEvent) => void;
  onTurnPanelResizeDoubleClick: () => void;

  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  rightPanelWidth: number;
  onRightPanelResizeStart: (e: React.MouseEvent) => void;
  onRightPanelResizeDoubleClick: () => void;

  expanded: Set<string>;
  toggleExpanded: (id: string) => void;

  favIds: Set<string>;
  toggleFav: (m: Message) => Promise<void>;
}

const SessionCtx = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

export function SessionProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const [data, setData] = useState<SessionFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!id) return;
    api
      .sessionDetail(id)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
    api
      .favoritesForSession(id)
      .then((r) => setFavIds(new Set(r.favorites.map((f) => f.messageId))))
      .catch(() => {});
  }, [id]);

  const refetch = useCallback(() => {
    if (!id) return;
    api
      .sessionDetail(id)
      .then((d) => setData(d))
      .catch(() => {});
    api
      .favoritesForSession(id)
      .then((r) => setFavIds(new Set(r.favorites.map((f) => f.messageId))))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError(new Error('session id is empty'));
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    setFavIds(new Set());
    load();
    return () => {
      // cleanup handled by the api dedup in api.ts
    };
  }, [id]);

  const messages = data?.messages ?? [];
  const summary = data?.session;
  const resumeHints = data?.resumeHints;
  const subagents = data?.subagents ?? [];
  const messageCount = data?.messageCount ?? 0;

  const turns = useMemo(() => buildTurns(messages), [messages]);

  const searchState = useSessionSearch(messages);

  const [activeTurnIndex, setActiveTurnIndex] = useState(0);
  const [scrollSignal, setScrollSignal] = useState<{
    messageId: string;
    nonce: number;
  } | null>(null);

  const scrollToMessage = useCallback((messageId: string) => {
    setScrollSignal((prev) => ({
      messageId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);

  // Turn panel resize + collapse
  const turnResize = useDragResize(TURN_PANEL_BOUNDS, loadTurnPanelWidth(), saveTurnPanelWidth);
  const [turnPanelCollapsed, setTurnPanelCollapsed] = useState(() => loadTurnPanelCollapsed());
  const toggleTurnPanel = useCallback(() => {
    setTurnPanelCollapsed((v) => {
      saveTurnPanelCollapsed(!v);
      return !v;
    });
  }, []);

  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const toggleRightPanel = useCallback(() => setRightPanelOpen((v) => !v), []);

  const rightResize = useDragResize(
    RIGHT_PANEL_BOUNDS,
    loadRightPanelWidth(),
    saveRightPanelWidth,
    true,
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleFav = useCallback(
    async (m: Message) => {
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
    },
    [id, data, favIds],
  );

  useEffect(() => {
    setActiveTurnIndex(0);
    setScrollSignal(null);
  }, [id]);

  const value: SessionContextValue = {
    id,
    loading,
    error,
    refetch,
    summary,
    resumeHints,
    subagents,
    messages,
    messageCount,
    turns,
    search: searchState,
    activeTurnIndex,
    setActiveTurnIndex,
    scrollSignal,
    scrollToMessage,
    turnPanelWidth: turnResize.width,
    turnPanelCollapsed,
    toggleTurnPanel,
    onTurnPanelResizeStart: turnResize.onResizeStart,
    onTurnPanelResizeDoubleClick: turnResize.onResizeDoubleClick,
    rightPanelOpen,
    toggleRightPanel,
    rightPanelWidth: rightResize.width,
    onRightPanelResizeStart: rightResize.onResizeStart,
    onRightPanelResizeDoubleClick: rightResize.onResizeDoubleClick,
    expanded,
    toggleExpanded,
    favIds,
    toggleFav,
  };

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
