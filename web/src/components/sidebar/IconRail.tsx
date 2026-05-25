import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessagesSquare,
  Sparkles,
  Boxes,
  BarChart3,
  Star,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

// Sparkles keeps showing up in the brand chip — `void` keeps the import
// honest for TS's noUnusedLocals while letting tree-shake do its thing.
void Sparkles;
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: '概览', icon: LayoutDashboard, end: true },
  // Sessions tab now hosts both 会话 and 消息 search modes — what
  // used to be the standalone /history page is just the "消息" toggle
  // inside the search box now (see docs/routing-and-navigation.md §1.4).
  { to: '/sessions', label: '会话', icon: MessagesSquare },
  { to: '/usage', label: '用量', icon: BarChart3 },
  { to: '/extensions', label: '扩展', icon: Boxes },
  { to: '/favorites', label: '收藏', icon: Star },
];

// We keep /skills and /mcps as standalone routes (and as sections inside
// /extensions) so any external bookmarks still work — the brand icon
// just doesn't surface them as separate top-level entries anymore.

export function IconRail({
  collapsed,
  sidebarAvailable,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  /** True when the current route has something to put in the side panel
   *  (today: /sessions and /favorites). When false, the collapse button
   *  hides because there's nothing to collapse — the panel is already
   *  invisible by route policy, so the toggle would lie. */
  sidebarAvailable: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <div className="flex h-full w-[44px] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-12 w-full items-center justify-center border-b border-border">
        <div
          className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-sm"
          title="agent-panel — 本地 AI agent 资产看板"
        >
          <Sparkles className="size-3.5" />
        </div>
      </div>
      {/* Nav */}
      <nav className="flex flex-1 flex-col items-center gap-1 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'relative flex size-9 items-center justify-center rounded-md transition-colors',
                isActive
                  ? 'bg-secondary text-fg'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-2 h-5 w-[3px] rounded-r-full bg-accent" />
                )}
                <item.icon className="size-[18px]" />
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {/* Bottom actions */}
      <div className="mt-auto flex flex-col items-center gap-1 pb-2">
        {sidebarAvailable && (
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? '展开侧栏' : '折叠侧栏'}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-muted-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        )}
        <NavLink
          to="/settings"
          title="设置"
          className={({ isActive }) =>
            cn(
              'flex size-9 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-secondary text-fg'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-muted-foreground',
            )
          }
        >
          <Settings className="size-[18px]" />
        </NavLink>
      </div>
    </div>
  );
}
