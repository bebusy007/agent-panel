import {
  loadExpandedProjects,
  saveExpandedProjects,
  loadPinnedCwds,
  savePinnedCwds,
  loadRemovedCwds,
  saveRemovedCwds,
  loadSidebarWidth,
  saveSidebarWidth,
  SIDEBAR_BOUNDS,
  loadSidebarCollapsed,
  saveSidebarCollapsed,
  loadTurnPanelWidth,
  saveTurnPanelWidth,
  TURN_PANEL_BOUNDS,
  loadTurnPanelCollapsed,
  saveTurnPanelCollapsed,
  loadRightPanelWidth,
  saveRightPanelWidth,
  RIGHT_PANEL_BOUNDS,
} from '../sidebar-state';

beforeEach(() => {
  localStorage.clear();
});

describe('loadExpandedProjects / saveExpandedProjects', () => {
  it('returns empty set by default', () => {
    expect(loadExpandedProjects().size).toBe(0);
  });

  it('roundtrips data', () => {
    const set = new Set(['cwd:/a', 'cwd:/b']);
    saveExpandedProjects(set);
    const loaded = loadExpandedProjects();
    expect(loaded).toEqual(set);
  });

  it('migrates from legacy sp: prefix', () => {
    localStorage.setItem('sp:expanded-projects', JSON.stringify(['cwd:/legacy']));
    const loaded = loadExpandedProjects();
    expect(loaded.has('cwd:/legacy')).toBe(true);
    expect(localStorage.getItem('sp:expanded-projects')).toBe(null);
    expect(localStorage.getItem('agent-panel:expanded-projects')).not.toBe(null);
  });
});

describe('loadPinnedCwds / savePinnedCwds', () => {
  it('returns empty array by default', () => {
    expect(loadPinnedCwds()).toEqual([]);
  });

  it('roundtrips data', () => {
    savePinnedCwds(['/a', '/b']);
    expect(loadPinnedCwds()).toEqual(['/a', '/b']);
  });
});

describe('loadRemovedCwds / saveRemovedCwds', () => {
  it('returns empty array by default', () => {
    expect(loadRemovedCwds()).toEqual([]);
  });

  it('roundtrips data', () => {
    saveRemovedCwds(['/x']);
    expect(loadRemovedCwds()).toEqual(['/x']);
  });
});

describe('loadSidebarWidth / saveSidebarWidth', () => {
  it('returns default for no stored value', () => {
    expect(loadSidebarWidth()).toBe(SIDEBAR_BOUNDS.default);
  });

  it('clamps to min', () => {
    saveSidebarWidth(50);
    expect(loadSidebarWidth()).toBe(SIDEBAR_BOUNDS.min);
  });

  it('clamps to max', () => {
    saveSidebarWidth(9999);
    expect(loadSidebarWidth()).toBe(SIDEBAR_BOUNDS.max);
  });

  it('stores valid values', () => {
    saveSidebarWidth(300);
    expect(loadSidebarWidth()).toBe(300);
  });

  it('returns default for non-numeric stored value', () => {
    localStorage.setItem('agent-panel:sidebar-width', 'abc');
    expect(loadSidebarWidth()).toBe(SIDEBAR_BOUNDS.default);
  });
});

describe('loadSidebarCollapsed / saveSidebarCollapsed', () => {
  it('returns false by default', () => {
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it('stores and loads true', () => {
    saveSidebarCollapsed(true);
    expect(loadSidebarCollapsed()).toBe(true);
  });

  it('stores and loads false', () => {
    saveSidebarCollapsed(true);
    saveSidebarCollapsed(false);
    expect(loadSidebarCollapsed()).toBe(false);
  });
});

describe('loadTurnPanelWidth / saveTurnPanelWidth', () => {
  it('returns default for no stored value', () => {
    expect(loadTurnPanelWidth()).toBe(TURN_PANEL_BOUNDS.default);
  });

  it('clamps to bounds', () => {
    saveTurnPanelWidth(50);
    expect(loadTurnPanelWidth()).toBe(TURN_PANEL_BOUNDS.min);
    saveTurnPanelWidth(9999);
    expect(loadTurnPanelWidth()).toBe(TURN_PANEL_BOUNDS.max);
  });
});

describe('loadTurnPanelCollapsed / saveTurnPanelCollapsed', () => {
  it('returns false by default', () => {
    expect(loadTurnPanelCollapsed()).toBe(false);
  });

  it('roundtrips', () => {
    saveTurnPanelCollapsed(true);
    expect(loadTurnPanelCollapsed()).toBe(true);
  });
});

describe('loadRightPanelWidth / saveRightPanelWidth', () => {
  it('returns default for no stored value', () => {
    expect(loadRightPanelWidth()).toBe(RIGHT_PANEL_BOUNDS.default);
  });

  it('clamps to bounds', () => {
    saveRightPanelWidth(50);
    expect(loadRightPanelWidth()).toBe(RIGHT_PANEL_BOUNDS.min);
    saveRightPanelWidth(9999);
    expect(loadRightPanelWidth()).toBe(RIGHT_PANEL_BOUNDS.max);
  });

  it('stores valid values', () => {
    saveRightPanelWidth(350);
    expect(loadRightPanelWidth()).toBe(350);
  });
});
