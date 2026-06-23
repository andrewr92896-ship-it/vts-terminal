import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';

// Auto-rotation timing: show the term for 10s, then the definition for 20s.
const TERM_SECS = 10;
const DEF_SECS = 20;

interface Card {
  term: string;
  def: string;
}

// Sample Series 65 vocabulary (the first study track). Swap for real data later.
const CARDS: Card[] = [
  { term: 'Fiduciary', def: 'Someone legally required to act in the best interest of another party — e.g. an investment adviser to a client.' },
  { term: 'Investment Adviser', def: 'A person or firm that, for compensation, is in the business of advising others about securities.' },
  { term: 'Form ADV', def: 'The uniform registration form for investment advisers; Part 2 is the plain-English disclosure brochure given to clients.' },
  { term: 'Discretionary Authority', def: "Written permission letting an adviser choose the security, amount, or action in a client's account without approval for each trade." },
  { term: 'Net Asset Value (NAV)', def: "A fund's per-share value: total assets minus liabilities, divided by shares outstanding." },
  { term: 'Dollar-Cost Averaging', def: 'Investing a fixed dollar amount at regular intervals regardless of price, lowering the average cost per share over time.' },
  { term: 'Duration', def: "A measure of a bond's price sensitivity to interest-rate changes, expressed in years." },
  { term: 'Efficient Market Hypothesis', def: 'The theory that prices already reflect all available information, making it hard to consistently beat the market.' },
  { term: 'Sharpe Ratio', def: 'Risk-adjusted return: return above the risk-free rate divided by standard deviation (total risk).' },
  { term: 'Wash Sale', def: 'Selling a security at a loss and buying the same or a substantially identical one within 30 days; the tax loss is disallowed.' },
];

export function Flashcards({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);

  const [i, setI] = useState(0);
  const [showDef, setShowDef] = useState(false);
  const [auto, setAuto] = useState(false);
  const [secs, setSecs] = useState(TERM_SECS);

  // Keep the latest phase available to the interval without restarting it.
  const showDefRef = useRef(showDef);
  showDefRef.current = showDef;

  // One interval drives the whole rotation while auto is on. When the current
  // phase runs out, it flips term <-> definition (advancing the card after the
  // definition) and resets the countdown to the next phase's length.
  useEffect(() => {
    if (!auto) return;
    setShowDef(false);
    setSecs(TERM_SECS);
    const id = setInterval(() => {
      setSecs((s) => {
        if (s > 1) return s - 1;
        if (!showDefRef.current) {
          setShowDef(true);
          return DEF_SECS;
        }
        setShowDef(false);
        setI((idx) => (idx + 1) % CARDS.length);
        return TERM_SECS;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [auto]);

  const card = CARDS[i];
  const phaseTotal = showDef ? DEF_SECS : TERM_SECS;

  function go(delta: number) {
    setI((idx) => (idx + delta + CARDS.length) % CARDS.length);
    setShowDef(false);
    setSecs(TERM_SECS);
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Flashcards</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#a99ff0' }}>
          Series 65 vocabulary · {CARDS.length} cards
        </p>
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            cursor: 'pointer',
            fontSize: 12.5,
            color: '#cdbcff',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: theme.accent, cursor: 'pointer' }}
          />
          Auto-rotate · term {TERM_SECS}s / definition {DEF_SECS}s
        </label>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#8a7fc8' }}>
          {i + 1} / {CARDS.length}
        </span>
      </div>

      {/* Rotation timer (auto only) */}
      {auto && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent }}>
              {showDef ? 'Definition' : 'Term'}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: '#fff' }}>
              {secs}s
            </span>
          </div>
          <div style={{ height: 6, background: theme.navBorder, borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(secs / phaseTotal) * 100}%`,
                background: accentGrad,
                transition: 'width 1s linear',
              }}
            />
          </div>
        </div>
      )}

      {/* Card */}
      <div
        onClick={() => !auto && setShowDef((v) => !v)}
        style={{
          background: 'linear-gradient(180deg,rgba(40,30,72,.55),rgba(28,20,54,.6))',
          border: `1px solid ${theme.navBorder}`,
          borderLeft: `3px solid ${theme.accent}`,
          borderRadius: 14,
          padding: isPhone ? '28px 20px' : '40px 34px',
          minHeight: 200,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 16,
          cursor: auto ? 'default' : 'pointer',
        }}
      >
        <div style={{ fontSize: isPhone ? 24 : 30, fontWeight: 700, color: '#fff', textAlign: 'center' }}>
          {card.term}
        </div>
        {showDef ? (
          <div
            style={{
              fontSize: isPhone ? 14 : 15,
              lineHeight: 1.6,
              color: '#d7ccff',
              textAlign: 'center',
              borderTop: `1px solid ${theme.navBorder}`,
              paddingTop: 16,
            }}
          >
            {card.def}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#8a7fc8', textAlign: 'center' }}>
            {auto ? 'Definition reveals automatically…' : 'Tap the card to reveal the definition'}
          </div>
        )}
      </div>

      {/* Manual controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 }}>
        <button onClick={() => go(-1)} style={navBtn(theme)}>‹ Prev</button>
        {!auto && (
          <button onClick={() => setShowDef((v) => !v)} style={primaryBtn(theme, accentGrad)}>
            {showDef ? 'Show term' : 'Show definition'}
          </button>
        )}
        <button onClick={() => go(1)} style={navBtn(theme)}>Next ›</button>
      </div>
    </div>
  );
}

function navBtn(theme: Theme): React.CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 42,
  };
}

function primaryBtn(theme: Theme, grad: string): React.CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontSize: 13,
    fontWeight: 700,
    padding: '10px 18px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 42,
  };
}
