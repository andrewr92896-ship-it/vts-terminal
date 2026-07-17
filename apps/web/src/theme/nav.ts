import type { WorkspaceKey } from './themes';
import { C } from './tokens';

// The Meridian sidebar's two-tier navigation model: a Workspaces list, and the
// current workspace's Sections list under a group label. Section keys are the
// app's existing screen keys (see Portal.renderScreen), so restyling the shell
// never changes routing. Wealth Management and Finance are intentionally absent
// — the redesign removes them from the nav (their data/routes are left intact).

export interface NavSection {
  key: string; // an existing screen key
  label: string;
  icon: string; // Lucide glyph name (see components/Icon)
  count?: number; // optional badge (e.g. unread alerts)
}

export interface NavWorkspace {
  key: WorkspaceKey;
  label: string;
  icon: string;
  accent: string; // the workspace's signalling color
  group: string; // header shown above its sections
  sections: NavSection[];
}

export const NAV: NavWorkspace[] = [
  {
    key: 'trading',
    label: 'Trading',
    icon: 'candlestick-chart',
    accent: C.gold,
    group: 'Trading',
    sections: [
      { key: 'live', label: 'Live Wall', icon: 'layout-dashboard' },
      { key: 'alerts', label: 'Alerts', icon: 'bell' },
      { key: 'desk', label: 'Trade Desk', icon: 'candlestick-chart' },
      { key: 'sessions', label: 'Strategy Sessions', icon: 'calendar-clock' },
      { key: 'funded', label: 'Manual Trades', icon: 'pencil' },
      // Private, role-gated: only shown to holders of the `funded` role (see
      // FUNDED_ONLY_SECTIONS + the sidebar filter). Never shown to the demo.
      { key: 'prop', label: 'Funded', icon: 'shield-check' },
      { key: 'news', label: 'Market News', icon: 'newspaper' },
      { key: 'td_trading', label: 'To Do', icon: 'list-todo' },
    ],
  },
  {
    key: 'studies',
    label: 'Studies',
    icon: 'graduation-cap',
    accent: C.violet,
    group: 'Studies',
    sections: [
      { key: 'st_home', label: 'Subjects', icon: 'layers' },
      { key: 'st_game', label: 'Study Game', icon: 'gamepad-2' },
      { key: 'st_test', label: 'Test Mode', icon: 'file-check-2' },
      { key: 'st_progress', label: 'Progress', icon: 'trending-up' },
      { key: 'st_decks', label: 'Study Games', icon: 'library' },
    ],
  },
  {
    key: 'todo',
    label: 'To Do',
    icon: 'list-todo',
    accent: '#46C2A8',
    group: 'Tasks',
    sections: [{ key: 'td_all', label: 'All Tasks', icon: 'list-checks' }],
  },
];

export function navFor(ws: WorkspaceKey): NavWorkspace | undefined {
  return NAV.find((w) => w.key === ws);
}

// Studies sections that belong to the Series 65 track (the owner's licensed
// content). The sidebar hides these for teams that can't use Series 65; the
// Subjects hub and the team-built Study Games stay visible to everyone.
export const SERIES65_ONLY_SECTIONS = new Set(['st_game', 'st_test', 'st_progress']);

// Trading sections gated behind the admin-assigned `funded` role. The sidebar
// hides these unless the viewer holds the role (see canAccessFunded); the demo
// and the public never see them.
export const FUNDED_ONLY_SECTIONS = new Set(['prop']);

// The signalling accent for a workspace (falls back to gold for anything not in
// the Meridian nav, e.g. a legacy wealth/finance route reached by deep link).
export function accentFor(ws: WorkspaceKey): string {
  return navFor(ws)?.accent ?? C.gold;
}
