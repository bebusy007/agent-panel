import {
  cn,
  formatRelative,
  formatAbsolute,
  formatTimestamp,
  formatSmartTime,
  shortPath,
  describeSkillSource,
  describeMcpSource,
  sourceColor,
  describeSessionSource,
  roleColor,
  roleLabel,
  copyToClipboard,
  formatBytes,
  formatCost,
  formatTokens,
} from "../utils";

describe("cn", () => {
  it("merges tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles conditional classes", () => {
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe(
      "text-sm font-bold",
    );
  });

  it("returns empty string for no input", () => {
    expect(cn()).toBe("");
  });
});

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for undefined/empty", () => {
    expect(formatRelative(undefined)).toBe("");
    expect(formatRelative("")).toBe("");
  });

  it("returns empty for invalid date", () => {
    expect(formatRelative("not-a-date")).toBe("");
  });

  it("returns 刚刚 for < 1 minute", () => {
    expect(formatRelative("2024-06-15T11:59:30Z")).toBe("刚刚");
  });

  it("returns minutes", () => {
    expect(formatRelative("2024-06-15T11:30:00Z")).toBe("30 分钟前");
  });

  it("returns hours", () => {
    expect(formatRelative("2024-06-15T09:00:00Z")).toBe("3 小时前");
  });

  it("returns days", () => {
    expect(formatRelative("2024-06-10T12:00:00Z")).toBe("5 天前");
  });

  it("returns months", () => {
    expect(formatRelative("2024-02-15T12:00:00Z")).toBe("4 个月前");
  });

  it("returns years", () => {
    expect(formatRelative("2022-06-15T12:00:00Z")).toBe("2 年前");
  });
});

