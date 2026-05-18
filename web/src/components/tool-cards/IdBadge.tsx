import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { COPY_FEEDBACK_MS } from "@/lib/constants";

interface IdEntry {
  key: string;
  value: string;
}

export function entryUuid(id: string): string {
  const idx = id.lastIndexOf("-");
  return idx > 0 ? id.slice(0, idx) : id;
}

export function IdBadge({
  entries,
  className,
}: {
  entries: IdEntry[];
  className?: string;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const filtered = entries.filter((e) => e.value);
  if (filtered.length === 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
        className,
      )}
    >
      {filtered.map((e, i) => {
        const full = `${e.key}:${e.value}`;
        const short = e.value.length > 12 ? e.value.slice(0, 10) + "…" : e.value;
        const isCopied = copiedIdx === i;
        return (
          <button
            key={e.key}
            title={full}
            onClick={(ev) => {
              ev.stopPropagation();
              copyToClipboard(full);
              setCopiedIdx(i);
              setTimeout(() => setCopiedIdx(null), COPY_FEEDBACK_MS);
            }}
            className="inline-flex items-center gap-0.5 rounded border border-border/50 bg-background/60 px-1 py-px font-mono text-[10px] leading-tight text-muted-foreground hover:border-border hover:text-fg"
          >
            <span className="opacity-60">{e.key}:</span>
            <span className="max-w-[80px] truncate">{short}</span>
            {isCopied ? (
              <Check className="ml-0.5 size-2.5 text-emerald-400" />
            ) : (
              <Copy className="ml-0.5 size-2.5 opacity-0 group-hover:opacity-40" />
            )}
          </button>
        );
      })}
    </span>
  );
}
