import { Tag, Sparkles } from "lucide-react";
import { cn, formatTimestamp } from "@/lib/utils";
import type { Message } from "@/lib/api";

interface Props {
  m: Message;
}

export function MetaBlock({ m }: Props) {
  const metaType = m.toolName || "meta";
  const text = m.text || metaType;

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/30 border border-border/50 px-3 py-1.5">
      <Tag className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {text}
      </span>
      {m.timestamp && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {formatTimestamp(m.timestamp)}
        </span>
      )}
    </div>
  );
}

export function ThinkingBlock({ m }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-purple-500/5 border border-purple-500/15 px-3 py-1.5">
      <Sparkles className="size-3 shrink-0 text-purple-400/60" />
      <span className="text-[11px] text-purple-300/60 italic">thinking</span>
      {m.timestamp && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground ml-auto">
          {formatTimestamp(m.timestamp)}
        </span>
      )}
    </div>
  );
}
