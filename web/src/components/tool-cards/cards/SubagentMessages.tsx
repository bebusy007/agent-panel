import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/api";
import { pairToolResults } from "@/lib/tool-result-pairing";
import { ToolCard } from "../ToolCard";
import { cleanupPromptPreview } from "@/lib/text-cleanup";
import { ASSISTANT_TEXT_PREVIEW_LEN, USER_TEXT_PREVIEW_LEN } from "@/lib/constants";

const INITIAL_LIMIT = 50;

export function SubagentMessages({ messages }: { messages: Message[] }) {
  const [showAll, setShowAll] = useState(false);

  const { resultByToolUseId, hiddenIds } = useMemo(
    () => pairToolResults(messages),
    [messages],
  );

  const visible = useMemo(
    () => messages.filter((m) => !hiddenIds.has(m.id)),
    [messages, hiddenIds]
  );

  const display = showAll ? visible : visible.slice(0, INITIAL_LIMIT);
  const hasMore = !showAll && visible.length > INITIAL_LIMIT;

  return (
    <div className="space-y-2">
      {display.map((m) => {
        if (m.role === "tool_use") {
          const paired = m.toolUseId
            ? resultByToolUseId.get(m.toolUseId)
            : undefined;
          return (
            <ToolCard
              key={m.id}
              tool={m}
              result={paired}
              defaultExpanded={false}
            />
          );
        }
        if (m.role === "assistant" && m.text) {
          return (
            <div key={m.id} className="text-sm text-muted-foreground leading-relaxed prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {cleanupPromptPreview(m.text).slice(0, ASSISTANT_TEXT_PREVIEW_LEN)}
              </ReactMarkdown>
            </div>
          );
        }
        if (m.role === "user" && m.text) {
          return (
            <div key={m.id} className="text-sm rounded bg-accent/10 px-3 py-2">
              {cleanupPromptPreview(m.text).slice(0, USER_TEXT_PREVIEW_LEN)}
            </div>
          );
        }
        return null;
      })}
      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-accent hover:underline"
        >
          显示全部 {visible.length} 条消息
        </button>
      )}
    </div>
  );
}
