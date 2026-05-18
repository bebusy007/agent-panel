import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, Search as SearchIcon, X } from "lucide-react";
import { centerMarkInScroller, highlightDom } from "@/lib/highlight";
import { cn } from "@/lib/utils";

interface UseInPaneSearchOpts {
  /** Element whose descendants should be searched & highlighted. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * When this changes, treat the rendered content as fresh and re-run the
   * highlight pass. Pass something stable (e.g. the entity id) so typing in
   * the input doesn't loop.
   */
  contentKey?: unknown;
}

interface InPaneSearchState {
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  total: number;
  activeIndex: number;
  navigate: (dir: "next" | "prev") => void;
  reset: () => void;
}

/**
 * Drop-in "find in detail" helper. Cmd+F opens it; it walks the container's
 * text nodes, wraps hits in <mark class="search-mark">, and manages an active
 * mark (search-mark-active). Handles cleanup when the query changes, the
 * content changes, or the panel closes.
 */
export function useInPaneSearch({
  containerRef,
  contentKey,
}: UseInPaneSearchOpts): InPaneSearchState {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const cleanupRef = useRef<(() => void) | null>(null);
  const marksRef = useRef<HTMLElement[]>([]);

  const clearMarks = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    marksRef.current = [];
    setTotal(0);
    setActiveIndex(-1);
  }, []);

  // (Re)run the highlight pass whenever the query or the content identity
  // changes. We read the marks back from the DOM in document order so
  // navigation matches what the user sees top-to-bottom.
  useEffect(() => {
    clearMarks();
    const container = containerRef.current;
    if (!container || !query.trim()) return;
    const result = highlightDom(container, query);
    const marks = Array.from(
      container.querySelectorAll<HTMLElement>("mark.search-mark")
    );
    marksRef.current = marks;
    cleanupRef.current = result.cleanup;
    setTotal(marks.length);
    setActiveIndex(marks.length > 0 ? 0 : -1);
    return () => {
      result.cleanup();
      cleanupRef.current = null;
    };
  }, [query, contentKey, containerRef, clearMarks]);

  // Apply the active class to the currently-focused mark and scroll it
  // into view. When activeIndex is -1 we just strip the class off all marks.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container
      .querySelectorAll<HTMLElement>("mark.search-mark-active")
      .forEach((el) => el.classList.remove("search-mark-active"));
    if (activeIndex < 0) return;
    const target = marksRef.current[activeIndex];
    if (!target) return;
    target.classList.add("search-mark-active");
    centerMarkInScroller(target);
  }, [activeIndex, containerRef]);

  // Cmd+F / Ctrl+F to open, Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        // Only intercept when the drawer we belong to is actually rendered.
        if (!containerRef.current) return;
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, containerRef]);

  const navigate = useCallback(
    (dir: "next" | "prev") => {
      if (total <= 0) return;
      setActiveIndex((cur) => {
        if (cur < 0) return 0;
        if (dir === "next") return cur + 1 >= total ? 0 : cur + 1;
        return cur - 1 < 0 ? total - 1 : cur - 1;
      });
    },
    [total]
  );

  const reset = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  return { open, setOpen, query, setQuery, total, activeIndex, navigate, reset };
}

/**
 * Inline search UI: a button to open, plus the input/nav bar when open.
 * Designed to be dropped into a detail-pane header.
 */
export function InPaneSearchBar({
  state,
  inputId,
  placeholder = "在此内容里搜索…",
}: {
  state: InPaneSearchState;
  inputId?: string;
  placeholder?: string;
}) {
  const { open, setOpen, query, setQuery, total, activeIndex, navigate, reset } = state;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-0.5 border transition-colors",
          open
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-border text-muted-foreground hover:border-border"
        )}
        title="在此详情内搜索 (Cmd+F)"
      >
        <SearchIcon className="size-3" /> 内搜
      </button>
      {open && (
        <div className="flex items-center gap-2 w-full mt-2">
          <input
            id={inputId}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                navigate(e.shiftKey ? "prev" : "next");
              }
            }}
            placeholder={placeholder}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-border"
          />
          {query && total > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {activeIndex >= 0 ? activeIndex + 1 : 0}/{total}
            </span>
          )}
          {query && total === 0 && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">无匹配</span>
          )}
          <button
            onClick={() => navigate("prev")}
            disabled={total === 0}
            className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="上一个 (Shift+Enter)"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            onClick={() => navigate("next")}
            disabled={total === 0}
            className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="下一个 (Enter)"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            onClick={reset}
            className="text-muted-foreground hover:text-muted-foreground"
            title="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