describe("formatAbsolute", () => {
  it("returns empty for undefined/invalid", () => {
    expect(formatAbsolute(undefined)).toBe("");
    expect(formatAbsolute("bad")).toBe("");
  });

  it("formats as YYYY/MM/DD HH:mm", () => {
    const result = formatAbsolute("2024-01-05T09:03:00Z");
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});

describe("formatTimestamp", () => {
  it("returns empty for undefined/invalid", () => {
    expect(formatTimestamp(undefined)).toBe("");
    expect(formatTimestamp("xyz")).toBe("");
  });

  it("formats with seconds", () => {
    const result = formatTimestamp("2024-03-15T14:30:45Z");
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("formatSmartTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T14:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty for undefined/invalid", () => {
    expect(formatSmartTime(undefined)).toBe("");
    expect(formatSmartTime("nope")).toBe("");
  });

  it("returns HH:mm for today", () => {
    const result = formatSmartTime("2024-06-15T10:30:00Z");
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns 昨 HH:mm for yesterday", () => {
    // Use a time that's unambiguously yesterday in any timezone
    const yesterday = new Date("2024-06-15T14:00:00Z");
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(10, 0, 0, 0);
    const result = formatSmartTime(yesterday.toISOString());
    expect(result).toMatch(/^昨 \d{2}:\d{2}$/);
  });

  it("returns 周X for same week", () => {
    const result = formatSmartTime("2024-06-12T10:00:00Z");
    expect(result).toMatch(/^周/);
  });

  it("returns MM/DD for same year", () => {
    const result = formatSmartTime("2024-02-10T10:00:00Z");
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });

  it("returns YY/MM/DD for older", () => {
    const result = formatSmartTime("2023-02-10T10:00:00Z");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
  });
});

describe("shortPath", () => {
  it("returns empty for empty input", () => {
    expect(shortPath("")).toBe("");
  });

  it("replaces home prefix with ~", () => {
    expect(shortPath("/Users/foo/projects/bar", "/Users/foo")).toBe(
      "~/projects/bar",
    );
  });

  it("auto-detects macOS /Users/ paths", () => {
    expect(shortPath("/Users/someone/code/repo")).toBe("~/code/repo");
  });

  it("returns path as-is if no match", () => {
    expect(shortPath("/etc/config")).toBe("/etc/config");
  });
});

describe("describeSkillSource", () => {
  it("handles user source", () => {
    expect(describeSkillSource("user")).toEqual({
      label: "Claude · 用户",
      short: "Claude",
    });
  });

  it("handles plugin: prefix", () => {
    const r = describeSkillSource("plugin:my/tool");
    expect(r.label).toBe("插件 · my/tool");
    expect(r.short).toBe("tool");
  });

  it("handles marketplace: prefix", () => {
    const r = describeSkillSource("marketplace:org/pkg");
    expect(r.label).toBe("市场 · org/pkg");
    expect(r.short).toBe("pkg (未装)");
  });

  it("returns raw for unknown", () => {
    expect(describeSkillSource("other")).toEqual({
      label: "other",
      short: "other",
    });
  });
});

describe("describeMcpSource", () => {
  it("handles project: prefix", () => {
    expect(describeMcpSource("project:my-proj")).toBe("项目 · my-proj");
  });

  it("handles claude-user", () => {
    expect(describeMcpSource("claude-user")).toBe("Claude 用户");
  });

  it("handles cursor", () => {
    expect(describeMcpSource("cursor")).toBe("Cursor");
  });

  it("returns raw for unknown", () => {
    expect(describeMcpSource("something")).toBe("something");
  });
});

describe("sourceColor", () => {
  it("returns orange for claude-code", () => {
    expect(sourceColor("claude-code")).toContain("orange");
  });

  it("returns sky for cursor-user", () => {
    expect(sourceColor("cursor-user")).toContain("sky");
  });

  it("returns emerald for codex", () => {
    expect(sourceColor("codex")).toContain("emerald");
  });

  it("returns pink for beam", () => {
    expect(sourceColor("beam")).toContain("pink");
  });

  it("returns default for unknown", () => {
    expect(sourceColor("unknown-thing")).toContain("text-fg-muted");
  });
});

describe("describeSessionSource", () => {
  it("maps known sources", () => {
    expect(describeSessionSource("claude-code")).toBe("Claude Code");
    expect(describeSessionSource("cursor-agent")).toBe("Cursor agent");
    expect(describeSessionSource("codex")).toBe("Codex");
  });

  it("returns raw for unknown", () => {
    expect(describeSessionSource("foo")).toBe("foo");
  });
});

describe("roleColor", () => {
  it("returns specific classes per role", () => {
    expect(roleColor("user")).toContain("bg-secondary");
    expect(roleColor("assistant")).toContain("bg-card");
    expect(roleColor("tool_use")).toContain("violet");
    expect(roleColor("tool_result")).toContain("emerald");
    expect(roleColor("system")).toContain("amber");
    expect(roleColor("meta")).toContain("amber");
  });

  it("returns default for unknown role", () => {
    expect(roleColor("xyz")).toContain("bg-card");
  });
});

describe("roleLabel", () => {
  it("maps known roles", () => {
    expect(roleLabel("user")).toBe("User");
    expect(roleLabel("assistant")).toBe("Assistant");
    expect(roleLabel("tool_use")).toBe("Tool");
    expect(roleLabel("tool_result")).toBe("Tool result");
    expect(roleLabel("system")).toBe("System");
    expect(roleLabel("meta")).toBe("Meta");
  });

  it("returns raw for unknown", () => {
    expect(roleLabel("other")).toBe("other");
  });
});

describe("copyToClipboard", () => {
  it("resolves immediately for empty text", async () => {
    await expect(copyToClipboard("")).resolves.toBeUndefined();
  });

  it("calls navigator.clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await copyToClipboard("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
  });
});

describe("formatBytes", () => {
  it("returns 0 B for 0", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats KB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats MB", () => {
    expect(formatBytes(1024 * 1024 * 5)).toBe("5.0 MB");
  });

  it("drops decimal for values >= 10", () => {
    expect(formatBytes(1024 * 15)).toBe("15 KB");
  });
});

describe("formatCost", () => {
  it("returns $0 for 0 or negative", () => {
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(-1)).toBe("$0");
  });

  it("returns <$0.01 for sub-cent", () => {
    expect(formatCost(0.005)).toBe("$<0.01");
  });

  it("formats small amounts with 3 decimals", () => {
    expect(formatCost(0.123)).toBe("$0.123");
  });

  it("formats medium amounts with 2 decimals", () => {
    expect(formatCost(12.345)).toBe("$12.35");
  });

  it("formats large amounts with 1 decimal", () => {
    expect(formatCost(500.12)).toBe("$500.1");
  });

  it("formats very large amounts as integers", () => {
    expect(formatCost(1234)).toMatch(/^\$1,234$/);
  });

  it("supports approximate prefix", () => {
    expect(formatCost(0.5, true)).toBe("~$0.500");
  });
});

describe("formatTokens", () => {
  it("returns small numbers as-is", () => {
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands as K", () => {
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(15000)).toBe("15K");
  });

  it("formats millions as M", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(15_000_000)).toBe("15M");
  });
});
