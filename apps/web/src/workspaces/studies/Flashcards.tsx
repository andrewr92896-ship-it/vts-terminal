import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { SERIES65_VOCAB } from './series65Vocab';
import { SERIES65_TOPICS, type Series65Topic } from './series65Questions';

// Default auto-rotation timing; both are adjustable in the controls below.
const DEFAULT_TERM_SECS = 10;
const DEFAULT_DEF_SECS = 20;
const MIN_SECS = 5;
const MAX_SECS = 120;
const STEP_SECS = 5;
// Words the user marked as known are hidden from the deck. Stored per device.
const LEARNED_KEY = 'vts-flashcards-learned';

function clampSecs(v: number): number {
  return Math.max(MIN_SECS, Math.min(MAX_SECS, v));
}

function loadLearned(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(LEARNED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

type Filter = 'All' | Series65Topic;

export function Flashcards({
  theme,
  embedded = false,
  readOnly: readOnlyProp,
}: {
  theme: Theme;
  embedded?: boolean;
  readOnly?: boolean;
}) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  // The parent (StudyGame) passes readOnly down; standalone use falls back to
  // the auth hook so the public demo stays look-only here too.
  const readOnly = readOnlyProp ?? !!user?.isDemo;
  const accentGrad = accentGradient(theme);

  const [filter, setFilter] = useState<Filter>('All');
  // Words the user already knows, hidden from the deck (persisted per device).
  const [learned, setLearned] = useState<Set<string>>(loadLearned);

  const cards = useMemo(
    () =>
      (filter === 'All' ? SERIES65_VOCAB : SERIES65_VOCAB.filter((c) => c.topic === filter)).filter(
        (c) => !learned.has(c.term),
      ),
    [filter, learned],
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

  // Plain-language expanded explanations that clarify any jargon used inside a
  // definition. Cached per term so re-opening a card does not call the AI again.
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainErr, setExplainErr] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  const revealed = alwaysDef || showDef;

  // Keep the latest values available to the interval without restarting it.
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

  function persistLearned(s: Set<string>) {
    try {
      localStorage.setItem(LEARNED_KEY, JSON.stringify([...s]));
    } catch {
      // Storage may be blocked; the choice still applies for this session.
    }
  }
  function markKnown(term: string) {
    setLearned((prev) => {
      const next = new Set(prev);
      next.add(term);
      persistLearned(next);
      return next;
    });
    setShowDef(false);
    setSecs(alwaysRef.current ? defRef.current : termRef.current);
    // Sync to the account (best effort); the local copy already updated, and a
    // read-only demo or offline session simply keeps the local copy.
    void api.addLearnedTerm(term).catch(() => {});
  }
  function restore(term: string) {
    setLearned((prev) => {
      const next = new Set(prev);
      next.delete(term);
      persistLearned(next);
      return next;
    });
    void api.removeLearnedTerm(term).catch(() => {});
  }

  // Ask the study tutor for a beginner-friendly explanation that breaks down any
  // jargon used inside the definition itself (for example "stagnant growth").
  async function explainCard(term: string, def: string) {
    setShowExplain(true);
    if (explanations[term]) return; // already have it
    setExplainBusy(true);
    setExplainErr(false);
    try {
      const r = await api.studyTutor({
        ask: `Explain the Series 65 term "${term}" in plain, simple language for a complete beginner. Its textbook definition is: "${def}". Define any jargon or uncommon terms used inside that definition (for example economics phrases like "stagnant growth") in everyday words, then give a short plain-English summary. Keep it concise, a few short sentences.`,
      });
      setExplanations((prev) => ({ ...prev, [term]: r.reply }));
    } catch {
      setExplainErr(true);
    } finally {
      setExplainBusy(false);
    }
  }

  // Pull the learned set from the account once, so progress follows the user
  // across devices. On failure (offline, demo) the local copy stays in use.
  useEffect(() => {
    let alive = true;
    api
      .studyLearned()
      .then((r) => {
        if (!alive) return;
        const s = new Set(r.terms);
        setLearned(s);
        persistLearned(s);
      })
      .catch(() => {
        /* keep the localStorage copy */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to the first card whenever the topic filter changes.
  useEffect(() => {
    setI(0);
    setShowDef(false);
    setSecs(termRef.current);
  }, [filter]);

  // One interval drives the whole rotation while auto is on.
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

  const card = cards.length ? cards[Math.min(i, cards.length - 1)] : null;

  // Collapse any open explanation when the visible card changes (manual nav,
  // auto-rotate, or a topic switch); the cache keeps prior answers ready.
  useEffect(() => {
    setShowExplain(false);
    setExplainErr(false);
  }, [card?.term]);

  const phaseTotal = alwaysDef ? defSecs : showDef ? defSecs : termSecs;
  const learnedList = useMemo(() => [...learned].sort((a, b) => a.localeCompare(b)), [learned]);

  function go(delta: number) {
    if (cards.length === 0) return;
    setI((idx) => (idx + delta + cards.length) % cards.length);
    setShowDef(false);
    setSecs(alwaysDef ? defSecs : termSecs);
  }

  return (
    <div style={{ maxWidth: embedded ? '100%' : 940, margin: embedded ? 0 : '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {!embedded && (
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Flashcards</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#a99ff0' }}>
            Series 65 vocabulary · {SERIES65_VOCAB.length} terms
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexDirection: isPhone ? 'column' : 'row', alignItems: 'flex-start' }}>
        {/* Main flashcard column */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
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

          {/* Controls */}
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
          {auto && card && (
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

          {/* Card or all-caught-up state */}
          {card ? (
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
                <div style={{ borderTop: `1px solid ${theme.navBorder}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: isPhone ? 14 : 15, lineHeight: 1.6, color: '#d7ccff', textAlign: 'center' }}>
                    {card.def}
                  </div>
                  {!showExplain ? (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void explainCard(card.term, card.def);
                        }}
                        style={explainBtn(theme)}
                        title="Get a simpler explanation that defines any tricky words"
                      >
                        💡 Explain simply
                      </button>
                    </div>
                  ) : (
                    <div onClick={(e) => e.stopPropagation()} style={explainPanel(theme)}>
                      {explainBusy && !explanations[card.term] ? (
                        <span style={{ fontSize: 12.5, color: '#a99ff0' }}>Thinking…</span>
                      ) : explainErr && !explanations[card.term] ? (
                        <span style={{ fontSize: 12.5, color: '#ff9a9a' }}>
                          Could not load an explanation.{' '}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void explainCard(card.term, card.def);
                            }}
                            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                          >
                            Try again
                          </button>
                        </span>
                      ) : (
                        <div style={{ fontSize: isPhone ? 13 : 13.5, lineHeight: 1.65, color: '#e7deff', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
                          {explanations[card.term]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#8a7fc8', textAlign: 'center' }}>
                  {auto ? 'Definition reveals automatically…' : 'Tap the card to reveal the definition'}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                background: 'linear-gradient(180deg,rgba(40,30,72,.55),rgba(28,20,54,.6))',
                border: `1px solid ${theme.navBorder}`,
                borderRadius: 14,
                padding: '40px 24px',
                minHeight: 200,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>All caught up</div>
              <div style={{ fontSize: 12.5, color: '#a99ff0', maxWidth: 320, lineHeight: 1.5 }}>
                You have marked every word here as known. Restore one from the Learned list to study it again.
              </div>
            </div>
          )}

          {/* Manual controls */}
          {card && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={() => go(-1)} style={navBtn(theme)}>‹ Prev</button>
              {!auto && !alwaysDef && (
                <button onClick={() => setShowDef((v) => !v)} style={primaryBtn(theme, accentGrad)}>
                  {showDef ? 'Show term' : 'Show definition'}
                </button>
              )}
              {!readOnly && (
                <button onClick={() => markKnown(card.term)} style={knownBtn} title="Hide this word; you already know it">
                  ✓ I know this
                </button>
              )}
              <button onClick={() => go(1)} style={navBtn(theme)}>Next ›</button>
            </div>
          )}
        </div>

        {/* Learned words column */}
        <div
          style={{
            flex: isPhone ? '1 1 auto' : '0 0 220px',
            width: isPhone ? '100%' : 220,
            background: 'rgba(255,255,255,.03)',
            border: `1px solid ${theme.navBorder}`,
            borderRadius: 12,
            padding: 12,
            maxHeight: isPhone ? 240 : 520,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, marginBottom: 10 }}>
            Learned · {learnedList.length}
          </div>
          {learnedList.length === 0 ? (
            <div style={{ fontSize: 11.5, color: '#8a7fc8', lineHeight: 1.5 }}>
              {readOnly
                ? 'Words marked as known move here and leave the deck.'
                : 'Words you mark with "I know this" move here and leave the deck. Tap the X to add one back.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {learnedList.map((term) => (
                <div key={term} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: '#56d6a0', fontSize: 12, flex: 'none' }}>✓</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#cdbcff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={term}>
                    {term}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => restore(term)}
                      title={`Add ${term} back to the deck`}
                      aria-label={`Add ${term} back to the deck`}
                      style={{ flex: 'none', background: 'none', border: 'none', color: '#ff9a9a', fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: '2px 4px' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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

const knownBtn: CSSProperties = {
  border: '1px solid rgba(86,214,160,.5)',
  background: 'rgba(86,214,160,.12)',
  color: '#7fe0c0',
  fontSize: 13,
  fontWeight: 600,
  padding: '10px 16px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 42,
};

function explainBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.accent}`,
    background: 'rgba(255,255,255,.05)',
    color: '#fff',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 8,
    cursor: 'pointer',
  };
}

function explainPanel(theme: Theme): CSSProperties {
  return {
    background: 'rgba(255,255,255,.04)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 10,
    padding: '12px 14px',
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
