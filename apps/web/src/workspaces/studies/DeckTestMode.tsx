import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { DeckQuestion, TeamDeckDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';

// A configurable, graded test over a team-built study game's questions. This is
// the generic mock test over any study game: pick how many
// questions and the pass line, sit the exam (silent or with feedback as you go),
// then get a score, pass/fail against the line, and a per-topic breakdown. The
// draw is a shuffled sample of the deck's own questions.

const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const muted = '#a99ff0';
const DEFAULT_PASS = 72;
const MAX_TEST = 50; // cap a single sitting so long decks stay a reasonable exam

type Letter = 'A' | 'B' | 'C' | 'D';
type Phase = 'intro' | 'running' | 'done';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Breakdown {
  [topic: string]: { correct: number; total: number };
}

export function DeckTestMode({ theme, deckId, onBack }: { theme: Theme; deckId: string; onBack: () => void }) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);

  const [deck, setDeck] = useState<TeamDeckDetail | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [phase, setPhase] = useState<Phase>('intro');
  const [size, setSize] = useState(20);
  const [passLine, setPassLine] = useState(DEFAULT_PASS);
  const [feedback, setFeedback] = useState(false); // show right/wrong as you go

  // The drawn questions for this sitting and the learner's answers.
  const [questions, setQuestions] = useState<DeckQuestion[]>([]);
  const [answers, setAnswers] = useState<(Letter | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [revealed, setRevealed] = useState(false); // feedback mode: current answer submitted
  const startedAt = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    api
      .studyDeck(deckId)
      .then((r) => {
        if (!alive) return;
        setDeck(r.deck);
        setSize(Math.min(MAX_TEST, Math.max(1, r.deck.questionCount)));
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [deckId]);

  const maxSize = deck ? Math.min(MAX_TEST, deck.questionCount) : MAX_TEST;

  function start() {
    if (!deck) return;
    const n = Math.max(1, Math.min(maxSize, size));
    const drawn = shuffle(deck.questions).slice(0, n);
    setQuestions(drawn);
    setAnswers(new Array(drawn.length).fill(null));
    setIndex(0);
    setSelected(null);
    setRevealed(false);
    startedAt.current = Date.now();
    setPhase('running');
  }

  function recordAndNext(label: Letter | null) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = label;
      return next;
    });
    if (index + 1 >= questions.length) {
      setPhase('done');
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
  }

  const result = useMemo(() => {
    if (phase !== 'done') return null;
    let correct = 0;
    const breakdown: Breakdown = {};
    questions.forEach((q, i) => {
      const topic = q.topic || 'General';
      breakdown[topic] ??= { correct: 0, total: 0 };
      breakdown[topic].total += 1;
      if (answers[i] === q.answer) {
        correct += 1;
        breakdown[topic].correct += 1;
      }
    });
    const total = questions.length;
    const score = total ? Math.round((100 * correct) / total) : 0;
    return { correct, total, score, passed: score >= passLine, breakdown };
  }, [phase, questions, answers, passLine]);

  const backBtn = (
    <button onClick={onBack} style={ghostBtn(theme)}>
      ‹ All study games
    </button>
  );

  if (loadError) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>Couldn’t load this study game.</div>
      </div>
    );
  }
  if (!deck) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  const header = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {backBtn}
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{deck.name} · Test</h2>
      </div>
    </div>
  );

  // ---- Intro: configure the sitting ----
  if (phase === 'intro') {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        {deck.questionCount === 0 ? (
          <div style={{ ...card(theme), color: muted, fontSize: 13 }}>This study game has no questions yet.</div>
        ) : (
          <div style={card(theme)}>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#d7ccff', lineHeight: 1.55 }}>
              A graded test drawn from this game’s {deck.questionCount} question{deck.questionCount === 1 ? '' : 's'}. Set
              the length and pass line, then sit the exam.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#e7e0ff' }}>
                <span style={{ minWidth: 130 }}>Number of questions</span>
                <input
                  type="number"
                  min={1}
                  max={maxSize}
                  value={size}
                  onChange={(e) => setSize(Math.max(1, Math.min(maxSize, Number(e.target.value) || 1)))}
                  style={{ ...field(theme), width: 90 }}
                />
                <span style={{ fontSize: 11.5, color: muted }}>up to {maxSize}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#e7e0ff' }}>
                <span style={{ minWidth: 130 }}>Pass line</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={passLine}
                  onChange={(e) => setPassLine(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  style={{ ...field(theme), width: 90 }}
                />
                <span style={{ fontSize: 11.5, color: muted }}>% correct to pass</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#e7e0ff', cursor: 'pointer' }}>
                <input type="checkbox" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} style={{ width: 16, height: 16, accentColor: theme.accent }} />
                Show feedback as I go (otherwise graded only at the end)
              </label>
            </div>
            <div style={{ marginTop: 20 }}>
              <button onClick={start} style={primaryBtn(theme, accentGrad)}>
                Start test · {Math.max(1, Math.min(maxSize, size))} question{Math.max(1, Math.min(maxSize, size)) === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Done: score + breakdown ----
  if (phase === 'done' && result) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <div style={{ ...card(theme), textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your score</div>
          <div style={{ fontSize: 46, fontWeight: 800, color: result.passed ? GREEN : RED, lineHeight: 1.1, margin: '6px 0' }}>
            {result.score}%
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: result.passed ? GREEN : RED }}>
            {result.passed ? 'PASS' : 'NOT PASSING'} · pass line {passLine}%
          </div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 6 }}>
            {result.correct} of {result.total} correct
          </div>
        </div>

        <div style={{ ...card(theme), marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent, marginBottom: 10 }}>
            By topic
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(result.breakdown).map(([topic, b]) => {
              const pct = b.total ? Math.round((100 * b.correct) / b.total) : 0;
              return (
                <div key={topic} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#e7e0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic}</span>
                  <div style={{ flex: 2, height: 8, background: theme.navBorder, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= passLine ? GREEN : AMBER }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: muted, width: 66, textAlign: 'right' }}>
                    {b.correct}/{b.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setPhase('intro')} style={primaryBtn(theme, accentGrad)}>Take another</button>
          <button onClick={onBack} style={ghostBtn(theme)}>Done</button>
        </div>
      </div>
    );
  }

  // ---- Running ----
  const q = questions[index];
  const chosen = answers[index] ?? selected;
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {header}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
        <span style={{ fontSize: 12, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
          Question {index + 1} / {questions.length}
        </span>
        <div style={{ flex: 1, maxWidth: 260, height: 6, background: theme.navBorder, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${((index) / questions.length) * 100}%`, background: accentGrad, transition: 'width .2s' }} />
        </div>
      </div>

      {q && (
        <div style={card(theme)}>
          <div style={{ fontSize: 10.5, color: muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{q.topic}</div>
          <div style={{ fontSize: isPhone ? 15 : 16, lineHeight: 1.55, color: '#fff', fontWeight: 600, marginBottom: 16 }}>{q.stem}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {q.options.map((o) => {
              const isChosen = chosen === o.label;
              const isCorrect = o.label === q.answer;
              let border = theme.navBorder;
              let bg = 'rgba(255,255,255,.04)';
              let mark = '';
              if (feedback && revealed) {
                if (isCorrect) {
                  border = GREEN;
                  bg = 'rgba(53,196,123,.12)';
                  mark = '✓';
                } else if (isChosen) {
                  border = RED;
                  bg = 'rgba(239,84,104,.12)';
                  mark = '✗';
                }
              } else if (isChosen) {
                border = theme.accent;
                bg = 'rgba(255,255,255,.10)';
              }
              return (
                <button
                  key={o.label}
                  onClick={() => !(feedback && revealed) && setSelected(o.label)}
                  disabled={feedback && revealed}
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
                    cursor: feedback && revealed ? 'default' : 'pointer',
                    fontSize: 13.5,
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: theme.accent }}>{o.label}</span>
                  <span style={{ flex: 1 }}>{o.text}</span>
                  {mark && <span style={{ color: isCorrect ? GREEN : RED, fontWeight: 700 }}>{mark}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {feedback && !revealed ? (
              <>
                <button
                  onClick={() => selected && setRevealed(true)}
                  disabled={selected == null}
                  style={{ ...primaryBtn(theme, accentGrad), flex: 1, minWidth: 160, opacity: selected == null ? 0.6 : 1 }}
                >
                  {selected == null ? 'Select an answer' : 'Check answer'}
                </button>
                <button onClick={() => { setRevealed(true); }} style={{ ...ghostBtn(theme), borderStyle: 'dashed' }}>Skip</button>
              </>
            ) : feedback && revealed ? (
              <div style={{ flex: 1 }}>
                {q.explanation && (
                  <div style={{ fontSize: 12.5, color: '#d7ccff', lineHeight: 1.55, marginBottom: 12 }}>{q.explanation}</div>
                )}
                <button onClick={() => recordAndNext(chosen)} style={primaryBtn(theme, accentGrad)}>
                  {index + 1 >= questions.length ? 'Finish test' : 'Next question ›'}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => recordAndNext(selected)}
                  disabled={selected == null}
                  style={{ ...primaryBtn(theme, accentGrad), flex: 1, minWidth: 160, opacity: selected == null ? 0.6 : 1 }}
                >
                  {index + 1 >= questions.length ? 'Finish test' : 'Next question ›'}
                </button>
                <button onClick={() => recordAndNext(null)} style={{ ...ghostBtn(theme), borderStyle: 'dashed' }}>Skip</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '18px 18px',
  };
}
function field(theme: Theme): CSSProperties {
  return {
    background: 'rgba(10,8,26,.6)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    padding: '8px 11px',
    outline: 'none',
    boxSizing: 'border-box',
  };
}
function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontSize: 13,
    fontWeight: 700,
    padding: '11px 18px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}
function ghostBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 13,
    fontWeight: 600,
    padding: '9px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };
}
