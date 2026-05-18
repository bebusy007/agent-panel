import { getToolColor, defaultToolColor } from "../tool-colors";

describe("getToolColor", () => {
  it("returns default for undefined", () => {
    expect(getToolColor(undefined)).toEqual(defaultToolColor);
  });

  it("returns default for unknown tool", () => {
    expect(getToolColor("NonexistentTool")).toEqual(defaultToolColor);
  });

  it("returns correct color for Read", () => {
    const c = getToolColor("Read");
    expect(c.bg).toContain("blue");
    expect(c.icon).toBe("📖");
  });

  it("returns correct color for Write", () => {
    const c = getToolColor("Write");
    expect(c.bg).toContain("amber");
    expect(c.icon).toBe("📝");
  });

  it("returns correct color for Edit", () => {
    const c = getToolColor("Edit");
    expect(c.bg).toContain("amber");
    expect(c.icon).toBe("✏️");
  });

  it("returns correct color for Bash", () => {
    const c = getToolColor("Bash");
    expect(c.bg).toContain("emerald");
    expect(c.icon).toBe("▶");
  });

  it("maps Cursor Shell to same as Bash", () => {
    const c = getToolColor("Shell");
    expect(c.bg).toContain("emerald");
  });

  it("returns correct color for Grep", () => {
    const c = getToolColor("Grep");
    expect(c.bg).toContain("purple");
    expect(c.icon).toBe("🔎");
  });

  it("returns correct color for LS", () => {
    const c = getToolColor("LS");
    expect(c.bg).toContain("fuchsia");
  });

  it("returns correct color for WebFetch", () => {
    const c = getToolColor("WebFetch");
    expect(c.bg).toContain("sky");
  });

  it("returns correct color for Task/Agent", () => {
    const c = getToolColor("Task");
    expect(c.bg).toContain("cyan");
    expect(getToolColor("Agent").bg).toContain("cyan");
  });

  it("returns correct color for TodoWrite", () => {
    const c = getToolColor("TodoWrite");
    expect(c.bg).toContain("indigo");
  });

  it("returns correct color for AskUserQuestion", () => {
    const c = getToolColor("AskUserQuestion");
    expect(c.bg).toContain("yellow");
  });

  it("returns correct color for Skill", () => {
    const c = getToolColor("Skill");
    expect(c.bg).toContain("rose");
  });

  it("returns correct color for Delete", () => {
    const c = getToolColor("Delete");
    expect(c.bg).toContain("red");
  });
});
