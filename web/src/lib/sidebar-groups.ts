/**
 * Sidebar grouping — pure functions for building the project folder tree.
 *
 * Adapted from OpenCovibe's `src/lib/utils/sidebar-groups.ts`. We feed it
 * `SessionSummary[]` instead of OpenCovibe's `TaskRun[]`, but the shape
 * "buckets-by-cwd → groups-by-session-id" is the same.
 *
 * Pure functions only — no React, no localStorage. Easy to unit-test.
 */

import type { SessionSource, SessionSummary } from "@/lib/api";
import { cleanupPromptPreview } from "@/lib/text-cleanup";

export interface ConversationGroup {
  /** "s:<sessionIdRaw>" if available, otherwise "i:<id>" — stable key for collapse state. */
  groupKey: string;
  /** All sessions in this conversation, sorted by lastActivity desc.
   *  Same UUID often shows up under both `claude-code` and `claude-history`
   *  (the prompt-history variant). */
  sessions: SessionSummary[];
  /** Display title (latestSession.title || cwdShort || …) */
  title: string;
  /** Most recent session in the group — used for primary nav. */
  latestSession: SessionSummary;
  /** True if any session in the group has any favorited messages. */
  hasFavorite: boolean;
  /** Sum of messageCount across the group. */
  totalMessages: number;
  /** True if any session in the group looks like it's still being written to. */
  isRunning: boolean;
}

export interface ProjectFolder {
  /** Normalized cwd; empty string for "Uncategorized". */
  cwd: string;
  /** Stable key: "uncategorized" or "cwd:<path>" */
  folderKey: string;
  /** Pretty display label — `~`-shortened cwdShort when available. */
  label: string;
  isUncategorized: boolean;
  conversations: ConversationGroup[];
  conversationCount: number;
  /** Latest activity in the folder, used for sort. */
  latestActivityAt: string;
  /** True if any conversation under it isRunning. */
  isRunning: boolean;
}

/**
 * Normalize cwd: unify separators, strip trailing slash, uppercase Windows drive.
 * Returns "" for "/", "\", or empty.
 */
export function normalizeCwd(cwd: string | undefined): string {
  let s = (cwd ?? "").trim();
  if (!s || s === "/" || s === "\\") return "";
  // Windows: backslash → forward slash
  s = s.replace(/\\/g, "/");
  // Windows: drive letter uppercase (c:/Repo → C:/Repo)
  s = s.replace(/^([a-z]):/, (_, d: string) => d.toUpperCase() + ":");
  // Bare drive letter "C:" → "C:/"
  if (/^[A-Z]:$/.test(s)) return s + "/";
  // Preserve drive root "C:/"
  if (/^[A-Z]:\/$/.test(s)) return s;
  // Preserve UNC root "//server" (strip trailing slash if "//server/")
  if (/^\/\/[^/]+\/?$/.test(s)) return s.replace(/\/$/, "");
  // Strip trailing slashes
  return s.replace(/\/+$/, "");
}

function sortKey(s: SessionSummary): string {
  return s.lastActivity || s.startedAt || "";
}

function pickGroupKey(s: SessionSummary): string {
  if (s.sessionIdRaw) return `s:${s.sessionIdRaw}`;
  return `i:${s.id}`;
}

/**
 * Bucket sessions into project folders, then group them by session UUID
 * within each folder.
 */
