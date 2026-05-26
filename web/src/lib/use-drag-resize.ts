import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragResizeBounds {
  min: number;
  max: number;
  default: number;
}

export interface DragResizeResult {
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
  onResizeDoubleClick: () => void;
  setWidth: (w: number) => void;
}

export function clampWidth(value: number, bounds: DragResizeBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export function useDragResize(
  bounds: DragResizeBounds,
  initialWidth: number,
  onPersist?: (width: number) => void,
  reverse?: boolean,
): DragResizeResult {
  const [width, setWidthRaw] = useState(() => clampWidth(initialWidth, bounds));
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const setWidth = useCallback(
    (w: number) => {
      const clamped = clampWidth(w, bounds);
      setWidthRaw(clamped);
    },
    [bounds],
  );

  useEffect(() => {
    onPersist?.(width);
  }, [width, onPersist]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = ev.clientX - drag.startX;
        const next = drag.startWidth + (reverse ? -delta : delta);
        setWidth(next);
      };
      const onUp = () => {
        dragRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [width, setWidth],
  );

  const onResizeDoubleClick = useCallback(() => {
    setWidth(bounds.default);
  }, [bounds.default, setWidth]);

  return { width, onResizeStart, onResizeDoubleClick, setWidth };
}
