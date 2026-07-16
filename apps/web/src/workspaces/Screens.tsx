import type { Theme } from '../theme/themes';
import { useResponsive } from '../hooks/useMediaQuery';

// Stage 1 ships the full app shell with every screen reachable. Each screen
// renders a branded placeholder describing what gets wired and when. Real
// data and interactions land in Stages 2-4.

interface ScreenInfo {
  title: string;
  blurb: string;
  stage: number;
}

const SCREENS: Record<string, ScreenInfo> = {
  // Trading
  live: { title: 'Live Wall', blurb: 'Live trade cards with planned entry, actual fill, slippage, TP, SL, strategy, timeframe, and lots — streamed from the brokers.', stage: 2 },
  alerts: { title: 'Alerts', blurb: 'TradingView alerts arrive by webhook; paste a chart screenshot and Claude (Opus 4.8) analyzes the trade and logs it.', stage: 2 },
  log: { title: 'Trade Log', blurb: 'Full fill history with Deck and Tape layouts, computed slippage versus the alert price per trade.', stage: 2 },
  sessions: { title: 'Strategy Sessions', blurb: 'Active, opening, and closing strategy windows with bull and bear playbooks per instrument.', stage: 2 },
  funded: { title: 'Funded', blurb: 'Everything for the funded account in one place: the FTP prop challenge (target + drawdown) and funded/prop accounts tracked from screenshots — each with daily / weekly / 30-day trade P/L.', stage: 2 },
  metrics: { title: 'Live Brokers', blurb: 'Live broker capital (OANDA): NAV, balance, open P/L, and trade P/L over daily / weekly / 30-day windows, pulled from the broker API.', stage: 2 },
  news: { title: 'Market News', blurb: 'Market and geopolitical headlines with impact and bias tags, plus the economic calendar in ET.', stage: 2 },
  history: { title: 'History', blurb: 'Historical performance, closed trades, and per-strategy results over time.', stage: 2 },
  td_trading: { title: 'Trading To Do', blurb: 'Trading tasks, also visible in your full To Do List workspace.', stage: 3 },
  admin: { title: 'Admin', blurb: 'User and role management, broker connection health, and audit settings.', stage: 3 },
  // To Do
  td_all: { title: 'All Tasks', blurb: 'Numbered sections, recurring tasks with reset intervals, due and overdue flags, and a Claude command parser.', stage: 3 },
  // Studies
  st_home: { title: 'Study Hub', blurb: 'Pick a subject (Series 65 first). Each track has its own flashcards, quizzes, and progress.', stage: 3 },
  st_quiz: { title: 'Practice Quiz', blurb: 'One question at a time, rotating topics, with scoring.', stage: 3 },
  st_cards: { title: 'Flashcards', blurb: 'Topic-filtered flashcards with a known/review pile.', stage: 3 },
  st_test: { title: 'Test Mode', blurb: 'A full 100-question mock exam drawn to the real Series 65 mix, each question asked once. Scores go on the leaderboard.', stage: 3 },
  st_progress: { title: 'Progress', blurb: 'Overall and per-topic accuracy over time.', stage: 3 },
  // Vitalis Retirement & Wealth Management — the client-management portal for
  // the future advisory firm (launches after the Series 65).
  wm_home: { title: 'Practice Overview', blurb: 'Snapshot of the advisory practice: assets under management, client and household counts, recent activity, and upcoming tasks.', stage: 5 },
  wm_clients: { title: 'Clients', blurb: 'Manage clients and households — contact details, accounts, risk profiles, goals, documents, and meeting notes.', stage: 5 },
  wm_portfolios: { title: 'Portfolios', blurb: 'Model portfolios and per-client allocations, holdings, performance, and rebalancing.', stage: 5 },
  wm_planning: { title: 'Planning', blurb: 'Retirement and financial planning: goals, cash-flow and income projections, and scenario analysis.', stage: 5 },
  wm_compliance: { title: 'Compliance', blurb: 'RIA recordkeeping: ADV, investment policy statements, disclosures, and an audit trail.', stage: 5 },
};

export function Screen({ screen, theme }: { screen: string; theme: Theme }) {
  const { isPhone } = useResponsive();
  const info = SCREENS[screen] ?? {
    title: 'Coming soon',
    blurb: 'This screen is part of a later stage.',
    stage: 2,
  };

  return (
    <div style={{ maxWidth: 760, margin: isPhone ? '16px auto' : '40px auto', animation: 'cardIn .35s ease' }}>
      <div
        style={{
          background: 'linear-gradient(180deg,rgba(13,31,68,.5),rgba(11,26,58,.6))',
          border: `1px solid ${theme.navBorder}`,
          borderLeft: `3px solid ${theme.accent}`,
          borderRadius: 14,
          padding: isPhone ? '20px 18px' : '28px 30px',
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            color: theme.accent,
            border: `1px solid ${theme.accent}`,
            borderRadius: 5,
            padding: '3px 9px',
            display: 'inline-block',
            opacity: 0.85,
            marginBottom: 16,
          }}
        >
          Wired in Stage {info.stage}
        </div>
        <h2 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 700, color: '#eef3ff' }}>
          {info.title}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: '#aebcd8' }}>
          {info.blurb}
        </p>
        <p
          style={{
            marginTop: 22,
            marginBottom: 0,
            fontSize: 12,
            color: '#5d72a0',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          Stage 1 delivers the shell, login, roles, and theming. This screen is
          a placeholder until its data is connected.
        </p>
      </div>
    </div>
  );
}
