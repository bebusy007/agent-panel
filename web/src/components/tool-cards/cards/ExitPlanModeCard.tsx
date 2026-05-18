import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message, ToolStatus } from "@/lib/api";
import { CopyButton } from "../ToolCardHeader";

/** Read-only ExitPlanMode card.
 *
 *  Historical sessions may show the agent's plan that was awaiting
 *  approval. We render the plan markdown as it was, with a banner
 *  reflecting how the user responded (approved / denied / no answer).
 *  No interactive buttons — we don't talk back to the agent. */
export function ExitPlanModeCard({ tool, result }: { tool: Message; result?: Message }) {
  const input = (tool.toolInput as Record<string, unknown> | undefined) ?? {};
  const plan = typeof input.plan === "string" ? input.plan : "";

  const status: ToolStatus = (result?.toolStatus ?? tool.toolStatus ?? "ask_pending") as ToolStatus;
  const banner =
    status === "success"
      ? { Icon: CheckCircle2, text: "已批准 — 进入实施阶段", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" }
      : status === "denied" || status === "permission_denied" || status === "error"
        ? { Icon: XCircle, text: "已拒绝 — 继续修改计划", cls: "bg-red-500/10 text-red-300 border-red-500/30" }
        : { Icon: HelpCircle, text: "未回答 — 用户未在此处决定", cls: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30" };

  return (
    <div className="space-y-2 px-3 pb-3">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium",
          banner.cls,
        )}
      >
        <banner.Icon className="size-3.5" />
        {banner.text}
      </div>
      {plan && (
        <div className="rounded-md border border-indigo-500/30 bg-indigo-500/5">
          <div className="flex items-center justify-between border-b border-indigo-500/20 px-2.5 py-1 text-[10px] uppercase tracking-wider text-indigo-300">
            <span>plan</span>
            <CopyButton text={plan} />
          </div>
          <div className="md-body max-h-[600px] overflow-auto px-3 py-2 text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
