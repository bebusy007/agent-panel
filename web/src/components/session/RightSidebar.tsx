import { useEffect, useMemo, useRef, useState } from 'react';
import { Wrench, FileText, Info, Activity } from 'lucide-react';
import { cn, formatBytes, formatTokens, sourceColor, describeSessionSource } from '@/lib/utils';
import { canonicalTool } from '@/lib/tool-aliases';
import { getToolColor } from '@/lib/tool-colors';
import { extractFileEntries, type FileEntry } from '@/lib/file-entries';
import { SESSION_ID_DISPLAY_LEN, RIGHT_SIDEBAR_VALUE_MAX_LEN } from '@/lib/constants';
import type { Message, SessionSummary } from '@/lib/api';
import type { TurnEntry } from '@/lib/turn-grouping';

type TabKey = 'tools' | 'files' | 'info' | 'context';

interface Props {
  summary: SessionSummary | undefined;
  messages: Message[];
  turns: TurnEntry[];
  activeTurnIndex: number;
  onScrollToMessage: (messageId: string) => void;
}

export function RightSidebar({
  summary,
  messages,
  turns,
  activeTurnIndex,
  onScrollToMessage,
}: Props) {
  const [tab, setTab] = useState<TabKey>('tools');
  const fileEntries = useMemo(() => extractFileEntries(messages, turns), [messages, turns]);
  const toolUses = useMemo(() => messages.filter((m) => m.role === 'tool_use'), [messages]);
  const toolResults = useMemo(() => messages.filter((m) => m.role === 'tool_result'), [messages]);

  const tabs: Array<{
    key: TabKey;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    count?: number;
  }> = [
    { key: 'tools', icon: Wrench, label: '工具', count: toolUses.length },
    { key: 'files', icon: FileText, label: '文件', count: fileEntries.length },
    { key: 'info', icon: Info, label: '信息' },
    { key: 'context', icon: Activity, label: '上下文' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={t.label}
              className={cn(
                'relative rounded-md p-1.5 transition-colors',
                tab === t.key
                  ? 'bg-secondary text-fg'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-fg',
              )}
            >
              <t.icon className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      {tab === 'tools' && (
        <ToolsPanel
          toolUses={toolUses}
          toolResults={toolResults}
          onScrollToMessage={onScrollToMessage}
        />
      )}
      {tab === 'files' && (
        <FilesPanel
          entries={fileEntries}
          turns={turns}
          activeTurnIndex={activeTurnIndex}
          onScrollToMessage={onScrollToMessage}
        />
      )}
      {tab === 'info' && (
        <InfoPanel
          summary={summary}
          messages={messages}
          fileEntries={fileEntries}
          toolUses={toolUses}
        />
      )}
      {tab === 'context' && <ContextPanel summary={summary} messages={messages} />}
    </div>
  );
}

// ── Tools tab ──
function ToolsPanel({
  toolUses,
  toolResults,
  onScrollToMessage,
}: {
  toolUses: Message[];
  toolResults: Message[];
  onScrollToMessage: (id: string) => void;
}) {
  // Build a status lookup so we can color the dots according to the matched
  // tool_result's toolStatus when available.
  const resultByToolUseId = useMemo(() => {
    const map = new Map<string, Message>();
    for (const r of toolResults) {
      if (r.toolUseId) map.set(r.toolUseId, r);
    }
    return map;
  }, [toolResults]);

  // Aggregate counts per canonical tool name. Used both for the
  // chip row labels and for resetting the filter when the underlying
  // session data changes.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of toolUses) {
      const name = canonicalTool(t.toolName);
      const display = name === 'Unknown' ? (t.toolName ?? '?') : name;
      c.set(display, (c.get(display) ?? 0) + 1);
    }
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]);
  }, [toolUses]);

  // Filter state — which tool kinds the user wants to see. Default
  // is "all chips selected" so first paint matches what was visible
  // before the chip became interactive. Scope is per-mount (no
  // sessionStorage): RightSidebar is inside SessionDetailView which
  // unmounts when the user closes the overlay, so the filter
  // naturally resets per session.
  const allNames = useMemo(() => counts.map(([n]) => n), [counts]);
  const namesKey = allNames.join('|');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allNames));
  // The first render usually sees `messages = []` and therefore an
  // empty allNames; once the session payload streams in, allNames
  // populates and we need to flip selected to "all of them" so the
  // list isn't blank. Same effect runs if tools appear mid-session.
  // We use namesKey (not allNames) as the dep so the comparison is
  // a string equality instead of reference equality on a new Array.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      const isFirstFill = prev.size === 0;
      for (const n of allNames) {
        if (isFirstFill || prev.has(n)) next.add(n);
        else next.add(n); // brand-new tool kind appeared → default on
      }
      // If everything got pruned (e.g. session changed and no overlap),
      // treat as first-fill again — never let `selected` end up empty.
      if (next.size === 0) for (const n of allNames) next.add(n);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        // Don't allow zero — at least one chip stays on so the list
        // isn't empty (matches the spec).
        if (next.size <= 1) return prev;
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const filteredToolUses = useMemo(() => {
    return toolUses.filter((m) => {
      const canon = canonicalTool(m.toolName);
      const display = canon === 'Unknown' ? (m.toolName ?? '?') : canon;
      return selected.has(display);
    });
  }, [toolUses, selected]);

  if (toolUses.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        本会话无工具调用
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filter chips — clicking toggles inclusion. At least one
       *  must stay selected. Hidden when there's only one tool
       *  type since the filter would be no-op. */}
      {counts.length > 1 && (
        <div className="flex flex-wrap gap-1 overflow-hidden border-b border-border px-2 py-1.5">
          {counts.map(([name, n]) => {
            const on = selected.has(name);
            const tc = getToolColor(name);
            return (
              <button
                key={name}
                onClick={() => toggle(name)}
                title={on ? `隐藏 ${name}` : `显示 ${name}`}
                className={cn(
                  'max-w-[160px] truncate rounded-md border-l-2 px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  on
                    ? [tc.border, tc.text, 'bg-secondary']
                    : 'border-border text-muted-foreground/60 bg-secondary/30 hover:bg-secondary/60',
                )}
              >
                {name} <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {/* List */}
      <div className="flex-1 overflow-y-auto py-0.5">
        {filteredToolUses.map((m) => {
          const canon = canonicalTool(m.toolName);
          const display = canon === 'Unknown' ? (m.toolName ?? '?') : canon;
          const result = m.toolUseId ? resultByToolUseId.get(m.toolUseId) : undefined;
          const status: 'success' | 'error' | 'pending' =
            result?.toolStatus === 'error' ? 'error' : result ? 'success' : 'pending';
          const detail = describeToolDetail(m.toolInput);
          return (
            <button
              key={m.id}
              onClick={() => onScrollToMessage(m.id)}
              className="group flex w-full items-center gap-1.5 px-2.5 py-1 text-left transition-colors hover:bg-secondary/60"
              title={`${display}${detail ? `: ${detail}` : ''}`}
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  status === 'error' && 'bg-red-400',
                  status === 'success' && 'bg-emerald-400',
                  status === 'pending' && 'bg-fg-subtle/60',
                )}
              />
              <span className="shrink-0 max-w-[100px] truncate text-[11px] font-medium text-muted-foreground">
                {display}
              </span>
              {detail && (
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                  {detail}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Files tab ──
function FilesPanel({
  entries,
  turns,
  activeTurnIndex,
  onScrollToMessage,
}: {
  entries: FileEntry[];
  turns: TurnEntry[];
  activeTurnIndex: number;
  onScrollToMessage: (id: string) => void;
}) {
  const activeGroupRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const map = new Map<number, FileEntry[]>();
    for (const e of entries) {
      const ti = e.turnIndex ?? 0;
      let arr = map.get(ti);
      if (!arr) {
        arr = [];
        map.set(ti, arr);
      }
      arr.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [entries]);

  useEffect(() => {
    if (!activeGroupRef.current || !containerRef.current) return;
    const ct = containerRef.current.getBoundingClientRect();
    const tt = activeGroupRef.current.getBoundingClientRect();
    if (tt.top < ct.top || tt.bottom > ct.bottom) {
      activeGroupRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTurnIndex]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        本会话未触及文件
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto py-0.5">
      {groups.map(([turnIdx, files], groupIdx) => {
        const isActive = turnIdx === activeTurnIndex;
        const turn = turns[turnIdx];
        return (
          <div key={turnIdx} ref={isActive ? activeGroupRef : undefined}>
            {groupIdx > 0 && <div className="mx-2.5 border-t border-border" />}
            <button
              onClick={() => {
                if (turn?.userMessage) onScrollToMessage(turn.userMessage.id);
              }}
              className={cn(
                'flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors',
                isActive ? 'bg-accent/10' : 'hover:bg-secondary/40',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-mono tabular-nums',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {turnIdx + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {turn?.preview || `轮次 ${turnIdx + 1}`}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {files.length}
              </span>
            </button>
            {files.map((e, i) => (
              <button
                key={`${e.path}-${i}`}
                onClick={() => {
                  if (e.messageId) onScrollToMessage(e.messageId);
                  else if (e.toolUseId) onScrollToMessage(e.toolUseId);
                }}
                className="group flex w-full items-center gap-1.5 px-2.5 py-1 pl-6 text-left transition-colors hover:bg-secondary/60"
                title={`${e.action.toUpperCase()} ${e.path}`}
              >
                <ActionBadge action={e.action} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground group-hover:text-fg">
                  {shortenPath(e.path)}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ActionBadge({ action }: { action: FileEntry['action'] }) {
  const map = {
    read: { bg: 'bg-blue-500/15', text: 'text-blue-300', letter: 'R' },
    write: { bg: 'bg-amber-500/15', text: 'text-amber-300', letter: 'W' },
    edit: { bg: 'bg-amber-500/15', text: 'text-amber-300', letter: 'E' },
  } as const;
  const m = map[action];
  return (
    <span
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold',
        m.bg,
        m.text,
      )}
    >
      {m.letter}
    </span>
  );
}

function shortenPath(p: string): string {
  const parts = p.split('/').filter(Boolean);
  if (parts.length <= 2) return p;
  return '…/' + parts.slice(-2).join('/');
}

// ── Info tab ──
function InfoPanel({
  summary,
  messages,
  fileEntries,
  toolUses,
}: {
  summary: SessionSummary | undefined;
  messages: Message[];
  fileEntries: FileEntry[];
  toolUses: Message[];
}) {
  if (!summary) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        无会话信息
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
      <Section title="会话">
        <Row label="来源">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset font-medium',
              sourceColor(summary.source),
            )}
          >
            {describeSessionSource(summary.source)}
          </span>
        </Row>
        {summary.sessionIdRaw && (
          <Row label="ID" mono>
            {summary.sessionIdRaw.slice(0, SESSION_ID_DISPLAY_LEN)}…
          </Row>
        )}
        {summary.model && (
          <Row label="模型" mono>
            {summary.model}
          </Row>
        )}
        <Row label="状态">
          {false ? (
            <span className="text-emerald-300">● 实时</span>
          ) : (
            <span className="text-muted-foreground">已结束</span>
          )}
        </Row>
      </Section>

      <Section title="环境">
        {summary.cwd && (
          <Row label="cwd" mono mono-wrap>
            {summary.cwd?.replace(/^\/Users\/[^\/]+/, '~') || summary.cwd}
          </Row>
        )}
        {summary.gitBranch && (
          <Row label="分支" mono>
            {summary.gitBranch}
          </Row>
        )}
      </Section>

      <Section title="数据">
        <Row label="消息">
          <span className="tabular-nums">{messages.length}</span>
        </Row>
        <Row label="工具调用">
          <span className="tabular-nums">{toolUses.length}</span>
        </Row>
        <Row label="文件">
          <span className="tabular-nums">{fileEntries.length}</span>
        </Row>
        {typeof summary.tokensTotal === 'number' && (
          <Row label="Tokens">
            <span className="tabular-nums">{formatTokens(summary.tokensTotal)}</span>
          </Row>
        )}
        <Row label="文件大小">
          <span className="tabular-nums">{formatBytes(summary.sizeBytes)}</span>
        </Row>
      </Section>

      <Section title="时间">
        {summary.startedAt && (
          <Row label="开始">{new Date(summary.startedAt).toLocaleString()}</Row>
        )}
        <Row label="最后活动">{new Date(summary.lastActivity || '').toLocaleString()}</Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 typo-label">{title}</div>
      <div className="space-y-1 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  mono,
  // eslint-disable-next-line react/no-unknown-property
  ...rest
}: {
  label: string;
  mono?: boolean;
  'mono-wrap'?: boolean;
  children: React.ReactNode;
}) {
  const wrap = (rest as Record<string, unknown>)['mono-wrap'] === true;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 text-right text-muted-foreground',
          mono && 'font-mono text-[11px]',
          wrap && 'text-left break-all',
        )}
      >
        {(rest as { children?: React.ReactNode }).children}
      </span>
    </div>
  );
}

// ── Context tab (token usage over time) ──
function ContextPanel({
  summary,
  messages,
}: {
  summary: SessionSummary | undefined;
  messages: Message[];
}) {
  // Cumulative token count from per-message usage on Claude lines, if present.
  // For sources without per-message usage we fall back to a flat per-turn bar
  // chart driven by message count.
  const points = useMemo(() => {
    let cum = 0;
    return messages
      .map((m, i) => {
        const u = (m.raw as Record<string, unknown> | undefined)?.message as
          | {
              usage?: {
                input_tokens?: number;
                output_tokens?: number;
                cache_creation_input_tokens?: number;
                cache_read_input_tokens?: number;
              };
            }
          | undefined;
        const t = u?.usage
          ? (u.usage.input_tokens ?? 0) +
            (u.usage.output_tokens ?? 0) +
            (u.usage.cache_creation_input_tokens ?? 0) +
            (u.usage.cache_read_input_tokens ?? 0)
          : 0;
        cum += t;
        return { i, t, cum };
      })
      .filter((p) => p.t > 0 || p.i % 5 === 0);
  }, [messages]);

  if (!summary?.tokensTotal && points.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 text-center text-xs text-muted-foreground">
        本来源未记录 token 用量
      </div>
    );
  }

  const max = points.reduce((m, p) => Math.max(m, p.cum), 0);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
      <Section title="累计 token">
        <Row label="总计">
          <span className="tabular-nums">{formatTokens(summary?.tokensTotal ?? 0)}</span>
        </Row>
      </Section>
      {points.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            随消息增长
          </div>
          <div className="flex h-24 items-end gap-[1px] rounded-md border border-border bg-background/40 p-2">
            {points.slice(-60).map((p) => (
              <div
                key={p.i}
                className="flex-1 rounded-t bg-accent/40"
                style={{ height: `${Math.max(2, (p.cum / Math.max(max, 1)) * 100)}%` }}
                title={`message #${p.i + 1}: cum ${formatTokens(p.cum)}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function describeToolDetail(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  for (const k of [
    'file_path',
    'path',
    'command',
    'cmd',
    'pattern',
    'query',
    'url',
    'description',
    'prompt',
  ]) {
    const v = o[k];
    if (typeof v === 'string' && v.trim())
      return v.length > RIGHT_SIDEBAR_VALUE_MAX_LEN
        ? v.slice(0, RIGHT_SIDEBAR_VALUE_MAX_LEN) + '…'
        : v;
  }
  return '';
}
