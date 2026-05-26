import type { SessionSummary } from '@/lib/api';
import { cleanupPromptPreview } from '@/lib/text-cleanup';
import {
  COPY_FEEDBACK_MS,
  TITLE_PREVIEW_MAX_LEN,
  FIRST_MSG_PREVIEW_MAX_LEN,
} from '@/lib/constants';
import {
  Copy,
  FolderGit2,
  Hash,
  Clock,
  MoreVertical,
  Eye,
  EyeOff,
  Trash2,
  Check,
  Zap,
  Radio,
} from 'lucide-react';
import {
  cn,
  copyToClipboard,
  describeSessionSource,
  formatRelative,
  formatTokens,
  sourceColor,
} from '@/lib/utils';
import { highlightJsx } from '@/lib/highlight';
import { ResumeMenu } from './ResumeMenu';
import { useEffect, useRef, useState } from 'react';

interface SessionItemProps {
  session: SessionSummary;
  selected: boolean;
  onSelect: (id: string, mode: 'click' | 'checkbox') => void;
  selectionMode: boolean;
  onToggleCheckbox: (id: string) => void;
  active?: boolean;
  onAction: (action: 'hide' | 'show' | 'trash' | 'restore' | 'permanent') => void;
  highlight?: string;
}

export function SessionItem({
  session,
  selected,
  onSelect,
  selectionMode,
  onToggleCheckbox,
  active,
  onAction,
  highlight,
}: SessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleCopyCwd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session.cwd) return;
    await copyToClipboard(session.cwd);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div
      onClick={() => onSelect(session.id, 'click')}
      className={cn(
        'group relative flex items-stretch gap-3 rounded-lg border bg-card px-4 py-3 cursor-pointer transition-all',
        active ? 'border-2 border-primary' : 'border-border hover:shadow-e2',
        selected && 'border-primary bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]',
        false && 'opacity-50',
      )}
    >
      {selectionMode && (
        <div
          className="flex items-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheckbox(session.id);
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleCheckbox(session.id)}
            onClick={(e) => e.stopPropagation()}
            className="size-4 accent-[var(--primary)] cursor-pointer"
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ring-1 ring-inset font-medium',
              sourceColor(session.source),
            )}
          >
            {describeSessionSource(session.source)}
          </span>
          {false && (
            <span
              title="此会话最近 5 分钟内有写入，可能正在运行 — 删除前请确认"
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
            >
              <Radio className="size-2.5 animate-pulse" />
              实时
            </span>
          )}
          {(() => {
            // Cursor wraps every user prompt in <user_query>…</user_query>;
            // Claude Code's slash commands wrap in <command-message>… —
            // strip the shell so cards show the real first line.
            const displayTitle =
              cleanupPromptPreview(session.title, TITLE_PREVIEW_MAX_LEN) || '(无标题)';
            return (
              <h3
                className="text-sm font-medium tracking-tight truncate flex-1"
                title={session.title}
              >
                {highlight ? highlightJsx(displayTitle, highlight) : displayTitle}
              </h3>
            );
          })()}
        </div>

        {session.cwd && (
          <div
            className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground group/cwd"
            title={session.cwd}
          >
            <FolderGit2 className="size-3 text-muted-foreground shrink-0" />
            <span className="truncate">
              {session.cwd?.replace(/^\/Users\/[^\/]+/, '~') || session.cwd}
            </span>
            {session.gitBranch && (
              <span className="text-muted-foreground truncate">@ {session.gitBranch}</span>
            )}
            <button
              onClick={handleCopyCwd}
              className="opacity-0 group-hover/cwd:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
              title="复制 cwd"
            >
              {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            </button>
          </div>
        )}

        {session.firstUserMessage &&
          (() => {
            const cleaned = cleanupPromptPreview(
              session.firstUserMessage,
              FIRST_MSG_PREVIEW_MAX_LEN,
            );
            if (!cleaned) return null;
            return (
              <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                {highlight ? highlightJsx(cleaned, highlight) : cleaned}
              </p>
            );
          })()}

        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3" /> {session.messageCount}
          </span>
          {typeof session.tokensTotal === 'number' && (
            <span
              className="inline-flex items-center gap-1"
              title={`${session.tokensTotal.toLocaleString()} tokens (input + output + cache)`}
            >
              <Zap className="size-3" /> {formatTokens(session.tokensTotal)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {formatRelative(session.lastActivity)}
          </span>
          {session.model && <span className="font-mono">{session.model}</span>}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <ResumeMenu session={session} compact />
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="更多"
          >
            <MoreVertical className="size-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-40 rounded-md border border-border bg-popover shadow-lg z-20 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {!false ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onAction(false ? 'show' : 'hide');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary"
                  >
                    {false ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    {false ? '取消隐藏' : '隐藏'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onAction('trash');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-red-300 hover:bg-secondary"
                  >
                    <Trash2 className="size-3.5" />
                    移到回收站
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onAction('restore');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-secondary"
                  >
                    <Eye className="size-3.5" />
                    恢复
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onAction('permanent');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left text-red-300 hover:bg-secondary"
                  >
                    <Trash2 className="size-3.5" />
                    永久删除
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
