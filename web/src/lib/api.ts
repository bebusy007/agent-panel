/**
 * API client adapted for the Rust backend.
 *
 * This file replaces the old api.ts import targets with types and
 * functions that match the Rust server's response format exactly.
 *
 * Rust backend is the authority. Frontend adapts to it.
 */

// =====================================================
// Types matching Rust responses
// =====================================================

export interface RustSkillSummary {
  id: string;
  name: string;
  source: string;
  marketplace?: string;
  description?: string;
  triggers: string[];
  cliCommands: string[];
  symlinkTo?: string;
  fileSize: number;
  filePath: string;
}

export interface RustMcpSummary {
  serverName: string;
  source: string;
  description?: string;
  command?: string;
  url?: string;
  toolCount: number;
  toolNames: string[];
  resourceCount: number;
  configuredIn: string[];
}

export interface RustSessionSummary {
  id: string;
  source: string;
  title: string;
  filePath: string;
  projectDir: string;
  firstUserMessage?: string;
  cwd?: string;
  gitBranch?: string;
  model?: string;
  sessionIdRaw?: string;
  startedAt?: string;
  lastActivity?: string;
  messageCount: number;
  sizeBytes: number;
  subagentCount: number;
  tokensTotal?: number;
  tokensInput?: number;
  tokensOutput?: number;
  tokensCacheRead?: number;
  tokensCacheWrite?: number;
  estimatedCostUsd?: number;
}

export interface ImageMeta {
  index: number;
  mediaType: string;
  sourceType: string;
  cachePath?: string;
  filePath?: string;
}

export interface RustMessage {
  id: string;
  role: string;
  text?: string;
  thinkingText?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  toolUseId?: string;
  toolStatus?: string;
  timestamp?: string;
  model?: string;
  images?: ImageMeta[];
  raw?: unknown;
  agentHash?: string;
}

export function imageUrl(sessionId: string, messageId: string, index: number, cachePath?: string): string {
  const base = `/api/sessions/${encodeURIComponent(sessionId)}/images/${encodeURIComponent(messageId)}/${index}`;
  if (cachePath) return `${base}?cache_path=${encodeURIComponent(cachePath)}`;
  return base;
}

export interface RustSearchHit {
  sessionId: string;
  messageId: string;
  role: string;
  snippet: string;
  projectName?: string;
  timestamp?: string;
  model?: string;
  score: number;
}

export interface RustStatsResponse {
  totals: {
    skills: number;
    mcps: number;
    sessions: number;
    hooks: number;
    agents: number;
    plugins: number;
    sources: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  scanTimeMs: number;
}

export interface RustProjectEntry {
  projectDir: string;
  sessionCount: number;
  totalTokens: number;
  lastActivity: string;
}

export interface RustDailyEntry {
  date: string;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  sessionCount: number;
  costUsd: number;
  // Legacy compat
  tokens?: number;
  sessions?: number;
  messages?: number;
}

export interface RustModelAggregate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  pct: number;
}

export interface RustUsageOverview {
  totalSessions: number;
  totalTokens: number;
  totalCostUsd: number;
  totalMessages: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  daily: RustDailyEntry[];
  bySource: Array<{ source: string; count: number }>;
  byModel: RustModelAggregate[];
  heatmap: RustDailyEntry[];
}

export interface RustFavoriteItem {
  id: string;
  sessionId: string;
  messageId: string;
  label?: string;
  createdAt: string;
  sessionTitle?: string;
  sessionSource?: string;
  sessionCwd?: string;
  message?: RustMessage;
}

export interface LogFileInfo {
  name: string;
  sizeBytes: number;
  date: string;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
  span?: string;
  fields?: Record<string, unknown>;
}

export interface RustHookEntry {
  event: string;
  commands: string[];
  scope: string;
}

export interface RustAgentEntry {
  name: string;
  filePath: string;
  description?: string;
}

export interface RustPluginEntry {
  name: string;
  scope: string;
  version?: string;
  installPath?: string;
}

export interface RustCommandEntry {
  command: string;
  skill: string;
  source: string;
}

// =====================================================
// API client
// =====================================================

import { logger, SESSION_ID } from "@/lib/logger";

const inflightGets = new Map<string, Promise<unknown>>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";

  // Deduplicate identical in-flight GET requests (React StrictMode fires
  // useEffect twice in dev mode, producing redundant fetches).
  if (method === "GET" && !init?.body) {
    const existing = inflightGets.get(path);
    if (existing) return existing as Promise<T>;

    const promise = doRequest<T>(path, init).finally(() => {
      inflightGets.delete(path);
    });
    inflightGets.set(path, promise);
    return promise;
  }

  return doRequest<T>(path, init);
}

