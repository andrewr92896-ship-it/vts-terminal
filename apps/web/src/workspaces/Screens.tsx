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
  alerts: { title: 'Alerts', blurb: 'TradingView alerts arrive by webhook; paste a chart screenshot and VTS AI analyzes the trade and logs it.', stage: 2 },
  log: { title: 'Trade Log', blurb: 'Full fill history with Deck and Tape layouts, computed slippage versus the alert price per trade.', stage: 2 },
  sessions: { title: 'Strategy Sessions', blurb: 'Active, opening, and closing strategy windows with bull and bear playbooks per instrument.', stage: 2 },
  funded: { title: 'Manual Trades', blurb: 'A self-managed book of accounts kept by hand — place trades by typing them in or reading them off a screenshot, track open positions live on the Live Wall, and see each account’s balance and daily / weekly / 30-day trade P/L.', stage: 2 },
  prop: { title: 'Funded', blurb: 'A private prop-firm challenge dashboard (equity vs. target and daily / max drawdown buffers), shown only to accounts an admin has granted the Funded role.', stage: 2 },
  metrics: { title: 'Live Brokers', blurb: 'Live broker capital (OANDA): NAV, balance, open P/L, and trade P/L over daily / weekly / 30-day windows, pulled from the broker API.', stage: 2 },
  news: { title: 'Market News', blurb: 'Market and geopolitical headlines with impact and bias tags, plus the economic calendar in ET.', stage: 2 },
  history: { title: 'History', blurb: 'Historical performance, closed trades, and per-strategy results over time.', stage: 2 },
  td_trading: { title: 'Trading To Do', blurb: 'Trading tasks and reminders, shared with your team.', stage: 3 },
  admin: { title: 'Admin', blurb: 'User and role management, broker connection health, and audit settings.', stage: 3 },
  // Studies
  st_home: { title: 'Study Hub', blurb: 'Build and study your own study games, flashcard sets, and guides.', stage: 3 },
  st_quiz: { title: 'Practice Quiz', blurb: 'One question at a time, rotating topics, with scoring.', stage: 3 },
  st_cards: { title: 'Flashcards', blurb: 'Topic-filtered flashcards with a known/review pile.', stage: 3 },
  st_test: { title: 'Test Mode', blurb: 'A graded test drawn from one of your study games.', stage: 3 },
  st_progress: { title: 'Progress', blurb: 'Overall and per-topic accuracy over time.', stage: 3 },
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
          {"Stage 1 delivers the shell, login, roles, and theming. This screen is a placeholder until its data is connected."}
        </p>
      </div>
    </div>
  );
}
