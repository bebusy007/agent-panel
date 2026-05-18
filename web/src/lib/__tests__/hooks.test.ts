import { renderHook, waitFor, act } from "@testing-library/react";
import { useAsync, useCachedAsync, invalidateAsyncCache, useDebounced } from "../hooks";

describe("useAsync", () => {
  it("starts in loading state", () => {
    const { result } = renderHook(() =>
      useAsync(() => Promise.resolve("data")),
    );
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);
  });

  it("resolves with data", async () => {
    const { result } = renderHook(() =>
      useAsync(() => Promise.resolve("hello")),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBe(null);
  });

  it("handles rejection", async () => {
    const { result } = renderHook(() =>
      useAsync(() => Promise.reject(new Error("fail"))),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("fail");
    expect(result.current.data).toBe(null);
  });

  it("wraps non-Error rejects in Error", async () => {
    const { result } = renderHook(() =>
      useAsync(() => Promise.reject("string error")),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("string error");
  });

  it("refetch triggers re-fetch", async () => {
    let count = 0;
    const { result } = renderHook(() =>
      useAsync(() => Promise.resolve(++count)),
    );
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toBe(2));
  });
});

describe("useCachedAsync", () => {
  beforeEach(() => {
    invalidateAsyncCache();
  });

  it("returns data and caches it", async () => {
    const fn = vi.fn().mockResolvedValue("cached");
    const { result } = renderHook(() => useCachedAsync("key1", fn));
    await waitFor(() => expect(result.current.data).toBe("cached"));
    expect(result.current.loading).toBe(false);
  });

  it("returns cached data immediately on re-mount", async () => {
    const fn = vi.fn().mockResolvedValue("val");
    const { result, unmount } = renderHook(() => useCachedAsync("key2", fn));
    await waitFor(() => expect(result.current.data).toBe("val"));
    unmount();

    const { result: result2 } = renderHook(() =>
      useCachedAsync("key2", fn),
    );
    expect(result2.current.data).toBe("val");
    expect(result2.current.loading).toBe(false);
  });
});

describe("invalidateAsyncCache", () => {
  beforeEach(() => {
    invalidateAsyncCache();
  });

  it("clears all cache when called without args", async () => {
    const fn = vi.fn().mockResolvedValue("x");
    const { result } = renderHook(() => useCachedAsync("a", fn));
    await waitFor(() => expect(result.current.data).toBe("x"));
    invalidateAsyncCache();
    const { result: r2 } = renderHook(() => useCachedAsync("a", fn));
    expect(r2.current.loading).toBe(true);
  });

  it("clears specific key", async () => {
    const fn = vi.fn().mockResolvedValue("y");
    const { result } = renderHook(() => useCachedAsync("b", fn));
    await waitFor(() => expect(result.current.data).toBe("y"));
    invalidateAsyncCache("b");
    const { result: r2 } = renderHook(() => useCachedAsync("b", fn));
    expect(r2.current.loading).toBe(true);
  });

  it("clears by prefix", async () => {
    const fn = vi.fn().mockResolvedValue("z");
    const { result } = renderHook(() => useCachedAsync("pre:1", fn));
    await waitFor(() => expect(result.current.data).toBe("z"));
    invalidateAsyncCache({ prefix: "pre:" });
    const { result: r2 } = renderHook(() => useCachedAsync("pre:1", fn));
    expect(r2.current.loading).toBe(true);
  });
});

describe("useDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebounced("init", 100));
    expect(result.current).toBe("init");
  });

  it("debounces value updates", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounced(val, 100),
      { initialProps: { val: "a" } },
    );
    rerender({ val: "b" });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe("b");
  });

  it("resets timer on rapid updates", () => {
    const { result, rerender } = renderHook(
      ({ val }) => useDebounced(val, 100),
      { initialProps: { val: "a" } },
    );
    rerender({ val: "b" });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ val: "c" });
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe("c");
  });
});
