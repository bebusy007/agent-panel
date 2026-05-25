import { extractFileEntries } from '../file-entries';
import type { Message } from '../api';

function msg(overrides: Partial<Message> & { id: string; role: string }): Message {
  return { ...overrides } as Message;
}

describe('extractFileEntries', () => {
  it('returns empty array for no messages', () => {
    expect(extractFileEntries([])).toEqual([]);
  });

  it('ignores non-tool_use messages', () => {
    const messages: Message[] = [
      msg({ id: '1', role: 'user', text: 'hello' }),
      msg({ id: '2', role: 'assistant', text: 'hi' }),
    ];
    expect(extractFileEntries(messages)).toEqual([]);
  });

  it('extracts read actions', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'Read',
        toolUseId: 'tu1',
        toolInput: { file_path: '/a.ts' },
      }),
    ];
    const entries = extractFileEntries(messages);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('/a.ts');
    expect(entries[0].action).toBe('read');
  });

  it('extracts write actions', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'Write',
        toolUseId: 'tu1',
        toolInput: { file_path: '/b.ts' },
      }),
    ];
    const entries = extractFileEntries(messages);
    expect(entries[0].action).toBe('write');
  });

  it('extracts edit actions', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'Edit',
        toolUseId: 'tu1',
        toolInput: { file_path: '/c.ts' },
      }),
    ];
    const entries = extractFileEntries(messages);
    expect(entries[0].action).toBe('edit');
  });

  it('deduplicates writes to same path (last write wins)', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'Write',
        toolUseId: 'tu1',
        toolInput: { file_path: '/x.ts' },
      }),
      msg({
        id: '2',
        role: 'tool_use',
        toolName: 'Edit',
        toolUseId: 'tu2',
        toolInput: { file_path: '/x.ts' },
      }),
    ];
    const entries = extractFileEntries(messages);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('edit');
    expect(entries[0].toolUseId).toBe('tu2');
  });

  it('upgrades read to write/edit for same path', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'Read',
        toolUseId: 'tu1',
        toolInput: { file_path: '/z.ts' },
      }),
      msg({
        id: '2',
        role: 'tool_use',
        toolName: 'Write',
        toolUseId: 'tu2',
        toolInput: { file_path: '/z.ts' },
      }),
    ];
    const entries = extractFileEntries(messages);
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('write');
  });

  it('handles Cursor-style tool names', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'read_file',
        toolUseId: 'tu1',
        toolInput: { path: '/cursor.ts' },
      }),
    ];
    const entries = extractFileEntries(messages);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('/cursor.ts');
    expect(entries[0].action).toBe('read');
  });

  it('skips tools without a path in input', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'Bash',
        toolUseId: 'tu1',
        toolInput: { command: 'ls' },
      }),
    ];
    expect(extractFileEntries(messages)).toEqual([]);
  });
});
