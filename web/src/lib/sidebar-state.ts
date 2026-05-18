/**
 * localStorage-backed sidebar state.
 *
 * Keys are namespaced under `agent-panel:` (the project will rename from
 * skill-panel to agent-panel in P6 — using the new prefix from the start
 * means no future migration). To avoid shipping breakage during the
 * transition we also lazy-read from the legacy `sp:` prefix once.
 */

const PREFIX = "agent-panel:";
const LEGACY_PREFIX = "sp:";

function read(key: string): string | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v != null) return v;
    const legacy = localStorage.getItem(LEGACY_PREFIX + key);
    if (legacy != null) {
      // One-time migrate
      localStorage.setItem(PREFIX + key, legacy);
      localStorage.removeItem(LEGACY_PREFIX + key);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // quota exceeded / disabled storage — silently drop
  }
}

function readJson<T>(key: string, fallback: T): T {
  const raw = read(key);
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  write(key, JSON.stringify(value));
}

// ── expanded project folders ──

export function loadExpandedProjects(): Set<string> {
  const arr = readJson<string[]>("expanded-projects", []);
  return new Set(Array.isArray(arr) ? arr.filter((v) => typeof v === "string") : []);
}

export function saveExpandedProjects(set: Set<string>) {
  writeJson("expanded-projects", [...set]);
}

// ── pinned project cwds ──

export function loadPinnedCwds(): string[] {
  const arr = readJson<string[]>("pinned-cwds", []);
  return Array.isArray(arr) ? arr.filter((v) => typeof v === "string") : [];
}

export function savePinnedCwds(arr: string[]) {
  writeJson("pinned-cwds", arr);
}

// ── removed (user-hidden) project cwds ──

export function loadRemovedCwds(): string[] {
  const arr = readJson<string[]>("removed-cwds", []);
  return Array.isArray(arr) ? arr.filter((v) => typeof v === "string") : [];
}

export function saveRemovedCwds(arr: string[]) {
  writeJson("removed-cwds", arr);
}

// ── sidebar geometry ──

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;

export function loadSidebarWidth(): number {
  const raw = read("sidebar-width");
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT;
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
}

export function saveSidebarWidth(px: number) {
  write("sidebar-width", String(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, px))));
}

export const SIDEBAR_BOUNDS = { min: SIDEBAR_MIN, max: SIDEBAR_MAX, default: SIDEBAR_DEFAULT };

// ── collapsed (icon-rail-only) toggle ──

export function loadSidebarCollapsed(): boolean {
  return read("sidebar-collapsed") === "1";
}

export function saveSidebarCollapsed(collapsed: boolean) {
  write("sidebar-collapsed", collapsed ? "1" : "0");
}

// ── turn panel (session detail left sidebar) ──

const TURN_PANEL_MIN = 120;
const TURN_PANEL_MAX = 400;
const TURN_PANEL_DEFAULT = 220;

export const TURN_PANEL_BOUNDS = { min: TURN_PANEL_MIN, max: TURN_PANEL_MAX, default: TURN_PANEL_DEFAULT };

export function loadTurnPanelWidth(): number {
  const raw = read("turn-panel-width");
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return TURN_PANEL_DEFAULT;
  return Math.min(TURN_PANEL_MAX, Math.max(TURN_PANEL_MIN, n));
}

export function saveTurnPanelWidth(px: number) {
  write("turn-panel-width", String(Math.min(TURN_PANEL_MAX, Math.max(TURN_PANEL_MIN, px))));
}

export function loadTurnPanelCollapsed(): boolean {
  return read("turn-panel-collapsed") === "1";
}

export function saveTurnPanelCollapsed(collapsed: boolean) {
  write("turn-panel-collapsed", collapsed ? "1" : "0");
}

// ── right panel (session detail right sidebar) ──

const RIGHT_PANEL_MIN = 200;
const RIGHT_PANEL_MAX = 480;
const RIGHT_PANEL_DEFAULT = 280;

export const RIGHT_PANEL_BOUNDS = { min: RIGHT_PANEL_MIN, max: RIGHT_PANEL_MAX, default: RIGHT_PANEL_DEFAULT };

export function loadRightPanelWidth(): number {
  const raw = read("right-panel-width");
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return RIGHT_PANEL_DEFAULT;
  return Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, n));
}

export function saveRightPanelWidth(px: number) {
  write("right-panel-width", String(Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, px))));
}

