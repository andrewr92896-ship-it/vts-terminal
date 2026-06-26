// Per-workspace themes, brand, and tabs — values taken verbatim from the
// prototype so the look matches exactly.

export type WorkspaceKey = 'trading' | 'kia' | 'todo' | 'studies' | 'wealth' | 'finance';

export interface Theme {
  pageBg: string;
  headerBg: string;
  headerBorder: string; // prototype "hb"
  navBg: string;
  navBorder: string;
  accent: string;
  accent2: string;
  accentText: string;
}

export const THEMES: Record<WorkspaceKey, Theme> = {
  wealth: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#0c2a20 0%,#06140e 60%)',
    headerBg: 'linear-gradient(90deg,#0a241b 0%,#0f3527 100%)',
    headerBorder: '#1d4a38',
    navBg: '#0a201a',
    navBorder: '#173f30',
    accent: '#34b87a',
    accent2: '#239160',
    accentText: '#05231a',
  },
  studies: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#241a3d 0%,#120d22 60%)',
    headerBg: 'linear-gradient(90deg,#1c1436 0%,#2a1f4e 100%)',
    headerBorder: '#3a2d63',
    navBg: '#171029',
    navBorder: '#2a1f4e',
    accent: '#b69cff',
    accent2: '#8a6fe0',
    accentText: '#1a1030',
  },
  trading: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#0d2150 0%,#060f24 55%)',
    headerBg: 'linear-gradient(90deg,#0a1f4d 0%,#0c2768 100%)',
    headerBorder: '#1c3a7a',
    navBg: '#0a1834',
    navBorder: '#16294f',
    accent: '#EBCB74',
    accent2: '#C9A24B',
    accentText: '#0c2768',
  },
  kia: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#1c1f25 0%,#0a0b0d 60%)',
    headerBg: 'linear-gradient(90deg,#141518 0%,#202227 100%)',
    headerBorder: '#2c2f36',
    navBg: '#141518',
    navBorder: '#26282e',
    accent: '#BB162B',
    accent2: '#8d0f20',
    accentText: '#ffffff',
  },
  todo: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#1b2c3b 0%,#0d1620 60%)',
    headerBg: 'linear-gradient(90deg,#15212e 0%,#1d3344 100%)',
    headerBorder: '#284158',
    navBg: '#15212e',
    navBorder: '#1d3344',
    accent: '#46c2a8',
    accent2: '#2f9e86',
    accentText: '#06231d',
  },
  finance: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#1a1f44 0%,#0a0e22 60%)',
    headerBg: 'linear-gradient(90deg,#15193a 0%,#222a5e 100%)',
    headerBorder: '#2e3766',
    navBg: '#12162f',
    navBorder: '#262e57',
    accent: '#6f8bff',
    accent2: '#4f63d6',
    accentText: '#0a0e22',
  },
};

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
    { key: 'log', label: 'Trade Log' },
    { key: 'sessions', label: 'Strategy Sessions' },
    { key: 'metrics', label: 'Accounts' },
    { key: 'news', label: 'Market News', dot: '#ef5468' },
    { key: 'history', label: 'History' },
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
