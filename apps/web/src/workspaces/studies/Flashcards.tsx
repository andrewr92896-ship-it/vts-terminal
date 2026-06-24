import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { SERIES65_VOCAB } from './series65Vocab';
import { SERIES65_TOPICS, type Series65Topic } from './series65Questions';

// Default auto-rotation timing; both are adjustable in the controls below.
const DEFAULT_TERM_SECS = 10;
const DEFAULT_DEF_SECS = 20;
const MIN_SECS = 5;
const MAX_SECS = 120;
const STEP_SECS = 5;

function clampSecs(v: number): number {
  return Math.max(MIN_SECS, Math.min(MAX_SECS, v));
}

type Filter = 'All' | Series65Topic;

export function Flashcards({ theme, embedded = false }: { theme: Theme; embedded?: boolean }) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);

  const [filter, setFilter] = useState<Filter>('All');
  const cards = useMemo(
    () => (filter === 'All' ? SERIES65_VOCAB : SERIES65_VOCAB.filter((c) => c.topic === filter)),
    [filter],
  );

  const [i, setI] = useState(0);
  const [showDef, setShowDef] = useState(false);
  const [auto, setAuto] = useState(false);
  const [secs, setSecs] = useState(DEFAULT_TERM_SECS);

  // Adjustable rotation timing.
  const [termSecs, setTermSecs] = useState(DEFAULT_TERM_SECS);
  const [defSecs, setDefSecs] = useState(DEFAULT_DEF_SECS);
  // When on, every card shows the word and its definition together (no term-only
  // step); auto-rotate then just moves between cards on one timer.
  const [alwaysDef, setAlwaysDef] = useState(false);

  // The definition is visible when the user revealed it, or when "always show"
  // is on (which has no separate term-only phase).
  const revealed = alwaysDef || showDef;

  // Keep the latest values available to the interval without restarting it on
  // every render.
  const showDefRef = useRef(showDef);
  showDefRef.current = showDef;
  const lenRef = useRef(cards.length);
  lenRef.current = cards.length;
  const termRef = useRef(termSecs);
  termRef.current = termSecs;
  const defRef = useRef(defSecs);
  defRef.current = defSecs;
  const alwaysRef = useRef(alwaysDef);
  alwaysRef.current = alwaysDef;

  // Reset to the first card whenever the topic filter changes.
  useEffect(() => {
    setI(0);
    setShowDef(false);
    setSecs(termRef.current);
  }, [filter]);

  // One interval drives the whole rotation while auto is on. With "always show"
  // off it flips term -> definition then advances; with it on, each card just
  // shows for the definition duration before advancing. Restarts when the mode
  // toggles so the phase is always consistent.
  useEffect(() => {
    if (!auto) return;
    if (alwaysRef.current) {
      setShowDef(true);
      setSecs(defRef.current);
    } else {
      setShowDef(false);
      setSecs(termRef.current);
    }
    const id = setInterval(() => {
      setSecs((s) => {
        if (s > 1) return s - 1;
        if (alwaysRef.current) {
          setI((idx) => (idx + 1) % Math.max(1, lenRef.current));
          return defRef.current;
        }
        if (!showDefRef.current) {
          setShowDef(true);
          return defRef.current;
        }
        setShowDef(false);
        setI((idx) => (idx + 1) % Math.max(1, lenRef.current));
        return termRef.current;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [auto, alwaysDef]);

  const card = cards[Math.min(i, cards.length - 1)];
  const phaseTotal = alwaysDef ? defSecs : showDef ? defSecs : termSecs;

  function go(delta: number) {
    setI((idx) => (idx + delta + cards.length) % cards.length);
    setShowDef(false);
    setSecs(alwaysDef ? defSecs : termSecs);
  }

  return (
    <div style={{ maxWidth: 760, margin: embedded ? 0 : '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {!embedded && (
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Flashcards</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#a99ff0' }}>
            Series 65 vocabulary · {SERIES65_VOCAB.length} terms
          </p>
        </div>
      )}

      {/* Topic filter */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['All', ...SERIES65_TOPICS] as Filter[]).map((t) => {
          const on = filter === t;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: '7px 12px',
                borderRadius: 999,
                cursor: 'pointer',
                border: `1px solid ${on ? theme.accent : theme.navBorder}`,
                background: on ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
                color: on ? '#fff' : '#a99ff0',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Controls: auto-rotate, the always-show-definition mode, and timing. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <label style={checkLabel}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={checkbox(theme)} />
            Auto-rotate
          </label>
          <label style={checkLabel}>
            <input type="checkbox" checked={alwaysDef} onChange={(e) => setAlwaysDef(e.target.checked)} style={checkbox(theme)} />
            Always show the definition with the word
          </label>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#8a7fc8' }}>
            {cards.length === 0 ? '0 / 0' : `${Math.min(i, cards.length - 1) + 1} / ${cards.length}`}
          </span>
        </div>

        {/* Timing steppers (only relevant for auto-rotate). */}
        {auto && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            {alwaysDef ? (
              <Stepper label="Seconds per card" value={defSecs} onChange={setDefSecs} theme={theme} />
            ) : (
              <>
                <Stepper label="Term" value={termSecs} onChange={setTermSecs} theme={theme} />
                <Stepper label="Definition" value={defSecs} onChange={setDefSecs} theme={theme} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Rotation timer (auto only) */}
      {auto && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent }}>
              {alwaysDef ? 'Card' : showDef ? 'Definition' : 'Term'}
            </span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: '#fff' }}>
              {secs}s
            </span>
          </div>
          <div style={{ height: 6, background: theme.navBorder, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(secs / phaseTotal) * 100}%`, background: accentGrad, transition: 'width 1s linear' }} />
          </div>
        </div>
      )}

      {/* Card */}
      <div
        onClick={() => !auto && !alwaysDef && setShowDef((v) => !v)}
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
          cursor: auto || alwaysDef ? 'default' : 'pointer',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '3px 9px', opacity: 0.85 }}>
            {card.topic}
          </span>
        </div>
        <div style={{ fontSize: isPhone ? 23 : 29, fontWeight: 700, color: '#fff', textAlign: 'center' }}>
          {card.term}
        </div>
        {revealed ? (
          <div style={{ fontSize: isPhone ? 14 : 15, lineHeight: 1.6, color: '#d7ccff', textAlign: 'center', borderTop: `1px solid ${theme.navBorder}`, paddingTop: 16 }}>
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
        {!auto && !alwaysDef && (
          <button onClick={() => setShowDef((v) => !v)} style={primaryBtn(theme, accentGrad)}>
            {showDef ? 'Show term' : 'Show definition'}
          </button>
        )}
        <button onClick={() => go(1)} style={navBtn(theme)}>Next ›</button>
      </div>
    </div>
  );
}

// A small minus/value/plus control for a seconds duration.
function Stepper({ label, value, onChange, theme }: { label: string; value: number; onChange: (v: number) => void; theme: Theme }) {
  const btn: CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 7,
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 16,
    lineHeight: 1,
    cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 12, color: '#cdbcff' }}>{label}</span>
      <button onClick={() => onChange(clampSecs(value - STEP_SECS))} style={btn} aria-label={`Decrease ${label}`}>−</button>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#fff', minWidth: 34, textAlign: 'center' }}>{value}s</span>
      <button onClick={() => onChange(clampSecs(value + STEP_SECS))} style={btn} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

const checkLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  cursor: 'pointer',
  fontSize: 12.5,
  color: '#cdbcff',
  userSelect: 'none',
};

function checkbox(theme: Theme): CSSProperties {
  return { width: 16, height: 16, accentColor: theme.accent, cursor: 'pointer' };
}

function navBtn(theme: Theme): CSSProperties {
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

function primaryBtn(theme: Theme, grad: string): CSSProperties {
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
