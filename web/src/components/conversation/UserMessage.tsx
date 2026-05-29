import { useState } from 'react';
import { Copy, Check, Star, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, copyToClipboard, roleColor } from '@/lib/utils';
import { highlightJsx } from '@/lib/highlight';
import { CollapsibleBody } from '@/components/session/CollapsibleBody';
import type { AdaptedTimelineEntry } from '@/lib/conversation/history-adapter';
import {
  COPY_FEEDBACK_MS,
  LONG_MESSAGE_LINE_THRESHOLD,
  LONG_MESSAGE_CHAR_THRESHOLD,
} from '@/lib/constants';

interface UserMessageProps {
  entry: AdaptedTimelineEntry;
  expanded: boolean;
  onToggle: () => void;
  highlight?: string;
  favorited: boolean;
  onToggleFav: () => void;
  timestamp?: string;
}

export function UserMessage({
  entry,
  expanded,
  onToggle,
  highlight,
  favorited,
  onToggleFav,
  timestamp,
}: UserMessageProps) {
  const [copied, setCopied] = useState(false);
  const text = entry.text ?? '';
  const lineCount = text ? text.split('\n').length : 0;
  const longMode =
    lineCount > LONG_MESSAGE_LINE_THRESHOLD || text.length > LONG_MESSAGE_CHAR_THRESHOLD;
  const ts = timestamp ?? entry.timestamp;

  const handleCopy = () => {
    if (!text) return;
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div className={cn('group relative rounded-lg border p-3', roleColor('user'))}>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={onToggle}
          disabled={!longMode}
          className={cn(
            'text-[11px] uppercase tracking-wider font-medium px-2 py-1 rounded inline-flex items-center gap-2',
            longMode
              ? 'hover:bg-secondary cursor-pointer text-muted-foreground'
              : 'cursor-default text-muted-foreground',
          )}
        >
          {longMode &&
            (expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)}
          User
        </button>
        {ts && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date(ts).toLocaleString()}
          </span>
        )}
        <button
          onClick={onToggleFav}
          className={cn(
            'transition-all',
            favorited
              ? 'text-[var(--warning)] hover:text-[var(--warning)]'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-muted-foreground hover:text-[var(--warning)]',
          )}
          title={favorited ? '取消收藏' : '收藏'}
          aria-label={favorited ? '取消收藏' : '收藏'}
        >
          <Star className={cn('size-3.5', favorited && 'fill-current')} />
        </button>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-muted-foreground hover:text-muted-foreground transition-opacity"
          title="复制全文"
          aria-label="复制全文"
        >
          {copied ? (
            <Check className="size-3 text-[var(--primary)]" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
      </div>
      <CollapsibleBody longMode={longMode} expanded={expanded} onExpand={onToggle}>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {highlight ? highlightJsx(text, highlight) : text}
        </div>
      </CollapsibleBody>
    </div>
  );
}
