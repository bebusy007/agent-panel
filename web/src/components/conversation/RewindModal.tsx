import React, { useState, useMemo } from "react";
import { RotateCcw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { TimelineEntry } from "@/lib/conversation/chat-session-store";
import {
  deriveRewindCandidates,
  type RewindCandidate,
  type RewindDryRunResult,
  type RewindMarker,
} from "@/lib/conversation/rewind";

interface RewindModalProps {
  open: boolean;
  timeline: TimelineEntry[];
  onClose: () => void;
  onDryRun: (uuid: string) => Promise<RewindDryRunResult>;
  onExecute: (uuid: string) => Promise<RewindDryRunResult>;
  onSuccess: (marker: RewindMarker) => void;
}

type Phase = "select" | "preview" | "executing";

export function RewindModal({
  open,
  timeline,
  onClose,
  onDryRun,
  onExecute,
  onSuccess,
}: RewindModalProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [selected, setSelected] = useState<RewindCandidate | null>(null);
  const [dryRunResult, setDryRunResult] = useState<RewindDryRunResult | null>(null);
  const [dryRunSkipped, setDryRunSkipped] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => deriveRewindCandidates(timeline), [timeline]);

  if (!open) return null;

  const handleSelect = async (candidate: RewindCandidate) => {
    setSelected(candidate);
    setError(null);
    setPhase("preview");

    try {
      const result = await onDryRun(candidate.cliUuid);
      if (result.canRewind) {
        setDryRunResult(result);
      } else if (result.error && isDryRunUnsupportedError(result.error)) {
        setDryRunSkipped(true);
        setDryRunResult(null);
      } else {
        setError(result.error || "Cannot rewind to this checkpoint");
        setPhase("select");
      }
    } catch (e) {
      setDryRunSkipped(true);
      setDryRunResult(null);
    }
  };

  const handleExecute = async () => {
    if (!selected) return;
    setPhase("executing");
    setExecuting(true);
    setError(null);

    try {
      const result = await onExecute(selected.cliUuid);
      if (result.canRewind || (!result.error && result.filesChanged !== undefined)) {
        onSuccess({
          id: crypto.randomUUID(),
          ts: Date.now(),
          targetContent: selected.content,
          targetUuid: selected.cliUuid,
          filesReverted: result.filesChanged ?? [],
          degraded: false,
        });
        onClose();
      } else {
        setError(result.error || "Rewind failed");
        setPhase("preview");
      }
    } catch (e: any) {
      setError(e?.message || "Rewind failed");
      setPhase("preview");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <RotateCcw className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Rewind Files</h2>
          <button
            onClick={onClose}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto">
          {phase === "select" && (
            <div className="p-2 space-y-1">
              {candidates.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No rewind checkpoints available
                </p>
              ) : (
                candidates.map((c, i) => (
                  <button
                    key={c.cliUuid}
                    onClick={() => handleSelect(c)}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-secondary transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono w-5">
                        #{candidates.length - i}
                      </span>
                      <span className="text-sm text-foreground truncate flex-1">
                        {c.content.slice(0, 80)}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-7">
                      {new Date(c.ts).toLocaleTimeString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {phase === "preview" && selected && (
            <div className="p-4 space-y-3">
              <p className="text-sm text-foreground">
                Rewind to: <span className="font-medium">{selected.content.slice(0, 60)}</span>
              </p>

              {dryRunSkipped && (
                <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 px-3 py-2 rounded-md">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Preview unavailable. You can still proceed.
                </div>
              )}

              {dryRunResult?.filesChanged && dryRunResult.filesChanged.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Files to revert:</span>
                  <ul className="text-xs font-mono text-foreground space-y-0.5 max-h-32 overflow-y-auto">
                    {dryRunResult.filesChanged.map((f) => (
                      <li key={f} className="px-2 py-0.5 rounded bg-secondary/50">{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setPhase("select"); setSelected(null); }}
                  className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground"
                >
                  Back
                </button>
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {executing ? "Reverting..." : "Rewind"}
                </button>
              </div>
            </div>
          )}

          {phase === "executing" && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Reverting files...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function isDryRunUnsupportedError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("unsupported") ||
    lower.includes("unknown subtype") ||
    lower.includes("unknown command")
  );
}