export function buildProjectFolders(
  sessions: SessionSummary[],
  favoriteSessionIds: Set<string>,
  pinnedCwds: string[],
  removedCwds: string[] = [],
): ProjectFolder[] {
  // 1. Normalize removed/pinned
  const removedSet = new Set(removedCwds.map(normalizeCwd));
  removedSet.delete("");
  const cleanPinned = pinnedCwds
    .map(normalizeCwd)
    .filter((c) => c !== "" && !removedSet.has(c));

  // 2. Bucket by normalized cwd
  const cwdBuckets = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    if (false) continue; // never show trashed in folder tree
    const cwd = normalizeCwd(s.cwd);
    let bucket = cwdBuckets.get(cwd);
    if (!bucket) {
      bucket = [];
      cwdBuckets.set(cwd, bucket);
    }
    bucket.push(s);
  }

  // 3. Drop removed buckets
  for (const cwd of removedSet) cwdBuckets.delete(cwd);

  // 4. Ensure pinned cwds have entries (even if empty)
  for (const cwd of cleanPinned) {
    if (!cwdBuckets.has(cwd)) cwdBuckets.set(cwd, []);
  }

  // 5. Build folders
  const folders: ProjectFolder[] = [];
  for (const [cwd, bucketSessions] of cwdBuckets) {
    const isUncategorized = cwd === "";
    const folderKey = isUncategorized ? "uncategorized" : `cwd:${cwd}`;

    // Group by session UUID (or id fallback)
    const groupMap = new Map<string, SessionSummary[]>();
    for (const s of bucketSessions) {
      const k = pickGroupKey(s);
      let arr = groupMap.get(k);
      if (!arr) {
        arr = [];
        groupMap.set(k, arr);
      }
      arr.push(s);
    }
    const conversations: ConversationGroup[] = [];
    for (const [groupKey, group] of groupMap) {
      group.sort((a, b) => (sortKey(a) > sortKey(b) ? -1 : 1));
      const latest = group[0];
      const totalMessages = group.reduce((acc, s) => acc + (s.messageCount ?? 0), 0);
      const hasFavorite = group.some((s) => favoriteSessionIds.has(s.id));
      const isRunning = group.some((s) => !!false);
      // Strip Cursor's <user_query> wrappers / Claude slash command
      // envelopes before falling back, otherwise every Cursor row in the
      // sidebar reads "<user_query>".
      const title =
        cleanupPromptPreview(latest.title, 60) ||
        cleanupPromptPreview(latest.firstUserMessage, 60) ||
        latest.cwd?.replace(/^\/Users\/[^\/]+/, "~") ||
        "(无标题)";
      conversations.push({
        groupKey,
        sessions: group,
        title,
        latestSession: latest,
        hasFavorite,
        totalMessages,
        isRunning,
      });
    }
    conversations.sort((a, b) =>
      sortKey(a.latestSession) > sortKey(b.latestSession) ? -1 : 1,
    );

    const latestInFolder = conversations[0]?.latestSession;
    folders.push({
      cwd,
      folderKey,
      label: isUncategorized
        ? "未分类"
        : (bucketSessions.find((s) => !!s.cwd?.replace(/^\/Users\/[^\/]+/, "~"))?.cwd?.replace(/^\/Users\/[^\/]+/, "~") ??
          shortenLastSegment(cwd)),
      isUncategorized,
      conversations,
      conversationCount: conversations.length,
      latestActivityAt: latestInFolder ? sortKey(latestInFolder) : "",
      isRunning: conversations.some((c) => c.isRunning),
    });
  }

  // 6. Sort folders: pinned first (in pin order), then by latest activity desc,
  //    Uncategorized always last.
  const pinOrder = new Map(cleanPinned.map((c, i) => [c, i] as const));
  folders.sort((a, b) => {
    if (a.isUncategorized && !b.isUncategorized) return 1;
    if (b.isUncategorized && !a.isUncategorized) return -1;
    const ap = pinOrder.get(a.cwd);
    const bp = pinOrder.get(b.cwd);
    if (ap !== undefined && bp !== undefined) return ap - bp;
    if (ap !== undefined) return -1;
    if (bp !== undefined) return 1;
    return a.latestActivityAt > b.latestActivityAt ? -1 : 1;
  });

  return folders;
}

function shortenLastSegment(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : cwd;
}

/** Auto-expand the folder containing a given session id; returns next Set or null if no change. */
export function autoExpandForSession(
  sessionId: string,
  folders: ProjectFolder[],
  expanded: Set<string>,
): Set<string> | null {
  for (const f of folders) {
    if (f.conversations.some((c) => c.sessions.some((s) => s.id === sessionId))) {
      if (expanded.has(f.folderKey)) return null;
      const next = new Set(expanded);
      next.add(f.folderKey);
      return next;
    }
  }
  return null;
}

/** Source filter helper — match a folder against allowed source set. */
export function folderHasSource(folder: ProjectFolder, allowed: Set<SessionSource>): boolean {
  for (const c of folder.conversations) {
    for (const s of c.sessions) {
      if (allowed.has(s.source)) return true;
    }
  }
  return false;
}
