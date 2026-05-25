interface Props {
  longMode: boolean;
  expanded: boolean;
  onExpand: () => void;
  children: React.ReactNode;
}

export function CollapsibleBody({ longMode, expanded, onExpand, children }: Props) {
  if (!longMode) return <>{children}</>;
  if (expanded) {
    return (
      <div className="space-y-1">
        {children}
        <div className="pt-1">
          <button
            onClick={onExpand}
            className="text-[11px] text-muted-foreground hover:text-muted-foreground"
          >
            ↑ 收起
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="max-h-[10rem] overflow-hidden">{children}</div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-bg-surface to-transparent" />
      <button
        onClick={onExpand}
        className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm transition-colors hover:border-border hover:text-fg"
      >
        ↓ 展开
      </button>
    </div>
  );
}
