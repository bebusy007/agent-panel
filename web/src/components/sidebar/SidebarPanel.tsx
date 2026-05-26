import { useLocation } from 'react-router-dom';
import { SessionsSidebar } from './SessionsSidebar';

/**
 * The second-tier sidebar. Layout only mounts this on routes that
 * actually have something useful to show (today: /sessions and
 * /favorites — they share the project folder tree).
 *
 * Other routes (overview / history / usage / extensions / skills /
 * mcps) used to render a brand-blurb DefaultPanel that just took up
 * 260px for no reason. We removed it; Layout now keeps only the 44px
 * IconRail visible on those routes.
 */
export function SidebarPanel() {
  const path = useLocation().pathname;
  if (path.startsWith('/sessions') || path.startsWith('/favorites')) {
    return <SessionsSidebar />;
  }
  // Defensive — Layout shouldn't mount us here, but if a new route
  // is added without updating Layout's allowlist, we'd rather render
  // nothing than the old marketing blurb.
  return null;
}
