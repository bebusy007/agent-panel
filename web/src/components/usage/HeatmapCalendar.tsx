import { useMemo, useState } from "react";
import { cn, formatTokens, formatCost } from "@/lib/utils";

/**
 * Month-calendar style heatmap (CCHV style).
 * Each month renders as a mini-calendar grid. Cells colored by percentile intensity.
 */

interface DailyEntry {
  date: string;
  inputTokens?: number;
  outputTokens?: number;
  messageCount?: number;
  sessionCount?: number;
  costUsd?: number;
  tokens?: number;
  messages?: number;
  sessions?: number;
}

interface CalendarDay {
  date: string | null;
  dayNum: number;
  value: number;
}

const CELL = 18;
const EMPTY: CalendarDay = { date: null, dayNum: 0, value: 0 };
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const LEVEL_CLASSES = [
  "bg-muted ring-1 ring-inset ring-border",
  "bg-emerald-300/40",
  "bg-emerald-400/60",
  "bg-emerald-500/80",
  "bg-emerald-600",
];

function getValue(d: DailyEntry, metric: string): number {
  if (metric === "cost") return d.costUsd ?? 0;
  if (metric === "tokens") return (d.inputTokens ?? d.tokens ?? 0) + (d.outputTokens ?? 0);
  if (metric === "messages") return d.messageCount ?? d.messages ?? 0;
  if (metric === "sessions") return d.sessionCount ?? d.sessions ?? 0;
  return (d.inputTokens ?? d.tokens ?? 0) + (d.outputTokens ?? 0);
}

function computePercentiles(values: number[]): [number, number, number] {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (nz.length === 0) return [0, 0, 0];
  const p = (pct: number) => nz[Math.floor((pct / 100) * (nz.length - 1))] ?? 0;
  return [p(25), p(50), p(75)];
}

function valueToLevel(v: number, t: [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (v <= 0) return 0;
  if (v <= t[0]) return 1;
  if (v <= t[1]) return 2;
  if (v <= t[2]) return 3;
  return 4;
}

function groupByMonth(daily: DailyEntry[], metric: string): Map<string, { days: Map<number, number> }> {
  const map = new Map<string, { days: Map<number, number> }>();
  for (const d of daily) {
    const key = d.date.slice(0, 7);
    if (!map.has(key)) map.set(key, { days: new Map() });
    const day = parseInt(d.date.slice(8, 10), 10);
    map.get(key)!.days.set(day, getValue(d, metric));
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function buildMonthGrid(yearMonth: string, days: Map<number, number>): CalendarDay[][] {
  const [year, month] = yearMonth.split("-").map(Number);
  const y = year ?? 2000;
  const m = (month ?? 1) - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let i = 0; i < startDow; i++) week.push(EMPTY);

  for (let day = 1; day <= daysInMonth; day++) {
    week.push({ date: `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, dayNum: day, value: days.get(day) ?? 0 });
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(EMPTY); weeks.push(week); }
  return weeks;
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short" }).format(new Date(year ?? 2000, (month ?? 1) - 1, 1));
}

export function HeatmapCalendar({
  daily,
  metric = "tokens",
}: {
  daily: DailyEntry[];
  metric?: "tokens" | "sessions" | "messages" | "cost";
}) {
  const [hover, setHover] = useState<{ x: number; y: number; date: string; value: number } | null>(null);

  const { months, thresholds } = useMemo(() => {
    const grouped = groupByMonth(daily, metric);
    const allValues = daily.map((d) => getValue(d, metric));
    const thresholds = computePercentiles(allValues);
    const months: Array<{ key: string; weeks: CalendarDay[][] }> = [];
    for (const [key, { days }] of grouped) {
      months.push({ key, weeks: buildMonthGrid(key, days) });
    }
    return { months, thresholds };
  }, [daily, metric]);

  if (daily.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">暂无活动数据</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-8 justify-center">
        {months.map(({ key, weeks }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <div className="text-[10px] font-semibold text-foreground/80 mb-0.5">{formatMonthLabel(key)}</div>
            <div className="grid grid-cols-7 gap-[3px] mb-0.5">
              {WEEKDAYS.map((w, i) => (
                <div key={i} style={{ width: CELL, height: CELL }} className="flex items-center justify-center text-[9px] font-medium text-muted-foreground/50">{w}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-[3px]">
                {week.map((cell, di) => {
                  if (!cell.date) return <div key={di} style={{ width: CELL, height: CELL }} />;
                  const level = valueToLevel(cell.value, thresholds);
                  return (
                    <div
                      key={di}
                      style={{ width: CELL, height: CELL }}
                      className={cn(
                        "rounded-sm cursor-pointer transition-transform duration-100",
                        "hover:scale-125 hover:z-10",
                        level > 0 && "hover:ring-1 hover:ring-white/30",
                        LEVEL_CLASSES[level],
                      )}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHover({ x: rect.right + 8, y: rect.top, date: cell.date!, value: cell.value });
                      }}
                      onMouseLeave={() => setHover(null)}
                    >
                      {cell.dayNum === 1 && (
                        <span className="text-[6px] text-foreground/40 leading-none flex items-center justify-center h-full">1</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Less</span>
          {LEVEL_CLASSES.map((cls, i) => (
            <div key={i} className={cn("w-3 h-3 rounded-sm", cls)} />
          ))}
          <span className="text-[9px] text-muted-foreground">More</span>
        </div>
      </div>

      {/* Tooltip */}
      {hover && (
        <div className="pointer-events-none fixed z-50 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-lg" style={{ left: hover.x, top: hover.y }}>
          <div className="font-mono text-fg">{hover.date}</div>
          <div className="mt-0.5 text-muted-foreground">
            {metric === "tokens" && `${formatTokens(hover.value)} tokens`}
            {metric === "messages" && `${hover.value} 条消息`}
            {metric === "sessions" && `${hover.value} 个会话`}
            {metric === "cost" && formatCost(hover.value)}
          </div>
        </div>
      )}
    </div>
  );
}
