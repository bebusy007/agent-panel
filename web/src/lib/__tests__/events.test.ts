import { renderHook, act } from '@testing-library/react';
import { emitAppEvent, useAppEvent } from '../events';

describe('emitAppEvent', () => {
  it('dispatches a CustomEvent on window', () => {
    const handler = vi.fn();
    window.addEventListener('sessions:changed', handler);
    emitAppEvent('sessions:changed');
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('sessions:changed', handler);
  });

  it('dispatches favorites:changed event', () => {
    const handler = vi.fn();
    window.addEventListener('favorites:changed', handler);
    emitAppEvent('favorites:changed');
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('favorites:changed', handler);
  });
});

describe('useAppEvent', () => {
  it('calls handler when event is emitted', () => {
    const handler = vi.fn();
    renderHook(() => useAppEvent('sessions:changed', handler));
    act(() => {
      emitAppEvent('sessions:changed');
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cleans up listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useAppEvent('sessions:changed', handler));
    unmount();
    emitAppEvent('sessions:changed');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire for unrelated events', () => {
    const handler = vi.fn();
    renderHook(() => useAppEvent('favorites:changed', handler));
    act(() => {
      emitAppEvent('sessions:changed');
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
