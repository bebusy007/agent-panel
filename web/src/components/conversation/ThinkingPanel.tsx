import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

interface ThinkingPanelProps {
  text: string;
  isThinking: boolean;
  startMs: number | null;
  endMs: number | null;
}

export function ThinkingPanel({
  text,
  isThinking,
  startMs,
  endMs,
}: ThinkingPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isThinking && startMs) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startMs) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (startMs && endMs) {
        setElapsed(Math.floor((endMs - startMs) / 1000));
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isThinking, startMs, endMs]);

  if (!text && !isThinking) return null;

  return (
    <div className="my-2 rounded-lg border border-border bg-secondary/30">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        <Brain className="w-3.5 h-3.5" />
        <span>Thinking</span>
        {elapsed > 0 && (
          <span className="ml-auto tabular-nums">
            {elapsed}s
            {isThinking && (
              <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            )}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="px-3 pb-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
          {text || (
            <span className="italic">Thinking...</span>
          )}
        </div>
      )}
    </div>
  );
}
