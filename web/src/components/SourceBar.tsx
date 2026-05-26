import { cn } from '@/lib/utils';

export function SourceBar({
  items,
  max,
}: {
  items: Array<{ label: string; type: string; count: number }>;
  max?: number;
}) {
  const top = items.slice(0, max ?? items.length);
  const peak = Math.max(1, ...top.map((i) => i.count));
  return (
    <div className="space-y-2.5">
      {top.map((it) => (
        <div key={it.type + ':' + it.label} className="flex items-center gap-3">
          <div className="w-44 shrink-0 truncate text-sm text-muted-foreground" title={it.label}>
            {it.label}
          </div>
          <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full bg-accent transition-all')}
              style={{ width: `${Math.max(4, (it.count / peak) * 100)}%` }}
            />
          </div>
          <div className="w-10 text-right text-sm tabular-nums text-muted-foreground">
            {it.count}
          </div>
        </div>
      ))}
    </div>
  );
}
