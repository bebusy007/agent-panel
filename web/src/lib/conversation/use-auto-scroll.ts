import { useCallback, useEffect, useRef, useState } from 'react';

interface AutoScrollOptions {
  /** Whether the AI is currently streaming (prevents auto-dismiss of float) */
  isStreaming?: boolean;
}

interface AutoScrollResult {
  /** True when the user is near the bottom */
  isAtBottom: boolean;
  /** Number of unseen new messages while scrolled up */
  unseenCount: number;
  /** Scroll to bottom and resume auto-follow */
  scrollToBottom: () => void;
  /** Mark that a new message arrived (increments unseen count if scrolled up) */
  markNewMessage: () => void;
  /** Force scroll to bottom (user sent a message) */
  forceScrollToBottom: () => void;
  /** Dismiss unseen float without scrolling */
  resetUnseen: () => void;
}

const BOTTOM_THRESHOLD_PX = 100;

export function useAutoScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  opts: AutoScrollOptions = {},
): AutoScrollResult {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const isUserScrollRef = useRef(true);
  const pauseScrollRef = useRef(false);

  // Detect scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const check = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = dist < BOTTOM_THRESHOLD_PX;
      setIsAtBottom(atBottom);
      if (atBottom) {
        setUnseenCount(0);
      }
    };

    // Track whether this scroll event was triggered by user or program
    let programmaticScroll = false;
    const onScroll = () => {
      if (programmaticScroll) {
        programmaticScroll = false;
        return;
      }
      check();
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  const scrollToBottom = useCallback(
    (force?: boolean) => {
      const el = containerRef.current;
      if (!el) return;
      // Use scrollTop directly to avoid triggering scroll event tracking
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
      setUnseenCount(0);
      pauseScrollRef.current = !force;
    },
    [containerRef],
  );

  const forceScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const markNewMessage = useCallback(() => {
    // Check current position
    const el = containerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist < BOTTOM_THRESHOLD_PX;

    if (atBottom) {
      // Auto-scroll: use rAF to wait for DOM update then scroll
      requestAnimationFrame(() => {
        const el2 = containerRef.current;
        if (!el2) return;
        el2.scrollTop = el2.scrollHeight;
        setIsAtBottom(true);
        setUnseenCount(0);
      });
    } else if (!opts.isStreaming) {
      // User scrolled up: increment unseen counter
      setUnseenCount((c) => c + 1);
    }
    // During streaming, always try to keep up
    if (opts.isStreaming && atBottom) {
      requestAnimationFrame(() => {
        const el2 = containerRef.current;
        if (!el2) return;
        el2.scrollTop = el2.scrollHeight;
      });
    }
  }, [containerRef, opts.isStreaming]);

  const resetUnseen = useCallback(() => {
    setUnseenCount(0);
  }, []);

  return {
    isAtBottom,
    unseenCount,
    scrollToBottom,
    markNewMessage,
    forceScrollToBottom,
    resetUnseen,
  };
}
