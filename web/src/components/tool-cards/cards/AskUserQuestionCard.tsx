import { CheckCircle2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/api";

interface QuestionInput {
  question?: string;
  questions?: Array<{ id?: string; question?: string; options?: Array<{ id?: string; label?: string }>; allow_multiple?: boolean }>;
  options?: Array<{ id?: string; label?: string } | string>;
}

/** Read-only AskUserQuestion card.
 *
 *  Historical view: shows the question + all the options the agent
 *  offered, plus any user response we can recover from the matching
 *  tool_result. No clickable answers — answering is done by the
 *  live agent process, not us. */
export function AskUserQuestionCard({ tool, result }: { tool: Message; result?: Message }) {
  const input = (tool.toolInput as QuestionInput | undefined) ?? {};
  const questions = input.questions ?? (
    input.question
      ? [{ question: input.question, options: (input.options ?? []).map((o) => (typeof o === "string" ? { label: o } : o)) }]
      : []
  );
  const answer = result?.toolOutput ?? "";

  return (
    <div className="space-y-2 px-3 pb-3">
      {questions.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">无问题数据</p>
      ) : (
        questions.map((q, i) => (
          <div key={i} className="rounded-md border border-yellow-500/30 bg-yellow-500/5">
            <div className="border-b border-yellow-500/20 px-2.5 py-1.5 text-xs font-medium text-yellow-100">
              <HelpCircle className="mr-1.5 inline size-3.5 text-yellow-400" />
              {q.question || "(无问题文本)"}
            </div>
            {q.options && q.options.length > 0 && (
              <ul className="divide-y divide-yellow-500/10">
                {q.options.map((opt, j) => {
                  const label = typeof opt === "string" ? opt : opt.label ?? "";
                  // Substring match would mis-fire ("是" matches inside
                  // "是否"). Split the answer on commas / newlines and
                  // compare trimmed tokens instead so "a" doesn't match
                  // "and".
                  const answerParts = answer
                    .split(/[\n,]/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const trimmedLabel = label.trim();
                  const chosen = !!trimmedLabel && answerParts.includes(trimmedLabel);
                  return (
                    <li
                      key={j}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5 text-xs",
                        chosen ? "bg-emerald-500/10" : "",
                      )}
                    >
                      {chosen ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <span className="size-3.5 shrink-0 rounded-full border border-fg-subtle/40" />
                      )}
                      <span className={cn("flex-1", chosen ? "text-emerald-200 font-medium" : "text-muted-foreground")}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))
      )}
      {answer && (
        <div className="rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-[11px]">
          <span className="text-muted-foreground">用户回答：</span>
          <span className="text-muted-foreground">{answer}</span>
        </div>
      )}
    </div>
  );
}
