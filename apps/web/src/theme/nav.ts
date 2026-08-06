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
      // THE LIVE WALL IS PINNED TO THE TOP, above the paid rows (owner
      // instruction, 2026-08). It is the single exception to the Max → Premium →
      // free stacking every other workspace follows, and it is deliberate: this
      // is the terminal's biggest feature and what a sign-in opens on, so
      // burying it beneath rows a free account cannot use read as though the
      // product led with its paywall. `zap` rather than `layout-dashboard` so
      // the row carries some weight against the paid marks beside it.
      //
      // The key stays `live`, so the howto wording and every in-app link keep
      // working — the same reason `desk` stayed `desk`.
      { key: 'live', label: 'Live Wall', icon: 'zap' },
      // Max.
      { key: 'my_team', label: 'Trading Team', icon: 'users' },
      // Premium — the series board. The economic calendar and the FOMC
      // countdown on that same screen stay free. Market News left for the News
      // workspace; Market Data stayed, because it is a board of rates and prices
      // rather than a feed of stories (owner decision, 2026-08).
      { key: 'data', label: 'Market Data', icon: 'line-chart' },
      // Moved here from Advanced Trading (owner decision, 2026-08): a to-do list
      // is personal, not a desk instrument. The key stays `td_trading` so saved
      // nav.order overrides and in-app links keep working.
      { key: 'td_trading', label: 'To Do', icon: 'list-todo' },
      // (Net Worth moved to the Finances workspace. Its key is still
      // `my_networth`, so in-app links keep working.)
      // Memberships and the optional parts of the terminal. The key stays
      // `my_access` though the label is now Premium Features, so a founder's
      // saved nav.order override keeps pointing at it.
      { key: 'my_access', label: 'Premium Features', icon: 'gem' },
      // The same Rules & Conduct document Site Help carries, surfaced here too
      // (owner decision, 2026-08). ONE document rendered in two places rather
      // than two documents — two rules pages disagree within a month, and the
      // one people read is always the wrong one. See RulesBody.
      { key: 'my_rules', label: 'Site Rules', icon: 'list-checks' },
      { key: 'my_prefs', label: 'Preferences', icon: 'settings-2' },
      { key: 'my_settings', label: 'Settings', icon: 'settings' },
    ],
  },
  // (The Markets workspace was dissolved — owner decision, 2026-08. Its two
  // sections, Market Data and Market News, are My Terminal sections now; the
  // Live Wall had already moved there. Nothing was removed: the screens, their
  // keys and their routes are unchanged, so the howto wording and every in-app
  // link still resolve.)
  // Advanced Trading — opt-in (My Terminal ▸ Premium Features). The desk: placing
  // trades, reviewing them, sessions, and the hand-kept manual book.
  //
  // **This list is ordered by the TRADE'S OWN LIFE, not by tier** (owner
  // instruction, 2026-08): what is open now, what is closed and what it scored,
  // then the funded book, the hand-kept book, and what was thrown away. It is
  // the one workspace that does not stack Max → Premium → free, because a
  // trader reads these rows as a sequence rather than as a price list. Strategy
  // Sessions follows them: it is a plan for trading rather than a record of it.
  {
    key: 'trading',
    label: 'Advanced Trading',
    icon: 'candlestick-chart',
    accent: C.gold,
    group: 'Advanced Trading',
    sections: [
      // Placing an order and watching what is open. Renamed from "Trade Desk"
      // (owner, 2026-08); the key stays `tradedesk`, as `desk` below stayed
      // `desk` through its own two renames — rename a label, never a key.
      { key: 'tradedesk', label: 'Live Trades', icon: 'zap' },
      // The review screen: the closed trades and what they scored, with the
      // connected brokers' capital on the same page (the Live Brokers tab was
      // folded in, owner instruction 2026-08). Key unchanged through "Trade
      // Desk" → "Trade Analysis" → "Trade History" → this, so `howto.desk` and
      // every in-app link still resolve.
      { key: 'desk', label: 'Closed Trades & Metrics', icon: 'candlestick-chart' },
      // The nested opt-in: shown only when Funded Account is turned on as well
      // (see FUNDED_ONLY_SECTIONS + the sidebar filter). Never shown to the demo.
      { key: 'prop', label: 'Funded Trades', icon: 'shield-check' },
      // Manual Trades is a plain Advanced Trading section — your own book, kept
      // by hand. It is deliberately independent of the Funded opt-in above:
      // plenty of traders keep a manual book without ever running a challenge.
      { key: 'funded', label: 'Manual Trades', icon: 'pencil' },
      { key: 'deleted', label: 'Deleted Trades', icon: 'trash-2' },
      // Premium. Last because it is the one row here that is not a record of
      // trades.
      { key: 'sessions', label: 'Strategy Sessions', icon: 'calendar-clock' },
      // (Trading Alerts was removed outright — owner instruction, 2026-08. The
      // two settings that lived on it and had no other home moved rather than
      // going with it: the session open/close/pre-open alerts are on Strategy
      // Sessions, and price alerts are in My Terminal ▸ Settings beside the
      // other notification controls. The TradingView alert feed, its screen and
      // its how-to entry are gone; the webhook, the `trading_alerts` table and
      // the Live Wall's Alerts tile are untouched.)
    ],
  },
  // Finances (green) — personal money for an ordinary person: what you are worth
  // and where it goes. Deliberately SEPARATE from Investments (owner decision,
  // 2026-08): Investments answers "what do I own", this answers "what do I earn
  // and spend", and folding them together makes one very long sidebar list in
  // which neither job is obvious. This is the workspace the average public user
  // opens first, so it leads the money pair.
  {
    key: 'finances',
    label: 'Finances',
    icon: 'piggy-bank',
    accent: '#4ADE80',
    group: 'Finances',
    sections: [
      // Moved out of My Terminal (owner decision, 2026-08). The key stays
      // `my_networth` on the screen it routes to, so in-app links keep working;
      // the section key is new because it is a new row in a new workspace.
      { key: 'fin_networth', label: 'Net Worth', icon: 'scale' },
      { key: 'fin_budget', label: 'Budget', icon: 'receipt' },
    ],
  },
  // News (slate-blue) — Market News moved out of My Terminal, and the workspace
  // is built to grow past markets. World and politics come from wire services
  // only (owner decision, 2026-08): factual reporting rather than opinion, which
  // keeps the terminal out of an editorial position it has no reason to hold.
  {
    key: 'news',
    label: 'News',
    icon: 'newspaper',
    accent: '#93B4FF',
    group: 'News',
    sections: [
      // The key stays `news` — the same screen, the same route, the same howto
      // wording. Only the workspace around it changed.
      { key: 'news', label: 'Market News', icon: 'line-chart' },
      { key: 'news_world', label: 'World', icon: 'globe' },
      { key: 'news_politics', label: 'Politics', icon: 'landmark' },
    ],
  },
  // Investments (teal) — a read-only, long-term portfolio tracker for the layman:
  // 401(k), IRA, ESA, and general holdings, entered by hand today (a read-only
  // aggregator — Plaid / SnapTrade — is the designed path and needs a paid
  // provider account, so it is an owner decision rather than a build). Strictly a
  // tracker — it displays and educates, it never executes trades or moves money
  // (Apple 3.2.1(viii)) — and carries no personalized buy/sell/rebalance advice
  // (no RIA exposure). All eight sections below are built; the "Coming Soon"
  // placeholder they once rendered has been deleted rather than left in the tree
  // saying that about shipped screens.
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
      // Premium — making. Playing every built-in game, set and guide is free,
      // which is why the rest of this list is not marked.
      { key: 'st_decks', label: 'Study Creation', icon: 'library' },
      // Free.
      { key: 'st_game', label: 'Study Game', icon: 'gamepad-2' },
      { key: 'st_cards', label: 'Flashcards', icon: 'copy' },
      { key: 'st_test', label: 'Practice Tests', icon: 'file-check-2' },
      { key: 'st_guides', label: 'Study Presentations', icon: 'presentation' },
      { key: 'st_progress', label: 'Progress', icon: 'trending-up' },
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
      // What administrators have done, and what is waiting on one. Membership
      // grants are recorded here; bug reports, support requests and early-access
      // leads are projected live from their own sections.
      { key: 'ad_log', label: 'Administrator Log', icon: 'file-clock' },
      // The rules admins work to, and how to handle common situations.
      { key: 'ad_guidelines', label: 'Admin Guidelines', icon: 'list-checks' },
      // Where VTS AI declined a request for financial or investment advice.
      // Sits beside the log and the guidelines because it is the same job:
      // what has happened, and what is waiting on somebody.
      { key: 'ad_rules', label: 'Rule Breaking', icon: 'shield' },
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
      // The idea board. Posts marked VTS Development come from Claude Code and
      // arrive with a deploy (see devBlog/seeded.ts).
      { key: 'ad_blog', label: 'Developer Blog', icon: 'book-open' },
      { key: 'ad_ai', label: 'AI Instructions', icon: 'message-square' },
      // The default Live Wall layouts every account chooses between — and the
      // only boards a free account gets. Draft-then-publish, so editing one does
      // not change what members see until it is published.
      { key: 'ad_walls', label: 'Live Wall Templates', icon: 'layout-dashboard' },
      { key: 'ad_content', label: 'Site Wording', icon: 'book-open' },
      // (There is deliberately no Sidebar Layout editor. This array IS the
      // sidebar's order — workspaces and the sections within each — and the only
      // way to change it is to edit it here and deploy. Owner decision, 2026-08.)
      { key: 'ad_suggestions', label: 'Suggestions', icon: 'lightbulb' },
      // (There is deliberately no "View as role" row. It lives in the account
      // menu instead — owner decision, 2026-08: previewing as Member hides this
      // very workspace, so a control for leaving the preview cannot live inside
      // it. See `ViewAsRole` in components/TopBar.tsx.)
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

// Sections behind the Trading Teams GRANT (`user.access.features.tradingTeams`).
//
// Hidden outright rather than drawn locked, which is the opposite of how the
// opt-in workspaces behave and is deliberate: a padlock advertises a feature,
// and the point here is that an ordinary account should not know teams exist.
// There is nothing to discover and nothing to buy — the grant is handed out by a
// software developer, so a lock icon would only invite a support ticket nobody
// can resolve with a payment.
//
// The server refuses every /api/my-portal/team* route on the same grant, so this
// is presentation only; the enforcer is requireTradingTeams.
export const TEAM_ONLY_SECTIONS = new Set(['my_team']);

// Workspaces a user turns on for themselves in My Terminal ▸ Premium Features, keyed
// to the feature that reveals each. A workspace not listed here is included with
// every account. When one is off the sidebar still draws its row — dimmed, with
// a lock — so the feature is discoverable instead of invisible; clicking it
// opens Premium Features rather than the workspace.
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
