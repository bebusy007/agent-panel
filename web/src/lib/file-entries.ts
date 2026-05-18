/**
 * Extract a list of file actions from a session's message stream.
 *
 * Walks every tool_use Message and inspects its toolName + toolInput to
 * decide whether it's a file Read / Write / Edit. Read paths show up
 * once per call; write paths get the latest action so the FilesTab list
 * reflects the most recent operation per file.
 */

import type { Message } from "@/lib/api";
import { canonicalTool, type CanonicalTool } from "@/lib/tool-aliases";
import { turnIndexForMessage, type TurnEntry } from "@/lib/turn-grouping";

export type FileAction = "read" | "write" | "edit";

export interface FileEntry {
  path: string;
  action: FileAction;
  /** ID of the corresponding tool_use Message — drives "scroll to" jumps. */
  toolUseId?: string;
  /** Stable id for React key. Falls back to path+toolUseId when missing. */
  messageId?: string;
  /** Turn index this file action belongs to (set when turns are provided). */
  turnIndex?: number;
}

const ACTION_BY_TOOL: Record<string, FileAction | undefined> = {
  Read: "read",
  Write: "write",
  Edit: "edit",
  MultiEdit: "edit",
  NotebookEdit: "edit",
};

function actionForTool(name: CanonicalTool): FileAction | undefined {
  return ACTION_BY_TOOL[name];
}

/** Pull a file path out of a tool input (works across Claude / Cursor / Codex). */
function pathFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  for (const key of ["file_path", "path", "notebook_path", "filePath", "filename"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/** Return entries in stream order, deduped by path (last write/edit wins). */
export function extractFileEntries(messages: Message[], turns?: TurnEntry[]): FileEntry[] {
  const collected: FileEntry[] = [];
  const lastByPath = new Map<string, number>();

  const msgIdToIndex = new Map<string, number>();
  for (let i = 0; i < messages.length; i++) msgIdToIndex.set(messages[i].id, i);

  for (const m of messages) {
    if (m.role !== "tool_use") continue;
    const canon = canonicalTool(m.toolName);
    const action = actionForTool(canon);
    if (!action) continue;
    const path = pathFromInput(m.toolInput);
    if (!path) continue;

    const ti = turns ? turnIndexForMessage(turns, msgIdToIndex.get(m.id) ?? 0) : undefined;

    if (action === "write" || action === "edit") {
      const existingIdx = lastByPath.get(path);
      if (existingIdx !== undefined) {
        const existing = collected[existingIdx]!;
        existing.action = action;
        existing.toolUseId = m.toolUseId;
        existing.messageId = m.id;
        existing.turnIndex = ti;
      } else {
        lastByPath.set(path, collected.length);
        collected.push({ path, action, toolUseId: m.toolUseId, messageId: m.id, turnIndex: ti });
      }
    } else {
      collected.push({ path, action, toolUseId: m.toolUseId, messageId: m.id, turnIndex: ti });
    }
  }

  // Final dedup pass for reads — keep one entry per path, but preserve
  // first-seen order; if the same path was both read and written, the
  // write/edit wins.
  const seen = new Map<string, FileEntry>();
  for (const e of collected) {
    const prev = seen.get(e.path);
    if (!prev) {
      seen.set(e.path, e);
    } else if (e.action !== "read" && prev.action === "read") {
      // upgrade read → write/edit
      seen.set(e.path, e);
    }
  }
  return Array.from(seen.values());
}
