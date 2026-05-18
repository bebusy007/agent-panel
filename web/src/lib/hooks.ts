import { useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fn()
      .then((v) => {
        if (!cancelled) {
          setData(v);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, refetch: () => setTick((t) => t + 1) };
}

/**
 * SWR-style cache layer for `useAsync`. Backed by a module-level
 * `Map` keyed by a caller-supplied string. When the same key shows
 * up again (e.g. user navigates away to a detail page and comes
 * back), the hook *immediately* returns the previously fetched
 * value while a fresh fetch happens in the background. This kills
 * the "everything blanks out for a beat" feeling that plain
 * `useAsync` produces on every remount.
 *
 * Notes:
 *  - Cache survives unmount but not full page reloads.
 *  - `loading` reports `true` only on the very first fetch for a
 *    key — subsequent revalidations don't flip it back to true so
 *    the UI doesn't disappear behind a spinner.
 *  - Errors are NOT cached; a failed revalidation surfaces in
 *    `error` while keeping the stale `data` visible.
 */
const asyncCache = new Map<string, { data: unknown; at: number }>();

export function useCachedAsync<T>(
  key: string,
  fn: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const cached = asyncCache.get(key);
  const [data, setData] = useState<T | null>(
    cached ? (cached.data as T) : null,
  );
  // First fetch for this key shows a spinner; revalidations don't.
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const hadCache = asyncCache.has(key);
    if (!hadCache) setLoading(true);
    fn()
      .then((v) => {
        if (cancelled) return;
        asyncCache.set(key, { data: v, at: Date.now() });
        setData(v);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps, tick]);

  return { data, loading, error, refetch: () => setTick((t) => t + 1) };
}

/** Drop cached values. Pass:
 *   - nothing → clear everything
 *   - exact key string → drop only that key
 *   - { prefix } → drop every key starting with the prefix (handy
 *     when keys embed search/filter values, e.g. dropping
 *     "sessions:list" should clear all variants regardless of which
 *     query was last fetched).
 *  Used after a mutation where waiting for the natural revalidate
 *  cycle would surface stale data. */
export function invalidateAsyncCache(arg?: string | { prefix: string }) {
  if (arg === undefined) {
    asyncCache.clear();
    return;
  }
  if (typeof arg === "string") {
    asyncCache.delete(arg);
    return;
  }
  const { prefix } = arg;
  for (const k of Array.from(asyncCache.keys())) {
    if (k.startsWith(prefix)) asyncCache.delete(k);
  }
}

export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
