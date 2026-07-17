// Per-workspace themes, brand, and tabs — values taken verbatim from the
// prototype so the look matches exactly.

export type WorkspaceKey = 'trading' | 'studies' | 'admin' | 'help';

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
  // The Admin workspace: a slate background with a rose accent to signal an
  // elevated, privileged area distinct from the three member workspaces.
  admin: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#2b2530 0%,#15131a 60%)',
    headerBg: 'linear-gradient(90deg,#241f29 0%,#33283c 100%)',
    headerBorder: '#3d3346',
    navBg: '#1b171f',
    navBorder: '#2c2633',
    accent: '#e0708f',
    accent2: '#c14e6e',
    accentText: '#2a0f19',
  },
  // Site Help: a calm sky-blue accent, distinct from the trading gold, for the
  // support/help area (how-to, announcements, patch notes, bug/suggestion).
  help: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#0d2444 0%,#060f24 60%)',
    headerBg: 'linear-gradient(90deg,#0a1f3d 0%,#0c2a54 100%)',
    headerBorder: '#1c3a6a',
    navBg: '#0a1834',
    navBorder: '#16294f',
    accent: '#6C9EFF',
    accent2: '#4b7fe0',
    accentText: '#06122c',
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
  // instead of the styled text brand (e.g. Trading).
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
  admin: {
    name: () => 'ADMIN',
    sub: 'Portal administration',
    color: '#f0a8bf',
    size: '21px',
    letterSpacing: '2px',
  },
  help: {
    name: () => 'SITE HELP',
    sub: 'Help & support',
    color: '#a9c6ff',
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
    { key: 'funded', label: 'Manual Trades' },
    { key: 'news', label: 'Market News', dot: '#ef5468' },
    { key: 'td_trading', label: 'To Do' },
  ],
  admin: [
    { key: 'ad_users', label: 'Users' },
    { key: 'ad_teams', label: 'Teams' },
    { key: 'ad_early', label: 'Early Access' },
    { key: 'ad_viewas', label: 'View as role' },
    { key: 'ad_suggestions', label: 'Suggestions' },
    { key: 'ad_bugs', label: 'Bug Reports' },
  ],
  help: [
    { key: 'hp_howto', label: 'How to' },
    { key: 'hp_news', label: 'Announcements' },
    { key: 'hp_notes', label: 'Patch notes' },
    { key: 'hp_bug', label: 'Report a bug' },
    { key: 'hp_suggest', label: 'Suggestion' },
  ],
};

export const DEFAULT_SCREEN: Record<WorkspaceKey, string> = {
  trading: 'live',
  studies: 'st_home',
  admin: 'ad_users',
  help: 'hp_howto',
};

export const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  trading: 'Trading',
  studies: 'Studies',
  admin: 'Admin',
  help: 'Site Help',
};
