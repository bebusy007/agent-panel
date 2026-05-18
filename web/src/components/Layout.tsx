import { ReactNode, useCallback, useEffect, useState } from "react";
import { useLocation, type Location } from "react-router-dom";
import { IconRail } from "./sidebar/IconRail";
import { SidebarPanel } from "./sidebar/SidebarPanel";
import { UpdateBanner } from "./UpdateBanner";
import {
  loadSidebarCollapsed,
  loadSidebarWidth,
  saveSidebarCollapsed,
  saveSidebarWidth,
  SIDEBAR_BOUNDS,
} from "@/lib/sidebar-state";
import { useDragResize } from "@/lib/use-drag-resize";

interface LayoutProps {
  children: ReactNode;
  /** Detail-route overlay (Modal Route Pattern). When present,
   *  rendered as `absolute inset-0` over the main area, on top of
   *  whatever `children` painted. The list page underneath stays
   *  mounted and keeps all its state. */
  overlay?: ReactNode;
}

/** Routes that opt out of the legacy max-w-1600 + px-8 padding wrapper.
 *  All single-item detail pages get full-bleed: they own their own
 *  scroll container, sticky header, and (for sessions) three-column
 *  layout. Listing pages stay inside the centred max-w wrapper. */
function isFullBleedRoute(pathname: string): boolean {
  // /sessions/<anything-but-trash>
  if (/^\/sessions\/(?!trash$)[^/]+/.test(pathname)) return true;
  if (/^\/skills\/[^/]+/.test(pathname)) return true;
  if (/^\/mcps\/[^/]+/.test(pathname)) return true;
  if (/^\/agents\/[^/]+/.test(pathname)) return true;
  return false;
}

/** Whether this route surfaces something useful in the second-tier
 *  sidebar panel.
 *
 *  Today only `/sessions*` (project folder tree, including session
 *  detail pages — the overlay opens on top of the same Sessions
 *  layout, so the sidebar should remain visible and operable) and
 *  `/favorites` (lives off the same SessionsSidebar) actually need
 *  it. Other pages (overview / usage / extensions / skills / mcps)
 *  used to render a "brand + blurb" DefaultPanel that took 260px
 *  for no reason — they no longer mount the panel at all. */
function shouldShowSidebarPanel(pathname: string): boolean {
  if (pathname.startsWith("/sessions")) return true;
  if (pathname === "/favorites") return true;
  return false;
}

/**
 * Two-tier sidebar layout:
 *
 *   ┌──────┬──────────────┬──────────────────────┐
 *   │ rail │ side panel    │ main content         │
 *   │  44  │   (resizable) │   (flex)             │
 *   └──────┴──────────────┴──────────────────────┘
 *
 * The rail is always visible. The side panel can be collapsed (rail-only
 * mode) or resized (200–480px). State is persisted to localStorage.
 */
export default function Layout({ children, overlay }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(() => loadSidebarCollapsed());
  const persistWidth = useCallback((w: number) => saveSidebarWidth(w), []);
  const { width, onResizeStart, onResizeDoubleClick } = useDragResize(
    SIDEBAR_BOUNDS,
    loadSidebarWidth(),
    persistWidth,
  );
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | null;
  const effectivePath = state?.backgroundLocation?.pathname || location.pathname;
  const fullBleed = isFullBleedRoute(effectivePath);
  const sidebarPanelVisible =
    !collapsed && shouldShowSidebarPanel(effectivePath);

  useEffect(() => saveSidebarCollapsed(collapsed), [collapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-fg">
      <IconRail
        collapsed={collapsed}
        sidebarAvailable={shouldShowSidebarPanel(effectivePath)}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      />
      {sidebarPanelVisible && (
        <>
          <aside
            className="shrink-0 overflow-hidden border-r border-border bg-sidebar"
            style={{ width: `${width}px` }}
          >
            <SidebarPanel />
          </aside>
          {/* Drag handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={onResizeStart}
            onDoubleClick={onResizeDoubleClick}
            className="group/handle relative w-px shrink-0 cursor-col-resize bg-border hover:bg-accent"
            title="拖动调整宽度，双击复位"
          >
            <span className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        </>
      )}
      {/* `relative` is the anchor for the overlay layer (Modal
       *  Route Pattern). The overlay is rendered as the second
       *  child below and uses `absolute inset-0` to cover this main
       *  column without spilling over the rail or the sidebar
       *  panel. */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <UpdateBanner />
        {fullBleed ? (
          // Full-bleed routes (/sessions/:id, /skills/:id, etc.) own
          // their own scroll + layout — the wrapper just expands.
          <div className="flex h-full min-h-0 flex-1">{children}</div>
        ) : (
          // Legacy max-w + padding wrapper for the listing pages.
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1600px] px-8 py-8">{children}</div>
          </div>
        )}
        {overlay && (
          <div className="absolute inset-0 z-30 flex flex-col bg-background">
            {overlay}
          </div>
        )}
      </main>
    </div>
  );
}
