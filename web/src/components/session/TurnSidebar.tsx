import { useEffect, useRef, useState } from "react";
import { ChevronRight, AlertTriangle, MessageSquare, Hammer, PanelLeftClose, PanelLeftOpen, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TurnEntry } from "@/lib/turn-grouping";

interface Props {
  turns: TurnEntry[];
  /** Index of the turn whose user message is closest to the current scroll
   *  position (driven by IntersectionObserver in SessionMessageStream). */
  activeTurnIndex: number;
  /** Click handler — caller should `scrollToMessageId(turn.userMessage.id)`. */
  onSelectTurn: (turn: TurnEntry) => void;
  /** Collapse the turn panel. */
  onCollapse?: () => void;
}

export function TurnSidebar({ turns, activeTurnIndex, onSelectTurn, onCollapse }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll the active turn into view when it changes (covers both
  // user clicking on a row and IntersectionObserver moving as the main
  // pane scrolls).
  useEffect(() => {
    if (!activeRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const target = activeRef.current;
    const ct = container.getBoundingClientRect();
    const tt = target.getBoundingClientRect();
    if (tt.top < ct.top || tt.bottom > ct.bottom) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeTurnIndex]);

  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <h3 className="typo-label">轮次</h3>
        <div className="flex items-center gap-1">
          <span className="text-[10px] tabular-nums text-muted-foreground">{turns.length}</span>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="收起轮次面板"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-fg"
            >
              <PanelLeftClose className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto py-1">
        {turns.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">无轮次</div>
        ) : (
          <ol className="space-y-px">
            {turns.map((t) => {
              const active = t.index === activeTurnIndex;
              return (
                <li key={t.index}>
                  <TurnRow
                    turn={t}
                    active={active}
                    btnRef={active ? activeRef : undefined}
                    onClick={() => onSelectTurn(t)}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Collapsed mini rail: only turn numbers ──

interface MiniTurnRailProps {
  turns: TurnEntry[];
  activeTurnIndex: number;
  onSelectTurn: (turn: TurnEntry) => void;
  onExpand: () => void;
}

export function MiniTurnRail({ turns, activeTurnIndex, onSelectTurn, onExpand }: MiniTurnRailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!activeRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const target = activeRef.current;
    const ct = container.getBoundingClientRect();
    const tt = target.getBoundingClientRect();
    if (tt.top < ct.top || tt.bottom > ct.bottom) {
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeTurnIndex]);

  return (
    <div className="flex h-full w-8 flex-col border-r border-border bg-sidebar">
      <div className="shrink-0 border-b border-border py-1.5">
        <button
          onClick={onExpand}
          title="展开轮次面板"
          className="mx-auto flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-fg"
        >
          <PanelLeftOpen className="size-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden py-1 scrollbar-none">
        {turns.map((t) => {
          const active = t.index === activeTurnIndex;
          return (
            <button
              key={t.index}
              ref={active ? activeRef : undefined}
              onClick={() => onSelectTurn(t)}
              title={t.preview || `轮次 ${t.index + 1}`}
              className={cn(
                "mx-auto my-px flex size-5 items-center justify-center rounded text-[10px] font-mono tabular-nums transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-fg",
              )}
            >
              {t.index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TurnRow({
  turn,
  active,
  btnRef,
  onClick,
}: {
  turn: TurnEntry;
  active: boolean;
  btnRef?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  return (
    <button
      ref={btnRef}
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors",
        active
          ? "bg-accent/12 text-fg"
          : "text-muted-foreground hover:bg-secondary hover:text-fg",
      )}
      title={turn.preview || "(空)"}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-mono tabular-nums",
          active
            ? "bg-accent text-accent-foreground"
            : "bg-secondary text-muted-foreground group-hover:text-muted-foreground",
        )}
      >
        {turn.index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 break-words text-xs leading-snug">
          {turn.preview || <span className="italic text-muted-foreground">(空消息)</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5" title="消息数">
            <MessageSquare className="size-2.5" />
            {turn.messageCount}
          </span>
          {turn.toolCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title="工具调用数">
              <Hammer className="size-2.5" />
              {turn.toolCount}
            </span>
          )}
          {turn.subagentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-cyan-400" title={`${turn.subagentCount} 个 Subagent`}>
              <Bot className="size-2.5" />
              {turn.subagentCount}
            </span>
          )}
          {turn.hasError && (
            <span className="inline-flex items-center gap-0.5 text-red-300" title="包含错误">
              <AlertTriangle className="size-2.5" />
            </span>
          )}
        </div>
      </div>
      {active && <ChevronRight className="mt-1 size-3 shrink-0 text-accent" />}
    </button>
  );
}
