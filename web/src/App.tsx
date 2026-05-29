import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, type Location } from 'react-router-dom';
import Layout from './components/Layout';
import { GlobalLoading } from './components/GlobalLoading';
import { api } from './lib/api';
import { logger } from './lib/logger';
import { BOOT_MIN_DISPLAY_MS, BOOT_TIMEOUT_MS } from './lib/constants';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const SkillsView = lazy(() => import('./pages/SkillsView'));
const SkillDetailView = lazy(() => import('./pages/SkillDetailView'));
const MCPsView = lazy(() => import('./pages/MCPsView'));
const MCPDetailView = lazy(() => import('./pages/MCPDetailView'));
const ExtensionsView = lazy(() => import('./pages/ExtensionsView'));
const AgentDetailView = lazy(() => import('./pages/AgentDetailView'));
const UsageView = lazy(() => import('./pages/UsageView'));
const SessionsView = lazy(() => import('./pages/SessionsView'));
const NewSessionView = lazy(() => import('./pages/NewSessionView'));
const SessionsTrashView = lazy(() => import('./pages/SessionsTrashView'));
const SessionDetailView = lazy(() => import('./pages/SessionDetailView'));
const FavoritesView = lazy(() => import('./pages/FavoritesView'));
const SettingsView = lazy(() => import('./pages/SettingsView'));
const LogsView = lazy(() => import('./pages/LogsView'));
const NotFound = lazy(() => import('./pages/NotFound'));

/**
 * Modal Route Pattern (React Router's recommended way to do
 * "detail page on top of list page without unmounting the list").
 *
 * When a list-page click navigates to a detail route, it passes
 * the current location as `state.backgroundLocation`. The first
 * <Routes> below renders against that background, so the list
 * component stays mounted across detail navigation. The second
 * <Routes> only renders when a backgroundLocation is present and
 * draws the detail on top.
 *
 * Direct URL hits (`/sessions/abc`, deep links, refresh) have no
 * backgroundLocation, so the first <Routes> just renders the
 * detail page standalone — no overlay, full bleed.
 *
 * Each detail component reads its own backgroundLocation via
 * useLocation().state and decides whether to render in overlay
 * or standalone mode (back-button behaviour, container styling).
 *
 * See docs/routing-and-navigation.md §3 for the full spec.
 */
export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const startTime = Date.now();
    const boot = async () => {
      try {
        await Promise.all([api.health(), api.stats()]);
      } catch {
        // Server not available — proceed after timeout
      }
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, BOOT_MIN_DISPLAY_MS - elapsed);
      setTimeout(() => setReady(true), remaining);
    };
    boot();
    timer = setTimeout(() => setReady(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return <GlobalLoading />;

  return <AppRoutes />;
}

function AppRoutes() {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | null;
  const background = state?.backgroundLocation;
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      logger.info('navigation', `Navigate to ${location.pathname}`);
      prevPath.current = location.pathname;
    }
  }, [location.pathname]);

  return (
    <Layout
      overlay={
        background ? (
          <Suspense
            fallback={<div className="p-12 text-center text-muted-foreground text-sm">加载中…</div>}
          >
            <Routes>
              <Route path="/sessions/new" element={<NewSessionView />} />
              <Route path="/sessions/:id" element={<SessionDetailView />} />
              <Route path="/skills/:id" element={<SkillDetailView />} />
              <Route path="/mcps/:id" element={<MCPDetailView />} />
              <Route path="/agents/:id" element={<AgentDetailView />} />
            </Routes>
          </Suspense>
        ) : null
      }
    >
      <Suspense
        fallback={<div className="p-12 text-center text-muted-foreground text-sm">加载中…</div>}
      >
        {/* Base routes — driven by background location when present
         *  so the list page stays mounted while detail overlays. */}
        <Routes location={background || location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/skills" element={<SkillsView />} />
          <Route path="/skills/:id" element={<SkillDetailView />} />
          <Route path="/mcps" element={<MCPsView />} />
          <Route path="/mcps/:id" element={<MCPDetailView />} />
          <Route path="/extensions" element={<ExtensionsView />} />
          <Route path="/agents/:id" element={<AgentDetailView />} />
          <Route path="/usage" element={<UsageView />} />
          <Route path="/sessions" element={<SessionsView />} />
          <Route path="/sessions/new" element={<NewSessionView />} />
          <Route path="/sessions/trash" element={<SessionsTrashView />} />
          <Route path="/sessions/:id" element={<SessionDetailView />} />
          <Route path="/favorites" element={<FavoritesView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/settings/logs" element={<LogsView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
