import {
  getDefaults,
  loadTypography,
  saveTypography,
  applyTypography,
  TYPO_LEVELS,
} from "../typography";

beforeEach(() => {
  localStorage.clear();
});

describe("getDefaults", () => {
  it("returns a record with all TYPO_LEVELS keys", () => {
    const defaults = getDefaults();
    for (const level of TYPO_LEVELS) {
      expect(defaults[level.key]).toBe(level.defaultPx);
    }
  });

  it("has expected default values", () => {
    const defaults = getDefaults();
    expect(defaults.h1).toBe(24);
    expect(defaults.body).toBe(14);
    expect(defaults.caption).toBe(12);
  });
});

describe("loadTypography", () => {
  it("returns defaults when nothing is stored", () => {
    const loaded = loadTypography();
    expect(loaded).toEqual(getDefaults());
  });

  it("returns stored values", () => {
    const custom = { h1: 28, h2: 18, body: 16, caption: 13, label: 12, sub: 11 };
    localStorage.setItem("agent-panel:typography", JSON.stringify(custom));
    const loaded = loadTypography();
    expect(loaded.h1).toBe(28);
    expect(loaded.body).toBe(16);
  });

  it("fills missing keys with defaults", () => {
    localStorage.setItem(
      "agent-panel:typography",
      JSON.stringify({ h1: 30 }),
    );
    const loaded = loadTypography();
    expect(loaded.h1).toBe(30);
    expect(loaded.body).toBe(14);
  });

  it("handles corrupt JSON gracefully", () => {
    localStorage.setItem("agent-panel:typography", "not-json");
    const loaded = loadTypography();
    expect(loaded).toEqual(getDefaults());
  });
});

describe("saveTypography", () => {
  it("persists to localStorage", () => {
    const values = { h1: 26, h2: 17, body: 15, caption: 12, label: 11, sub: 10 };
    saveTypography(values);
    const raw = localStorage.getItem("agent-panel:typography");
    expect(raw).not.toBe(null);
    expect(JSON.parse(raw!)).toEqual(values);
  });
});

describe("applyTypography", () => {
  it("sets CSS variables on document root", () => {
    const values = { h1: 26, h2: 17, body: 15, caption: 13, label: 12, sub: 10 };
    applyTypography(values);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--text-h1")).toBe("26px");
    expect(root.style.getPropertyValue("--text-body")).toBe("15px");
  });

  it("uses loadTypography defaults when no argument", () => {
    applyTypography();
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--text-h1")).toBe("24px");
  });
});
