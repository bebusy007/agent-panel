import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterChips({
  options,
  selected,
  onToggle,
  onClear,
  emptyHint = "暂无可选项",
}: {
  options: Array<{
    value: string;
    label: string;
    count?: number;
    /** Optional: non-empty string = this source is currently unreadable; chip
     *  gets an amber warning triangle with this message as tooltip. */
    warning?: string;
  }>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear?: () => void;
  emptyHint?: string;
}) {
  if (options.length === 0) {
    return <div className="text-xs text-muted-foreground">{emptyHint}</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isOn = selected.has(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            className={cn(
              "text-xs rounded-full px-2.5 py-0.5 border transition-colors inline-flex items-center gap-1",
              isOn
                ? "border-accent/50 bg-accent/10 text-accent"
                : opt.warning
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:border-amber-500/60"
                  : "border-border bg-card text-muted-foreground hover:border-border hover:text-fg"
            )}
            title={opt.warning || undefined}
          >
            {opt.warning && <AlertTriangle className="size-3 shrink-0" />}
            {opt.label}
            {typeof opt.count === "number" && (
              <span className="text-[10px] opacity-60 tabular-nums">{opt.count}</span>
            )}
          </button>
        );
      })}
      {selected.size > 0 && onClear && (
        <button
          onClick={onClear}
          className="text-xs rounded-full px-2.5 py-0.5 text-muted-foreground hover:text-muted-foreground"
        >
          清空
        </button>
      )}
    </div>
  );
}
