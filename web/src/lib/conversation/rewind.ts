import type { TimelineEntry, UserTimelineEntry } from "./chat-session-store";

export interface RewindCandidate {
  cliUuid: string;
  content: string;
  ts: number;
  timelineIndex: number;
}

export interface RewindDryRunResult {
  canRewind: boolean;
  filesChanged?: string[];
  error?: string;
}

export interface RewindMarker {
  id: string;
  ts: number;
  targetContent: string;
  targetUuid: string;
  filesReverted: string[];
  degraded: boolean;
}

export function deriveRewindCandidates(timeline: TimelineEntry[]): RewindCandidate[] {
  return timeline
    .map((entry, idx) => ({ entry, idx }))
    .filter(
      ({ entry }) => entry.kind === "user" && !!(entry as UserTimelineEntry).uuid
    )
    .map(({ entry, idx }) => {
      const user = entry as UserTimelineEntry;
      return {
        cliUuid: user.uuid!,
        content: user.text,
        ts: user.ts,
        timelineIndex: idx,
      };
    })
    .reverse(); // Most recent first
}

export function isDryRunUnsupported(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("unsupported") ||
    lower.includes("unknown subtype") ||
    lower.includes("unknown command") ||
    lower.includes("dry_run")
  );
}

export function isFilesParamUnsupported(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes("files") && lower.includes("unsupported");
}

export function parseDryRunResult(raw: Record<string, unknown>): RewindDryRunResult {
  // Handle both camelCase and snake_case
  const canRewind = raw.canRewind ?? raw.can_rewind;
  const filesChanged = (raw.filesChanged ?? raw.files_changed) as string[] | undefined;
  const error = raw.error as string | undefined;

  if (error) {
    return { canRewind: false, error };
  }

  if (canRewind === true || (filesChanged !== undefined && !error)) {
    return { canRewind: true, filesChanged: filesChanged ?? [] };
  }

  if (canRewind === false) {
    return { canRewind: false, error: "Cannot rewind to this checkpoint" };
  }

  // Ambiguous — assume success if no explicit error
  return { canRewind: true, filesChanged: [] };
}
