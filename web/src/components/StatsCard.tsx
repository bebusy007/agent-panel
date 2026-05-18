import { cn } from "@/lib/utils";
import { type ReactNode, type ElementType } from "react";

type ColorVariant = "purple" | "blue" | "green" | "amber" | "pink" | "teal";

export function StatsCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  colorVariant = "blue",
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: ElementType | ReactNode;
  tone?: "default" | "warn";
  colorVariant?: ColorVariant;
  onClick?: () => void;
}) {
  const colorVar = `var(--metric-${colorVariant})`;
  const isWarn = tone === "warn" && Number(value) > 0;
  const iconColor = isWarn ? "var(--warning)" : colorVar;

  const renderIcon = () => {
    if (!Icon) return null;
    if (isRenderableComponent(Icon)) {
      const Comp = Icon;
      return <Comp className="w-4 h-4" style={{ color: iconColor }} />;
    }
    return (
      <span className="flex items-center justify-center w-4 h-4" style={{ color: iconColor }}>
        {Icon as ReactNode}
      </span>
    );
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border transition-all duration-200",
        "bg-card",
        isWarn
          ? "border-warning/40 hover:border-warning/60"
          : "border-border hover:shadow-e2",
        onClick && "cursor-pointer hover:border-primary/40",
      )}
    >
      <div className="relative p-4 flex flex-col h-full">
        {/* Icon */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: isWarn
                ? "color-mix(in oklch, var(--warning) 15%, transparent)"
                : `color-mix(in oklch, ${colorVar} 15%, transparent)`,
            }}
          >
            {renderIcon()}
          </div>
        </div>

        {/* Value */}
        <div className="font-mono typo-h1 text-foreground tabular-nums">
          {value}
        </div>

        {/* Label */}
        <div className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </div>

        {/* Hint */}
        {hint && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="font-mono text-[11px] text-muted-foreground/70">
              {hint}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function isRenderableComponent(icon: unknown): icon is ElementType {
  const t = typeof icon;
  if (t === "function") return true;
  if (t === "object" && icon !== null && "$$typeof" in (icon as object) && "render" in (icon as object)) return true;
  return false;
}
