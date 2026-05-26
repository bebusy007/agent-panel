import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounced } from '../../src/lib/hooks';

describe('useDebounced', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounced('hello', 200));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes', async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, delay }) => useDebounced(value, delay), {
      initialProps: { value: 'hello', delay: 200 },
    });

    expect(result.current).toBe('hello');

    rerender({ value: 'world', delay: 200 });

    // Should still be old value during debounce period
    expect(result.current).toBe('hello');

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('world');
    vi.useRealTimers();
  });
});
