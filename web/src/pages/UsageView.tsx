import { useEffect, useState } from "react";
import { Activity, RefreshCw, BarChart3, MessageSquare, Hash, Calendar, DollarSign, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { cn, describeSessionSource, formatCost, formatTokens, sourceColor } from "@/lib/utils";
import { HeatmapCalendar } from "@/components/usage/HeatmapCalendar";
import type { RustUsageOverview } from "@/lib/api";
import type { SessionSource } from "@/lib/api";

type ScopeKey = "all" | SessionSource;
type DaysKey = 1 | 7 | 30 | 90 | 0; // 0 = all
type ChartMode = "tokens" | "sessions" | "messages" | "cost";

const SCOPE_OPTIONS: { key: ScopeKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "claude-code", label: "Claude Code" },
  { key: "cursor-agent", label: "Cursor agent" },
  { key: "codex", label: "Codex" },
];

const DAY_OPTIONS: { key: DaysKey; label: string }[] = [
  { key: 1, label: "1d" },
  { key: 7, label: "7d" },
  { key: 30, label: "30d" },
  { key: 90, label: "90d" },
  { key: 0, label: "全部" },
];

/**
 * Multi-source usage analytics.
 *
 * Cost is estimated from `shared/pricing.ts` × per-session token
 * breakdown. Two trustworthiness tiers:
 *   - Claude Code: full input/output/cache breakdown → accurate as the
 *     local pricing table itself.
 *   - Codex: only `total_tokens` reported, attributed entirely to
 *     output for cost purposes — marked with "~" prefix so the user
 *     knows it's an over-estimate for input-heavy turns.
 *   - Cursor / Claude prompts / Cursor composer: no token data at all,
 *     "—" everywhere.
 */
