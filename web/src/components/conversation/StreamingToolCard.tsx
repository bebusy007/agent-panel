import React from "react";
import { Loader2, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import type { ToolTimelineEntry } from "@/lib/conversation/chat-session-store";

interface StreamingToolCardProps {
  entry: ToolTimelineEntry;
}

export function StreamingToolCard({ entry }: StreamingToolCardProps) {
  const { toolName, input, status, output, isError } = entry;

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/20">
        <StatusIcon status={status} />
        <span className="text-sm font-medium text-foreground">{toolName}</span>
        <StatusLabel status={status} />
      </div>

      {input && (
        <div className="px-3 py-2 text-xs font-mono text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
          {tryFormatJson(input)}
        </div>
      )}

      {status === "success" && output && (
        <div className="px-3 py-2 border-t border-border text-xs font-mono text-foreground max-h-40 overflow-y-auto whitespace-pre-wrap">
          {output.length > 2000 ? output.slice(0, 2000) + "\n... (truncated)" : output}
        </div>
      )}

      {status === "error" && output && (
        <div className="px-3 py-2 border-t border-border text-xs font-mono text-destructive max-h-40 overflow-y-auto whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: ToolTimelineEntry["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "error":
      return <XCircle className="w-4 h-4 text-destructive" />;
    case "permission_prompt":
      return <ShieldAlert className="w-4 h-4 text-warning" />;
  }
}

function StatusLabel({ status }: { status: ToolTimelineEntry["status"] }) {
  const labels: Record<ToolTimelineEntry["status"], string> = {
    running: "Running...",
    success: "Done",
    error: "Failed",
    permission_prompt: "Awaiting permission",
  };
  const colors: Record<ToolTimelineEntry["status"], string> = {
    running: "text-primary",
    success: "text-green-500",
    error: "text-destructive",
    permission_prompt: "text-warning",
  };
  return (
    <span className={`ml-auto text-xs ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function tryFormatJson(input: string): string {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return input;
  }
}
