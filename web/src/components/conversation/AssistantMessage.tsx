import { useState } from 'react';
import { Copy, Check, Star, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn, copyToClipboard, roleColor } from '@/lib/utils';
import { highlightJsx } from '@/lib/highlight';
import { CollapsibleBody } from '@/components/session/CollapsibleBody';
import type { AdaptedTimelineEntry } from '@/lib/conversation/history-adapter';
import {
  COPY_FEEDBACK_MS,
  LONG_MESSAGE_LINE_THRESHOLD,
  LONG_MESSAGE_CHAR_THRESHOLD,
} from '@/lib/constants';

interface AssistantMessageProps {
  entry: AdaptedTimelineEntry;
  expanded: boolean;
  onToggle: () => void;
  highlight?: string;
  favorited: boolean;
  onToggleFav: () => void;
  timestamp?: string;
}

export function AssistantMessage({
  entry,
  expanded,
  onToggle,
  highlight,
  favorited,
  onToggleFav,
  timestamp,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const text = entry.text ?? '';
  const thinkingText = entry.thinkingText;
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

  const costStr = entry.costUsd != null ? `$${Number(entry.costUsd).toFixed(4)}` : undefined;

  const tokenStr = entry.usage
    ? `${entry.usage.inputTokens}↓ / ${entry.usage.outputTokens}↑`
    : undefined;

  return (
    <div className={cn('group relative rounded-lg border p-3', roleColor('assistant'))}>
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
          Assistant
          {entry.model && (
            <span className="font-mono normal-case ml-1 text-muted-foreground">
              {entry.model.split('-').slice(-1)[0]}
            </span>
          )}
          {entry.stopReason && entry.stopReason !== 'end_turn' && (
            <span className="ml-1 rounded bg-secondary px-1 py-px text-[9px] font-normal text-muted-foreground">
              {entry.stopReason}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1.5 ml-auto">
          {costStr && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{costStr}</span>
          )}
          {tokenStr && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{tokenStr}</span>
          )}
          {ts && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(ts).toLocaleString()}
            </span>
          )}
        </div>
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

      {/* Thinking panel */}
      {thinkingText && (
        <div className="mb-2">
          <button
            onClick={() => setThinkingOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-muted-foreground mb-1"
          >
            {thinkingOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            Thinking
            {entry.durationMs != null && (
              <span className="tabular-nums text-muted-foreground ml-1">
                ({(entry.durationMs / 1000).toFixed(1)}s)
              </span>
            )}
          </button>
          {thinkingOpen && (
            <div className="text-[12px] font-mono text-muted-foreground whitespace-pre-wrap bg-background rounded p-2 border border-border max-h-60 overflow-y-auto">
              {thinkingText}
            </div>
          )}
        </div>
      )}

      {/* Main text */}
      <CollapsibleBody longMode={longMode} expanded={expanded} onExpand={onToggle}>
        {highlight ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {highlightJsx(text, highlight)}
          </div>
        ) : (
          <div className="md-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {text}
            </ReactMarkdown>
          </div>
        )}
      </CollapsibleBody>
    </div>
  );
}
