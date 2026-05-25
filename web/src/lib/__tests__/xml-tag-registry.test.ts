import { resolveDisplay, xmlTagRegistry } from '../xml-tag-registry';

describe('xmlTagRegistry', () => {
  it('has task-notification config', () => {
    const cfg = xmlTagRegistry['task-notification'];
    expect(cfg).toBeDefined();
    expect(cfg.displayName).toBe('任务通知');
    expect(cfg.color).toBe('blue');
    expect(cfg.metaFields).toContain('task-id');
    expect(cfg.metaFields).toContain('status');
  });

  it('has system-reminder config', () => {
    const cfg = xmlTagRegistry['system-reminder'];
    expect(cfg).toBeDefined();
    expect(cfg.displayName).toBe('系统提醒');
    expect(cfg.color).toBe('amber');
  });

  it('has teammate-message config with function displayName', () => {
    const cfg = xmlTagRegistry['teammate-message'];
    expect(cfg).toBeDefined();
    expect(typeof cfg.displayName).toBe('function');
    expect(typeof cfg.color).toBe('function');
  });
});

describe('resolveDisplay', () => {
  it('resolves static displayName and color', () => {
    const cfg = xmlTagRegistry['task-notification'];
    const { name, color } = resolveDisplay(cfg, {});
    expect(name).toBe('任务通知');
    expect(color).toBe('blue');
  });

  it('resolves function-based displayName', () => {
    const cfg = xmlTagRegistry['teammate-message'];
    const { name } = resolveDisplay(cfg, { teammate_id: 'alice' });
    expect(name).toBe('队友: alice');
  });

  it('resolves function displayName without teammate_id', () => {
    const cfg = xmlTagRegistry['teammate-message'];
    const { name } = resolveDisplay(cfg, {});
    expect(name).toBe('队友消息');
  });

  it('resolves function-based color with fallback', () => {
    const cfg = xmlTagRegistry['teammate-message'];
    const { color } = resolveDisplay(cfg, {});
    expect(color).toBe('cyan');
  });

  it('resolves function-based color with provided value', () => {
    const cfg = xmlTagRegistry['teammate-message'];
    const { color } = resolveDisplay(cfg, { color: 'purple' });
    expect(color).toBe('purple');
  });
});
