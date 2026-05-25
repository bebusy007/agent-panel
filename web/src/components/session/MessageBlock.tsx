import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, Star } from 'lucide-react';
import { cn, copyToClipboard, formatTimestamp } from '@/lib/utils';
import { highlightJsx } from '@/lib/highlight';
import { getRoleTheme } from '@/lib/role-theme';
import { CollapsibleBody } from './CollapsibleBody';
import { MarkdownWithHighlight } from './MarkdownWithHighlight';
import { ImageThumbnailStrip } from './ImageThumbnailStrip';
import type { Message } from '@/lib/api';
import { IdBadge, entryUuid } from '@/components/tool-cards/IdBadge';
import { detectXmlTag, parseXmlTag } from '@/lib/xml-tag-parser';
import { xmlTagRegistry, resolveDisplay } from '@/lib/xml-tag-registry';
import { SystemXmlBlock } from './SystemXmlBlock';
import {
  COPY_FEEDBACK_MS,
  LONG_MESSAGE_LINE_THRESHOLD,
  LONG_MESSAGE_CHAR_THRESHOLD,
  CHAR_PER_HUNDRED,
  TOOL_INPUT_PREVIEW_LEN,
} from '@/lib/constants';

interface Props {
  m: Message;
  sessionId: string;
  expanded: boolean;
  searchActive: boolean;
  onToggle: () => void;
  highlight?: string;
  favorited: boolean;
  onToggleFav: () => void;
}

export function MessageBlock({
  m,
  sessionId,
  expanded,
  searchActive,
  onToggle,
  highlight,
  favorited,
  onToggleFav,
}: Props) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const text = m.text || m.toolOutput || '';
    if (!text) return;
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  const theme = getRoleTheme(m.role);
  const RoleIcon = theme.icon;
  const isFold = m.role === 'tool_use' || m.role === 'tool_result';
  const xmlTag = detectXmlTag(m.text || '');
  const xmlConfig = xmlTag ? xmlTagRegistry[xmlTag] : undefined;
  const xmlParsed = xmlTag ? parseXmlTag(m.text || '') : null;
  const xmlDisplay = xmlConfig && xmlParsed ? resolveDisplay(xmlConfig, xmlParsed.attrs) : null;
  const XmlIcon = xmlConfig?.icon;

  const bodyText = m.text || '';
  const lineCount = bodyText ? bodyText.split('\n').length : 0;
  const isAssistantOrUser =
    m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'meta';
  const longThreshold =
    lineCount > LONG_MESSAGE_LINE_THRESHOLD || bodyText.length > LONG_MESSAGE_CHAR_THRESHOLD;
  const longMode = isAssistantOrUser && longThreshold && !searchActive;
  const longExpanded = expanded;

  const showBody = !isFold || expanded || searchActive;
  const canToggle = isFold || longMode;

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-l-2 px-3.5 py-2.5',
        theme.bgCard,
        theme.borderCard,
        theme.borderLeft,
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onClick={onToggle}
          disabled={!canToggle}
          className={cn(
            'text-[11px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1',
            canToggle ? 'hover:bg-secondary cursor-pointer' : 'cursor-default',
            theme.color,
          )}
        >
          {canToggle &&
            (isFold ? (
              showBody
            ) : longExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            ))}
          <RoleIcon className="size-3" />
          {theme.label}
          {m.toolName && (
            <span className="font-mono normal-case ml-1 text-muted-foreground">{m.toolName}</span>
          )}
          {longMode && (
            <span className="ml-1 rounded bg-secondary px-1 py-px text-[9px] font-normal tabular-nums text-muted-foreground">
              {lineCount > LONG_MESSAGE_LINE_THRESHOLD
                ? `${lineCount}行`
                : `${Math.ceil(bodyText.length / CHAR_PER_HUNDRED)}百字`}
            </span>
          )}
        </button>
        {xmlDisplay &&
          XmlIcon &&
          xmlConfig?.showHeaderBadge !== false &&
          (() => {
            const c = xmlDisplay.color;
            return (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border',
                  c === 'blue' && 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                  c === 'amber' && 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                  c === 'cyan' && 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
                  c === 'green' && 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                )}
              >
                <XmlIcon className="size-3" />
                {xmlDisplay.name}
              </span>
            );
          })()}
        <IdBadge entries={[{ key: 'uuid', value: entryUuid(m.id) }]} />
        <span className="ml-auto" />
        <button
          onClick={onToggleFav}
          className={cn(
            'shrink-0 transition-all',
            favorited
              ? 'text-amber-400 hover:text-amber-300'
              : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-amber-400',
          )}
          title={favorited ? '取消收藏' : '收藏'}
        >
          <Star className={cn('size-3.5', favorited && 'fill-current')} />
        </button>
        <button
          onClick={handleCopy}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-fg transition-opacity"
          title="复制全文"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </button>
        {m.timestamp && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatTimestamp(m.timestamp)}
          </span>
        )}
      </div>
      {showBody && (
        <>
          {m.role === 'assistant' && m.text ? (
            <CollapsibleBody longMode={longMode} expanded={longExpanded} onExpand={onToggle}>
              <MarkdownWithHighlight text={m.text} highlight={highlight} />
            </CollapsibleBody>
          ) : m.role === 'tool_use' ? (
            <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto bg-background rounded p-2 border border-border">
              {highlight
                ? highlightJsx(JSON.stringify(m.toolInput, null, 2), highlight)
                : JSON.stringify(m.toolInput, null, 2)}
            </pre>
          ) : m.role === 'tool_result' ? (
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto bg-background rounded p-2 border border-border max-h-96 overflow-y-auto">
              {highlight
                ? highlightJsx(m.toolOutput || m.text || '', highlight)
                : m.toolOutput || m.text || ''}
            </pre>
          ) : xmlTag ? (
            <SystemXmlBlock text={m.text || ''} highlight={highlight} />
          ) : (
            <CollapsibleBody longMode={longMode} expanded={longExpanded} onExpand={onToggle}>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {highlight ? highlightJsx(m.text || '', highlight) : m.text}
              </div>
            </CollapsibleBody>
          )}
        </>
      )}
      {(m.images?.length ?? 0) > 0 && <ImageThumbnailStrip sessionId={sessionId} message={m} />}
      {!showBody && (
        <div className="text-[11px] text-muted-foreground line-clamp-1">
          {highlight
            ? highlightJsx(
                m.text ||
                  m.toolOutput ||
                  (m.toolInput ? JSON.stringify(m.toolInput).slice(0, TOOL_INPUT_PREVIEW_LEN) : ''),
                highlight,
              )
            : m.text ||
              m.toolOutput ||
              (m.toolInput ? JSON.stringify(m.toolInput).slice(0, TOOL_INPUT_PREVIEW_LEN) : '')}
        </div>
      )}
    </div>
  );
}
