import {
  normalizeCwd,
  buildProjectFolders,
  autoExpandForSession,
  folderHasSource,
} from "../sidebar-groups";
import type { SessionSummary } from "../api";

function session(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
  return {
    source: "claude-code",
    title: "",
    filePath: "",
    projectDir: "",
    messageCount: 0,
    sizeBytes: 0,
    subagentCount: 0,
    ...overrides,
  } as SessionSummary;
}

describe("normalizeCwd", () => {
  it("returns empty for undefined/null/empty", () => {
    expect(normalizeCwd(undefined)).toBe("");
    expect(normalizeCwd("")).toBe("");
    expect(normalizeCwd("   ")).toBe("");
  });

  it("returns empty for root paths", () => {
    expect(normalizeCwd("/")).toBe("");
    expect(normalizeCwd("\\")).toBe("");
  });

  it("converts backslashes to forward slashes", () => {
    expect(normalizeCwd("C:\\Users\\me\\project")).toBe("C:/Users/me/project");
  });

  it("uppercases Windows drive letter", () => {
    expect(normalizeCwd("c:/repo")).toBe("C:/repo");
  });

  it("adds trailing slash to bare drive letter", () => {
    expect(normalizeCwd("C:")).toBe("C:/");
  });

  it("preserves drive root C:/", () => {
    expect(normalizeCwd("C:/")).toBe("C:/");
  });

  it("strips trailing slashes", () => {
    expect(normalizeCwd("/Users/me/project/")).toBe("/Users/me/project");
  });

  it("handles normal paths", () => {
    expect(normalizeCwd("/Users/me/project")).toBe("/Users/me/project");
  });
});

describe("buildProjectFolders", () => {
  it("returns empty for no sessions", () => {
    const folders = buildProjectFolders([], new Set(), []);
    expect(folders).toEqual([]);
  });

  it("groups sessions by cwd", () => {
    const sessions = [
      session({ id: "1", cwd: "/Users/me/proj-a", lastActivity: "2024-01-02" }),
      session({ id: "2", cwd: "/Users/me/proj-b", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), []);
    expect(folders.length).toBe(2);
  });

  it("puts sessions without cwd in uncategorized", () => {
    const sessions = [
      session({ id: "1", cwd: undefined, lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), []);
    expect(folders[0].isUncategorized).toBe(true);
    expect(folders[0].label).toBe("未分类");
  });

  it("pins folders in specified order", () => {
    const sessions = [
      session({ id: "1", cwd: "/a", lastActivity: "2024-01-01" }),
      session({ id: "2", cwd: "/b", lastActivity: "2024-01-02" }),
      session({ id: "3", cwd: "/c", lastActivity: "2024-01-03" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), ["/c", "/a"]);
    expect(folders[0].cwd).toBe("/c");
    expect(folders[1].cwd).toBe("/a");
  });

  it("removes cwds from removedCwds", () => {
    const sessions = [
      session({ id: "1", cwd: "/keep", lastActivity: "2024-01-01" }),
      session({ id: "2", cwd: "/remove", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), [], ["/remove"]);
    expect(folders.find((f) => f.cwd === "/remove")).toBeUndefined();
  });

  it("groups sessions by sessionIdRaw into conversations", () => {
    const sessions = [
      session({ id: "1", cwd: "/proj", sessionIdRaw: "uuid1", lastActivity: "2024-01-02" }),
      session({ id: "2", cwd: "/proj", sessionIdRaw: "uuid1", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), []);
    expect(folders[0].conversations.length).toBe(1);
    expect(folders[0].conversations[0].sessions.length).toBe(2);
  });

  it("marks hasFavorite when session is in favoriteSessionIds", () => {
    const sessions = [
      session({ id: "1", cwd: "/proj", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(["1"]), []);
    expect(folders[0].conversations[0].hasFavorite).toBe(true);
  });
});

describe("autoExpandForSession", () => {
  it("returns null if already expanded", () => {
    const sessions = [
      session({ id: "1", cwd: "/proj", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), []);
    const expanded = new Set(["cwd:/proj"]);
    expect(autoExpandForSession("1", folders, expanded)).toBe(null);
  });

  it("returns new set with folder added", () => {
    const sessions = [
      session({ id: "1", cwd: "/proj", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), []);
    const result = autoExpandForSession("1", folders, new Set());
    expect(result).not.toBe(null);
    expect(result!.has("cwd:/proj")).toBe(true);
  });

  it("returns null if session not found", () => {
    const folders = buildProjectFolders([], new Set(), []);
    expect(autoExpandForSession("missing", folders, new Set())).toBe(null);
  });
});

describe("folderHasSource", () => {
  it("returns true when a session matches allowed source", () => {
    const sessions = [
      session({ id: "1", cwd: "/proj", source: "claude-code", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), []);
    expect(folderHasSource(folders[0], new Set(["claude-code"]))).toBe(true);
  });

  it("returns false when no session matches", () => {
    const sessions = [
      session({ id: "1", cwd: "/proj", source: "cursor-agent", lastActivity: "2024-01-01" }),
    ];
    const folders = buildProjectFolders(sessions, new Set(), []);
    expect(folderHasSource(folders[0], new Set(["claude-code"]))).toBe(false);
  });
});
