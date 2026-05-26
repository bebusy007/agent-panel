import type { RustSessionSummary, RustSkillSummary, RustMcpSummary } from '../../src/lib/api';

// ============================================================
// In-memory state store — simulates backend persistence
// ============================================================

let sessions: Record<string, RustSessionSummary> = {};
let skills: RustSkillSummary[] = [];
let mcps: RustMcpSummary[] = [];
let favorites: Array<{ id: string; sessionId: string; messageId: string; label?: string }> = [];

export function resetState() {
  sessions = {
    'test-session-1': {
      id: 'test-session-1',
      source: 'claude-code',
      title: 'Test session',
      messageCount: 5,
      tokensTotal: 1000,
      model: 'claude-sonnet-4',
      lastActivity: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      cwd: '/test/project',
      hidden: false,
      isRunning: false,
    },
    'test-session-2': {
      id: 'test-session-2',
      source: 'codex',
      title: 'Codex session',
      messageCount: 3,
      tokensTotal: 500,
      model: 'codex-mini',
      lastActivity: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      hidden: false,
      isRunning: false,
    },
  };
  skills = [
    {
      id: 'skill-1',
      name: 'test-skill',
      source: 'user',
      description: 'A test skill',
      triggers: ['test'],
      cliCommands: ['/test'],
      fileSize: 1024,
      filePath: '/test/skill.md',
    },
  ];
  mcps = [
    {
      serverName: 'test-mcp',
      source: 'global',
      description: 'A test MCP server',
    },
  ];
  favorites = [];
}

// Initialize with defaults
resetState();

// ============================================================
// State modifiers
// ============================================================

export function getSessions() {
  return Object.values(sessions);
}

export function getSession(id: string) {
  return sessions[id] ?? null;
}

export function addSession(session: RustSessionSummary) {
  sessions[session.id] = session;
}

export function deleteSession(id: string) {
  delete sessions[id];
}

export function getSkills() {
  return skills;
}

export function getMcps() {
  return mcps;
}

export function getFavorites() {
  return favorites;
}

export function addFavorite(fav: { sessionId: string; messageId: string; label?: string }) {
  const id = `fav-${Date.now()}`;
  favorites.push({ id, ...fav });
  return id;
}

export function deleteFavorite(id: string) {
  favorites = favorites.filter((f) => f.id !== id);
}
