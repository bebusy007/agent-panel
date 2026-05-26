/**
 * Per-tool color palette. Mirrors OpenCovibe's tool-colors.ts but trimmed
 * to the canonical names we actually render (others fall through to
 * `defaultToolColor`). Both raw agent names (Bash, Shell, exec_command)
 * and our canonical names map here directly so callers don't need to
 * normalize first.
 */

export interface ToolColor {
  /** Tailwind background class for the icon chip. */
  bg: string;
  /** Tailwind text class for the icon and accent. */
  text: string;
  /** Tailwind border class for the card outline. */
  border: string;
  /** Single-character emoji icon. We avoid SVG paths here — emojis
   *  ship for free and stay legible at 12px. */
  icon: string;
}

export const defaultToolColor: ToolColor = {
  bg: 'bg-bg-elevated',
  text: 'text-fg-muted',
  border: 'border-border',
  icon: '🛠',
};

const PALETTE: Record<string, ToolColor> = {
  Read: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300 dark:text-blue-300',
    border: 'border-blue-500/30',
    icon: '📖',
  },
  read_file: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    icon: '📖',
  },

  Write: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: '📝',
  },
  write_file: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: '📝',
  },

  Edit: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: '✏️',
  },
  edit_file: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: '✏️',
  },
  MultiEdit: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: '✏️',
  },
  apply_patch: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: '✏️',
  },
  NotebookEdit: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-300',
    border: 'border-violet-500/30',
    icon: '📓',
  },

  Bash: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: '▶',
  },
  bash: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: '▶',
  },
  Shell: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: '▶',
  },
  shell: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: '▶',
  },
  exec_command: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: '▶',
  },
  run_terminal_cmd: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    icon: '▶',
  },

  Grep: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },
  grep_search: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },
  codebase_search: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },
  Glob: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },
  file_search: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },
  search_files: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },

  LS: {
    bg: 'bg-fuchsia-500/10',
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-500/30',
    icon: '📂',
  },
  list_dir: {
    bg: 'bg-fuchsia-500/10',
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-500/30',
    icon: '📂',
  },
  list_directory: {
    bg: 'bg-fuchsia-500/10',
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-500/30',
    icon: '📂',
  },

  WebFetch: { bg: 'bg-sky-500/10', text: 'text-sky-300', border: 'border-sky-500/30', icon: '🌐' },
  WebSearch: { bg: 'bg-sky-500/10', text: 'text-sky-300', border: 'border-sky-500/30', icon: '🌐' },
  web_search: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    icon: '🌐',
  },

  Task: { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/30', icon: '🤖' },
  Agent: { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/30', icon: '🤖' },

  TodoWrite: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '✅',
  },
  todo_write: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '✅',
  },
  TodoRead: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '📋',
  },

  ExitPlanMode: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '📋',
  },
  EnterPlanMode: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '📋',
  },
  AskUserQuestion: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-300',
    border: 'border-yellow-500/30',
    icon: '❓',
  },
  Skill: { bg: 'bg-rose-500/10', text: 'text-rose-300', border: 'border-rose-500/30', icon: '⚡' },

  // ── Task tools ──
  TaskUpdate: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '✅',
  },
  TaskCreate: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '✅',
  },
  TaskList: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '✅',
  },
  TaskStop: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '✅',
  },
  TaskOutput: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '✅',
  },

  // ── Communication / Team ──
  SendMessage: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
    icon: '💬',
  },
  TeamCreate: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
    icon: '👥',
  },
  TeamDelete: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
    icon: '👥',
  },

  // ── Search ──
  rg: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },
  SemanticSearch: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    icon: '🔎',
  },

  // ── Read variants ──
  ReadFile: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    icon: '📖',
  },
  ReadLints: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
    icon: '📖',
  },

  // ── Destructive ──
  Delete: { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/30', icon: '🗑' },

  // ── Wait / Monitor ──
  Await: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
    icon: '⏳',
  },
  AwaitShell: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
    icon: '⏳',
  },
  Monitor: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-300',
    border: 'border-slate-500/30',
    icon: '📊',
  },

  // ── MCP ──
  CallMcpTool: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    icon: '🔌',
  },

  // ── Edit variants ──
  StrReplace: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    icon: '✏️',
  },

  // ── Question / Planning ──
  AskQuestion: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-300',
    border: 'border-yellow-500/30',
    icon: '❓',
  },
  SwitchMode: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '📋',
  },
  CreatePlan: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    icon: '📋',
  },
};

/** Look up a color palette by raw or canonical tool name. */
export function getToolColor(name: string | undefined): ToolColor {
  if (!name) return defaultToolColor;
  return PALETTE[name] ?? defaultToolColor;
}
