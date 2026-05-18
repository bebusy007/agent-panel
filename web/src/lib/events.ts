/**
 * Tiny window-level event bus for cross-component refresh signals.
 *
 * Why not Context / global store? — only a handful of fire-and-forget
 * "data changed" hints flow between unrelated panels (sidebar, list,
 * detail page). A typed wrapper around CustomEvent is enough and keeps
 * the components themselves dependency-free.
 *
 * Producers call `emit(event)`; consumers call `useAppEvent(event, fn)`.
 */

import { useEffect } from "react";

export type AppEventName =
  | "sessions:changed" // a session was trashed / restored / hidden / unhidden
  | "favorites:changed";

export function emitAppEvent(name: AppEventName): void {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // Defensive: SSR / weird hosts. Nothing to do.
  }
}

export function useAppEvent(name: AppEventName, handler: () => void): void {
  useEffect(() => {
    const fn = () => handler();
    window.addEventListener(name, fn);
    return () => window.removeEventListener(name, fn);
    // The handler closes over its caller's render scope — re-bind every
    // render so updates to deps inside `handler` actually take effect.
  });
}
