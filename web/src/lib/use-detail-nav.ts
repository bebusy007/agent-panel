import { useCallback } from "react";
import { useLocation, useNavigate, type Location } from "react-router-dom";

/**
 * Helper hook for detail-route components that may be rendered in
 * one of two modes (Modal Route Pattern):
 *
 *   - **overlay** (typical): navigated to from a list with
 *     `state.backgroundLocation` set. Browser back unwraps the
 *     overlay and the list page underneath is still mounted. We
 *     just call `navigate(-1)`.
 *
 *   - **standalone** (deep link / refresh): no background. Pressing
 *     `navigate(-1)` would either go to another site or do nothing
 *     useful. We send the user to a sensible fallback list.
 *
 * Detail components call `useDetailNav("/skills")` and use
 * `goBack()` for their "返回" button. The `isOverlay` flag is
 * also returned for any layout differences (e.g. header colour).
 */
export function useDetailNav(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | null;
  const isOverlay = !!state?.backgroundLocation;

  const goBack = useCallback(() => {
    if (isOverlay) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [isOverlay, fallbackPath, navigate]);

  return { goBack, isOverlay };
}

/** Helper for opening detail routes as overlays. Wraps
 *  `navigate(path, …)` with `state.backgroundLocation` set to the
 *  list-page location, which is the cue for App.tsx to render
 *  that detail as an overlay on top of the existing list rather
 *  than replacing it.
 *
 *  Two scenarios:
 *
 *  1. Called from a list page — current location IS the list, so
 *     we push it as the background and add a new history entry.
 *
 *  2. Called from inside an already-open overlay (e.g. sidebar
 *     switches from session A to session B while the detail is
 *     showing) — we want to keep the original list as background
 *     AND collapse the history so one browser-back returns to the
 *     list, not to session A. So we reuse the existing background
 *     and do `replace: true`.
 *
 *  Caller can override `replace` explicitly if needed. */
export function useOverlayNavigate() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (to: string, opts?: { replace?: boolean }) => {
      const state = location.state as { backgroundLocation?: Location } | null;
      const existingBg = state?.backgroundLocation;
      // Already inside an overlay → reuse the original background,
      // replace history entry by default so back returns to list.
      if (existingBg) {
        navigate(to, {
          state: { backgroundLocation: existingBg },
          replace: opts?.replace ?? true,
        });
        return;
      }
      // First-time push from a list page.
      navigate(to, {
        state: { backgroundLocation: location },
        replace: opts?.replace,
      });
    },
    [navigate, location],
  );
}
