import { getRoleTheme, getAllRoleThemes } from '../role-theme';

describe('getRoleTheme', () => {
  it.each(['user', 'assistant', 'tool_use', 'tool_result', 'system', 'meta', 'subagent'])(
    "returns a theme for known role '%s'",
    (role) => {
      const theme = getRoleTheme(role);
      expect(theme.key).toBe(role);
      expect(theme.label).toBeTruthy();
      expect(theme.icon).toBeDefined();
      expect(theme.color).toBeTruthy();
      expect(theme.bgCard).toBeTruthy();
      expect(theme.borderCard).toBeTruthy();
    },
  );

  it('returns fallback for unknown role', () => {
    const theme = getRoleTheme('nonsense');
    expect(theme.key).toBe('unknown');
    expect(theme.label).toBe('Unknown');
  });

  it('each role has a unique color', () => {
    const themes = getAllRoleThemes();
    const colors = themes.map((t) => t.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('getAllRoleThemes', () => {
  it('returns all 8 roles', () => {
    expect(getAllRoleThemes()).toHaveLength(8);
  });
});