async function doRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const requestId = crypto.randomUUID();
  const start = performance.now();

  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Request-Id": requestId,
      "X-Session-Id": SESSION_ID,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const latencyMs = Math.round(performance.now() - start);
  const method = init?.method ?? "GET";

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error("http", `${method} ${path} → ${res.status}`, {
      requestId,
      latencyMs,
      status: res.status,
      body: text.slice(0, 200),
    });
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  logger.debug("http", `${method} ${path} → ${res.status}`, {
    requestId,
    latencyMs,
    status: res.status,
  });

  return (await res.json()) as T;
}

export const rustApi = {
  // Health
  health: () => request<{ status: string; server: string; version: string }>("/api/health"),

  // Stats
  stats: () => request<RustStatsResponse>("/api/stats"),
  statsActivity: (weeks = 52) =>
    request<{ weeks: number; days: Array<{ date: string; tokens: number; sessions: number; messages: number }>; totals: { tokens: number; sessions: number } }>(
      `/api/stats/activity?weeks=${weeks}`
    ),

  // Skills
  skills: () => request<{ skills: RustSkillSummary[]; total: number }>("/api/skills"),
  skill: (id: string) => request<{ skill: RustSkillSummary } | { error: string }>(
    `/api/skills/${encodeURIComponent(id)}`
  ),

  // MCPs
  mcps: () => request<{ mcps: RustMcpSummary[]; total: number }>("/api/mcps"),
  mcp: (name: string) => request<{ mcp: RustMcpSummary } | { error: string }>(
    `/api/mcps/${encodeURIComponent(name)}`
  ),

  // Sessions
  sessionsList: (params: { source?: string; q?: string; limit?: number; sortBy?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.source) qs.set("source", params.source);
    if (params.q) qs.set("q", params.q);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.sortBy) qs.set("sort_by", params.sortBy);
    return request<{ total: number; sessions: RustSessionSummary[]; scanTimeMs: number }>(
      `/api/sessions?${qs.toString()}`
    );
  },
  sessionDetail: (id: string) =>
    request<SessionFull>(
      `/api/sessions/${encodeURIComponent(id)}`
    ),
  sessionSearch: (id: string, q: string, limit = 50) =>
    request<{ q: string; hits: Array<{ messageId: string; role: string; snippet: string }>; total: number }>(
      `/api/sessions/${encodeURIComponent(id)}/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
  sessionsProjects: () =>
    request<{ projects: RustProjectEntry[] }>("/api/sessions/projects"),
  sessionsSearch: (q: string, limit = 50) =>
    request<{ q: string; hits: RustSearchHit[]; total: number; searchTimeMs: number }>(
      `/api/sessions/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),
  sessionHealth: () =>
    request<{ status: string; sessionCount: number; scanTimeMs: number }>("/api/sessions/health"),
  sessionExportUrl: (id: string) => `/api/sessions/${encodeURIComponent(id)}/export.md`,
  sessionSubagent: (sessionId: string, agentHash: string) =>
    request<{ meta: { agentHash: string; messageCount: number; filePath: string }; messages: RustMessage[] }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/subagent/${encodeURIComponent(agentHash)}`
    ),

  // Search (full-text via Rust aho-corasick engine)
  searchMessages: (body: {
    query: string;
    filters?: {
      messageType?: string;
      projects?: string[];
      dateFrom?: string;
      dateTo?: string;
      hasToolCalls?: boolean;
      hasErrors?: boolean;
      hasFileChanges?: boolean;
    };
    limit?: number;
    offset?: number;
  }) =>
    request<{ query: string; hits: RustSearchHit[]; totalMatches: number; searchTimeMs: number }>(
      "/api/search/messages",
      { method: "POST", body: JSON.stringify(body) }
    ),

  // Trash
  sessionsTrash: (filePaths: string[]) =>
    request<{ trashed: string[]; errors: string[] }>("/api/sessions/trash", {
      method: "POST",
      body: JSON.stringify({ filePaths }),
    }),
  sessionsRestore: (filePaths: string[]) =>
    request<{ restored: string[]; errors: string[] }>("/api/sessions/restore", {
      method: "POST",
      body: JSON.stringify({ filePaths }),
    }),
  sessionsPermanentDelete: (filePaths: string[]) =>
    request<{ deleted: string[]; errors: string[] }>("/api/sessions/permanent-delete", {
      method: "POST",
      body: JSON.stringify({ filePaths }),
    }),
  trashList: () =>
    request<{ items: Array<{ path: string; project: string; sizeBytes: number }>; total: number }>(
      "/api/sessions/trash/list"
    ),

  // Resume
  sessionResume: (sessionId: string, mode: "terminal" | "ide" | "copy" = "copy") =>
    request<{ ok?: boolean; terminal?: string; via?: string; error?: string; hints?: ResumeHints; mode?: string }>("/api/sessions/resume", {
      method: "POST",
      body: JSON.stringify({ sessionId, mode }),
    }),

  // Extensions
  hooks: () => request<{ hooks: RustHookEntry[] }>("/api/extensions/hooks"),
  agents: () => request<{ agents: RustAgentEntry[] }>("/api/extensions/agents"),
  plugins: () => request<{ plugins: RustPluginEntry[] }>("/api/extensions/plugins"),
  commands: () => request<{ commands: RustCommandEntry[]; total: number }>("/api/extensions/commands"),
  extensionsSummary: () => request<{ hooks: number; agents: number; plugins: number }>("/api/extensions/summary"),

  // Usage
  usageOverview: (params: { source?: string; days?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.source) qs.set("source", params.source);
    if (params.days) qs.set("days", String(params.days));
    return request<RustUsageOverview>(`/api/usage/overview?${qs.toString()}`);
  },

  // Favorites
  favoritesList: () => request<{ favorites: RustFavoriteItem[]; total: number }>("/api/favorites"),
  favoritesAdd: (body: { sessionId: string; messageId: string; label?: string }) =>
    request<{ favorite: RustFavoriteItem } | { error: string }>("/api/favorites", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  favoritesRemove: (id: string) =>
    request<{ ok: boolean } | { error: string }>(`/api/favorites/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  favoritesRemoveByMessage: (sessionId: string, messageId: string) =>
    request<{ ok: boolean } | { error: string }>(
      `/api/favorites/by-message/${encodeURIComponent(sessionId)}/${encodeURIComponent(messageId)}`,
      { method: "DELETE" }
    ),
  favoritesForSession: (sessionId: string) =>
    request<{ favorites: RustFavoriteItem[] }>(
      `/api/favorites/session/${encodeURIComponent(sessionId)}`
    ),

  // Refresh (force re-scan)
  refresh: () =>
    request<{ ok: boolean; sessionCount: number; scanTimeMs: number }>("/api/sessions/refresh", {
      method: "POST",
    }),

  // Sources
  sources: () => request<{ sources: Array<{ type: string; count: number }> }>("/api/sources"),

  // Open folder in Finder
  openFolder: (path: string) =>
    request<{ ok: boolean }>("/api/open-folder", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  // Version
  version: () => request<{ name: string; version: string; runtime: string }>("/api/version"),

  // Logs
  logsFiles: () => request<{ files: LogFileInfo[] }>("/api/logs/files"),
  logsContent: (file: string) =>
    request<{ file: string; entries: LogEntry[]; totalLines: number }>(
      `/api/logs/content?file=${encodeURIComponent(file)}`
    ),
};

