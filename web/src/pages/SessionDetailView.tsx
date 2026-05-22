import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  cn,
  describeSessionSource,
  formatAbsolute,
  formatRelative,
  sourceColor,
} from "@/lib/utils";
import { SessionDetail } from "@/components/SessionDetail";
import { TurnSidebar, MiniTurnRail } from "@/components/session/TurnSidebar";
import { RightSidebar } from "@/components/session/RightSidebar";
import { SessionProvider, useSession } from "@/components/session/SessionContext";
import { ResumeMenu } from "@/components/ResumeMenu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cleanupPromptPreview } from "@/lib/text-cleanup";
import { emitAppEvent } from "@/lib/events";
import { useDetailNav } from "@/lib/use-detail-nav";
import type { TurnEntry } from "@/lib/turn-grouping";
import type { SessionSummary } from "@/lib/api";

export default function SessionDetailView() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scrollToMsg = searchParams.get("msg");

  useEffect(() => {
    if (!id) navigate("/sessions", { replace: true });
  }, [id, navigate]);

  if (!id) return null;

  return (
    <SessionProvider id={id}>
      <SessionDetailViewInner id={id} scrollToMsg={scrollToMsg} />
    </SessionProvider>
  );
}

function SessionDetailViewInner({
  id,
  scrollToMsg,
}: {
  id: string;
  scrollToMsg: string | null;
}) {
  const navigate = useNavigate();
  const { goBack } = useDetailNav("/sessions");
  const {
    summary,
    messages,
    turns,
    activeTurnIndex,
    setActiveTurnIndex,
    scrollToMessage,
    turnPanelWidth,
    turnPanelCollapsed,
    toggleTurnPanel,
    onTurnPanelResizeStart,
    onTurnPanelResizeDoubleClick,
    rightPanelOpen,
    toggleRightPanel,
    rightPanelWidth,
    onRightPanelResizeStart,
    onRightPanelResizeDoubleClick,
  } = useSession();

  const { search: { filtered } } = useSession();

  const onSelectTurn = useCallback(
    (turn: TurnEntry) => {
      setActiveTurnIndex(turn.index);

      // Try the user message first. If it's not in the filtered list
      // (e.g. user role is hidden), scan from the turn's start position
      // in the original messages to find the nearest visible message.
      const filteredIds = new Set(filtered.map((m) => m.id));

      if (turn.userMessage && filteredIds.has(turn.userMessage.id)) {
        scrollToMessage(turn.userMessage.id);
        return;
      }

      // Find the turn's range in original messages: from userMessageIndex
      // to the next turn's userMessageIndex (or end).
      const startIdx = turn.userMessageIndex === -1 ? 0 : turn.userMessageIndex;
      const nextTurn = turns.find((t) => t.index === turn.index + 1);
      const endIdx = nextTurn
        ? nextTurn.userMessageIndex === -1 ? 0 : nextTurn.userMessageIndex
        : messages.length;

      for (let i = startIdx; i < endIdx; i++) {
        if (filteredIds.has(messages[i]!.id)) {
          scrollToMessage(messages[i]!.id);
          return;
        }
      }

      // Last resort: scroll to whatever is first visible
      if (filtered.length > 0) {
        scrollToMessage(filtered[0]!.id);
      }
    },
    [messages, turns, filtered, setActiveTurnIndex, scrollToMessage],
  );

  // Delete flow
  const [confirm, setConfirm] = useState<{ cascadeIds: string[] } | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const requestDelete = async () => {
    if (!summary) return;
    setConfirm({ cascadeIds: [] });
  };

  const performDelete = async () => {
    if (!summary || deleting) return;
    setDeleting(true);
    try {
      await api.sessionsTrash([summary.filePath]);
      emitAppEvent("sessions:changed");
      navigate("/sessions");
    } finally {
      setDeleting(false);
      setConfirm(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <PageHeader
        summary={summary}
        onBack={goBack}
        onDelete={requestDelete}
        onToggleRight={toggleRightPanel}
        rightOpen={rightPanelOpen}
      />

      <div className="flex min-h-0 flex-1">
        {/* Left: turns (resizable + collapsible) */}
        {turnPanelCollapsed ? (
          <MiniTurnRail
            turns={turns}
            activeTurnIndex={activeTurnIndex}
            onSelectTurn={onSelectTurn}
            onExpand={toggleTurnPanel}
          />
        ) : (
          <>
            <div
              className="shrink-0 overflow-hidden"
              style={{ width: `${turnPanelWidth}px` }}
            >
              <TurnSidebar
                turns={turns}
                activeTurnIndex={activeTurnIndex}
                onSelectTurn={onSelectTurn}
                onCollapse={toggleTurnPanel}
              />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={onTurnPanelResizeStart}
              onDoubleClick={onTurnPanelResizeDoubleClick}
              className="group/handle relative w-px shrink-0 cursor-col-resize bg-border hover:bg-accent"
              title="拖动调整宽度，双击复位"
            >
              <span className="absolute inset-y-0 -left-1 -right-1" />
            </div>
          </>
        )}

        {/* Center: SessionDetail (with ChatInput at bottom) */}
        <div className="flex min-w-0 flex-1 flex-col">
          <SessionDetail
            id={id}
            hideHeader
            scrollToMessageId={scrollToMsg}
            onTrash={requestDelete}
          />
        </div>

        {/* Right sidebar (resizable) */}
        {rightPanelOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={onRightPanelResizeStart}
              onDoubleClick={onRightPanelResizeDoubleClick}
              className="group/handle relative w-px shrink-0 cursor-col-resize bg-border hover:bg-accent"
              title="拖动调整宽度，双击复位"
            >
              <span className="absolute inset-y-0 -left-1 -right-1" />
            </div>
            <aside
              className="shrink-0 overflow-hidden bg-sidebar"
              style={{ width: `${rightPanelWidth}px` }}
            >
              <RightSidebar
                summary={summary}
                messages={messages}
                turns={turns}
                activeTurnIndex={activeTurnIndex}
                onScrollToMessage={scrollToMessage}
              />
            </aside>
          </>
        )}
      </div>

      {/* Delete confirm */}
      {confirm && summary && (
        <ConfirmDialog
          open
          title="移到回收站"
          description={
            <p>把这个会话移到回收站？回收站保留 30 天，期间可恢复。</p>
          }
          tone="default"
          loading={deleting}
          onClose={() => setConfirm(null)}
          onConfirm={performDelete}
        />
      )}
    </div>
  );
}

function PageHeader({
  summary,
  onBack,
  onDelete,
  onToggleRight,
  rightOpen,
}: {
  summary: SessionSummary | undefined;
  onBack: () => void;
  onDelete: () => void;
  onToggleRight: () => void;
  rightOpen: boolean;
}) {
  if (!summary) {
    return (
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-3 text-sm text-muted-foreground">
        <button
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-fg"
        >
          <ArrowLeft className="size-4" />
        </button>
        加载中…
      </header>
    );
  }
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-2.5">
      <button
        onClick={onBack}
        title="返回会话列表"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-fg"
      >
        <ArrowLeft className="size-4" />
      </button>
      <span
        className={cn(
          "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset font-medium",
          sourceColor(summary.source),
        )}
      >
        {describeSessionSource(summary.source)}
      </span>
      <h1
        className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-fg"
        title={summary.title}
      >
        {cleanupPromptPreview(summary.title, 200) || "(无标题)"}
      </h1>
      <div
        className="hidden shrink-0 items-baseline gap-1.5 text-[11px] text-muted-foreground md:inline-flex"
        title={[
          summary.startedAt &&
            `创建 ${new Date(summary.startedAt).toLocaleString()}`,
          `最后 ${new Date(summary.lastActivity || "").toLocaleString()}`,
        ]
          .filter(Boolean)
          .join("\n")}
      >
        {summary.startedAt && (
          <>
            <span className="text-muted-foreground/80">创建</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {formatAbsolute(summary.startedAt)}
            </span>
            <span className="text-muted-foreground/40">·</span>
          </>
        )}
        <span className="text-muted-foreground/80">最后</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {formatAbsolute(summary.lastActivity)}
        </span>
        <span className="text-muted-foreground/60">
          ({formatRelative(summary.lastActivity)})
        </span>
      </div>
      <ResumeMenu session={summary} compact />
      <a
        href={api.sessionExportUrl(summary.id)}
        target="_blank"
        rel="noreferrer"
        title="导出 .md"
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-fg"
      >
        <Download className="size-3" />
      </a>
      <button
        onClick={onDelete}
        title="移到回收站"
        className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/10"
      >
        <Trash2 className="size-3" />
      </button>
      <button
        onClick={onToggleRight}
        title={rightOpen ? "收起右侧栏" : "展开右侧栏"}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-fg"
      >
        {rightOpen ? (
          <PanelRightClose className="size-3" />
        ) : (
          <PanelRightOpen className="size-3" />
        )}
      </button>
    </header>
  );
}
