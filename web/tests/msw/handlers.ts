import { http, HttpResponse } from 'msw';
import * as state from './state';

export const handlers = [
  // Health
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok', server: 'test', version: '0.0.1-test' });
  }),

  // Stats
  http.get('/api/stats', () => {
    return HttpResponse.json({
      skills: state.getSkills().length,
      mcps: state.getMcps().length,
      sessions: state.getSessions().length,
      favorites: state.getFavorites().length,
      hooks: 0,
      agents: 0,
      plugins: 0,
      sources: {},
      totalTokens: 1500,
      totalCostUsd: 0,
      scanTimeMs: 10,
    });
  }),

  // Sessions
  http.get('/api/sessions', () => {
    return HttpResponse.json({
      sessions: state.getSessions(),
      total: state.getSessions().length,
      scanTimeMs: 5,
    });
  }),

  http.get('/api/sessions/:id', ({ params }) => {
    const session = state.getSession(params.id as string);
    if (!session) {
      return HttpResponse.json({ error: 'not found' }, { status: 404 });
    }
    return HttpResponse.json({
      summary: session,
      messages: [],
      subagents: [],
      resumeHints: null,
    });
  }),

  http.post('/api/sessions/refresh', () => {
    return HttpResponse.json({ count: state.getSessions().length, scanTimeMs: 5 });
  }),

  http.post('/api/sessions/trash', async ({ request }) => {
    const body = (await request.json()) as { filePaths: string[] };
    for (const path of body.filePaths) {
      const id = path.split('/').pop()?.replace('.jsonl', '') ?? '';
      state.deleteSession(id);
    }
    return HttpResponse.json({ ok: true });
  }),

  // Search
  http.post('/api/search/messages', async ({ request }) => {
    const body = (await request.json()) as { query: string };
    return HttpResponse.json({
      q: body.query,
      hits: [],
      total: 0,
      searchTimeMs: 1,
    });
  }),

  // Skills
  http.get('/api/skills', () => {
    return HttpResponse.json({ skills: state.getSkills(), total: state.getSkills().length });
  }),

  // MCPs
  http.get('/api/mcps', () => {
    return HttpResponse.json({ mcps: state.getMcps(), total: state.getMcps().length });
  }),

  // Favorites
  http.get('/api/favorites', () => {
    return HttpResponse.json({ favorites: state.getFavorites() });
  }),

  http.post('/api/favorites', async ({ request }) => {
    const body = (await request.json()) as { sessionId: string; messageId: string; label?: string };
    const id = state.addFavorite(body);
    return HttpResponse.json({ id });
  }),

  http.delete('/api/favorites/:id', ({ params }) => {
    state.deleteFavorite(params.id as string);
    return HttpResponse.json({ ok: true });
  }),

  // Extensions
  http.get('/api/extensions/hooks', () => {
    return HttpResponse.json({ hooks: [] });
  }),

  http.get('/api/extensions/agents', () => {
    return HttpResponse.json({ agents: [] });
  }),

  http.get('/api/extensions/plugins', () => {
    return HttpResponse.json({ plugins: [] });
  }),

  http.get('/api/extensions/commands', () => {
    return HttpResponse.json({ commands: [] });
  }),

  http.get('/api/extensions/summary', () => {
    return HttpResponse.json({ hooks: 0, agents: 0, plugins: 0 });
  }),

  // Usage
  http.get('/api/usage/overview', () => {
    return HttpResponse.json({
      totalSessions: 2,
      totalTokens: 1500,
      totalMessages: 8,
      activeDays: 1,
      currentStreak: 1,
      longestStreak: 1,
      daily: [],
      byModel: {},
      bySource: {},
    });
  }),

  // Sources
  http.get('/api/sources', () => {
    return HttpResponse.json({ sources: {} });
  }),

  // Logs
  http.get('/api/logs/files', () => {
    return HttpResponse.json({ files: [] });
  }),

  http.get('/api/logs/content', () => {
    return HttpResponse.json({ entries: [] });
  }),

  // Projects
  http.get('/api/sessions/projects', () => {
    return HttpResponse.json({ projects: [] });
  }),
];
