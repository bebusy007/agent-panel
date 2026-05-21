import React, { useRef, useEffect } from "react";
import { MarkdownWithHighlight } from "@/components/session/MarkdownWithHighlight";

interface StreamingAssistantBlockProps {
  text: string;
  isStreaming: boolean;
}

export function StreamingAssistantBlock({
  text,
  isStreaming,
}: StreamingAssistantBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative py-2">
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
        {text ? (
          <MarkdownWithHighlight text={text} />
        ) : isStreaming ? (
          <span className="text-muted-foreground text-sm italic">Generating...</span>
        ) : null}
      </div>
      {isStreaming && text && <StreamingCursor />}
    </div>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-block w-2 h-4 ml-0.5 bg-foreground/70 animate-pulse rounded-sm align-text-bottom" />
  );
}
