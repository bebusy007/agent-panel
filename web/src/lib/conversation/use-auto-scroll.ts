import { useRef, useEffect, useCallback, useState } from "react";

interface UseAutoScrollOptions {
  threshold?: number;
  deps?: unknown[];
}

interface UseAutoScrollReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
  showNewMessageIndicator: boolean;
}

export function useAutoScroll(
  options: UseAutoScrollOptions = {}
): UseAutoScrollReturn {
  const { threshold = 50, deps = [] } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showIndicator, setShowIndicator] = useState(false);
  const userScrolledRef = useRef(false);

  const checkIsAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distFromBottom < threshold;
  }, [threshold]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setIsAtBottom(true);
    setShowIndicator(false);
    userScrolledRef.current = false;
  }, []);

  // Listen for scroll events
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const atBottom = checkIsAtBottom();
      setIsAtBottom(atBottom);
      if (atBottom) {
        setShowIndicator(false);
        userScrolledRef.current = false;
      } else {
        userScrolledRef.current = true;
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkIsAtBottom]);

  // Auto-scroll when deps change (new content)
  useEffect(() => {
    if (isAtBottom && !userScrolledRef.current) {
      const el = containerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } else if (!isAtBottom) {
      setShowIndicator(true);
    }
  }, deps);

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
    showNewMessageIndicator: showIndicator,
  };
}
