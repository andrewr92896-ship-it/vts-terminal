import { useEffect, useState, type CSSProperties } from 'react';
import { type Theme, type WorkspaceKey, accentGradient } from '../theme/themes';

// A guided, slideshow-style walkthrough for the public demo. Each step can drive
// the portal to a real screen (and optionally open the VTS AI panel) so the
// reviewer sees the actual product while the card explains it. It is non-modal:
// there is no backdrop, so the app stays fully visible and clickable behind it.

export interface TourStep {
  workspace?: WorkspaceKey;
  screen?: string;
  openClaude?: boolean; // opens the VTS AI assistant panel for this step
  title: string;
  body: string;
}

// The script. Keys match the workspace/screen identifiers the Portal renders.
export const DEMO_STEPS: TourStep[] = [
  {
    workspace: 'trading',
    screen: 'live',
    title: 'Welcome to VTS Portal',
    body: 'A private trading and operations hub: live trading across any broker with an API, a hand-kept trade book, a build-your-own study game, a shared to-do list, and a built-in VTS AI assistant. This is a read-only demo with simulated data — click around freely.',
  },
  {
    workspace: 'trading',
    screen: 'live',
    title: 'Live Wall — your command center',
    body: 'The Master board is a drag-and-drop grid of charts, watchlists, market news, and the economic calendar — arrange and resize the tiles, then save your own presets. Flip to Positions and open trades stream in from any broker with an API (OANDA, Kraken, TradeStation, and more), every instrument normalized — forex, indices, crypto, futures, stocks — with live price, open P/L, and risk/reward to your stop and target.',
  },
  {
    workspace: 'trading',
    screen: 'alerts',
    title: 'Alerts — VTS AI trade analysis',
    body: 'TradingView alerts land here by webhook. Paste a chart screenshot and VTS AI grades the trade: fill vs. planned entry, slippage, setup quality, risk, and a verdict. One alert here is already analyzed so you can see the result.',
  },
  {
    workspace: 'trading',
    screen: 'desk',
    title: 'Trade Desk',
    body: 'The Trade Log, Live Brokers, and History views in one place — a full journal of every fill with slippage and realized P/L, live broker capital, and closed-trade breakdowns by strategy and instrument. Log trades in plain English and get recaps from VTS AI.',
  },
  {
    workspace: 'trading',
    screen: 'funded',
    title: 'Manual Trades',
    body: 'A self-managed book for accounts you keep by hand — add an account, log trades by typing them in or reading them off a screenshot, and watch each account’s balance and Today / This week / 30-day P/L. Nothing here connects to an outside platform.',
  },
  {
    workspace: 'trading',
    screen: 'sessions',
    title: 'Strategy Sessions',
    body: 'Your trading windows in Eastern Time, each with a bias and bull/bear playbooks per instrument. Cards regroup themselves as sessions open, go active, and close, so you always know what you’re watching for.',
  },
  {
    workspace: 'studies',
    screen: 'st_decks',
    title: 'Study Creation — games and guides',
    body: 'Make your own study content. Turn any topic — or a file you upload — into a study game: VTS AI writes the questions and you play it as a leveling game with a team leaderboard. Or build a study guide: go back and forth with VTS AI to draft a slide deck, drop in your own screenshots, and present it like a walkthrough.',
  },
  {
    workspace: 'todo',
    screen: 'td_all',
    title: 'To Do — just type it',
    body: 'A shared task list with numbered sections, recurring resets, and due-date flags. Type a plain-English instruction in the command box — “new section Garden”, “add to Priority: fund the account”, “done 1.2” — and VTS AI updates the list for you.',
  },
  {
    workspace: 'trading',
    screen: 'live',
    openClaude: true,
    title: 'VTS AI, on every screen',
    body: 'The assistant is one click away anywhere and knows which workspace you’re in — ask about a trade, a task, or a study question. In this demo the replies are scripted; the live portal answers with VTS AI.',
  },
  {
    workspace: 'trading',
    screen: 'desk',
    title: 'Private by design',
    body: 'Trade data is scoped to your team — you never see another team’s trades, positions, or capital. And “Hide $” or Privacy mode masks every dollar figure on screen instantly, so you can share your screen without sharing your book.',
  },
  {
    workspace: 'trading',
    screen: 'live',
    title: 'That’s the tour',
    body: 'Everything here is simulated and read-only, so explore freely. The real, live portal — built end to end with VTS AI — is available on request. Thanks for looking.',
  },
];

interface DemoTourProps {
  theme: Theme;
  onGo: (workspace: WorkspaceKey, screen: string) => void;
  onOpenClaude: () => void;
  onClose: () => void;
}

export function DemoTour({ theme, onGo, onOpenClaude, onClose }: DemoTourProps) {
  const [index, setIndex] = useState(0);
  const step = DEMO_STEPS[index];
  const last = index === DEMO_STEPS.length - 1;

  // Drive the portal to this step's screen (and optionally open the VTS AI panel).
  useEffect(() => {
    if (step.workspace && step.screen) onGo(step.workspace, step.screen);
    if (step.openClaude) onOpenClaude();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const accentGrad = accentGradient(theme);

  return (
    <div style={cardWrap}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', color: theme.accent, fontWeight: 700 }}>
            Guided tour · {index + 1} of {DEMO_STEPS.length}
          </span>
          <button onClick={onClose} aria-label="Close tour" style={closeBtn}>×</button>
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#cfe0ff' }}>{step.body}</div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 5, margin: '14px 0 12px', flexWrap: 'wrap' }}>
          {DEMO_STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === index ? 16 : 7,
                height: 7,
                borderRadius: 4,
                background: i === index ? theme.accent : 'rgba(124,156,224,.35)',
                transition: 'width .2s ease',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={ghostBtn}>Skip</button>
          <div style={{ flex: 1 }} />
          {index > 0 && (
            <button onClick={() => setIndex((i) => Math.max(0, i - 1))} style={ghostBtn}>Back</button>
          )}
          <button
            onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
            style={{ ...primaryBtn, background: accentGrad, color: theme.accentText }}
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

const cardWrap: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: 16,
  zIndex: 56,
  pointerEvents: 'none', // let clicks pass except on the card itself
};

const card: CSSProperties = {
  pointerEvents: 'auto',
  width: 'min(520px, 96vw)',
  background: 'linear-gradient(180deg,#0c1c3c,#0a1730)',
  border: '1px solid #243f74',
  borderRadius: 14,
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
  padding: '16px 18px',
};

const closeBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#7488b5',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
};

const ghostBtn: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: '#cfe0ff',
  background: 'rgba(255,255,255,.05)',
  border: '1px solid #2a4170',
  padding: '8px 14px',
  borderRadius: 8,
  cursor: 'pointer',
};

const primaryBtn: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: 'none',
  padding: '9px 18px',
  borderRadius: 8,
  cursor: 'pointer',
};