// Default export alias so components can keep `import { api } from "@/lib/api"`
export const api = rustApi;


// =====================================================
// Type aliases for backward compat with old component imports
// Components can import these from "@/lib/api" instead of "@shared/types"
// =====================================================

export type Message = RustMessage;
export type SessionSummary = RustSessionSummary;
export type SkillSummary = RustSkillSummary;
export type MCPSummary = RustMcpSummary;
export type FavoriteItem = RustFavoriteItem;
export type SearchHit = RustSearchHit;
export type HookEntry = RustHookEntry;
export type AgentEntry = RustAgentEntry;
export type CommandEntry = RustCommandEntry;
export type InstalledPluginEntry = RustPluginEntry;

// Simplified types (Rust backend uses strings, not complex objects)
export type SessionSource = string;
export type SkillSource = string;
export type MCPSourceType = string;
export type MessageRole = string;
export type ToolStatus = string;

// Resume hints returned by the server
export interface ResumeHints {
  command?: string;
  terminalCommand?: string;
  ideCommand?: string;
}

// Session full detail response
export interface SessionFull {
  session: RustSessionSummary;
  messages: RustMessage[];
  messageCount: number;
  subagents?: SubagentMeta[];
  resumeHints?: ResumeHints;
}

// Skill detail (same as summary for now — Rust returns same struct)
export type Skill = RustSkillSummary;
export type MCP = RustMcpSummary;

// Subagent meta
export interface SubagentMeta {
  agentHash: string;
  agentType: string;
  description: string;
  messageCount: number;
  filePath: string;
}

// Trash entry
export interface TrashEntry {
  path: string;
  project: string;
  sizeBytes: number;
}

// Source info
export interface SourceInfo {
  type: string;
  count: number;
}

// Stats response
export type StatsResponse = RustStatsResponse;

// Usage types
export type UsageDailyEntry = RustDailyEntry;
export interface UsageOverview extends RustUsageOverview {}

export interface ActivityDay {
  date: string;
  tokens: number;
  sessions: number;
  messages: number;
}

export type HookEvent = string;

