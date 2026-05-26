import { imageUrl } from '../api';

describe('imageUrl', () => {
  it('builds basic URL without cache path', () => {
    const url = imageUrl('session-1', 'msg-1', 0);
    expect(url).toBe('/api/sessions/session-1/images/msg-1/0');
  });

  it('encodes special characters in session/message ids', () => {
    const url = imageUrl('a/b', 'c/d', 2);
    expect(url).toBe('/api/sessions/a%2Fb/images/c%2Fd/2');
  });

  it('appends cache_path query param when provided', () => {
    const url = imageUrl('s1', 'm1', 1, '/tmp/cache.png');
    expect(url).toBe('/api/sessions/s1/images/m1/1?cache_path=%2Ftmp%2Fcache.png');
  });

  it('handles index 0', () => {
    const url = imageUrl('s', 'm', 0);
    expect(url).toContain('/0');
  });
});

describe('rustApi (fetch mock)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockOk(data: unknown) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(''),
    });
  }

  function mockError(status: number, body = '') {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status,
      statusText: 'Error',
      text: () => Promise.resolve(body),
    });
  }

  it('health endpoint calls /api/health', async () => {
    const mockResponse = { status: 'ok', server: 'rust', version: '1.0' };
    mockOk(mockResponse);

    const { rustApi } = await import('../api');
    const result = await rustApi.health();
    expect(result).toEqual(mockResponse);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('throws on non-ok response', async () => {
    mockError(404, 'not found');
    const { rustApi } = await import('../api');
    await expect(rustApi.skills()).rejects.toThrow('404');
  });

  it('stats endpoint calls /api/stats', async () => {
    const data = { totals: { skills: 5 }, scanTimeMs: 10 };
    mockOk(data);
    const { rustApi } = await import('../api');
    const result = await rustApi.stats();
    expect(result).toEqual(data);
  });

  it('sessionsList builds query params', async () => {
    mockOk({ total: 0, sessions: [], scanTimeMs: 1 });
    const { rustApi } = await import('../api');
    await rustApi.sessionsList({ source: 'claude-code', q: 'test', limit: 10, sortBy: 'date' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('source=claude-code'),
      expect.anything(),
    );
  });

  it('sessionsTrash sends POST with filePaths', async () => {
    mockOk({ trashed: ['/a'], errors: [] });
    const { rustApi } = await import('../api');
    await rustApi.sessionsTrash(['/a']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/sessions/trash',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sessionExportUrl returns correct path', async () => {
    const { rustApi } = await import('../api');
    expect(rustApi.sessionExportUrl('abc')).toBe('/api/sessions/abc/export.md');
  });

  it('searchMessages sends POST', async () => {
    mockOk({ query: 'q', hits: [], totalMatches: 0, searchTimeMs: 1 });
    const { rustApi } = await import('../api');
    await rustApi.searchMessages({ query: 'hello' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/search/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('favoritesAdd sends POST', async () => {
    mockOk({ favorite: { id: '1' } });
    const { rustApi } = await import('../api');
    await rustApi.favoritesAdd({ sessionId: 's1', messageId: 'm1' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/favorites',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('favoritesRemove sends DELETE', async () => {
    mockOk({ ok: true });
    const { rustApi } = await import('../api');
    await rustApi.favoritesRemove('fav1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/favorites/fav1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('usageOverview builds query params', async () => {
    mockOk({ totalSessions: 1, daily: [] });
    const { rustApi } = await import('../api');
    await rustApi.usageOverview({ source: 'codex', days: 30 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('source=codex'),
      expect.anything(),
    );
  });

  it('refresh sends POST', async () => {
    mockOk({ ok: true, sessionCount: 10, scanTimeMs: 50 });
    const { rustApi } = await import('../api');
    await rustApi.refresh();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/sessions/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('openFolder sends POST with path', async () => {
    mockOk({ ok: true });
    const { rustApi } = await import('../api');
    await rustApi.openFolder('/some/path');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/open-folder',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('statsActivity with default weeks', async () => {
    mockOk({ weeks: 52, days: [], totals: { tokens: 0, sessions: 0 } });
    const { rustApi } = await import('../api');
    await rustApi.statsActivity();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/stats/activity?weeks=52',
      expect.any(Object),
    );
  });

  it('statsActivity with custom weeks', async () => {
    mockOk({ weeks: 4, days: [], totals: { tokens: 100, sessions: 5 } });
    const { rustApi } = await import('../api');
    await rustApi.statsActivity(4);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/stats/activity?weeks=4',
      expect.any(Object),
    );
  });

  it('skill fetches single skill by id', async () => {
    mockOk({
      skill: { id: 's1', name: 'test', source: 'user', filePath: '/f', fileSize: 100 },
    });
    const { rustApi } = await import('../api');
    await rustApi.skill('s1');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/skills/s1', expect.any(Object));
  });

  it('mcp fetches single mcp by name', async () => {
    mockOk({ mcp: { serverName: 'test-mcp', source: 'global' } });
    const { rustApi } = await import('../api');
    await rustApi.mcp('test-mcp');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/mcps/test-mcp', expect.any(Object));
  });

  it('sessionDetail fetches session by id', async () => {
    mockOk({ session: {}, messages: [], messageCount: 0, resumeHints: null });
    const { rustApi } = await import('../api');
    await rustApi.sessionDetail('session-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/sessions/session-1',
      expect.any(Object),
    );
  });

  it('favoritesForSession fetches favorites for session', async () => {
    mockOk({ favorites: [] });
    const { rustApi } = await import('../api');
    await rustApi.favoritesForSession('session-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/favorites/session/session-1',
      expect.any(Object),
    );
  });

  it('logsFiles fetches log file list', async () => {
    mockOk({ files: [] });
    const { rustApi } = await import('../api');
    await rustApi.logsFiles();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/logs/files', expect.any(Object));
  });

  it('logsContent fetches log file content', async () => {
    mockOk({ entries: [], totalLines: 0 });
    const { rustApi } = await import('../api');
    await rustApi.logsContent('agent-panel.2026-01-01.log');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/logs/content?file=agent-panel.2026-01-01.log',
      expect.any(Object),
    );
  });
});
