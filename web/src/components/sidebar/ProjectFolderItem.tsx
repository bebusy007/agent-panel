import { useLocation } from 'react-router-dom';
import { useOverlayNavigate } from '@/lib/use-detail-nav';
// useLocation is used inside ConversationRow below.
import type { SessionSource } from '@/lib/api';
import { ChevronRight, Folder, FolderOpen, X, Pin, PinOff } from 'lucide-react';
import { cn, describeSessionSource, formatSmartTime } from '@/lib/utils';
import { FALLBACK_SOURCE_RANK } from '@/lib/constants';
import type { ConversationGroup, ProjectFolder } from '@/lib/sidebar-groups';

interface Props {
  folder: ProjectFolder;
  expanded: boolean;
  onToggle: () => void;
  pinned: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onRemove: () => void;
  /** Currently active conversation id (for highlight). */
  activeSessionId?: string;
  highlight?: string;
}

export function ProjectFolderItem({
  folder,
  expanded,
  onToggle,
  pinned,
  onPin,
  onUnpin,
  onRemove,
  activeSessionId,
  highlight,
}: Props) {
  return (
    <div className="select-none">
      {/* Folder header row */}
      <div className="group/folder relative flex items-center">
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-1 truncate rounded px-1.5 py-1 pr-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-fg"
          title={folder.cwd || '未分类'}
        >
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
          {expanded ? (
            <FolderOpen className="size-3.5 shrink-0 text-amber-400/80" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-amber-400/70" />
          )}
          <span className="min-w-0 flex-1 truncate">{folder.label}</span>
          {folder.isRunning && (
            <span
              title="此项目下有会话正在运行"
              className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)] animate-pulse"
            />
          )}
          <span className="shrink-0 min-w-[36px] text-right text-[10px] tabular-nums text-muted-foreground">
            <span className="inline-flex items-center justify-center rounded-full bg-secondary px-1.5 py-px">
              {folder.conversationCount}
            </span>
          </span>
        </button>
        {!folder.isUncategorized && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex shrink-0 items-center opacity-0 transition-opacity group-hover/folder:opacity-100 bg-secondary rounded">
            {pinned ? (
              <button
                onClick={onUnpin}
                title="取消置顶"
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-muted-foreground"
              >
                <PinOff className="size-3" />
              </button>
            ) : (
              <button
                onClick={onPin}
                title="置顶项目"
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-muted-foreground"
              >
                <Pin className="size-3" />
              </button>
            )}
            <button
              onClick={onRemove}
              title="从侧栏移除（可通过项目内的会话再次添加）"
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-red-300"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>
      {/* Conversations */}
      {expanded && folder.conversations.length > 0 && (
        <div className="ml-3 border-l border-border/60">
          {folder.conversations.map((conv) => (
            <ConversationRow
              key={conv.groupKey}
              conv={conv}
              active={!!activeSessionId && conv.sessions.some((s) => s.id === activeSessionId)}
              highlight={highlight}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  highlight,
}: {
  conv: ConversationGroup;
  active: boolean;
  highlight?: string;
}) {
  const location = useLocation();
  const openOverlay = useOverlayNavigate();
  const onClick = () => {
    // Open the session detail as an overlay. When the sidebar is
    // already on top of an open detail, useOverlayNavigate will
    // reuse the original background and replace history — so one
    // browser back returns to the list, not to the previous
    // session's detail.
    const target = `/sessions/${encodeURIComponent(conv.latestSession.id)}`;
    if (location.pathname === target) return;
    openOverlay(target);
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 truncate rounded-r px-2 py-1 text-left text-xs transition-colors',
        active ? 'bg-accent/15 text-fg' : 'text-muted-foreground hover:bg-secondary hover:text-fg',
      )}
      title={`${conv.title} · ${describeSessionSource(conv.latestSession.source)}`}
    >
      {conv.isRunning && (
        <span
          title="正在运行"
          className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)] animate-pulse"
        />
      )}
      {/* Source mini-icon: 2-letter monogram in source-tinted chip so the
       *  user can tell CC vs Cursor agent vs Codex etc. at a glance from
       *  the sidebar without opening the conversation. */}
      <SourceMonogram sources={conversationSources(conv.sessions)} />
      <span className="min-w-0 flex-1 truncate">
        {highlight ? <Highlighted text={conv.title} term={highlight} /> : conv.title}
      </span>
      {/* Last-activity timestamp in compact smart format so the
       *  user can locate "the conversation I had this afternoon"
       *  without opening it. Sits before the favorite star so the
       *  star always lands at the same x position regardless of
       *  whether a timestamp is shown. */}
      <span
        className="shrink-0 min-w-[36px] text-right font-mono text-[10px] tabular-nums text-muted-foreground"
        title={new Date(conv.latestSession.lastActivity || Date.now()).toLocaleString()}
      >
        {formatSmartTime(conv.latestSession.lastActivity)}
      </span>
      {conv.hasFavorite && (
        <span title="已收藏">
          <span className="text-amber-400">★</span>
        </span>
      )}
    </button>
  );
}

