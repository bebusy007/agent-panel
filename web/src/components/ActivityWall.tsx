import { useMemo } from 'react';
import { api, type ActivityDay } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { cn, formatTokens } from '@/lib/utils';
import { DEFAULT_ACTIVITY_WEEKS } from '@/lib/constants';

/**
 * GitHub-style activity heatmap. Each cell = one day; colour depth scales with
 * that day's token consumption. 26 weeks (~6 months) by default, laid out with
 * today in the rightmost column.
 *
 * The colour ramp is **adaptive**: thresholds come from the quartiles of the
 * non-zero days in the response, so the chart looks meaningful whether the
 * user burns 1K or 10M tokens per day. Fixed thresholds would either clip
 * small users to a single shade or saturate heavy users.
 */
export function ActivityWall({ weeks = DEFAULT_ACTIVITY_WEEKS }: { weeks?: number }) {
  const { data, loading } = useAsync(() => api.statsActivity(weeks), [weeks]);

  // Build a 7 rows × `weeks` cols grid. Convention: each COLUMN is a
  // Sunday-anchored week. Rightmost column contains today. If today isn't a
  // Saturday, cells below today in that column are "future" → rendered empty.
  const { grid, thresholds, monthLabels } = useMemo(() => {
    const days = data?.days ?? [];
    const byDate = new Map(days.map((d) => [d.date, d]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysWeekday = today.getDay(); // 0=Sun..6=Sat

    // Start of the week containing today (Sunday of that week)
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - todaysWeekday);

    // Leftmost Sunday: weekStart minus (weeks-1) weeks
    const gridStart = new Date(weekStart);
    gridStart.setDate(weekStart.getDate() - (weeks - 1) * 7);

    const cols: Array<Array<{ date: string; day?: ActivityDay } | null>> = Array.from(
      { length: weeks },
      () => Array(7).fill(null),
    );

    for (let c = 0; c < weeks; c++) {
      for (let r = 0; r < 7; r++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + c * 7 + r);
        // Don't render future days in the rightmost column
        if (d > today) continue;
        const dateStr = d.toISOString().slice(0, 10);
        cols[c]![r] = { date: dateStr, day: byDate.get(dateStr) };
      }
    }

    // Adaptive thresholds from non-zero days
    const nonzero = days
      .map((d) => d.tokens)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const q = (p: number) =>
      nonzero.length === 0 ? 0 : nonzero[Math.floor((nonzero.length - 1) * p)]!;
    const thresholds = [q(0.25), q(0.5), q(0.75), q(0.9)];

    // Month labels: first column whose Sunday falls in that month
    const labels = new Map<number, string>();
    let lastMonth = -1;
    for (let c = 0; c < weeks; c++) {
      const firstCell = cols[c]!.find((x) => x !== null);
      if (!firstCell) continue;
      const d = new Date(firstCell.date + 'T00:00:00');
      const m = d.getMonth();
      if (m !== lastMonth && d.getDate() <= 7) {
        labels.set(c, `${m + 1}月`);
        lastMonth = m;
      }
    }

    return { grid: cols, thresholds, monthLabels: labels };
  }, [data?.days, weeks]);

  const totalTokens = data?.totals.tokens ?? 0;
  const totalSessions = data?.totals.sessions ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">活跃墙 · 过去 {weeks} 周</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            按每日 token 消耗深浅着色，来源：claude-code / codex
          </p>
        </div>
        {!loading && (
          <div className="text-right text-[11px] text-muted-foreground">
            总计 <span className="text-fg">{formatTokens(totalTokens)}</span> tokens ·{' '}
            <span className="text-fg">{totalSessions}</span> sessions
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-4">加载中…</div>
      ) : totalTokens === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          过去 {weeks} 周没有带 token 数据的对话 — 只有 claude-code / codex 的对话会被计入。
        </div>
      ) : (
        <>
          {/* Month strip (top) + main grid (weekday rows × week columns) */}
          <div className="flex gap-1.5 items-start overflow-x-auto pb-1">
            {/* Weekday labels on the left (only Mon/Wed/Fri) */}
            <div className="flex flex-col gap-[3px] mt-[18px] text-[9px] text-muted-foreground pr-1 select-none">
              {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
                <div
                  key={i}
                  className="h-[11px] leading-[11px]"
                  style={{ visibility: i === 1 || i === 3 || i === 5 ? 'visible' : 'hidden' }}
                >
                  {w}
                </div>
              ))}
            </div>

            <div>
              {/* Month labels */}
              <div className="flex gap-[3px] mb-1 text-[9px] text-muted-foreground h-[14px] select-none">
                {grid.map((_, ci) => (
                  <div key={ci} className="w-[11px]">
                    {monthLabels.get(ci) ?? ''}
                  </div>
                ))}
              </div>

              {/* Grid itself: 7 rows (weekday 0-6) × N cols (weeks) */}
              <div className="flex flex-col gap-[3px]">
                {[0, 1, 2, 3, 4, 5, 6].map((row) => (
                  <div key={row} className="flex gap-[3px]">
                    {grid.map((col, ci) => {
                      const cell = col?.[row];
                      if (!cell) {
                        return (
                          <div
                            key={ci}
                            className="w-[11px] h-[11px] rounded-[2px] bg-transparent"
                          />
                        );
                      }
                      const tok = cell.day?.tokens ?? 0;
                      const cls =
                        tok === 0
                          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/15 ring-inset'
                          : tok <= thresholds[0]!
                            ? 'bg-emerald-900/70'
                            : tok <= thresholds[1]!
                              ? 'bg-emerald-700/80'
                              : tok <= thresholds[2]!
                                ? 'bg-emerald-500/80'
                                : tok <= thresholds[3]!
                                  ? 'bg-emerald-400'
                                  : 'bg-emerald-300';
                      const tip =
                        tok === 0
                          ? `${cell.date} · 无消耗`
                          : `${cell.date} · ${formatTokens(tok)} tokens · ${cell.day!.sessions} session${cell.day!.sessions > 1 ? 's' : ''}`;
                      return (
                        <div
                          key={ci}
                          title={tip}
                          className={cn('w-[11px] h-[11px] rounded-[2px]', cls)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground justify-end">
            <span>少</span>
            <div className="size-[11px] rounded-[2px] bg-emerald-500/10 ring-1 ring-emerald-500/15 ring-inset" />
            <div className="size-[11px] rounded-[2px] bg-emerald-900/70" />
            <div className="size-[11px] rounded-[2px] bg-emerald-700/80" />
            <div className="size-[11px] rounded-[2px] bg-emerald-500/80" />
            <div className="size-[11px] rounded-[2px] bg-emerald-400" />
            <div className="size-[11px] rounded-[2px] bg-emerald-300" />
            <span>多</span>
          </div>
        </>
      )}
    </div>
  );
}
