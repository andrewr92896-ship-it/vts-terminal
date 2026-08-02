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
  // My Terminal — the user's own personal workspace. Available to every signed-in
  // user. Home of the user-created Trading Team. Pinned to the very top of the
  // workspaces list.
  {
    key: 'myportal',
    label: 'My Terminal',
    icon: 'briefcase',
    accent: '#34D399',
    group: 'My Terminal',
    sections: [
      // A combined portfolio summary: active Advanced Trading positions merged
      // with the total long-term Investments portfolio and the stats across both.
      { key: 'my_holdings', label: 'Investment Holdings', icon: 'gem' },
      // The whole-life roll-up: everything you own minus everything you owe.
      { key: 'my_networth', label: 'Net Worth', icon: 'scale' },
      { key: 'my_team', label: 'Trading Team', icon: 'users' },
      // Turn the optional parts of the terminal on and off for yourself.
      { key: 'my_access', label: 'Feature Access', icon: 'toggle-right' },
      { key: 'my_prefs', label: 'Preferences', icon: 'settings-2' },
      { key: 'my_settings', label: 'Settings', icon: 'settings' },
    ],
  },
  // Markets — included with every account, no opt-in. Everything here reads
  // public market data: nothing on these three screens touches a trade, a broker
  // or a balance, which is exactly why they can sit outside the Advanced Trading
  // opt-in. The Live Wall board is shared between the two: a Markets-only user
  // gets the chart / watchlist / news / calendar tiles and one saved board,
  // while opting into Advanced Trading adds the desk tiles and named presets to
  // the same screen rather than giving them a second one.
  {
    key: 'markets',
    label: 'Markets',
    icon: 'globe',
    accent: '#5AC8FA',
    group: 'Markets',
    sections: [
      { key: 'live', label: 'Live Wall', icon: 'layout-dashboard' },
      { key: 'data', label: 'Market Data', icon: 'line-chart' },
      { key: 'news', label: 'Market News', icon: 'newspaper' },
    ],
  },
  // Advanced Trading — opt-in (My Terminal ▸ Feature Access). The desk: placing
  // trades, reviewing them, alerts, sessions, and the hand-kept manual book.
  {
    key: 'trading',
    label: 'Advanced Trading',
    icon: 'candlestick-chart',
    accent: C.gold,
    group: 'Advanced Trading',
    sections: [
      { key: 'alerts', label: 'Trading Alerts', icon: 'bell' },
      // Placing trades. The section key is `tradedesk`; `desk` (below) is the
      // review screen that used to carry this name, and keeps its key so saved
      // sidebar orders, how-to wording and in-app links stay pointed at it.
      { key: 'tradedesk', label: 'Trade Desk', icon: 'zap' },
      { key: 'desk', label: 'Trade Analysis', icon: 'candlestick-chart' },
      { key: 'deleted', label: 'Deleted Trades', icon: 'trash-2' },
      { key: 'sessions', label: 'Strategy Sessions', icon: 'calendar-clock' },
      // Manual Trades is a plain Advanced Trading section — your own book, kept
      // by hand. It is deliberately independent of the Funded opt-in below:
      // plenty of traders keep a manual book without ever running a challenge.
      { key: 'funded', label: 'Manual Trades', icon: 'pencil' },
      // The nested opt-in: shown only when Funded Account is turned on as well
      // (see FUNDED_ONLY_SECTIONS + the sidebar filter). Never shown to the demo.
      { key: 'prop', label: 'Funded Account', icon: 'shield-check' },
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
  // workspaces list via workspacesForRoles); consolidates the terminal's admin
  // tools into one workspace.
  {
    key: 'admin',
    label: 'Admin Terminal',
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
      { key: 'ad_bugs', label: 'Bug Reports', icon: 'bug' },
      { key: 'ad_support', label: 'Support', icon: 'life-buoy' },
    ],
  },
  // Developer-only. Sits above Admin and holds the developer-exclusive tools
  // moved out of the Admin Terminal: AI Instructions, Site Wording, and View as
  // role. (Internal key stays `founder` — the role/gating is unchanged.)
  {
    key: 'founder',
    label: 'Developer Terminal',
    icon: 'crown',
    accent: '#F5A524',
    group: 'Developer',
    sections: [
      { key: 'ad_ai', label: 'AI Instructions', icon: 'message-square' },
      { key: 'ad_content', label: 'Site Wording', icon: 'book-open' },
      { key: 'ad_sidebar', label: 'Sidebar Layout', icon: 'list-tree' },
      { key: 'ad_suggestions', label: 'Suggestions', icon: 'lightbulb' },
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

// Trading sections behind the nested Funded Account opt-in. The sidebar hides
// these unless the viewer has turned Funded on (which itself requires Advanced
// Trading); the demo never sees them.
export const FUNDED_ONLY_SECTIONS = new Set(['prop']);

// Workspaces a user turns on for themselves in My Terminal ▸ Feature Access, keyed
// to the feature that reveals each. A workspace not listed here is included with
// every account. When one is off the sidebar still draws its row — dimmed, with
// a lock — so the feature is discoverable instead of invisible; clicking it
// opens Feature Access rather than the workspace.
export const OPT_IN_WORKSPACES: Record<string, 'advancedTrading'> = {
  trading: 'advancedTrading',
};

// The Employee Portal is deliberately NOT in this nav config. It is not a
// workspace and not a section — it is a separate website, so the sidebar renders
// it as a standalone row above the workspaces list that opens /employee in a new
// tab (see Sidebar.tsx). Nothing here routes to it.

// The signalling accent for a workspace (falls back to gold for any key not in
// the nav — every real WorkspaceKey is present, so the fallback is a safety net).
export function accentFor(ws: WorkspaceKey): string {
  return navFor(ws)?.accent ?? C.gold;
}
