import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Bot,
  MessageSquare,
} from "lucide-react";
import { extractOutputText } from "@/lib/tool-rendering";
import { api } from "@/lib/api";
import type { Message, SubagentMeta } from "@/lib/api";
import { CopyButton } from "../ToolCardHeader";
import { IdBadge } from "../IdBadge";
import { SubagentMessages } from "./SubagentMessages";
import { cn } from "@/lib/utils";

export function TaskCard({
  tool,
  result,
  subagentMeta,
  sessionId,
}: {
  tool: Message;
  result?: Message;
  subagentMeta?: SubagentMeta;
  sessionId?: string;
}) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  const subagent = (input.subagent_type as string) || (input.subagentType as string) || "";
  const description = (input.description as string) || "";
  const prompt = (input.prompt as string) || "";
  const out = result?.toolOutput ?? extractOutputText(tool.toolOutput);


  const [expanded, setExpanded] = useState(false);
  const [subMessages, setSubMessages] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (subMessages) return;
    if (!sessionId || !subagentMeta) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.sessionSubagent(sessionId, subagentMeta.agentHash);
      setSubMessages(res.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const hasResult = !!out;
  const isRunning = !hasResult && !result;

  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-cyan-500/30 bg-gradient-to-b from-cyan-500/[0.06] to-transparent">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-cyan-500/20">
          <Bot className="size-3.5 text-cyan-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-cyan-300">
              Subagent
            </span>
            {subagent && (
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400/80">
                {subagent}
              </span>
            )}
            {subagentMeta?.agentHash && (
              <IdBadge entries={[{ key: "agentHash", value: subagentMeta.agentHash }]} />
            )}
            {isRunning && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400">
                <Loader2 className="size-3 animate-spin" />
                运行中
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {subagentMeta && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <MessageSquare className="size-3" />
            <span className="tabular-nums">{subagentMeta.messageCount}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="space-y-2 p-3">
        {/* Prompt */}
        {prompt && (
          <div className="rounded-md border border-border bg-background/40">
            <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>prompt</span>
              <CopyButton text={prompt} />
            </div>
            <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {prompt}
            </pre>
          </div>
        )}

        {/* Result */}
        {out && (
          <div className="rounded-md border border-border bg-background/40">
            <div className="flex items-center justify-between border-b border-border/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>result</span>
              <CopyButton text={out} />
            </div>
            <div className="md-body max-h-[300px] overflow-auto px-3 py-2 text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{out}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Expand subagent conversation */}
        {subagentMeta && (
          <button
            onClick={handleExpand}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
              expanded
                ? "border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-300"
                : "border-border text-muted-foreground hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] hover:text-cyan-300",
            )}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin text-cyan-400" />
            ) : expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            <Bot className="size-3.5" />
            <span className="font-medium">
              {expanded ? "收起" : "展开"} Subagent 对话
            </span>
            <span className="text-muted-foreground">
              ({subagentMeta.messageCount} 条消息)
            </span>
          </button>
        )}

        {expanded && (
          <div className="ml-2 rounded-lg border-l-2 border-cyan-500/30 pl-3 pt-1">
            {loading && (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-cyan-400" />
                加载 Subagent 对话...
              </div>
            )}
            {error && (
              <div className="py-2 text-xs text-red-400">
                加载失败: {error}
              </div>
            )}
            {subMessages && <SubagentMessages messages={subMessages} />}
          </div>
        )}
      </div>
    </div>
  );
}
