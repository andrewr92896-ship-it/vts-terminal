import type { WorkspaceKey } from './themes';
import { C } from './tokens';

// The Meridian sidebar's two-tier navigation model: a Workspaces list, and the
// current workspace's Sections list under a group label. Section keys are the
// app's existing screen keys (see Portal.renderScreen), so restyling the shell
// never changes routing.

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
  // My Portal — the user's own personal workspace. Available to every signed-in
  // user. Home of the user-created Trading Team. Pinned to the very top of the
  // workspaces list.
  {
    key: 'myportal',
    label: 'My Portal',
    icon: 'briefcase',
    accent: '#34D399',
    group: 'My Portal',
    sections: [
      // A combined portfolio summary: active Advanced Trading positions merged
      // with the total long-term Investments portfolio and the stats across both.
      { key: 'my_holdings', label: 'Investment Holdings', icon: 'gem' },
      { key: 'my_team', label: 'Trading Team', icon: 'users' },
      { key: 'my_prefs', label: 'Preferences', icon: 'settings-2' },
      { key: 'my_settings', label: 'Settings', icon: 'settings' },
    ],
  },
  {
    key: 'trading',
    label: 'Advanced Trading',
    icon: 'candlestick-chart',
    accent: C.gold,
    group: 'Advanced Trading',
    sections: [
      { key: 'live', label: 'Live Wall', icon: 'layout-dashboard' },
      { key: 'alerts', label: 'Trading Alerts', icon: 'bell' },
      { key: 'desk', label: 'Trade Desk', icon: 'candlestick-chart' },
      { key: 'deleted', label: 'Deleted Trades', icon: 'trash-2' },
      { key: 'sessions', label: 'Strategy Sessions', icon: 'calendar-clock' },
      { key: 'funded', label: 'Manual Trades', icon: 'pencil' },
      // Private, role-gated: only shown to holders of the `funded` role (see
      // FUNDED_ONLY_SECTIONS + the sidebar filter). Never shown to the demo.
      { key: 'prop', label: 'Funded', icon: 'shield-check' },
      { key: 'news', label: 'Market News', icon: 'newspaper' },
      { key: 'td_trading', label: 'To Do', icon: 'list-todo' },
    ],
  },
  // Investments (teal) — a read-only, long-term portfolio tracker for the layman:
  // 401(k), IRA, ESA, and general holdings connected via a read-only aggregator
  // (Plaid / SnapTrade) or entered by hand. Strictly a tracker — it displays and
  // educates, it never executes trades or moves money (Apple 3.2.1(viii)) — and
  // carries no personalized buy/sell/rebalance advice (no RIA exposure). Every
  // section below is a "Coming Soon" placeholder for now; this is the foundation.
  {
    key: 'investments',
    label: 'Investments',
    icon: 'landmark',
    accent: '#2DD4BF',
    group: 'Investments',
    sections: [
      { key: 'inv_overview', label: 'Portfolio Overview', icon: 'layout-dashboard' },
      { key: 'inv_accounts', label: 'Accounts', icon: 'building-2' },
      { key: 'inv_holdings', label: 'Holdings', icon: 'layers' },
      { key: 'inv_allocation', label: 'Allocation', icon: 'gauge' },
      { key: 'inv_performance', label: 'Performance', icon: 'trending-up' },
      { key: 'inv_dividends', label: 'Dividends & Income', icon: 'banknote' },
      { key: 'inv_contributions', label: 'Contributions & Goals', icon: 'piggy-bank' },
      { key: 'inv_projections', label: 'Projections', icon: 'sparkles' },
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
      { key: 'st_cards', label: 'Flashcards', icon: 'copy' },
      { key: 'st_test', label: 'Practice Tests', icon: 'file-check-2' },
      { key: 'st_guides', label: 'Study Presentations', icon: 'presentation' },
      { key: 'st_progress', label: 'Progress', icon: 'trending-up' },
      { key: 'st_decks', label: 'Study Creation', icon: 'library' },
    ],
  },
  // Admin-only. Shown in the sidebar only to admins (Portal filters the
  // workspaces list via workspacesForRoles); consolidates the portal's admin
  // tools into one workspace.
  {
    key: 'admin',
    label: 'Admin Portal',
    icon: 'shield-check',
    accent: '#E0708F',
    group: 'Administration',
    sections: [
      { key: 'ad_users', label: 'Users', icon: 'users' },
      { key: 'ad_teams', label: 'Teams', icon: 'building-2' },
      { key: 'ad_badges', label: 'Badges', icon: 'star' },
      { key: 'ad_templates', label: 'Message Templates', icon: 'message-square' },
      { key: 'ad_notes', label: 'Patch Notes', icon: 'file-text' },
      { key: 'ad_early', label: 'Early Access', icon: 'sparkles' },
      { key: 'ad_suggestions', label: 'Suggestions', icon: 'lightbulb' },
      { key: 'ad_bugs', label: 'Bug Reports', icon: 'bug' },
      { key: 'ad_support', label: 'Support', icon: 'life-buoy' },
    ],
  },
  // Developer-only. Sits above Admin and holds the developer-exclusive tools
  // moved out of the Admin Portal: AI Instructions, Site Wording, and View as
  // role. (Internal key stays `founder` — the role/gating is unchanged.)
  {
    key: 'founder',
    label: 'Developer Portal',
    icon: 'crown',
    accent: '#F5A524',
    group: 'Developer',
    sections: [
      { key: 'ad_ai', label: 'AI Instructions', icon: 'message-square' },
      { key: 'ad_content', label: 'Site Wording', icon: 'book-open' },
      { key: 'ad_sidebar', label: 'Sidebar Layout', icon: 'list-tree' },
      { key: 'ad_viewas', label: 'View as role', icon: 'eye' },
    ],
  },
  // Site Help — available to every signed-in user. Consolidates the how-to
  // guides, announcements, patch notes, and the bug-report / suggestion forms
  // that used to live in the corner help hub.
  {
    key: 'help',
    label: 'Site Help',
    icon: 'life-buoy',
    accent: '#6C9EFF',
    group: 'Help & support',
    sections: [
      { key: 'hp_howto', label: 'How to', icon: 'book-open' },
      { key: 'hp_news', label: 'Announcements', icon: 'megaphone' },
      { key: 'hp_notes', label: 'Patch notes', icon: 'file-text' },
      { key: 'hp_bug', label: 'Report a bug', icon: 'bug' },
      { key: 'hp_suggest', label: 'Suggestion', icon: 'lightbulb' },
      { key: 'hp_rules', label: 'Rules & Conduct', icon: 'list-checks' },
      { key: 'hp_terms', label: 'Terms of Service', icon: 'scale' },
      { key: 'hp_privacy', label: 'Privacy Policy', icon: 'file-lock-2' },
    ],
  },
];

export function navFor(ws: WorkspaceKey): NavWorkspace | undefined {
  return NAV.find((w) => w.key === ws);
}

// Trading sections gated behind the admin-assigned `funded` role. The sidebar
// hides these unless the viewer holds the role (see canAccessFunded); the demo
// and the public never see them.
export const FUNDED_ONLY_SECTIONS = new Set(['prop']);

// The signalling accent for a workspace (falls back to gold for any key not in
// the nav — every real WorkspaceKey is present, so the fallback is a safety net).
export function accentFor(ws: WorkspaceKey): string {
  return navFor(ws)?.accent ?? C.gold;
}
