import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CascadeItem {
  id: string;
  label: ReactNode;
  /** Source hint chip, e.g. "Claude prompts" — displayed next to the label. */
  sourceBadge?: ReactNode;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the set of extra ids the user opted to cascade to. */
  onConfirm: (cascadeIds: string[]) => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When set, user must type this exact word to enable confirm */
  requireType?: string;
  /** Visual tone */
  tone?: "default" | "danger";
  /** Loading state from parent */
  loading?: boolean;
  /** Cascade candidates; shown as a checklist. Initially all checked. */
  cascade?: {
    heading: ReactNode;
    items: CascadeItem[];
  };
  /** Optional race-condition / safety warning block. */
  warning?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  requireType,
  tone = "default",
  loading = false,
  cascade,
  warning,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // When the dialog opens, default all cascade items to checked.
  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    setCheckedIds(new Set((cascade?.items ?? []).map((i) => i.id)));
  }, [open, cascade]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canConfirm = requireType ? typed === requireType : true;
  const busy = loading || working;

  const handleConfirm = async () => {
    if (!canConfirm || busy) return;
    setWorking(true);
    try {
      await onConfirm(Array.from(checkedIds));
    } finally {
      setWorking(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-start gap-2.5">
            {tone === "danger" && (
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
            )}
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-fg transition-colors"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="px-5 py-4 text-sm text-muted-foreground leading-relaxed max-h-[70vh] overflow-y-auto">
          {description && <div>{description}</div>}

          {cascade && cascade.items.length > 0 && (
            <div className="mt-4 rounded-md border border-border bg-background/60 px-3 py-2.5">
              <div className="text-xs font-medium text-muted-foreground mb-2">{cascade.heading}</div>
              <ul className="space-y-1.5">
                {cascade.items.map((it) => {
                  const checked = checkedIds.has(it.id);
                  return (
                    <li key={it.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id={`cascade-${it.id}`}
                        checked={checked}
                        onChange={(e) =>
                          setCheckedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(it.id);
                            else next.delete(it.id);
                            return next;
                          })
                        }
                        className="mt-1 size-3.5 accent-accent cursor-pointer shrink-0"
                      />
                      <label
                        htmlFor={`cascade-${it.id}`}
                        className="text-[12.5px] flex items-center gap-1.5 flex-wrap cursor-pointer min-w-0"
                      >
                        {it.sourceBadge}
                        <span className="truncate">{it.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {warning && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <Info className="size-3.5 mt-0.5 shrink-0 text-amber-300" />
              <div>{warning}</div>
            </div>
          )}

          {requireType && (
            <div className="mt-4 space-y-2">
              <div className="text-xs">
                请输入 <code className="font-mono bg-secondary px-1.5 py-0.5 rounded">{requireType}</code> 以确认
              </div>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={requireType}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-border"
              />
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-fg hover:border-border transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || busy}
            className={cn(
              "text-sm px-3 py-1.5 rounded-md font-medium transition-colors",
              tone === "danger"
                ? "bg-red-500/90 hover:bg-red-500 text-white"
                : "bg-accent hover:bg-accent/90 text-accent-foreground",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
