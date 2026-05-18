import { useState } from "react";
import { COPY_FEEDBACK_MS, TOOL_INPUT_PREVIEW_LEN } from "@/lib/constants";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  Star,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn, copyToClipboard, formatTimestamp } from "@/lib/utils";
import { canonicalTool } from "@/lib/tool-aliases";
import type { Message, ToolStatus } from "@/lib/api";
import { getToolColor } from "@/lib/tool-colors";
import { IdBadge, entryUuid } from "./IdBadge";

export type ViewMode = "pretty" | "raw";

interface Props {
  message: Message;
  /** Detail string (file path / command / etc.) shown next to the name. */
  detail?: string;
  expanded: boolean;
  onToggle: () => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  /** When given, status overrides the one on `message` itself — used to
   *  inherit the matched tool_result's status onto the tool_use header. */
  effectiveStatus?: ToolStatus;
  /** Favorite mechanics — preserved from SessionDetail. */
  favorited?: boolean;
  onToggleFav?: () => void;
}

export function ToolCardHeader({
  message,
  detail,
  expanded,
  onToggle,
  view,
  onViewChange,
  effectiveStatus,
  favorited,
  onToggleFav,
}: Props) {
  const [copied, setCopied] = useState(false);
  const rawName = message.toolName ?? "?";
  const canon = canonicalTool(rawName);
  const displayName = canon === "Unknown" ? rawName : canon;
  const palette = getToolColor(rawName);
  const status = effectiveStatus ?? message.toolStatus;

  const onCopyDetail = async () => {
    if (!detail) return;
    await copyToClipboard(detail);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-muted-foreground"
        title={expanded ? "折叠" : "展开"}
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded text-xs leading-none",
          palette.bg,
          palette.text,
        )}
        title={canon === "Unknown" ? rawName : `${displayName}（原名：${rawName}）`}
      >
        {palette.icon}
      </span>
      <span className={cn("shrink-0 text-[11px] font-semibold", palette.text)}>{displayName}</span>
      {detail && (
        <button
          onClick={onCopyDetail}
          title={`复制 ${detail.length > TOOL_INPUT_PREVIEW_LEN ? detail.slice(0, TOOL_INPUT_PREVIEW_LEN) + "…" : detail}`}
          className="group min-w-0 flex-1 truncate text-left text-[11px] text-muted-foreground hover:text-fg"
        >
          {detail}
          {copied && <span className="ml-1 text-emerald-400">已复制</span>}
        </button>
      )}
      {!detail && <span className="flex-1" />}
      <IdBadge
        entries={[
          { key: "uuid", value: entryUuid(message.id) },
          ...(message.toolUseId ? [{ key: "tuId", value: message.toolUseId }] : []),
        ]}
      />
      {onToggleFav && (
        <button
          onClick={onToggleFav}
          title={favorited ? "取消收藏" : "收藏"}
          className={cn(
            "shrink-0 transition-all",
            favorited
              ? "text-amber-400 hover:text-amber-300"
              : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-amber-400",
          )}
        >
          <Star className={cn("size-3.5", favorited && "fill-current")} />
        </button>
      )}
      <StatusBadge status={status} />
      <div className="flex shrink-0 items-center gap-px rounded-md border border-border bg-background/40">
        <ViewBtn active={view === "pretty"} onClick={() => onViewChange("pretty")}>
          美化
        </ViewBtn>
        <ViewBtn active={view === "raw"} onClick={() => onViewChange("raw")}>
          原始
        </ViewBtn>
      </div>
      {message.timestamp && (
        <time
          dateTime={message.timestamp}
          className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
          title={formatTimestamp(message.timestamp)}
        >
          {formatTimestamp(message.timestamp)}
        </time>
      )}
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-1.5 py-0.5 text-[10px] transition-colors",
        active ? "bg-secondary text-fg" : "text-muted-foreground hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status?: ToolStatus }) {
  if (!status || status === "success") {
    return (
      <span title="成功" className="inline-flex shrink-0 items-center text-emerald-400">
        <CheckCircle2 className="size-3" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span title="出错" className="inline-flex shrink-0 items-center text-red-400">
        <AlertTriangle className="size-3" />
      </span>
    );
  }
  if (status === "denied" || status === "permission_denied") {
    return (
      <span title="被拒绝" className="inline-flex shrink-0 items-center text-amber-400">
        <AlertTriangle className="size-3" />
      </span>
    );
  }
  if (status === "ask_pending") {
    return (
      <span title="等待回答" className="inline-flex shrink-0 items-center text-yellow-300">
        <Clock className="size-3" />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span title="进行中" className="inline-flex shrink-0 items-center text-blue-400">
        <Clock className="size-3 animate-pulse" />
      </span>
    );
  }
  return null;
}

/** Compact "Copy raw text" button used inside individual cards. */
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        copyToClipboard(text);
        setDone(true);
        setTimeout(() => setDone(false), COPY_FEEDBACK_MS);
      }}
      title={label}
      className="inline-flex items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-muted-foreground"
    >
      {done ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  );
}
