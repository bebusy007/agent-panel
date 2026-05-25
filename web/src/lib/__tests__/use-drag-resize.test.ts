import { renderHook, act } from '@testing-library/react';
import { clampWidth, useDragResize, type DragResizeBounds } from '../use-drag-resize';

const bounds: DragResizeBounds = { min: 120, max: 400, default: 220 };

describe('clampWidth', () => {
  it('returns value when within bounds', () => {
    expect(clampWidth(250, bounds)).toBe(250);
  });

  it('clamps to min when below', () => {
    expect(clampWidth(50, bounds)).toBe(120);
  });

  it('clamps to max when above', () => {
    expect(clampWidth(600, bounds)).toBe(400);
  });

  it('handles exact min boundary', () => {
    expect(clampWidth(120, bounds)).toBe(120);
  });

  it('handles exact max boundary', () => {
    expect(clampWidth(400, bounds)).toBe(400);
  });

  it('handles negative values', () => {
    expect(clampWidth(-10, bounds)).toBe(120);
  });
});

describe('useDragResize', () => {
  it('returns initial width clamped', () => {
    const { result } = renderHook(() => useDragResize(bounds, 250));
    expect(result.current.width).toBe(250);
  });

  it('clamps initial width to bounds', () => {
    const { result } = renderHook(() => useDragResize(bounds, 50));
    expect(result.current.width).toBe(120);
  });

  it('setWidth updates width within bounds', () => {
    const { result } = renderHook(() => useDragResize(bounds, 220));
    act(() => result.current.setWidth(300));
    expect(result.current.width).toBe(300);
  });

  it('setWidth clamps to bounds', () => {
    const { result } = renderHook(() => useDragResize(bounds, 220));
    act(() => result.current.setWidth(999));
    expect(result.current.width).toBe(400);
  });

  it('onResizeDoubleClick resets to default', () => {
    const { result } = renderHook(() => useDragResize(bounds, 350));
    act(() => result.current.onResizeDoubleClick());
    expect(result.current.width).toBe(220);
  });

  it('calls onPersist when width changes', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDragResize(bounds, 220, persist));
    expect(persist).toHaveBeenCalledWith(220);
    act(() => result.current.setWidth(300));
    expect(persist).toHaveBeenCalledWith(300);
  });

  it('onResizeStart sets up listeners and handles drag', () => {
    const { result } = renderHook(() => useDragResize(bounds, 220));
    const mouseEvent = { clientX: 100, preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onResizeStart(mouseEvent));
    // Simulate mouse move
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
    });
    expect(result.current.width).toBe(270);
    // Simulate mouse up
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    // Further moves should not change width
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
    });
    expect(result.current.width).toBe(270);
  });

  it('onResizeStart with reverse=true inverts delta', () => {
    const { result } = renderHook(() => useDragResize(bounds, 220, undefined, true));
    const mouseEvent = { clientX: 100, preventDefault: vi.fn() } as unknown as React.MouseEvent;
    act(() => result.current.onResizeStart(mouseEvent));
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150 }));
    });
    // reverse: delta=50, so width = 220 - 50 = 170
    expect(result.current.width).toBe(170);
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
  });
});