export default function UsageView() {
  const [scope, setScope] = useState<ScopeKey>("all");
  const [days, setDays] = useState<DaysKey>(30);
  const [data, setData] = useState<RustUsageOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("tokens");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .usageOverview({
        source: scope === "all" ? undefined : scope,
        days: days === 0 ? undefined : days,
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          if (d.totalTokens === 0 && (chartMode === "tokens" || chartMode === "cost")) {
            setChartMode(d.totalMessages > 0 ? "messages" : "sessions");
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, days, refreshKey]);

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="typo-h1">用量</h1>
          <p className="mt-1 typo-body text-muted-foreground">
            跨 Claude Code / Cursor / Codex 的会话、token 与活跃度统计。
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-fg"
          title="重新计算"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          刷新
        </button>
      </header>

      {/* Scope + range tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {SCOPE_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setScope(o.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                scope === o.key
                  ? "bg-secondary text-fg shadow-sm"
                  : "text-muted-foreground hover:text-fg",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {/* relative wrapper so the date-range hint can float *below*
         *  the pills (absolute) — that way the days pill box stays
         *  the same height as the scope pill box and the parent
         *  `items-center` can actually align the two white boxes
         *  on a single baseline. Earlier `flex-col items-center`
         *  made this column taller than the scope column, breaking
         *  the alignment the user asked for. */}
        <div className="relative">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            {DAY_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setDays(o.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  days === o.key
                    ? "bg-accent/15 text-accent"
                    : "text-muted-foreground hover:text-fg",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-center font-mono text-[10px] tabular-nums text-muted-foreground">
            {dateRangeHint(days, data?.daily)}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
      )}

      {data && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-70")}>
          {/* Summary cards */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard
              icon={<MessageSquare className="size-3.5" />}
              label="会话"
              value={data.totalSessions.toLocaleString()}
            />
            <SummaryCard
              icon={<BarChart3 className="size-3.5" />}
              label="Tokens"
              value={formatTokens(data.totalTokens)}
              hint={
                Math.round(data.totalTokens / (data.totalSessions || 1))
                  ? `~${formatTokens(Math.round(data.totalTokens / (data.totalSessions || 1)))} / 会话`
                  : undefined
              }
            />
            <SummaryCard
              icon={<DollarSign className="size-3.5" />}
              label="估算成本"
              value={formatCost(data.totalCostUsd, false)}
              hint={`基于本地价格表（${"2026-01-01"}）`}
              info={
                <>
                  <p className="font-medium text-fg">如何计算</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>
                      <span className="text-fg">Claude Code</span>：每个会话的
                      input / output / cache_read / cache_write tokens 分别
                      乘以模型对应的 USD/M tokens 单价
                    </li>
                    <li>
                      <span className="text-fg">Codex</span>：仅记录
                      total_tokens，全部按 output 价计（带 <code>~</code> 前缀）
                    </li>
                    <li>
                      <span className="text-fg">Cursor agent / Cursor composer / Claude prompts</span>：
                      不记录 token，无法估算（显示 <code>—</code>）
                    </li>
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    价格表：
                    <code className="font-mono">shared/pricing.ts</code>，
                    更新于 {"2026-01-01"}。
                    供应商调价后请手动更新该文件。
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    本机数据完全不上传，估算只在浏览器和本地 server 间流转。
                  </p>
                </>
              }
            />
            <SummaryCard
              icon={<Hash className="size-3.5" />}
              label="消息"
              value={data.totalMessages.toLocaleString()}
            />
            <SummaryCard
              icon={<Calendar className="size-3.5" />}
              label="活跃天数"
              value={data.daily.length.toString()}
            />
          </section>

          {/* Heatmap */}
          <section className="rounded-lg border border-border bg-card p-4">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-1.5 typo-label">
                <Activity className="size-3.5" />
                最近 365 天活跃度
              </h2>
              <div className="flex items-center gap-1 rounded-md border border-border bg-background/40 p-0.5">
                {(["tokens", "cost", "sessions", "messages"] as ChartMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] transition-colors",
                      chartMode === m ? "bg-secondary text-fg" : "text-muted-foreground hover:text-muted-foreground",
                    )}
                  >
                    {m === "tokens"
                      ? "Token"
                      : m === "cost"
                        ? "成本"
                        : m === "sessions"
                          ? "会话"
                          : "消息"}
                  </button>
                ))}
              </div>
            </header>
            <HeatmapCalendar daily={data.heatmap} metric={chartMode} />
          </section>

          {/* Trend chart for the filtered window */}
          {data.daily.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="typo-label">
                  趋势（{days === 0 ? "全部时间" : `最近 ${days} 天`}）
                </h2>
                <span className="text-[10px] text-muted-foreground">
                  共 <span className="text-muted-foreground tabular-nums">{data.daily.length}</span> 天有活动
                </span>
              </header>
              <TrendBars daily={data.daily.slice(-90)} metric={chartMode} />
            </section>
          )}

          {/* By Source */}
          {data.bySource.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 typo-label">
                按来源
              </h2>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 text-left">来源</th>
                    <th className="py-1.5 text-right">会话</th>
                    <th className="py-1.5 text-right">消息</th>
                    <th className="py-1.5 text-right">Tokens</th>
                    <th className="py-1.5 text-right">估算成本</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySource.map((row: { source: string; count: number }) => (
                    <tr key={row.source} className="border-b border-border/50">
                      <td className="py-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset font-medium",
                            sourceColor(row.source),
                          )}
                        >
                          {describeSessionSource(row.source)}
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.count}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.count.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {0 > 0 ? (
                          formatTokens(0)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {0 > 0 ? (
                          formatCost(0, false)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* By Model */}
          {data.byModel.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 typo-label">
                按模型 {data.byModel.length > 10 && (
                  <span className="text-muted-foreground">(展示前 10)</span>
                )}
              </h2>
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 text-left">模型</th>
                    <th className="py-1.5 text-right whitespace-nowrap px-3">Input</th>
                    <th className="py-1.5 text-right whitespace-nowrap px-3">Output</th>
                    <th className="py-1.5 text-right whitespace-nowrap px-3">Cache Read</th>
                    <th className="py-1.5 text-right whitespace-nowrap px-3">Cache Write</th>
                    <th className="py-1.5 text-right whitespace-nowrap px-3">总量</th>
                    <th className="py-1.5 pl-3" style={{ width: 100 }}>占比</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.slice(0, 10).map((row) => {
                    const total = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens;
                    return (
                    <tr key={row.model} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-1.5 truncate max-w-[240px] font-mono text-[11px]" title={row.model}>
                        {row.model}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap tabular-nums font-mono text-[11px] px-3">
                        {formatTokens(row.inputTokens)}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap tabular-nums font-mono text-[11px] px-3">
                        {formatTokens(row.outputTokens)}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap tabular-nums font-mono text-[11px] text-muted-foreground px-3">
                        {formatTokens(row.cacheReadTokens)}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap tabular-nums font-mono text-[11px] text-muted-foreground px-3">
                        {formatTokens(row.cacheWriteTokens)}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap tabular-nums font-mono text-[11px] font-medium px-3">
                        {formatTokens(total)}
                      </td>
                      <td className="py-1.5 pl-3" style={{ width: 100 }}>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, row.pct)}%` }}
                            />
                          </div>
                          <span className="shrink-0 w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                            {row.pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </section>
          )}

          {data.totalSessions === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              当前过滤条件下无任何会话
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  info,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  /** Optional rich content for a hover popover (the ? badge). Plain
   *  string `hint` and rich `info` can co-exist — hint always shows
   *  inline, info hides until hover. */
  info?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
        {info && <InfoTooltip>{info}</InfoTooltip>}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Generic ? hover popover.
 *
 *  Implementation notes:
 *  - text-transform is an inherited CSS property; the SummaryCard label
 *    row uses `uppercase` so the popover would inherit it and shout
 *    every word at the user. Force `normal-case` + `tracking-normal`
 *    inside the popover so it reads as regular prose.
 *  - Popover opens BELOW the icon (top-full + mt-1.5) so it doesn't
 *    get clipped by the viewport top edge — SummaryCards live in the
 *    upper region of the page where the gap above is tiny. There's
 *    always plenty of room below.
 *  - pointer-events-none so it doesn't catch the user's mouseleave
 *    while they read it.  */
function InfoTooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseOver={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <HelpCircle className="size-3 cursor-help text-muted-foreground hover:text-muted-foreground" />
      {open && (
        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-72 -translate-x-1/2 rounded-md border border-border bg-card p-3 text-[11px] leading-relaxed normal-case tracking-normal text-muted-foreground shadow-lg">
          {children}
        </div>
      )}
    </span>
  );
}

function dateRangeHint(
  days: DaysKey,
  daily: { date: string }[] | undefined,
): string {
  if (days === 0) {
    // "全部时间" — show the actual span we have data for, falling back
    // to "(无数据)" when daily is empty.
    const first = daily?.[0]?.date;
    const last = daily?.[daily.length - 1]?.date;
    if (!first) return "全部时间 · 暂无数据";
    return `全部时间 · ${first} ~ ${last}`;
  }
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return `${start.toISOString().slice(0, 10)} ~ ${end}`;
}

function formatAxisValue(v: number, metric: ChartMode): string {
  if (metric === "cost") return formatCost(v, false);
  if (metric === "tokens") return formatTokens(v);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function TrendBars({
  daily,
  metric,
}: {
  daily: { date: string; inputTokens: number; outputTokens: number; messageCount: number; sessionCount: number; costUsd: number }[];
  metric: ChartMode;
}) {
  const valueOf = (
    d: { inputTokens: number; outputTokens: number; messageCount: number; sessionCount: number; costUsd: number },
  ) => {
    if (metric === "cost") return d.costUsd;
    if (metric === "tokens") return d.inputTokens + d.outputTokens;
    if (metric === "messages") return d.messageCount;
    return d.sessionCount;
  };
  const max = daily.reduce((m, d) => Math.max(m, valueOf(d)), 0);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    entry: { date: string; inputTokens: number; outputTokens: number; messageCount: number; sessionCount: number; costUsd: number };
  } | null>(null);

  if (max === 0) {
    return <p className="py-4 text-center text-[11px] text-muted-foreground">无数据</p>;
  }

  const labelInterval = Math.max(1, Math.ceil(daily.length / 10));

  return (
    <div className="relative">
      <div className="flex h-40">
        {/* Y-axis */}
        <div className="flex flex-col justify-between items-end pr-2 text-[10px] text-muted-foreground tabular-nums shrink-0 py-0.5">
          <span>{formatAxisValue(max, metric)}</span>
          <span>{formatAxisValue(max / 2, metric)}</span>
          <span>0</span>
        </div>
        {/* Chart area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex gap-[2px] border-l border-b border-border/50 relative items-end">
            <div className="absolute inset-x-0 top-1/2 border-t border-border/30 pointer-events-none" />
            {daily.map((d) => {
              const v = valueOf(d);
              const pct = max > 0 ? Math.max((v / max) * 100, 2) : 2;
              return (
                <div
                  key={d.date}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHover({ x: rect.left + rect.width / 2, y: rect.top - 6, entry: d });
                  }}
                  onMouseLeave={() => setHover(null)}
                  className="flex-1 min-w-0 rounded-t bg-emerald-400/70 hover:bg-emerald-300 transition-colors cursor-default"
                  style={{ height: `${pct}%` }}
                />
              );
            })}
          </div>
          {/* X-axis */}
          <div className="flex gap-[2px] mt-1">
            {daily.map((d, i) => (
              <div key={d.date} className="flex-1 min-w-0 text-center">
                {i % labelInterval === 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{d.date.slice(5)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="font-mono text-fg">{hover.entry.date}</div>
          <div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
            <span>{formatTokens(hover.entry.inputTokens + hover.entry.outputTokens)} tok</span>
            {hover.entry.costUsd > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{formatCost(hover.entry.costUsd)}</span>
              </>
            )}
            <span className="text-muted-foreground">·</span>
            <span>{hover.entry.sessionCount} 会话</span>
            <span className="text-muted-foreground">·</span>
            <span>{hover.entry.messageCount} 消息</span>
          </div>
        </div>
      )}
    </div>
  );
}
