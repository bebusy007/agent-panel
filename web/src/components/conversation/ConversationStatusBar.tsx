import React from "react";
import type { ChatSessionState } from "@/lib/conversation/chat-session-store";
import { getContextUtilization, getContextWarningLevel } from "@/lib/conversation/chat-session-store";

interface ConversationStatusBarProps {
  state: ChatSessionState;
}

export function ConversationStatusBar({ state }: ConversationStatusBarProps) {
  const utilization = getContextUtilization(state);
  const warningLevel = getContextWarningLevel(state);

  const formatTokens = (n: number): string => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n.toString();
  };

  const formatCost = (c: number): string => {
    if (c < 0.01) return "<$0.01";
    return "$" + c.toFixed(2);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border text-xs text-muted-foreground">
      {/* Model */}
      {state.model && (
        <span className="font-medium text-foreground">{formatModelName(state.model)}</span>
      )}

      {/* Tokens */}
      {(state.usage.inputTokens > 0 || state.usage.outputTokens > 0) && (
        <div className="flex items-center gap-1.5">
          <TokenBadge label="in" value={state.usage.inputTokens} format={formatTokens} />
          <TokenBadge label="out" value={state.usage.outputTokens} format={formatTokens} />
          {state.usage.cacheReadTokens > 0 && (
            <TokenBadge label="cache" value={state.usage.cacheReadTokens} format={formatTokens} />
          )}
        </div>
      )}

      {/* Context bar */}
      {utilization > 0 && (
        <div className="flex items-center gap-1.5 ml-auto">
          <ContextBar utilization={utilization} warningLevel={warningLevel} />
          <span className="tabular-nums">{Math.round(utilization * 100)}%</span>
        </div>
      )}

      {/* Cost */}
      {state.usage.cost > 0 && (
        <span className="tabular-nums">{formatCost(state.usage.cost)}</span>
      )}
    </div>
  );
}

function TokenBadge({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
}) {
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground/60">{label}:</span>
      {format(value)}
    </span>
  );
}

function ContextBar({
  utilization,
  warningLevel,
}: {
  utilization: number;
  warningLevel: "none" | "moderate" | "high" | "critical";
}) {
  const colors: Record<typeof warningLevel, string> = {
    none: "bg-primary",
    moderate: "bg-yellow-500",
    high: "bg-orange-500",
    critical: "bg-destructive",
  };

  return (
    <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colors[warningLevel]}`}
        style={{ width: `${Math.round(utilization * 100)}%` }}
      />
    </div>
  );
}

function formatModelName(model: string): string {
  // Shorten long model IDs: "claude-sonnet-4-20250514" → "Sonnet 4"
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-").slice(0, 2).join("-");
}
