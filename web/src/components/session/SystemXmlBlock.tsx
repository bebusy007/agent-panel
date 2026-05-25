import { useState } from 'react';
import { cn, copyToClipboard } from '@/lib/utils';
import { parseXmlTag, type ParsedXmlBlock } from '@/lib/xml-tag-parser';
import { xmlTagRegistry, resolveDisplay, type XmlTagConfig } from '@/lib/xml-tag-registry';
import { MarkdownWithHighlight } from './MarkdownWithHighlight';
import { COPY_FEEDBACK_MS } from '@/lib/constants';
import { Check, Copy, ChevronDown, ChevronRight, Clock } from 'lucide-react';

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badgeBg: string }> = {
  blue: {
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    badgeBg: 'bg-blue-500/15',
  },
  amber: {
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    badgeBg: 'bg-amber-500/15',
  },
  cyan: {
    bg: 'bg-cyan-500/5',
    border: 'border-cyan-500/20',
    text: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/15',
  },
  green: {
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/15',
  },
};

function MetaPill({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > 16 ? value.slice(0, 14) + '…' : value;
  return (
    <button
      title={`${label}:${value}`}
      onClick={() => {
        copyToClipboard(`${label}:${value}`);
        setCopied(true);
        setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
      }}
      className="inline-flex items-center gap-0.5 rounded border border-border/50 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-border hover:text-fg"
    >
      <span className="opacity-60">{label}:</span>
      <span className="max-w-[100px] truncate">{short}</span>
      {copied ? (
        <Check className="ml-0.5 size-2.5 text-emerald-400" />
      ) : (
        <Copy className="ml-0.5 size-2.5 opacity-30" />
      )}
    </button>
  );
}

function parseUsage(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*<([\w_]+)>(.*?)<\/\1>/);
    if (m) {
      result[m[1]] = m[2].trim();
      continue;
    }
    const kv = line.match(/^\s*([\w_]+):\s*(.+)/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

function UsageStats({ text }: { text: string }) {
  const stats = parseUsage(text);
  if (Object.keys(stats).length === 0) return null;
  const items: string[] = [];
  if (stats.total_tokens) items.push(`tokens: ${stats.total_tokens}`);
  if (stats.tool_uses) items.push(`tools: ${stats.tool_uses}`);
  if (stats.duration_ms) {
    const sec = (parseInt(stats.duration_ms, 10) / 1000).toFixed(1);
    items.push(`耗时: ${sec}s`);
  }
  if (items.length === 0) return null;
  return (
    <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/30">
      {items.join(' · ')}
    </div>
  );
}

function MarkdownSection({
  label,
  content,
  highlight,
}: {
  label: string;
  content: string;
  highlight?: string;
}) {
  const [open, setOpen] = useState(content.length < 500);
  return (
    <div className="px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-fg"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {label}
      </button>
      {open && (
        <div className="text-sm">
          <MarkdownWithHighlight text={content} highlight={highlight} />
        </div>
      )}
    </div>
  );
}

function SingleBlock({
  block,
  config,
  highlight,
}: {
  block: ParsedXmlBlock;
  config: XmlTagConfig;
  highlight?: string;
}) {
  const { name, color: resolvedColor } = resolveDisplay(config, block.attrs);
  const palette = COLOR_MAP[resolvedColor] ?? COLOR_MAP.blue;
  const Icon = config.icon;
  const sectionMap = new Map(block.sections.map((s) => [s.tag, s.content]));

  const attrItems = (config.attrFields ?? [])
    .map((f) => ({ label: f, value: block.attrs[f] }))
    .filter((x): x is { label: string; value: string } => !!x.value);

  const metaItems = [
    ...attrItems,
    ...config.metaFields
      .map((f) => ({ label: f, value: sectionMap.get(f) }))
      .filter((x): x is { label: string; value: string } => !!x.value),
  ];

  const mdItems = config.markdownFields
    .map((f) => ({ label: f, content: sectionMap.get(f) }))
    .filter((x): x is { label: string; content: string } => !!x.content);

  const statsItems = config.statsFields
    .map((f) => sectionMap.get(f))
    .filter((x): x is string => !!x);

  const plainTexts = block.sections.filter((s) => s.tag === '__text__').map((s) => s.content);

  const hasNoSubTags = config.markdownFields.length === 0;

  return (
    <div className={cn('rounded-md border overflow-hidden', palette.border, palette.bg)}>
      <div className={cn('flex items-center gap-2 px-3 py-1.5 border-b', palette.border)}>
        <Icon className={cn('size-3', palette.text)} />
        <span className={cn('text-[11px] font-medium', palette.text)}>{name}</span>
      </div>

      {metaItems.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border/20">
          {metaItems.map((item) => (
            <MetaPill key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      )}

      {hasNoSubTags && plainTexts.length > 0 && (
        <div className="px-3 py-2 text-sm">
          {plainTexts.map((txt, i) => (
            <PlainTextOrJson key={i} text={txt} highlight={highlight} />
          ))}
        </div>
      )}

      {mdItems.map((item) => (
        <MarkdownSection
          key={item.label}
          label={item.label}
          content={item.content}
          highlight={highlight}
        />
      ))}

      {statsItems.map((s, i) => (
        <UsageStats key={i} text={s} />
      ))}
    </div>
  );
}

/** Render plain text sections: detect JSON events for special rendering. */
function PlainTextOrJson({ text, highlight }: { text: string; highlight?: string }) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        const eventType = parsed.type as string;
        if (eventType === 'idle_notification') {
          return (
            <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Clock className="size-3" /> 空闲中
            </div>
          );
        }
        if (eventType === 'teammate_terminated') {
          return (
            <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Clock className="size-3" /> 已退出
            </div>
          );
        }
        if (eventType === 'shutdown_approved') {
          return (
            <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Clock className="size-3" /> 已关闭
            </div>
          );
        }
        if (eventType === 'task_assignment') {
          const subject = parsed.subject ?? parsed.task?.subject ?? '';
          const assignee = parsed.assignee ?? parsed.task?.assignee ?? '';
          return (
            <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
              <div className="text-[11px] font-medium text-fg">{subject || 'Task Assignment'}</div>
              {assignee && (
                <div className="mt-0.5 text-[10px] text-muted-foreground">assignee: {assignee}</div>
              )}
            </div>
          );
        }
      }
      // Generic JSON — formatted code block
      return (
        <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      // Not valid JSON, fall through to markdown
    }
  }
  return <MarkdownWithHighlight text={text} highlight={highlight} />;
}

export function SystemXmlBlock({ text, highlight }: { text: string; highlight?: string }) {
  const parsed = parseXmlTag(text);
  if (!parsed) return <pre className="whitespace-pre-wrap text-sm">{text}</pre>;

  const config = xmlTagRegistry[parsed.tagName];
  if (!config) return <pre className="whitespace-pre-wrap text-sm">{text}</pre>;

  if (parsed.blocks.length <= 1) {
    return <SingleBlock block={parsed.blocks[0]} config={config} highlight={highlight} />;
  }

  return (
    <div className="space-y-2">
      {parsed.blocks.map((block, i) => (
        <SingleBlock key={i} block={block} config={config} highlight={highlight} />
      ))}
    </div>
  );
}
