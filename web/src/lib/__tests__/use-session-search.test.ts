import { renderHook, act } from '@testing-library/react';
import { useSessionSearch, ALL_FILTERS } from '../use-session-search';
import type { Message } from '../api';

function msg(overrides: Partial<Message> & { id: string; role: string }): Message {
  return { text: '', ...overrides } as Message;
}

const fixture: Message[] = [
  msg({ id: '1', role: 'user', text: 'Hello world' }),
  msg({ id: '2', role: 'assistant', text: 'Hi there, how can I help?' }),
  msg({ id: '3', role: 'tool_use', toolName: 'Bash', toolUseId: 'tu1', toolInput: 'ls -la' }),
  msg({ id: '4', role: 'tool_result', toolUseId: 'tu1', toolOutput: 'file.txt' }),
  msg({ id: '5', role: 'user', text: 'Search for foo' }),
  msg({ id: '6', role: 'assistant', text: 'Found foo in bar.ts' }),
];

describe('useSessionSearch', () => {
  it('returns all messages when no filter/search active', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    expect(result.current.filtered).toHaveLength(fixture.length);
    expect(result.current.searchActive).toBe(false);
  });

  it('filters by role', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    act(() => {
      result.current.toggleRole('assistant');
    });
    const filtered = result.current.filtered;
    expect(filtered.every((m) => m.role !== 'assistant')).toBe(true);
  });

  it('does not allow removing all roles (keeps at least one)', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    for (const r of ALL_FILTERS) {
      act(() => result.current.toggleRole(r));
    }
    expect(result.current.selectedRoles.size).toBeGreaterThanOrEqual(1);
  });

  it('filters by search text (min 2 chars)', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    act(() => {
      result.current.setSearch('f');
    });
    expect(result.current.filtered).toHaveLength(fixture.length);

    act(() => {
      result.current.setSearch('foo');
    });
    expect(result.current.filtered.length).toBeLessThan(fixture.length);
    expect(result.current.filtered.some((m) => m.text?.includes('foo'))).toBe(true);
  });

  it('reports search match total', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    act(() => {
      result.current.setSearch('foo');
    });
    expect(result.current.searchMatchTotal).toBeGreaterThan(0);
  });

  it('navigates search results', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    act(() => {
      result.current.setSearch('foo');
    });
    const total = result.current.searchMatchTotal;
    if (total > 1) {
      act(() => result.current.navigateSearch('next'));
      expect(result.current.searchActiveIndex).toBe(1);
      act(() => result.current.navigateSearch('prev'));
      expect(result.current.searchActiveIndex).toBe(0);
    }
  });

  it('wraps around when navigating past end', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    act(() => {
      result.current.setSearch('foo');
    });
    const total = result.current.searchMatchTotal;
    if (total > 0) {
      act(() => result.current.navigateSearch('prev'));
      expect(result.current.searchActiveIndex).toBe(total - 1);
    }
  });

  it('toggles searchOpen state', () => {
    const { result } = renderHook(() => useSessionSearch(fixture));
    expect(result.current.searchOpen).toBe(false);
    act(() => result.current.setSearchOpen(true));
    expect(result.current.searchOpen).toBe(true);
  });

  it('searches in toolInput objects', () => {
    const messages: Message[] = [
      msg({
        id: '1',
        role: 'tool_use',
        toolName: 'Read',
        toolInput: { file_path: '/unique-path.ts' },
      }),
    ];
    const { result } = renderHook(() => useSessionSearch(messages));
    act(() => result.current.setSearch('unique-path'));
    expect(result.current.filtered).toHaveLength(1);
  });
});
