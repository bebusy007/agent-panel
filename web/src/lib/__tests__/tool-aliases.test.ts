import { canonicalTool, isFileTool, getToolDetail } from "../tool-aliases";

describe("canonicalTool", () => {
  it("returns Unknown for undefined/empty", () => {
    expect(canonicalTool(undefined)).toBe("Unknown");
    expect(canonicalTool("")).toBe("Unknown");
  });

  it("maps Claude Code names directly", () => {
    expect(canonicalTool("Read")).toBe("Read");
    expect(canonicalTool("Write")).toBe("Write");
    expect(canonicalTool("Edit")).toBe("Edit");
    expect(canonicalTool("Bash")).toBe("Bash");
    expect(canonicalTool("Grep")).toBe("Grep");
    expect(canonicalTool("Glob")).toBe("Glob");
    expect(canonicalTool("LS")).toBe("LS");
    expect(canonicalTool("WebFetch")).toBe("WebFetch");
    expect(canonicalTool("WebSearch")).toBe("WebSearch");
    expect(canonicalTool("Task")).toBe("Task");
    expect(canonicalTool("Agent")).toBe("Task");
  });

  it("maps Cursor names", () => {
    expect(canonicalTool("Shell")).toBe("Bash");
    expect(canonicalTool("shell")).toBe("Bash");
    expect(canonicalTool("read_file")).toBe("Read");
    expect(canonicalTool("edit_file")).toBe("Edit");
    expect(canonicalTool("write_file")).toBe("Write");
    expect(canonicalTool("list_dir")).toBe("LS");
    expect(canonicalTool("grep_search")).toBe("Grep");
    expect(canonicalTool("codebase_search")).toBe("Grep");
    expect(canonicalTool("file_search")).toBe("Glob");
    expect(canonicalTool("run_terminal_cmd")).toBe("Bash");
  });

  it("maps Codex names", () => {
    expect(canonicalTool("exec_command")).toBe("Bash");
    expect(canonicalTool("apply_patch")).toBe("Edit");
  });

  it("returns Unknown for unmapped names", () => {
    expect(canonicalTool("some_random_tool")).toBe("Unknown");
  });
});

describe("isFileTool", () => {
  it("returns true for file tools", () => {
    expect(isFileTool("Read")).toBe(true);
    expect(isFileTool("Write")).toBe(true);
    expect(isFileTool("Edit")).toBe(true);
    expect(isFileTool("MultiEdit")).toBe(true);
    expect(isFileTool("NotebookEdit")).toBe(true);
  });

  it("returns false for non-file tools", () => {
    expect(isFileTool("Bash")).toBe(false);
    expect(isFileTool("Grep")).toBe(false);
    expect(isFileTool("Unknown")).toBe(false);
  });
});

describe("getToolDetail", () => {
  it("returns empty string for null/non-object input", () => {
    expect(getToolDetail(null)).toBe("");
    expect(getToolDetail(undefined)).toBe("");
    expect(getToolDetail("string")).toBe("");
  });

  it("extracts file_path", () => {
    expect(getToolDetail({ file_path: "/foo/bar.ts" })).toBe("/foo/bar.ts");
  });

  it("extracts command", () => {
    expect(getToolDetail({ command: "ls -la" })).toBe("ls -la");
  });

  it("extracts query", () => {
    expect(getToolDetail({ query: "search term" })).toBe("search term");
  });

  it("extracts url", () => {
    expect(getToolDetail({ url: "https://example.com" })).toBe(
      "https://example.com",
    );
  });

  it("extracts skill", () => {
    expect(getToolDetail({ skill: "my-skill" })).toBe("my-skill");
  });

  it("prioritizes file_path over command", () => {
    expect(getToolDetail({ file_path: "/a.ts", command: "echo" })).toBe(
      "/a.ts",
    );
  });

  it("skips empty string values", () => {
    expect(getToolDetail({ file_path: "", command: "ls" })).toBe("ls");
  });

  it("extracts MCP action from rawToolName", () => {
    expect(getToolDetail({}, "mcp__plugin_foo_bar__do_thing")).toBe("do_thing");
  });

  it("returns empty for non-MCP rawToolName without input", () => {
    expect(getToolDetail({}, "regularTool")).toBe("");
  });

  it("returns MCP action even with null input", () => {
    expect(getToolDetail(null, "mcp__x__action")).toBe("action");
  });
});
