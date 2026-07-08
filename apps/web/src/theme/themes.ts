// Per-workspace themes, brand, and tabs.
//
// The portal is unified onto one calm, warm-neutral dark palette ("Claude-clean")
// defined in `tokens.ts`. Every workspace now shares the same flat surfaces,
// hairline borders, and clay accent — the only per-workspace difference is a
// subtle `identity` color (active-tab underline + wordmark) for wayfinding.
// The `Theme` shape is kept intact so existing screens keep compiling; the
// values just point at the shared tokens now.

import { color, workspaceIdentity } from './tokens';

export type WorkspaceKey = 'trading' | 'kia' | 'todo' | 'studies' | 'wealth' | 'finance';

export interface Theme {
  pageBg: string;
  headerBg: string;
  headerBorder: string; // prototype "hb"
  navBg: string;
  navBorder: string;
  accent: string; // primary action / active color (clay, shared)
  accent2: string; // accent hover / gradient stop
  accentText: string; // text on a solid accent fill
  identity: string; // subtle per-workspace wayfinding color
}

// One shared surface set for every workspace — flat, warm, no gradient washes.
function makeTheme(identity: string): Theme {
  return {
    pageBg: color.bg,
    headerBg: color.surface,
    headerBorder: color.border,
    navBg: color.bg,
    navBorder: color.border,
    accent: color.accent,
    accent2: color.accentHover,
    accentText: color.onAccent,
    identity,
  };
}

export const THEMES: Record<WorkspaceKey, Theme> = {
  trading: makeTheme(workspaceIdentity.trading),
  kia: makeTheme(workspaceIdentity.kia),
  studies: makeTheme(workspaceIdentity.studies),
  todo: makeTheme(workspaceIdentity.todo),
  wealth: makeTheme(workspaceIdentity.wealth),
  finance: makeTheme(workspaceIdentity.finance),
};

// Kept for backward compatibility with callers. Now a near-flat clay fill
// (restraint over glow); the old signature (accent → accent2) is preserved.
export function accentGradient(t: Theme): string {
  return `linear-gradient(180deg,${t.accent},${t.accent2})`;
}

export interface BrandMeta {
  name: (userName: string) => string;
  sub: string;
  color: string;
  size: string;
  letterSpacing: string;
  // When set, the header and background watermark use this wordmark image
  // instead of the styled text brand (Trading and Wealth Management).
  wordmark?: string;
}

export const BRAND: Record<WorkspaceKey, BrandMeta> = {
  trading: {
    name: () => 'VITALIS',
    sub: 'Trading Systems',
    color: '#EBCB74',
    size: '22px',
    letterSpacing: '2px',
    wordmark: '/brand/vitalis-wordmark.png',
  },
  studies: {
    name: () => 'STUDIES',
    sub: 'Study hub',
    color: '#cdbcff',
    size: '21px',
    letterSpacing: '2px',
  },
  kia: {
    name: () => 'KIA',
    sub: 'Kia of Streetsboro',
    color: '#ffffff',
    size: '26px',
    letterSpacing: '5px',
  },
  todo: {
    name: (userName: string) => `${userName}'s To Do List`,
    sub: 'Personal workspace',
    color: '#bfeee2',
    size: '19px',
    letterSpacing: '0.5px',
  },
  wealth: {
    name: () => 'VITALIS',
    sub: 'Retirement & Wealth Management',
    color: '#a9ecce',
    size: '22px',
    letterSpacing: '2px',
    // Same Vitalis logo as Trading, with the Retirement & Wealth subtitle.
    wordmark: '/brand/vitalis-wealth-wordmark.svg',
  },
  finance: {
    name: () => 'FINANCE',
    sub: 'Personal Finance',
    color: '#9fb0ff',
    size: '21px',
    letterSpacing: '2px',
  },
};

export interface TabDef {
  key: string;
  label: string;
  dot?: string; // live/attention indicator color
}

// Tabs per workspace. The Trading Admin tab is appended only for Admins
// (handled in the shell).
export const TABS: Record<WorkspaceKey, TabDef[]> = {
  studies: [
    { key: 'st_home', label: 'Subjects' },
    { key: 'st_game', label: 'Study Game' },
    { key: 'st_progress', label: 'Progress' },
  ],
  trading: [
    { key: 'live', label: 'Live Wall', dot: '#35c47b' },
    { key: 'alerts', label: 'Alerts', dot: '#EBCB74' },
    { key: 'desk', label: 'Trade Desk' },
    { key: 'sessions', label: 'Strategy Sessions' },
    { key: 'funded', label: 'Funded' },
    { key: 'news', label: 'Market News', dot: '#ef5468' },
    { key: 'td_trading', label: 'To Do' },
  ],
  kia: [
    { key: 'kia_dash', label: 'Dashboard' },
    { key: 'kia_news', label: 'Kia News' },
    { key: 'kia_know', label: 'Product Knowledge' },
    { key: 'kia_todo', label: 'To Do' },
  ],
  todo: [{ key: 'td_all', label: 'All Tasks' }],
  wealth: [
    { key: 'wm_home', label: 'Overview' },
    { key: 'wm_clients', label: 'Clients' },
    { key: 'wm_portfolios', label: 'Portfolios' },
    { key: 'wm_planning', label: 'Planning' },
    { key: 'wm_compliance', label: 'Compliance' },
  ],
  finance: [
    { key: 'fin_overview', label: 'Overview' },
    { key: 'fin_expenses', label: 'Expenses' },
    { key: 'fin_networth', label: 'Net Worth' },
  ],
};

export const DEFAULT_SCREEN: Record<WorkspaceKey, string> = {
  trading: 'live',
  kia: 'kia_dash',
  todo: 'td_all',
  studies: 'st_home',
  wealth: 'wm_home',
  finance: 'fin_overview',
};

export const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  todo: 'To Do List',
  kia: 'Kia Sales',
  trading: 'Trading',
  studies: 'Studies',
  wealth: 'Wealth Management',
  finance: 'Finance',
};
