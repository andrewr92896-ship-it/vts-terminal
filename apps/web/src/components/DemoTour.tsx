import { useEffect, useState, type CSSProperties } from 'react';
import { type Theme, type WorkspaceKey, accentGradient } from '../theme/themes';

// A guided, slideshow-style walkthrough for the public demo. Each step can drive
// the portal to a real screen (and optionally open the Ask Claude panel) so the
// reviewer sees the actual product while the card explains it. It is non-modal:
// there is no backdrop, so the app stays fully visible and clickable behind it.

export interface TourStep {
  workspace?: WorkspaceKey;
  screen?: string;
  openClaude?: boolean;
  title: string;
  body: string;
}

// The script. Keys match the workspace/screen identifiers the Portal renders.
export const DEMO_STEPS: TourStep[] = [
  {
    workspace: 'trading',
    screen: 'live',
    title: 'Welcome to VTS Portal',
    body: 'A private trading and operations portal: live trading, Series 65 study tools, a shared to-do list, and an AI assistant. This is a read-only demo with simulated data.',
  },
  {
    workspace: 'trading',
    screen: 'live',
    title: 'Live Wall',
    body: 'Open positions stream from your own broker (OANDA or Kraken). For forex it computes the live price, P/L in pips, money-per-pip, and your risk/reward to the stop and target in both dollars and pips.',
  },
  {
    workspace: 'trading',
    screen: 'alerts',
    title: 'AI trade analysis',
    body: 'TradingView alerts arrive by webhook. Paste a chart screenshot and Claude (Opus) grades the trade: entry quality, risk, and a verdict. One alert here is already analyzed so you can see the result.',
  },
  {
    workspace: 'trading',
    screen: 'desk',
    title: 'Trade Desk',
    body: 'The Trade Log, Live Brokers, and History views in one place: a full journal of every trade with slippage and realized P/L, live broker capital, and a breakdown of closed results. Plain-English logging and recaps are powered by Claude.',
  },
  {
    workspace: 'trading',
    screen: 'live',
    openClaude: true,
    title: 'Ask Claude, anywhere',
    body: 'The assistant is one click away on every screen and knows which workspace you are in. In the demo its replies are scripted; the live portal answers with Claude (Sonnet).',
  },
  {
    workspace: 'studies',
    screen: 'st_home',
    title: 'Series 65 study tools',
    body: 'Exam prep with a 400-question bank, a study game, and an AI tutor that explains why an answer is right and the distractors are wrong.',
  },
  {
    workspace: 'trading',
    screen: 'live',
    title: 'That is the tour',
    body: 'Everything here is simulated and read-only, so explore freely. The real, live portal, built end to end with AI, is available on request. Thanks for looking.',
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

  // Drive the portal to this step's screen (and optionally open Ask Claude).
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
