import { pairToolResults } from '../tool-result-pairing';
import type { Message } from '../api';

function msg(overrides: Partial<Message> & { id: string; role: string }): Message {
  return { ...overrides } as Message;
}

describe('pairToolResults', () => {
  it('returns empty maps for no messages', () => {
    const { resultByToolUseId, hiddenIds } = pairToolResults([]);
    expect(resultByToolUseId.size).toBe(0);
    expect(hiddenIds.size).toBe(0);
  });

  it('pairs a tool_use with its tool_result', () => {
    const messages: Message[] = [
      msg({ id: '1', role: 'tool_use', toolUseId: 'tu1' }),
      msg({ id: '2', role: 'tool_result', toolUseId: 'tu1', toolOutput: 'ok' }),
    ];
    const { resultByToolUseId, hiddenIds } = pairToolResults(messages);
    expect(resultByToolUseId.get('tu1')?.id).toBe('2');
    expect(hiddenIds.has('2')).toBe(true);
  });

  it('prefers non-error result when multiple exist', () => {
    const messages: Message[] = [
      msg({ id: '1', role: 'tool_use', toolUseId: 'tu1' }),
      msg({ id: '2', role: 'tool_result', toolUseId: 'tu1', toolStatus: 'error' }),
      msg({ id: '3', role: 'tool_result', toolUseId: 'tu1', toolStatus: 'success' }),
    ];
    const { resultByToolUseId } = pairToolResults(messages);
    expect(resultByToolUseId.get('tu1')?.id).toBe('3');
  });

  it('falls back to last result if all are errors', () => {
    const messages: Message[] = [
      msg({ id: '1', role: 'tool_use', toolUseId: 'tu1' }),
      msg({ id: '2', role: 'tool_result', toolUseId: 'tu1', toolStatus: 'error' }),
      msg({ id: '3', role: 'tool_result', toolUseId: 'tu1', toolStatus: 'error' }),
    ];
    const { resultByToolUseId } = pairToolResults(messages);
    expect(resultByToolUseId.get('tu1')?.id).toBe('3');
  });

  it('hides all results that have a matching tool_use', () => {
    const messages: Message[] = [
      msg({ id: '1', role: 'tool_use', toolUseId: 'tu1' }),
      msg({ id: '2', role: 'tool_result', toolUseId: 'tu1' }),
      msg({ id: '3', role: 'tool_result', toolUseId: 'tu1' }),
    ];
    const { hiddenIds } = pairToolResults(messages);
    expect(hiddenIds.has('2')).toBe(true);
    expect(hiddenIds.has('3')).toBe(true);
  });

  it('does not hide results without matching tool_use', () => {
    const messages: Message[] = [msg({ id: '1', role: 'tool_result', toolUseId: 'orphan' })];
    const { hiddenIds } = pairToolResults(messages);
    expect(hiddenIds.size).toBe(0);
  });
});
