import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import {
  SERIES65_QUESTIONS,
  SERIES65_TOPICS,
  type Series65Question,
  type Series65Topic,
} from './series65Questions';
import {
  HISTORY_CAP,
  computeStats,
  historyKey,
  loadHistory,
  saveHistory,
  type HistEntry,
} from './series65Progress';

const GREEN = '#35c47b';
const RED = '#ef5468';
type Letter = 'A' | 'B' | 'C' | 'D';

// ---- Question-selection engine (kept in a ref; it doesn't drive rendering) ----
// Topics rotate on every fresh question; missed questions go to a back-burner
// and reappear at random, never sooner than 10 questions after the miss.
interface Engine {
  pools: Record<Series65Topic, number[]>; // shuffled indices into SERIES65_QUESTIONS
  ptr: Record<Series65Topic, number>;
  topicIdx: number;
  backBurner: { qi: number; eligibleAt: number }[];
  presented: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildEngine(): Engine {
  const pools = {} as Record<Series65Topic, number[]>;
  const ptr = {} as Record<Series65Topic, number>;
  for (const t of SERIES65_TOPICS) {
    pools[t] = [];
    ptr[t] = 0;
  }
  SERIES65_QUESTIONS.forEach((q, i) => pools[q.topic].push(i));
  for (const t of SERIES65_TOPICS) pools[t] = shuffle(pools[t]);
  return { pools, ptr, topicIdx: 0, backBurner: [], presented: 0 };
}

function nextFrom(e: Engine): { qi: number; isReview: boolean } | null {
  e.presented += 1;
  const eligible = e.backBurner.filter((b) => b.eligibleAt <= e.presented);
  const freshLeft = SERIES65_TOPICS.some((t) => e.ptr[t] < e.pools[t].length);
  // Mix in a due review ~25% of the time, or whenever no fresh questions remain.
  if (eligible.length > 0 && (Math.random() < 0.25 || !freshLeft)) {
    const choice = eligible[Math.floor(Math.random() * eligible.length)];
    e.backBurner = e.backBurner.filter((b) => b !== choice);
    return { qi: choice.qi, isReview: true };
  }
  if (freshLeft) {
    for (let k = 0; k < SERIES65_TOPICS.length; k++) {
      const t = SERIES65_TOPICS[e.topicIdx % SERIES65_TOPICS.length];
      e.topicIdx += 1;
      if (e.ptr[t] < e.pools[t].length) {
        const qi = e.pools[t][e.ptr[t]];
        e.ptr[t] += 1;
        return { qi, isReview: false };
      }
    }
  }
  return null; // deck complete and nothing due for review
}

export function Series65Quiz({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const accentGrad = accentGradient(theme);
  const storageKey = historyKey(user?.id);

  const engineRef = useRef<Engine | null>(null);
  if (engineRef.current === null) engineRef.current = buildEngine();

  const [history, setHistory] = useState<HistEntry[]>(() => loadHistory(storageKey));
  const [current, setCurrent] = useState<{ q: Series65Question; qi: number; isReview: boolean } | null>(null);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  // Bookkeeping for the override ("mark right/wrong") on the just-scored item.
  const lastScored = useRef(false);
  const lastBB = useRef<{ qi: number; eligibleAt: number } | null>(null);

  useEffect(() => {
    saveHistory(storageKey, history);
  }, [history, storageKey]);

  function advance() {
    const nx = nextFrom(engineRef.current!);
    if (!nx) {
      setDone(true);
      setCurrent(null);
      return;
    }
    setCurrent({ q: SERIES65_QUESTIONS[nx.qi], qi: nx.qi, isReview: nx.isReview });
    setSelected(null);
    setRevealed(false);
    setOutcome(null);
    lastScored.current = false;
    lastBB.current = null;
  }

  // First question on mount.
  useEffect(() => {
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record an outcome. Back-burner reviews are review-only and never scored.
  function record(correct: boolean, q: Series65Question, qi: number, isReview: boolean) {
    const e = engineRef.current!;
    if (isReview) {
      if (!correct) e.backBurner.push({ qi, eligibleAt: e.presented + 10 });
      return;
    }
    lastScored.current = true;
    setHistory((h) => [...h, { topic: q.topic, correct }].slice(-HISTORY_CAP));
    if (!correct) {
      const entry = { qi, eligibleAt: e.presented + 10 };
      e.backBurner.push(entry);
      lastBB.current = entry;
    }
  }

  function answer(label: Letter) {
    if (!current || revealed) return;
    const correct = label === current.q.answer;
    setSelected(label);
    setRevealed(true);
    setOutcome(correct);
    record(correct, current.q, current.qi, current.isReview);
  }

  // "I don't know" / reveal without answering — counts as a miss.
  function reveal() {
    if (!current || revealed) return;
    setSelected(null);
    setRevealed(true);
    setOutcome(false);
    record(false, current.q, current.qi, current.isReview);
  }

  // Override the recorded mark on the current scored question.
  function override(toCorrect: boolean) {
    if (!current || !revealed || current.isReview || !lastScored.current || toCorrect === outcome) return;
    setOutcome(toCorrect);
    setHistory((h) => {
      if (!h.length) return h;
      const c = h.slice();
      c[c.length - 1] = { ...c[c.length - 1], correct: toCorrect };
      return c;
    });
    const e = engineRef.current!;
    if (toCorrect && lastBB.current) {
      e.backBurner = e.backBurner.filter((b) => b !== lastBB.current);
      lastBB.current = null;
    } else if (!toCorrect && !lastBB.current) {
      const entry = { qi: current.qi, eligibleAt: e.presented + 10 };
      e.backBurner.push(entry);
      lastBB.current = entry;
    }
  }

  function resetProgress() {
    engineRef.current = buildEngine();
    setHistory([]);
    setDone(false);
    advance();
  }

  const stats = useMemo(() => computeStats(history), [history]);

  const muted = '#a99ff0';

  if (done) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Practice Quiz</h2>
        <div style={{ ...cardStyle(theme), marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
            You’ve worked through all 400 questions. 🎉
          </div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
            Overall accuracy (last 100): <strong style={{ color: '#fff' }}>{stats.overall ?? '—'}%</strong>
          </div>
          <button onClick={resetProgress} style={primaryBtn(theme, accentGrad)}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  if (!current) return <div style={{ color: muted, padding: 20, fontSize: 13 }}>Loading quiz…</div>;

  const q = current.q;
  const topicPct = stats.perTopic[q.topic];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Practice Quiz</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            Series 65 · {SERIES65_QUESTIONS.length} questions · one at a time, rotating topics
          </p>
        </div>
        <button onClick={resetProgress} style={ghostBtn(theme)} title="Clear stats and reshuffle the deck">
          Reset progress
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.7fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Question */}
        <div style={cardStyle(theme)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={topicBadge(theme)}>{q.topic}</span>
            {current.isReview && <span style={reviewBadge}>Review · not scored</span>}
            <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#8a7fc8' }}>
              #{q.id}
            </span>
          </div>

          <div style={{ fontSize: isPhone ? 15 : 16, lineHeight: 1.55, color: '#fff', fontWeight: 600, marginBottom: 16 }}>
            {q.stem}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {q.options.map((o) => {
              const isCorrect = o.label === q.answer;
              const isChosen = selected === o.label;
              let border = theme.navBorder;
              let bg = 'rgba(255,255,255,.04)';
              let mark = '';
              if (revealed) {
                if (isCorrect) {
                  border = GREEN;
                  bg = 'rgba(53,196,123,.12)';
                  mark = '✓';
                } else if (isChosen) {
                  border = RED;
                  bg = 'rgba(239,84,104,.12)';
                  mark = '✗';
                }
              }
              return (
                <button
                  key={o.label}
                  onClick={() => answer(o.label)}
                  disabled={revealed}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 11,
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${border}`,
                    background: bg,
                    color: '#e7e0ff',
                    cursor: revealed ? 'default' : 'pointer',
                    fontSize: 13.5,
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: revealed && isCorrect ? GREEN : revealed && isChosen ? RED : theme.accent }}>
                    {o.label}
                  </span>
                  <span style={{ flex: 1 }}>{o.text}</span>
                  {mark && <span style={{ color: isCorrect ? GREEN : RED, fontWeight: 700 }}>{mark}</span>}
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {revealed ? (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: outcome ? GREEN : RED,
                  marginBottom: 6,
                }}
              >
                {outcome ? 'Correct' : 'Incorrect'}
                {current.isReview ? ' (review — not counted)' : ''}
              </div>
              {!outcome && (
                <div style={{ fontSize: 13, color: '#d7ccff', lineHeight: 1.55, marginBottom: 10 }}>
                  Correct answer: <strong style={{ color: '#fff' }}>{q.answer})</strong>{' '}
                  {q.options.find((o) => o.label === q.answer)?.text}
                </div>
              )}
              {!current.isReview && (
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#a99ff0', marginBottom: 10 }}>
                  Overall {stats.overall ?? 0}% · {q.topic} {topicPct.pct ?? 0}%
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={advance} style={primaryBtn(theme, accentGrad)}>
                  Next question ›
                </button>
                {!current.isReview && (
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 4 }}>
                    <span style={{ fontSize: 11, color: '#8a7fc8' }}>Mark:</span>
                    <button onClick={() => override(true)} disabled={outcome === true} style={tinyBtn(outcome === true ? GREEN : theme.navBorder)}>
                      right
                    </button>
                    <button onClick={() => override(false)} disabled={outcome === false} style={tinyBtn(outcome === false ? RED : theme.navBorder)}>
                      wrong
                    </button>
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={reveal} style={ghostBtn(theme)} title="Reveal the answer; counts as a miss">
                I don’t know
              </button>
            </div>
          )}
        </div>

        {/* Running stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={cardStyle(theme)}>
            <div style={statLabel}>Overall accuracy</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color: '#fff', marginTop: 4 }}>
              {stats.overall == null ? '—' : `${stats.overall}%`}
            </div>
            <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
              last {Math.min(100, stats.overallN)} answered{stats.overallN >= 94 ? ' · pass ≈ 72%' : ''}
            </div>
            <div style={{ height: 8, background: theme.navBorder, borderRadius: 5, overflow: 'hidden', marginTop: 10, position: 'relative' }}>
              <div style={{ position: 'absolute', left: '72%', top: 0, width: 2, height: '100%', background: '#fff', opacity: 0.5 }} />
              <div style={{ height: '100%', width: `${stats.overall ?? 0}%`, background: accentGrad }} />
            </div>
          </div>

          <div style={cardStyle(theme)}>
            <div style={statLabel}>By topic (last 20 each)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
              {SERIES65_TOPICS.map((t) => {
                const pt = stats.perTopic[t];
                const isCurrent = t === q.topic;
                return (
                  <div key={t}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                      <span style={{ color: isCurrent ? theme.accent : '#cdbcff', fontWeight: isCurrent ? 700 : 500 }}>{t}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#fff' }}>
                        {pt.pct == null ? '—' : `${pt.pct}%`}
                      </span>
                    </div>
                    <div style={{ height: 6, background: theme.navBorder, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pt.pct ?? 0}%`, background: isCurrent ? accentGrad : 'rgba(205,188,255,.45)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: '#8a7fc8', marginTop: 12 }}>
              {stats.total} answered · {engineRef.current!.backBurner.length} in back-burner review
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cardStyle(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: 20,
  };
}

function topicBadge(theme: Theme): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: theme.accent,
    border: `1px solid ${theme.accent}`,
    borderRadius: 5,
    padding: '3px 8px',
  };
}

const reviewBadge: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  color: '#e0a23a',
  border: '1px solid #e0a23a',
  borderRadius: 5,
  padding: '3px 8px',
};

const statLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#a99ff0',
};

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

function ghostBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '9px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };
}

function tinyBtn(border: string): CSSProperties {
  return {
    border: `1px solid ${border}`,
    background: 'rgba(255,255,255,.05)',
    color: '#e7e0ff',
    fontSize: 11.5,
    fontWeight: 600,
    padding: '5px 10px',
    borderRadius: 6,
    cursor: 'pointer',
  };
}
