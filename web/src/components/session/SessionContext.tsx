import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/lib/api";
import type {
  Message,
  SessionSummary,
  SessionFull,
  SubagentMeta,
  ResumeHints,
} from "@/lib/api";
import { buildTurns, type TurnEntry } from "@/lib/turn-grouping";
import { emitAppEvent } from "@/lib/events";
import {
  useSessionSearch,
  type SessionSearchState,
} from "@/lib/use-session-search";
import { useDragResize } from "@/lib/use-drag-resize";
import {
  TURN_PANEL_BOUNDS,
  loadTurnPanelWidth,
  saveTurnPanelWidth,
  loadTurnPanelCollapsed,
  saveTurnPanelCollapsed,
  RIGHT_PANEL_BOUNDS,
  loadRightPanelWidth,
  saveRightPanelWidth,
} from "@/lib/sidebar-state";
import { useChatConnection } from "@/lib/conversation/use-chat-connection";
import type { ChatSessionState, ConnectionState, AttachmentData } from "@/lib/conversation";
import {
  eventToMessages,
  updateToolInput,
  createOptimisticUserMessage,
  flushStreamingToMessages,
  type LiveMessage,
} from "@/lib/conversation/event-to-message";

interface SessionContextValue {
  id: string;
  loading: boolean;
  error: Error | null;
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

  // Chat conversation state
  chat: {
    state: ChatSessionState;
    connectionState: ConnectionState;
    sendMessage: (text: string, attachments?: AttachmentData[]) => void;
    respondPermission: (requestId: string, decision: "allow" | "deny") => void;
    interrupt: () => void;
    disconnect: () => void;
  };
  liveMessages: LiveMessage[];
}

const SessionCtx = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionCtx);
  if (!ctx)
    throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

export function SessionProvider({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<SessionFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError(new Error("session id is empty"));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setFavIds(new Set());
    api
      .sessionDetail(id)
      .then((d) => {
        if (!cancelled) {
          setData(d);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    api
      .favoritesForSession(id)
      .then((r) => {
        if (!cancelled)
          setFavIds(new Set(r.favorites.map((f) => f.messageId)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const historyMessages = data?.messages ?? [];
  const summary = data?.session;
  const resumeHints = data?.resumeHints;
  const subagents = data?.subagents ?? [];
  const messageCount = data?.messageCount ?? 0;

  // ── Chat connection (defined early so liveMessages is available for merge) ──
  const chatConn = useChatConnection({ sessionId: id, cwd: summary?.cwd });
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const prevTimelineLenRef = useRef(0);

  // Merge history + live messages for the virtual list
  const messages: Message[] = useMemo(
    () => [...historyMessages, ...liveMessages as Message[]],
    [historyMessages, liveMessages]
  );

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
  const turnResize = useDragResize(
    TURN_PANEL_BOUNDS,
    loadTurnPanelWidth(),
    saveTurnPanelWidth,
  );
  const [turnPanelCollapsed, setTurnPanelCollapsed] = useState(
    () => loadTurnPanelCollapsed(),
  );
  const toggleTurnPanel = useCallback(() => {
    setTurnPanelCollapsed((v) => {
      saveTurnPanelCollapsed(!v);
      return !v;
    });
  }, []);

  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const toggleRightPanel = useCallback(
    () => setRightPanelOpen((v) => !v),
    [],
  );

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
      emitAppEvent("favorites:changed");
    },
    [id, data, favIds],
  );

  useEffect(() => {
    setActiveTurnIndex(0);
    setScrollSignal(null);
  }, [id]);

  // React to chat store events: convert to live messages
  useEffect(() => {
    const { timeline } = chatConn.state;
    const timelineLen = timeline.length;
    if (timelineLen === prevTimelineLenRef.current) return;

    // Process new timeline entries
    const newEntries = timeline.slice(prevTimelineLenRef.current);
    prevTimelineLenRef.current = timelineLen;

    const newMessages: LiveMessage[] = [];
    for (const entry of newEntries) {
      if (entry.kind === "user" && !entry.optimistic) continue; // handled by optimistic path
      if (entry.kind === "user" && entry.optimistic) {
        newMessages.push(createOptimisticUserMessage(entry.text, entry.id));
      } else if (entry.kind === "tool") {
        newMessages.push({
          id: entry.toolUseId,
          role: "tool_use",
          toolName: entry.toolName,
          toolUseId: entry.toolUseId,
          toolInput: entry.input ? tryParseJson(entry.input) : undefined,
          toolStatus: entry.status,
          timestamp: new Date(entry.ts).toISOString(),
          isLive: true,
        });
      } else if (entry.kind === "assistant") {
        if (entry.thinkingText) {
          newMessages.push({
            id: `thinking_${entry.id}`,
            role: "assistant",
            text: "(thinking)",
            timestamp: new Date(entry.ts).toISOString(),
            isLive: true,
          });
        }
        newMessages.push({
          id: entry.id,
          role: "assistant",
          text: entry.text,
          model: undefined,
          timestamp: new Date(entry.ts).toISOString(),
          isLive: true,
        });
      }
    }

    if (newMessages.length > 0) {
      setLiveMessages((prev) => [...prev, ...newMessages]);
    }
  }, [chatConn.state.timeline]);

  // Handle tool input deltas (update existing tool message)
  useEffect(() => {
    const { timeline } = chatConn.state;
    setLiveMessages((prev) => {
      let updated = prev;
      for (const entry of timeline) {
        if (entry.kind === "tool" && entry.input) {
          updated = updated.map((m) =>
            m.role === "tool_use" && m.toolUseId === entry.toolUseId
              ? { ...m, toolInput: tryParseJson(entry.input), toolStatus: entry.status }
              : m
          );
        }
      }
      return updated;
    });
  }, [chatConn.state.timeline]);

  const value: SessionContextValue = {
    id,
    loading,
    error,
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
    chat: {
      state: chatConn.state,
      connectionState: chatConn.connectionState,
      sendMessage: chatConn.sendMessage,
      respondPermission: chatConn.respondPermission,
      interrupt: chatConn.interrupt,
      disconnect: chatConn.disconnect,
    },
    liveMessages,
  };

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

function tryParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
