/**
 * Cross-agent tool name normalization.
 *
 * Different CLIs / agents use different names for the same conceptual tool
 * (Claude → "Bash", Cursor → "Shell", Codex → "exec_command", …). UI render
 * dispatch and color lookup work in the canonical namespace; raw names are
 * preserved on each Message so the "raw JSON" view stays honest.
 */

/** Canonical names the UI dispatches against. Adding a new card means
 *  adding the canonical name + an entry per source raw name below. */
export type CanonicalTool =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'MultiEdit'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'LS'
  | 'WebFetch'
  | 'WebSearch'
  | 'Task'
  | 'TodoWrite'
  | 'TodoRead'
  | 'NotebookEdit'
  | 'ExitPlanMode'
  | 'AskUserQuestion'
  | 'Skill'
  | 'Permission'
  /** Anything we haven't mapped — falls through to DefaultCard. */
  | 'Unknown';

const ALIASES: Record<string, CanonicalTool> = {
  // ── Claude Code (pass-through) ──
  Read: 'Read',
  Write: 'Write',
  Edit: 'Edit',
  MultiEdit: 'MultiEdit',
  Bash: 'Bash',
  Grep: 'Grep',
  Glob: 'Glob',
  LS: 'LS',
  WebFetch: 'WebFetch',
  WebSearch: 'WebSearch',
  Task: 'Task',
  Agent: 'Task',
  TodoWrite: 'TodoWrite',
  TodoRead: 'TodoRead',
  NotebookEdit: 'NotebookEdit',
  ExitPlanMode: 'ExitPlanMode',
  AskUserQuestion: 'AskUserQuestion',
  Skill: 'Skill',

  // ── Cursor agent / composer ──
  Shell: 'Bash',
  shell: 'Bash',
  read_file: 'Read',
  edit_file: 'Edit',
  write_file: 'Write',
  list_dir: 'LS',
  list_directory: 'LS',
  search_files: 'Grep',
  grep_search: 'Grep',
  file_search: 'Glob',
  codebase_search: 'Grep',
  web_search: 'WebSearch',
  todo_write: 'TodoWrite',
  delete_file: 'Write',
  create_file: 'Write',
  run_terminal_cmd: 'Bash',

  // ── Codex (function_call.name) ──
  exec_command: 'Bash',
  apply_patch: 'Edit',
  // Codex MCP tool calls and others fall through to Unknown by default.

  // ── Additional aliases ──
  StrReplace: 'Edit',
  ReadFile: 'Read',
  rg: 'Grep',
  AskQuestion: 'AskUserQuestion',
  Delete: 'Write',
};

/** Map any raw agent tool name to a canonical name. */
export function canonicalTool(rawName: string | undefined): CanonicalTool {
  if (!rawName) return 'Unknown';
  return ALIASES[rawName] ?? 'Unknown';
}

/** True if this canonical tool reads or writes files (used for FilesPanel). */
export function isFileTool(name: CanonicalTool): boolean {
  return (
    name === 'Read' ||
    name === 'Write' ||
    name === 'Edit' ||
    name === 'MultiEdit' ||
    name === 'NotebookEdit'
  );
}

/** Best-effort detail label for a tool input — first non-empty hit wins.
 *  Mirrors OpenCovibe's getToolDetail() ordering. */
export function getToolDetail(input: unknown, rawToolName?: string): string {
  if (!input || typeof input !== 'object') {
    return extractMcpAction(rawToolName) ?? '';
  }
  const o = input as Record<string, unknown>;
  const keys = [
    'file_path',
    'notebook_path',
    'path',
    'command',
    'cmd',
    'pattern',
    'query',
    'url',
    'description',
    'prompt',
    'subagent_type',
    'subagentType',
    'team_name',
    'subject',
    'skill',
    'recipient',
  ] as const;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  // Fallback: extract action from MCP tool name pattern
  return extractMcpAction(rawToolName) ?? '';
}

/** Extract short action name from MCP tool names like
 *  `mcp__plugin_{plugin}_{server}__{action}` → `{action}`. */
function extractMcpAction(rawName: string | undefined): string | undefined {
  if (!rawName || !rawName.startsWith('mcp__')) return undefined;
  const doubleUnderIdx = rawName.indexOf('__', 5); // skip first "mcp__"
  if (doubleUnderIdx === -1) return undefined;
  const action = rawName.slice(doubleUnderIdx + 2);
  return action || undefined;
}
