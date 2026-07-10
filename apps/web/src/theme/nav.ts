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
      { key: 'funded', label: 'Funded', icon: 'shield-check' },
      { key: 'news', label: 'Market News', icon: 'newspaper' },
      { key: 'td_trading', label: 'To Do', icon: 'list-todo' },
    ],
  },
  {
    key: 'kia',
    label: 'Kia Sales',
    icon: 'car-front',
    accent: '#E0526A',
    group: 'Kia of Streetsboro',
    sections: [
      { key: 'kia_dash', label: 'Dashboard', icon: 'gauge' },
      { key: 'kia_news', label: 'Kia News', icon: 'newspaper' },
      { key: 'kia_know', label: 'Product Knowledge', icon: 'book-open' },
      { key: 'kia_todo', label: 'To Do', icon: 'list-todo' },
    ],
  },
  {
    key: 'studies',
    label: 'Studies',
    icon: 'graduation-cap',
    accent: C.violet,
    group: 'Series 65',
    sections: [
      { key: 'st_home', label: 'Subjects', icon: 'layers' },
      { key: 'st_game', label: 'Study Game', icon: 'gamepad-2' },
      { key: 'st_progress', label: 'Progress', icon: 'trending-up' },
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
  {
    key: 'llc',
    label: 'Vitalis Trading Systems LLC',
    icon: 'building-2',
    accent: C.info,
    group: 'Business',
    sections: [
      { key: 'llc_overview', label: 'Overview', icon: 'landmark' },
      { key: 'llc_documents', label: 'Documents', icon: 'folder-archive' },
      { key: 'llc_members', label: 'Members', icon: 'users' },
      { key: 'llc_contractors', label: 'Contractors', icon: 'briefcase' },
      { key: 'llc_compliance', label: 'Compliance & Filings', icon: 'file-check-2' },
      { key: 'llc_banking', label: 'Accounts & Banking', icon: 'banknote' },
      { key: 'llc_legal', label: 'Legal & Contracts', icon: 'scale' },
    ],
  },
];

export function navFor(ws: WorkspaceKey): NavWorkspace | undefined {
  return NAV.find((w) => w.key === ws);
}

// The signalling accent for a workspace (falls back to gold for anything not in
// the Meridian nav, e.g. a legacy wealth/finance route reached by deep link).
export function accentFor(ws: WorkspaceKey): string {
  return navFor(ws)?.accent ?? C.gold;
}
