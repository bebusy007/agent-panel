import { useState } from 'react';
import { Search, X, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SearchBar({
  value,
  onChange,
  placeholder = '搜索',
  className,
  tip,
  resultCount,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Short text describing what this search covers. Shown on hover of ? icon. */
  tip?: string;
  /** If provided, shows result count + hints when 0 */
  resultCount?: number;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const showSingleCharHint = value.length === 1;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 focus-within:border-border transition-colors',
          className,
        )}
      >
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="text-muted-foreground hover:text-muted-foreground transition-colors"
            aria-label="清空"
          >
            <X className="size-3.5" />
          </button>
        )}
        {tip && (
          <div className="relative">
            <button
              onMouseEnter={() => setTipOpen(true)}
              onMouseLeave={() => setTipOpen(false)}
              onClick={() => setTipOpen((o) => !o)}
              className="text-muted-foreground hover:text-muted-foreground transition-colors"
              aria-label="搜索范围"
            >
              <HelpCircle className="size-3.5" />
            </button>
            {tipOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-md border border-border bg-secondary shadow-lg z-30 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                {tip}
              </div>
            )}
          </div>
        )}
      </div>
      {showSingleCharHint && (
        <div className="text-[11px] text-muted-foreground px-1">
          输入 2 个字以上可获得更精确的结果
        </div>
      )}
      {value.length >= 2 && resultCount === 0 && (
        <div className="text-[11px] text-muted-foreground px-1">
          没有匹配结果，试试更短的关键词？
        </div>
      )}
    </div>
  );
}
