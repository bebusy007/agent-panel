import { useState } from "react";
import type { Message, SubagentMeta } from "@/lib/api";
import { canonicalTool, getToolDetail } from "@/lib/tool-aliases";
import { ToolCardHeader, type ViewMode } from "./ToolCardHeader";
import { RawJsonView } from "./RawJsonView";
import { getToolColor } from "@/lib/tool-colors";
import { cn } from "@/lib/utils";
import { ReadCard } from "./cards/ReadCard";
import { EditCard } from "./cards/EditCard";
import { WriteCard } from "./cards/WriteCard";
import { BashCard } from "./cards/BashCard";
import { GrepCard } from "./cards/GrepCard";
import { WebFetchCard } from "./cards/WebFetchCard";
import { TodoWriteCard } from "./cards/TodoWriteCard";
import { TaskCard } from "./cards/TaskCard";
import { ExitPlanModeCard } from "./cards/ExitPlanModeCard";
import { AskUserQuestionCard } from "./cards/AskUserQuestionCard";
import { DefaultCard } from "./cards/DefaultCard";

interface Props {
  /** The tool_use message we're rendering. */
  tool: Message;
  /** The matching tool_result message (if any) — paired by toolUseId. */
  result?: Message;
  favorited?: boolean;
  onToggleFav?: () => void;
  /** Initial expanded state — defaults to true for "heavy" tools. */
  defaultExpanded?: boolean;
  subagentMeta?: SubagentMeta;
  sessionId?: string;
}

export function ToolCard({ tool, result, favorited, onToggleFav, defaultExpanded, subagentMeta, sessionId }: Props) {
  const canon = canonicalTool(tool.toolName);
  const palette = getToolColor(tool.toolName);
  const detail = getToolDetail(tool.toolInput);
  const [view, setView] = useState<ViewMode>("pretty");
  // Every tool card starts collapsed. Earlier we kept Edit / Write /
  // MultiEdit / Read open by default ("heavy" tools — file content /
  // diff was deemed worth the vertical space) but on long sessions
  // that meant hundreds of pixels of code expanded by default,
  // making the message stream unscannable. User flipped the rule:
  // collapse everything, click to expand the few you actually want.
  // `defaultExpanded` prop is still honored if a caller explicitly
  // wants a row open.
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? false);

  // Inherit the result's status onto the header so the icon reflects
  // the real outcome (the tool_use row itself doesn't know).
  const effectiveStatus = result?.toolStatus ?? tool.toolStatus;

  return (
    <div
      className={cn(
        "group overflow-hidden rounded-lg border bg-card transition-colors",
        palette.border,
      )}
    >
      <ToolCardHeader
        message={tool}
        detail={detail}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        view={view}
        onViewChange={setView}
        effectiveStatus={effectiveStatus}
        favorited={favorited}
        onToggleFav={onToggleFav}
      />
      {expanded && (
        <div>
          {view === "raw" ? (
            <div className="px-3 pb-3">
              <RawJsonView
                input={tool.toolInput}
                output={result?.toolOutput ?? tool.toolOutput}
                raw={tool.raw}
              />
            </div>
          ) : (
            renderPretty(canon, tool, result, subagentMeta, sessionId)
          )}
        </div>
      )}
    </div>
  );
}

function renderPretty(canon: string, tool: Message, result?: Message, subagentMeta?: SubagentMeta, sessionId?: string) {
  switch (canon) {
    case "Read":
      return <ReadCard tool={tool} result={result} />;
    case "Edit":
    case "MultiEdit":
      return <EditCard tool={tool} result={result} />;
    case "Write":
      return <WriteCard tool={tool} result={result} />;
    case "Bash":
      return <BashCard tool={tool} result={result} />;
    case "Grep":
    case "Glob":
    case "LS":
      return <GrepCard tool={tool} result={result} />;
    case "WebFetch":
    case "WebSearch":
      return <WebFetchCard tool={tool} result={result} />;
    case "TodoWrite":
      return <TodoWriteCard tool={tool} result={result} />;
    case "Task":
      return <TaskCard tool={tool} result={result} subagentMeta={subagentMeta} sessionId={sessionId} />;
    case "ExitPlanMode":
      return <ExitPlanModeCard tool={tool} result={result} />;
    case "AskUserQuestion":
      return <AskUserQuestionCard tool={tool} result={result} />;
    default:
      return <DefaultCard tool={tool} result={result} />;
  }
}
