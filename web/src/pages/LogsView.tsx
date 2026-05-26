import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Clock, FileText, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { api, type LogEntry, type LogFileInfo } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function LogsView() {
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hourFilter, setHourFilter] = useState<string>('all');

  useEffect(() => {
    api
      .logsFiles()
      .then((res) => {
        setFiles(res.files);
        if (res.files.length > 0) {
          setSelectedFile(res.files[0].name);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    setHourFilter('all');
    api
      .logsContent(selectedFile)
      .then((res) => {
        setEntries(res.entries);
        setTotalLines(res.totalLines);
      })
      .catch(() => {
        setEntries([]);
        setTotalLines(0);
      })
      .finally(() => setLoading(false));
  }, [selectedFile]);

  const selectedMeta = files.find((f) => f.name === selectedFile);
  const allHourGroups = useMemo(() => groupByHourThenSecond(entries), [entries]);
  const hourOptions = useMemo(
    () => allHourGroups.map((hg) => ({ key: hg.hourKey, label: hg.hourLabel, count: hg.count })),
    [allHourGroups],
  );
  const visibleGroups = useMemo(() => {
    if (hourFilter === 'all') return allHourGroups;
    return allHourGroups.filter((hg) => hg.hourKey === hourFilter);
  }, [allHourGroups, hourFilter]);
  const visibleCount = useMemo(
    () => visibleGroups.reduce((s, g) => s + g.count, 0),
    [visibleGroups],
  );

  return (
    <div className="animate-fade-in h-full flex flex-col">
      <header className="shrink-0 mb-4">
        <div className="flex items-center gap-3 mb-1">
          <Link
            to="/settings"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            设置
          </Link>
        </div>
        <h1 className="typo-h1">日志</h1>
        <p className="mt-1 typo-body text-muted-foreground">查看系统运行日志，按天存储、自动轮转</p>
      </header>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 mb-3 flex-wrap">
        {/* File selector */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-mono hover:border-muted-foreground/30 transition-colors">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="truncate max-w-[400px]">{selectedFile || '选择日志文件'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            {files.map((f) => (
              <DropdownMenuItem
                key={f.name}
                onClick={() => setSelectedFile(f.name)}
                className={cn('font-mono text-xs', selectedFile === f.name && 'bg-accent/10')}
              >
                <span className="truncate">{f.name}</span>
                <span className="ml-auto pl-4 text-muted-foreground">
                  {formatBytes(f.sizeBytes)}
                </span>
              </DropdownMenuItem>
            ))}
            {files.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无日志文件</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hour filter */}
        {hourOptions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm hover:border-muted-foreground/30 transition-colors">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{hourFilter === 'all' ? '全部时段' : hourFilter}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuItem
                onClick={() => setHourFilter('all')}
                className={cn('text-xs', hourFilter === 'all' && 'bg-accent/10')}
              >
                全部时段
                <span className="ml-auto pl-4 text-muted-foreground">{totalLines} 条</span>
              </DropdownMenuItem>
              {hourOptions.map((h) => (
                <DropdownMenuItem
                  key={h.key}
                  onClick={() => setHourFilter(h.key)}
                  className={cn('text-xs font-mono', hourFilter === h.key && 'bg-accent/10')}
                >
                  {h.label}
                  <span className="ml-auto pl-4 text-muted-foreground">{h.count} 条</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {selectedMeta && (
          <span className="text-xs text-muted-foreground">
            {formatBytes(selectedMeta.sizeBytes)} · 显示 {visibleCount} / {totalLines} 条
          </span>
        )}
      </div>

      {/* Log entries */}
      <div className="flex-1 min-h-0 rounded-xl border border-border bg-card overflow-y-auto font-mono text-xs">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">加载中…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {selectedFile ? '该日志文件为空' : '请选择日志文件'}
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">该时段无日志</div>
        ) : (
          visibleGroups.map((hg) => (
            <div key={hg.hourKey}>
              <div className="sticky top-0 z-20 bg-card border-b border-border px-4 py-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{hg.hourLabel}</span>
                <span className="text-[10px] text-muted-foreground">{hg.count} 条</span>
                <div className="flex-1 border-t border-border/50 ml-2" />
              </div>
              {hg.seconds.map((sg) => (
                <div key={sg.time}>
                  <div className="sticky top-[33px] z-10 bg-secondary/60 backdrop-blur-sm border-b border-border/50 px-4 py-0.5 text-[10px] text-muted-foreground/70">
                    {sg.time}
                  </div>
                  {sg.entries.map((entry, i) => (
                    <LogLine key={`${sg.time}-${i}`} entry={entry} />
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Log line ───────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  ERROR: 'text-[var(--destructive)]',
  WARN: 'text-amber-500 dark:text-amber-400',
  INFO: 'text-foreground',
  DEBUG: 'text-muted-foreground/60',
  TRACE: 'text-muted-foreground/30',
};

function LogLine({ entry }: { entry: LogEntry }) {
  const levelCls = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.INFO;
  const shortTarget = entry.target ? (entry.target.split('::').pop() ?? '') : '';
  const isFrontend = entry.fields?.source === 'frontend';

  const fieldPairs = useMemo(() => {
    if (!entry.fields) return [];
    return Object.entries(entry.fields).map(([k, v]) => {
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = str.length > 80 ? str.slice(0, 80) + '…' : str;
      return { k, v: truncated };
    });
  }, [entry.fields]);

  return (
    <div className="flex items-start gap-2 px-4 py-1 hover:bg-secondary/40 transition-colors border-b border-border/30 leading-5">
      <span
        className={cn(
          'w-6 shrink-0 text-center text-[10px] font-semibold uppercase rounded py-[1px] mt-[2px]',
          isFrontend
            ? 'bg-blue-500/15 text-blue-500 dark:bg-blue-400/15 dark:text-blue-400'
            : 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400',
        )}
      >
        {isFrontend ? 'FE' : 'BE'}
      </span>
      <span className={cn('w-12 shrink-0 text-right font-semibold', levelCls)}>{entry.level}</span>
      <span className="w-28 shrink-0 truncate text-muted-foreground">{shortTarget}</span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground break-all">{entry.message}</span>
        {fieldPairs.length > 0 && (
          <div className="text-[10px] text-muted-foreground/70 break-all mt-0.5">
            {fieldPairs.map(({ k, v }) => (
              <span key={k} className="inline-block mr-3">
                <span className="text-muted-foreground/50">{k}=</span>
                <span>{v}</span>
              </span>
            ))}
          </div>
        )}
        {entry.span && (
          <div className="text-muted-foreground/40 break-all text-[10px]">{entry.span}</div>
        )}
      </span>
    </div>
  );
}

// ── Grouping ──────────────────────────────────────────────

interface SecondGroup {
  time: string;
  entries: LogEntry[];
}

interface HourGroup {
  hourKey: string;
  hourLabel: string;
  count: number;
  seconds: SecondGroup[];
}

function groupByHourThenSecond(entries: LogEntry[]): HourGroup[] {
  const hours: HourGroup[] = [];
  let curHour = '';
  let curSec = '';

  for (const entry of entries) {
    const { hourKey, hourLabel, second } = toLocalHourSecond(entry.timestamp);

    if (hourKey !== curHour) {
      curHour = hourKey;
      curSec = '';
      hours.push({ hourKey, hourLabel, count: 0, seconds: [] });
    }
    const hg = hours[hours.length - 1];
    hg.count++;

    if (second !== curSec) {
      curSec = second;
      hg.seconds.push({ time: second, entries: [] });
    }
    hg.seconds[hg.seconds.length - 1].entries.push(entry);
  }

  return hours;
}

function toLocalHourSecond(ts: string): { hourKey: string; hourLabel: string; second: string } {
  if (!ts) return { hourKey: '—', hourLabel: '—', second: '—' };
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime()))
      return { hourKey: ts.slice(0, 13), hourLabel: ts.slice(0, 13), second: ts.slice(0, 19) };
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return {
      hourKey: `${hh}:00`,
      hourLabel: `${hh}:00 — ${hh}:59`,
      second: `${hh}:${mm}:${ss}`,
    };
  } catch {
    return { hourKey: ts.slice(0, 13), hourLabel: ts.slice(0, 13), second: ts.slice(0, 19) };
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
