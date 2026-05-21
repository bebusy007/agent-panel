import React from "react";
import { ArrowDown } from "lucide-react";
import type { ChatSessionState, TimelineEntry } from "@/lib/conversation/chat-session-store";
import { useAutoScroll } from "@/lib/conversation/use-auto-scroll";
import { StreamingAssistantBlock } from "./StreamingAssistantBlock";
import { ThinkingPanel } from "./ThinkingPanel";
import { StreamingToolCard } from "./StreamingToolCard";
import { MessageBlock } from "@/components/session/MessageBlock";

interface ConversationTimelineProps {
  state: ChatSessionState;
}

export function ConversationTimeline({ state }: ConversationTimelineProps) {
  const { containerRef, scrollToBottom, showNewMessageIndicator } =
    useAutoScroll({
      deps: [state.timeline.length, state.streamingText, state.thinkingText],
    });

  const hasStreaming = state.streamingText || state.thinkingText;
  const isRunning = state.phase === "running";

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-4 py-3 space-y-1"
      >
        {state.timeline.map((entry) => (
          <TimelineEntryRenderer key={entry.id} entry={entry} />
        ))}

        {/* Active streaming section */}
        {hasStreaming && (
          <div className="mt-2">
            <ThinkingPanel
              text={state.thinkingText}
              isThinking={isRunning && !state.thinkingEndMs}
              startMs={state.thinkingStartMs}
              endMs={state.thinkingEndMs}
            />
            <StreamingAssistantBlock
              text={state.streamingText}
              isStreaming={isRunning}
            />
          </div>
        )}
      </div>

      {/* New messages floating indicator */}
      {showNewMessageIndicator && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          New messages
        </button>
      )}
    </div>
  );
}

function TimelineEntryRenderer({ entry }: { entry: TimelineEntry }) {
  switch (entry.kind) {
    case "user":
      return (
        <div className="flex justify-end py-1">
          <div className="max-w-[85%] rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {entry.text}
            </p>
            {entry.optimistic && (
              <span className="text-[10px] text-muted-foreground">Sending...</span>
            )}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div className="py-1">
          {entry.thinkingText && (
            <ThinkingPanel
              text={entry.thinkingText}
              isThinking={false}
              startMs={null}
              endMs={null}
            />
          )}
          <StreamingAssistantBlock text={entry.text} isStreaming={false} />
        </div>
      );

    case "tool":
      return <StreamingToolCard entry={entry} />;

    case "system":
      return (
        <div className="flex justify-center py-2">
          <span className="text-xs text-muted-foreground italic">
            {entry.text}
          </span>
        </div>
      );
  }
}
