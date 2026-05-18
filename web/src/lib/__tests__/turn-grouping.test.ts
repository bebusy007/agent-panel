import { buildTurns, turnIndexForMessage } from "../turn-grouping";
import type { Message } from "../api";

function msg(overrides: Partial<Message> & { role: string }): Message {
  const { role, text, timestamp, toolName, toolUseId, toolInput, toolOutput, toolStatus, ...rest } = overrides;
  return {
    id: Math.random().toString(36).slice(2),
    role,
    text: text ?? "",
    timestamp,
    toolName,
    toolUseId,
    toolInput,
    toolOutput,
    toolStatus,
    ...rest,
  } as Message;
}

describe("buildTurns", () => {
  it("returns empty array for empty messages", () => {
    expect(buildTurns([])).toEqual([]);
  });

  it("creates one turn per user message", () => {
    const messages = [
      msg({ role: "user", text: "Hello" }),
      msg({ role: "assistant", text: "Hi" }),
      msg({ role: "user", text: "How are you?" }),
      msg({ role: "assistant", text: "Good" }),
    ];
    const turns = buildTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.index).toBe(0);
    expect(turns[0]!.preview).toBe("Hello");
    expect(turns[0]!.messageCount).toBe(2);
    expect(turns[1]!.index).toBe(1);
    expect(turns[1]!.preview).toBe("How are you?");
    expect(turns[1]!.messageCount).toBe(2);
  });

  it("handles leading system messages as synthetic turn 0", () => {
    const messages = [
      msg({ role: "system", text: "System prompt" }),
      msg({ role: "assistant", text: "Init" }),
      msg({ role: "user", text: "First real question" }),
      msg({ role: "assistant", text: "Answer" }),
    ];
    const turns = buildTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.preview).toBe("(系统消息)");
    expect(turns[0]!.userMessage).toBeUndefined();
    expect(turns[0]!.messageCount).toBe(2);
    expect(turns[1]!.preview).toBe("First real question");
    expect(turns[1]!.userMessage).toBeDefined();
  });

  it("counts tool_use and tool_result correctly", () => {
    const messages = [
      msg({ role: "user", text: "Run a command" }),
      msg({ role: "assistant", text: "Sure" }),
      msg({ role: "tool_use", toolName: "Bash", toolUseId: "t1" }),
      msg({ role: "tool_result", toolUseId: "t1", toolOutput: "ok" }),
      msg({ role: "tool_use", toolName: "Read", toolUseId: "t2" }),
      msg({ role: "tool_result", toolUseId: "t2", toolOutput: "content" }),
      msg({ role: "assistant", text: "Done" }),
    ];
    const turns = buildTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.messageCount).toBe(7);
    expect(turns[0]!.toolCount).toBe(2);
    expect(turns[0]!.hasError).toBe(false);
  });

  it("detects error turns from tool_result with error status", () => {
    const messages = [
      msg({ role: "user", text: "Try something" }),
      msg({ role: "tool_use", toolName: "Bash", toolUseId: "t1" }),
      msg({ role: "tool_result", toolUseId: "t1", toolStatus: "error", toolOutput: "failed" }),
    ];
    const turns = buildTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.hasError).toBe(true);
  });

  it("meta messages do not start new turns", () => {
    const messages = [
      msg({ role: "user", text: "Q1" }),
      msg({ role: "meta", text: "permission-mode: auto", toolName: "permission-mode" }),
      msg({ role: "assistant", text: "A1" }),
      msg({ role: "meta", text: "ai-title: Test", toolName: "ai-title" }),
      msg({ role: "user", text: "Q2" }),
    ];
    const turns = buildTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.messageCount).toBe(4);
    expect(turns[1]!.messageCount).toBe(1);
  });

  it("counts subagent tool_use calls per turn", () => {
    const messages = [
      msg({ role: "user", text: "Spawn agents" }),
      msg({ role: "assistant", text: "On it" }),
      msg({ role: "tool_use", toolName: "Agent", toolUseId: "a1" }),
      msg({ role: "tool_result", toolUseId: "a1", toolOutput: "done" }),
      msg({ role: "tool_use", toolName: "Task", toolUseId: "a2" }),
      msg({ role: "tool_result", toolUseId: "a2", toolOutput: "done" }),
      msg({ role: "tool_use", toolName: "Bash", toolUseId: "b1" }),
      msg({ role: "tool_result", toolUseId: "b1", toolOutput: "ok" }),
      msg({ role: "user", text: "No agents here" }),
      msg({ role: "assistant", text: "Sure" }),
    ];
    const turns = buildTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.subagentCount).toBe(2);
    expect(turns[0]!.toolCount).toBe(3);
    expect(turns[1]!.subagentCount).toBe(0);
  });

  it("handles single user message with no response", () => {
    const messages = [msg({ role: "user", text: "Just me" })];
    const turns = buildTurns(messages);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.messageCount).toBe(1);
    expect(turns[0]!.toolCount).toBe(0);
  });

  it("assigns consecutive indexes", () => {
    const messages = [
      msg({ role: "user", text: "Q1" }),
      msg({ role: "assistant", text: "A1" }),
      msg({ role: "user", text: "Q2" }),
      msg({ role: "assistant", text: "A2" }),
      msg({ role: "user", text: "Q3" }),
    ];
    const turns = buildTurns(messages);
    expect(turns.map((t) => t.index)).toEqual([0, 1, 2]);
  });

  it("preserves userMessageIndex pointing to original array position", () => {
    const messages = [
      msg({ role: "system", text: "sys" }),
      msg({ role: "user", text: "Q1" }),
      msg({ role: "assistant", text: "A1" }),
      msg({ role: "user", text: "Q2" }),
    ];
    const turns = buildTurns(messages);
    expect(turns[0]!.userMessageIndex).toBe(-1);
    expect(turns[1]!.userMessageIndex).toBe(1);
    expect(turns[2]!.userMessageIndex).toBe(3);
  });
});

describe("turnIndexForMessage", () => {
  const messages = [
    msg({ role: "system", text: "sys" }),       // 0 → turn 0
    msg({ role: "user", text: "Q1" }),          // 1 → turn 1
    msg({ role: "assistant", text: "A1" }),     // 2 → turn 1
    msg({ role: "tool_use", toolName: "Bash" }),// 3 → turn 1
    msg({ role: "user", text: "Q2" }),          // 4 → turn 2
    msg({ role: "assistant", text: "A2" }),     // 5 → turn 2
  ];
  const turns = buildTurns(messages);

  it("maps leading system message to turn 0", () => {
    expect(turnIndexForMessage(turns, 0)).toBe(0);
  });

  it("maps first user message to turn 1", () => {
    expect(turnIndexForMessage(turns, 1)).toBe(1);
  });

  it("maps assistant following first user to turn 1", () => {
    expect(turnIndexForMessage(turns, 2)).toBe(1);
  });

  it("maps tool_use in first turn to turn 1", () => {
    expect(turnIndexForMessage(turns, 3)).toBe(1);
  });

  it("maps second user message to turn 2", () => {
    expect(turnIndexForMessage(turns, 4)).toBe(2);
  });

  it("maps assistant following second user to turn 2", () => {
    expect(turnIndexForMessage(turns, 5)).toBe(2);
  });

  it("returns 0 for empty turns", () => {
    expect(turnIndexForMessage([], 0)).toBe(0);
  });
});