// ── Source-monogram chip ──
//
// Two-character abbreviation per source so the sidebar can carry the
// info on a 12px square without crowding the conversation title. Color
// matches the source badge palette used elsewhere on the cards.
const SOURCE_MONOGRAM: Record<SessionSource, { letters: string; cls: string }> = {
  'claude-code': { letters: 'CC', cls: 'bg-orange-500/20 text-orange-300' },
  'claude-history': { letters: 'CH', cls: 'bg-amber-500/20 text-amber-300' },
  'cursor-agent': { letters: 'CA', cls: 'bg-sky-500/20 text-sky-300' },
  'cursor-composer': { letters: 'Co', cls: 'bg-sky-500/20 text-sky-200' },
  codex: { letters: 'Cx', cls: 'bg-emerald-500/20 text-emerald-300' },
};

function conversationSources(sessions: ConversationGroup['sessions']): SessionSource[] {
  // Same conversation often spans claude-code + claude-history (the same
  // sessionId showing up in both projects/.jsonl and history.jsonl). We
  // surface every source that appears so the chip honestly reflects the
  // mixed origin instead of pretending it's only one.
  const seen = new Set<SessionSource>();
  const out: SessionSource[] = [];
  for (const s of sessions) {
    if (seen.has(s.source)) continue;
    seen.add(s.source);
    out.push(s.source);
  }
  return out;
}

function SourceMonogram({ sources }: { sources: SessionSource[] }) {
  if (sources.length === 0) return null;
  // Show the most distinctive source first when there's a mix; CC wins
  // over CH because the user typically cares about the rich transcript
  // not the prompt-only shadow.
  const ordered = [...sources].sort((a, b) => rank(a) - rank(b));
  return (
    <span className="flex shrink-0 items-center gap-px">
      {ordered.slice(0, 2).map((s) => {
        const m = SOURCE_MONOGRAM[s];
        return (
          <span
            key={s}
            title={describeSessionSource(s)}
            className={cn(
              'inline-flex h-3.5 min-w-[16px] items-center justify-center rounded px-0.5 text-[9px] font-semibold leading-none',
              m.cls,
            )}
          >
            {m.letters}
          </span>
        );
      })}
    </span>
  );
}

function rank(s: SessionSource): number {
  // Lower = shows first.
  switch (s) {
    case 'claude-code':
      return 0;
    case 'cursor-agent':
      return 1;
    case 'codex':
      return 2;
    case 'cursor-composer':
      return 3;
    case 'claude-history':
      return 4;
  }
  return FALLBACK_SOURCE_RANK;
}

function Highlighted({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const t = term.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(t);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-400/40 px-0.5 text-fg">
        {text.slice(idx, idx + term.length)}
      </mark>
      {text.slice(idx + term.length)}
    </>
  );
}
