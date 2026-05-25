import type { Message } from './api';

export function pairToolResults(messages: Message[]) {
  const allResults = new Map<string, Message[]>();
  for (const m of messages) {
    if (m.role === 'tool_result' && m.toolUseId) {
      const arr = allResults.get(m.toolUseId);
      if (arr) arr.push(m);
      else allResults.set(m.toolUseId, [m]);
    }
  }
  const resultByToolUseId = new Map<string, Message>();
  for (const [tuId, results] of allResults) {
    resultByToolUseId.set(
      tuId,
      results.find((r) => r.toolStatus !== 'error') ?? results[results.length - 1],
    );
  }
  const hiddenIds = new Set<string>();
  for (const m of messages) {
    if (m.role === 'tool_use' && m.toolUseId && allResults.has(m.toolUseId)) {
      for (const r of allResults.get(m.toolUseId)!) hiddenIds.add(r.id);
    }
  }
  return { resultByToolUseId, hiddenIds };
}
