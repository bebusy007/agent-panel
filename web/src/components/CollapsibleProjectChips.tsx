import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search as SearchIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_COLLAPSED_CHIP_LIMIT } from '@/lib/constants';

export interface ProjectChip {
  value: string;
  label: string;
  count: number;
}

interface Props {
  options: ProjectChip[];
  selected: string;
  onSelect: (value: string) => void;
  /** Number of chips to show when collapsed */
  collapsedLimit?: number;
}

export function CollapsibleProjectChips({
  options,
  selected,
  onSelect,
  collapsedLimit = DEFAULT_COLLAPSED_CHIP_LIMIT,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter.trim()) return options;
    const q = filter.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, filter]);

  // When collapsed: show top N by count + selected (if not already in top N).
  // When expanded: show all (subject to filter).
  const visible = useMemo(() => {
    if (expanded) return filtered;
    const top = filtered.slice(0, collapsedLimit);
    if (selected && !top.some((o) => o.value === selected)) {
      const sel = filtered.find((o) => o.value === selected);
      if (sel) return [sel, ...top];
    }
    return top;
  }, [filtered, expanded, collapsedLimit, selected]);

  const hiddenCount = filtered.length - visible.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="typo-label">
          项目（cwd）{' '}
          <span className="ml-1 text-muted-foreground normal-case tracking-normal">
            {options.length}
          </span>
        </div>
        {expanded && (
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5">
            <SearchIcon className="size-3 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="按路径筛选…"
              className="bg-transparent outline-none text-[11px] w-44 placeholder:text-muted-foreground"
              autoFocus
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="text-muted-foreground hover:text-muted-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((p) => (
          <button
            key={p.value}
            onClick={() => onSelect(selected === p.value ? '' : p.value)}
            className={cn(
              'text-[11px] rounded-full px-2 py-0.5 border transition-colors',
              selected === p.value
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border bg-card text-muted-foreground hover:border-border hover:text-fg',
            )}
            title={p.value}
          >
            <span className="font-mono">{p.label}</span>
            <span className="ml-1 text-[10px] opacity-60 tabular-nums">{p.count}</span>
          </button>
        ))}
        {!expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[11px] rounded-full px-2 py-0.5 border border-dashed border-border text-muted-foreground hover:text-muted-foreground hover:border-border inline-flex items-center gap-1"
          >
            <ChevronDown className="size-3" /> 展开 +{hiddenCount}
          </button>
        )}
        {expanded && (
          <button
            onClick={() => {
              setExpanded(false);
              setFilter('');
            }}
            className="text-[11px] rounded-full px-2 py-0.5 border border-dashed border-border text-muted-foreground hover:text-muted-foreground hover:border-border inline-flex items-center gap-1"
          >
            <ChevronUp className="size-3" /> 收起
          </button>
        )}
        {selected && (
          <button
            onClick={() => onSelect('')}
            className="text-[11px] rounded-full px-2 py-0.5 text-muted-foreground hover:text-muted-foreground"
          >
            清空
          </button>
        )}
        {expanded && filter && filtered.length === 0 && (
          <span className="text-[11px] text-muted-foreground py-0.5">没有匹配的项目</span>
        )}
      </div>
    </div>
  );
}
