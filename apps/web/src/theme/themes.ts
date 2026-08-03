// Per-workspace themes — values taken verbatim from the prototype so the look
// matches exactly. (Navigation — sections, labels, order, icons, role gates —
// lives in theme/nav.ts, the single source of truth.)

export type WorkspaceKey =
  | 'trading'
  | 'investments'
  | 'studies'
  | 'myportal'
  | 'help'
  | 'admin'
  | 'founder';

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
  // (There is no `markets` theme — the Markets workspace was dissolved into My
  // Terminal, owner decision 2026-08. Market Data and Market News render on My
  // Terminal's emerald now.)
  // Investments: a calm teal accent for the long-term, layman-friendly portfolio
  // tracker (401k / IRA / ESA / general holdings). Distinct from the Advanced
  // Trading gold and My Terminal's greener emerald — teal signals steady, long-hold
  // growth rather than active-desk urgency.
  investments: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#052e33 0%,#04141a 60%)',
    headerBg: 'linear-gradient(90deg,#052a30 0%,#083f46 100%)',
    headerBorder: '#12565e',
    navBg: '#04201f',
    navBorder: '#0d3a3d',
    accent: '#2DD4BF',
    accent2: '#14B8A6',
    accentText: '#04211e',
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
  // My Terminal: an emerald accent for the user's personal workspace (Trading
  // Team). Distinct from every other workspace signal.
  myportal: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#0b3026 0%,#06160f 60%)',
    headerBg: 'linear-gradient(90deg,#0a2b22 0%,#0e3a2c 100%)',
    headerBorder: '#1c5a44',
    navBg: '#08201a',
    navBorder: '#123b2e',
    accent: '#34d399',
    accent2: '#12a374',
    accentText: '#052018',
  },
  // Founder Terminal: a distinguished amber accent that signals the elevated,
  // founder-only area sitting above Admin.
  founder: {
    pageBg: 'radial-gradient(1200px 600px at 70% -10%,#2e2410 0%,#161206 60%)',
    headerBg: 'linear-gradient(90deg,#2a2110 0%,#3c2f14 100%)',
    headerBorder: '#5a4620',
    navBg: '#201a0c',
    navBorder: '#332813',
    accent: '#F5A524',
    accent2: '#c9821a',
    accentText: '#241800',
  },
};

export function accentGradient(t: Theme): string {
  return `linear-gradient(180deg,${t.accent},${t.accent2})`;
}

export const DEFAULT_SCREEN: Record<WorkspaceKey, string> = {
  trading: 'tradedesk',
  investments: 'inv_overview',
  studies: 'st_game',
  // The Live Wall is the terminal's centralized board and the first thing in
  // My Terminal, so it is what this workspace opens on.
  myportal: 'live',
  admin: 'ad_users',
  founder: 'ad_ai',
  help: 'hp_howto',
};

export const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  trading: 'Advanced Trading',
  investments: 'Investments',
  studies: 'Studies',
  myportal: 'My Terminal',
  admin: 'Admin Terminal',
  founder: 'Developer Terminal',
  help: 'Site Help',
};
