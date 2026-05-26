import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAsync } from '../../src/lib/hooks';

describe('useAsync', () => {
  it('loads data successfully', async () => {
    const { result } = renderHook(() => useAsync(async () => 'hello', []));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe('hello');
    expect(result.current.error).toBeNull();
  });

  it('handles errors', async () => {
    const { result } = renderHook(() =>
      useAsync(async () => {
        throw new Error('test error');
      }, []),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('supports refetch', async () => {
    let count = 0;
    const { result } = renderHook(() => useAsync(async () => ++count, []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(1);

    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data).toBe(2);
    });
  });
});
