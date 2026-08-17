import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { DeckQuestion, TeamDeckDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { StudyDisclaimer } from './StudyDisclaimer';
import {
  drawWeighted,
  hasUsableWeights,
  weightedResult,
  type DrawAllocation,
  type WeightedResult,
} from './examWeights';
import { NumberField } from './NumberField';
import { useAuth } from '../../auth/AuthContext';
import {
  clearTestSession,
  loadTestSession,
  restoreQuestions,
  saveTestSession,
  type TestSessionState,
} from './testSession';

// A configurable, graded test over a team-built study game's questions. This is
// the generic mock test over any study game: pick how many questions and the
// pass line, sit the exam (silent or with feedback as you go), then get a score,
// pass/fail against the line, and a per-topic breakdown.
//
// It sits two ways, and the author's category weights decide whether the choice
// is even offered (see examWeights.ts):
//
//  • PLAIN — a shuffled sample of the deck, scored as a straight percentage of
//    questions right. What this screen has always done, and still the default
//    for any game with no weights set.
//  • WEIGHTED — the draw is composed in the proportions the author gave each
//    category, and the score is each category's accuracy against its share of
//    the paper. That is what makes the result resemble the exam behind the game
//    rather than whichever questions happened to come up.
//
// The two scores are shown together at the end whichever was chosen, because
// the gap between them is itself informative: a plain score well above the
// weighted one means the sample was kind about where it drew from.

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
  const { user } = useAuth();
  const accentGrad = accentGradient(theme);

  const [deck, setDeck] = useState<TeamDeckDetail | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [phase, setPhase] = useState<Phase>('intro');
  const [size, setSize] = useState(20);
  const [passLine, setPassLine] = useState(DEFAULT_PASS);
  const [feedback, setFeedback] = useState(false); // show right/wrong as you go
  // Whether to sit this one weighted. Only meaningful when the game carries
  // usable weights; defaulted on for those, since an author who set a blueprint
  // meant the test to follow it.
  const [useWeights, setUseWeights] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);

  // The drawn questions for this sitting and the learner's answers.
  const [questions, setQuestions] = useState<DeckQuestion[]>([]);
  // What the sitting was actually composed of — recorded at draw time so the
  // result can report a category the deck could not fill. Empty on a plain
  // sitting, and `weightedSitting` is what the result reads, never `useWeights`:
  // the toggle can be moved on the intro screen after a test has been sat.
  const [allocations, setAllocations] = useState<DrawAllocation[]>([]);
  const [weightedSitting, setWeightedSitting] = useState(false);
  const [answers, setAnswers] = useState<(Letter | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [revealed, setRevealed] = useState(false); // feedback mode: current answer submitted
  const startedAt = useRef<number>(0);

  // A sitting left part-way through, offered back on the intro screen. Held as
  // the stored blob plus the paper resolved against the deck as it stands now;
  // `stale` is a saved sitting whose questions no longer all exist, which cannot
  // be restored faithfully and is dropped (see restoreQuestions).
  const [resume, setResume] = useState<{ saved: TestSessionState; questions: DeckQuestion[] } | null>(null);
  const [resumeStale, setResumeStale] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .studyDeck(deckId)
      .then((r) => {
        if (!alive) return;
        setDeck(r.deck);
        setSize(Math.min(MAX_TEST, Math.max(1, r.deck.questionCount)));
        const saved = loadTestSession(user?.id, deckId);
        if (!saved) return;
        const questions = restoreQuestions(saved.seqs, r.deck);
        if (questions) setResume({ saved, questions });
        else {
          // The paper changed underneath it, so there is nothing honest to
          // resume. Drop it rather than leaving a Continue button that would
          // grade a different test.
          clearTestSession(user?.id, deckId);
          setResumeStale(true);
        }
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // Keep the running sitting saved on every answer and every move between
  // questions, so leaving the screen at any point can be picked back up.
  useEffect(() => {
    if (phase !== 'running' || questions.length === 0) return;
    saveTestSession(user?.id, deckId, {
      seqs: questions.map((q) => q.seq),
      answers,
      index,
      selected,
      revealed,
      passLine,
      feedback,
      weighted: weightedSitting,
      allocations,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questions, answers, index, selected, revealed, passLine, feedback, weightedSitting, allocations]);

  // A finished test has nothing left to resume, and its answers must not come
  // back as a part-done sitting the next time the screen opens.
  useEffect(() => {
    if (phase === 'done') clearTestSession(user?.id, deckId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Pick the saved sitting back up exactly as it was left — same paper, same
  // order, same answers, and the terms it was started under rather than whatever
  // the intro controls now read.
  function resumeTest() {
    if (!resume) return;
    const { saved, questions: qs } = resume;
    setQuestions(qs);
    setAnswers(saved.answers);
    setIndex(saved.index);
    setSelected(saved.selected);
    setRevealed(saved.revealed);
    setPassLine(saved.passLine);
    setFeedback(saved.feedback);
    setWeightedSitting(saved.weighted);
    setAllocations(saved.allocations);
    setStartError(null);
    startedAt.current = Date.now();
    setPhase('running');
  }

  function discardResume() {
    clearTestSession(user?.id, deckId);
    setResume(null);
  }

  const maxSize = deck ? Math.min(MAX_TEST, deck.questionCount) : MAX_TEST;
  // Whether this game can be sat weighted at all — weights set, and at least one
  // category carrying a non-zero one.
  const canWeight = !!deck && hasUsableWeights(deck.categories, deck.categoryWeights);
  const weighting = canWeight && useWeights;

  function start() {
    if (!deck) return;
    const n = Math.max(1, Math.min(maxSize, size));
    let drawn: DeckQuestion[];
    let alloc: DrawAllocation[] = [];
    if (weighting) {
      const d = drawWeighted(deck.questions, (q) => q.topic, deck.categories, deck.categoryWeights, n, shuffle);
      drawn = d.questions;
      alloc = d.allocations;
    } else {
      drawn = shuffle(deck.questions).slice(0, n);
    }
    // A weighted draw can come back empty even on a game full of questions —
    // every weight sitting on categories that hold none. Refuse the sitting and
    // say so, rather than starting a test with no questions in it.
    if (drawn.length === 0) {
      setStartError(
        weighting
          ? 'None of the weighted categories have any questions in them. Give a category with questions a weight, or sit this one on plain scoring.'
          : 'This study game has no questions to draw from.',
      );
      return;
    }
    setStartError(null);
    // Starting a fresh sitting replaces whatever was left part-way through; the
    // save effect below overwrites the stored blob on the first answer.
    setResume(null);
    setResumeStale(false);
    setAllocations(alloc);
    setWeightedSitting(weighting);
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
    const rawScore = total ? Math.round((100 * correct) / total) : 0;

    // The weighted score, when this sitting was drawn to a blueprint. Null when
    // it wasn't, or when nothing weighted was covered — never silently swapped
    // for the raw one, since the two are different claims about the same paper.
    const weightedScore: WeightedResult | null =
      weightedSitting && deck
        ? weightedResult(
            deck.categories,
            deck.categoryWeights,
            new Map(Object.entries(breakdown).map(([k, v]) => [k, { correct: v.correct, total: v.total }])),
          )
        : null;

    // The headline is whichever score this sitting was taken under, and pass or
    // fail is judged against that one alone.
    const headline = weightedScore ? Math.round(weightedScore.score * 10) / 10 : rawScore;
    return {
      correct,
      total,
      rawScore,
      weightedScore,
      headline,
      passed: headline >= passLine,
      breakdown,
    };
  }, [phase, questions, answers, passLine, weightedSitting, deck]);

  // Categories the deck could not fill the blueprint's share of, and the ones
  // that cost the most marks. Both read off the finished result, so they are
  // empty on a plain sitting.
  const shortfalls = useMemo(
    () => (result?.weightedScore ? allocations.filter((a) => a.drawn < a.wanted) : []),
    [result, allocations],
  );
  const focus = useMemo(() => {
    if (!result?.weightedScore) return [];
    const lost = (c: { pointsAvailable: number; pointsEarned: number }) => c.pointsAvailable - c.pointsEarned;
    return result.weightedScore.categories
      .filter((c) => c.total > 0 && lost(c) >= 0.05)
      .sort((a, b) => lost(b) - lost(a))
      .slice(0, 3);
  }, [result]);

  const backBtn = (
    <button onClick={onBack} style={ghostBtn(theme)}>
      ‹ All study games
    </button>
  );

  if (loadError) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          {"Couldn’t load this study game."}
        </div>
      </div>
    );
  }
  if (!deck) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          {"Loading…"}
        </div>
      </div>
    );
  }

  const header = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {backBtn}
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{deck.name} · Practice Test</h2>
      </div>
    </div>
  );

  // ---- Intro: configure the sitting ----
  if (phase === 'intro') {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}

        {/* A sitting left part-way through. Offered rather than resumed on its
            own, so starting a fresh test is still one press away. */}
        {resume && (
          <div style={{ ...card(theme), marginBottom: 14, borderColor: theme.accent }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 5 }}>
              {"You have a test in progress"}
            </div>
            <div style={{ fontSize: 12.5, color: muted, marginBottom: 14 }}>
              {`Question ${resume.saved.index + 1} of ${resume.saved.seqs.length}`}
              {` · ${resume.saved.answers.filter((a) => a != null).length} answered`}
              {resume.saved.weighted ? ' · weighted scoring' : ''}
              {` · pass line ${resume.saved.passLine}%`}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={resumeTest} style={primaryBtn(theme, accentGrad)}>
                {"Continue where I left off"}
              </button>
              <button onClick={discardResume} style={ghostBtn(theme)}>
                {"Discard it"}
              </button>
            </div>
          </div>
        )}

        {/* Only drawn when a saved sitting was actually thrown away, so the
            Continue button going missing is never unexplained. */}
        {resumeStale && (
          <div style={{ ...card(theme), marginBottom: 14, borderColor: AMBER }}>
            <div style={{ fontSize: 12.5, color: '#f0dcb4', lineHeight: 1.55 }}>
              {"The test you had in progress can’t be picked back up — its questions have changed since you started it. Start a new one below."}
            </div>
          </div>
        )}

        {deck.questionCount === 0 ? (
          <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
            {"This study game has no questions yet."}
          </div>
        ) : (
          <div style={card(theme)}>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#d7ccff', lineHeight: 1.55 }}>
              A graded test drawn from this game’s {deck.questionCount} question{deck.questionCount === 1 ? '' : 's'}. Set
              the length and pass line, then sit the exam.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#e7e0ff' }}>
                <span style={{ minWidth: 130 }}>{"Number of questions"}</span>
                <NumberField value={size} onChange={setSize} min={1} max={maxSize} emptyValue={1} style={{ ...field(theme), width: 90 }} />
                <span style={{ fontSize: 11.5, color: muted }}>up to {maxSize}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#e7e0ff' }}>
                <span style={{ minWidth: 130 }}>{"Pass line"}</span>
                <NumberField value={passLine} onChange={setPassLine} min={1} max={100} emptyValue={1} style={{ ...field(theme), width: 90 }} />
                <span style={{ fontSize: 11.5, color: muted }}>{"% correct to pass"}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#e7e0ff', cursor: 'pointer' }}>
                <input type="checkbox" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} style={{ width: 16, height: 16, accentColor: theme.accent }} />
                {"Show feedback as I go (otherwise graded only at the end)"}
              </label>

              {/* Scoring: offered only when the author gave this game category
                  weights. A game without them has one honest way to score. */}
              {canWeight && (
                <div style={{ borderTop: `1px solid ${theme.navBorder}`, paddingTop: 16 }}>
                  <div style={{ fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 9 }}>
                    {"Scoring"}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <ScoreChoice
                      theme={theme}
                      selected={useWeights}
                      onSelect={() => setUseWeights(true)}
                      title="Weighted — like the real exam"
                      detail="Draws questions in the proportions the author set for each category, and scores each category against its share of the paper."
                    />
                    <ScoreChoice
                      theme={theme}
                      selected={!useWeights}
                      onSelect={() => setUseWeights(false)}
                      title="Plain — percentage correct"
                      detail="A shuffled sample of the whole game, scored as a straight percentage of questions right."
                    />
                  </div>
                  {weighting && <BlueprintPreview deck={deck} size={Math.max(1, Math.min(maxSize, size))} />}
                </div>
              )}
            </div>
            {startError && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: 12.5,
                  color: '#ffb4ab',
                  background: 'rgba(239,84,104,.1)',
                  border: '1px solid rgba(239,84,104,.4)',
                  borderRadius: 8,
                  padding: '9px 12px',
                  lineHeight: 1.5,
                }}
              >
                {startError}
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <button onClick={start} style={primaryBtn(theme, accentGrad)}>
                Start test · {Math.max(1, Math.min(maxSize, size))} question{Math.max(1, Math.min(maxSize, size)) === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        )}

        <StudyDisclaimer theme={theme} />
      </div>
    );
  }

  // ---- Done: score + breakdown ----
  if (phase === 'done' && result) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <div style={{ ...card(theme), textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {result.weightedScore ? 'Your weighted score' : 'Your score'}
          </div>
          <div style={{ fontSize: 46, fontWeight: 800, color: result.passed ? GREEN : RED, lineHeight: 1.1, margin: '6px 0' }}>
            {result.headline}%
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: result.passed ? GREEN : RED }}>
            {result.passed ? 'PASS' : 'NOT PASSING'} · pass line {passLine}%
          </div>
          <div style={{ fontSize: 12.5, color: muted, marginTop: 6 }}>
            {result.correct} of {result.total} correct
            {result.weightedScore && ` · ${result.rawScore}% unweighted`}
          </div>
          {/* The gap between the two is worth naming: it says the sample was
              kinder (or harsher) than the exam's own mix, which is the thing a
              plain percentage cannot tell you. */}
          {result.weightedScore && Math.abs(result.headline - result.rawScore) >= 2 && (
            <div style={{ fontSize: 12, color: muted, marginTop: 6, lineHeight: 1.5 }}>
              {result.headline < result.rawScore
                ? 'Lower than the plain percentage — more of your wrong answers were in areas the exam weights heavily.'
                : 'Higher than the plain percentage — more of your wrong answers were in areas the exam weights lightly.'}
            </div>
          )}
        </div>

        {/* Any category the deck could not supply its full share of. A 15% area
            answered on two questions is a noisy estimate of that 15%, and the
            score gives it the full 15% regardless — so this has to be said. */}
        {result.weightedScore && shortfalls.length > 0 && (
          <div style={{ ...card(theme), marginBottom: 14, borderColor: AMBER }}>
            <div style={{ fontSize: 12.5, color: '#f0dcb4', lineHeight: 1.55 }}>
              {"This game has fewer questions than the blueprint asked for in "}
              {shortfalls.map((s) => `${s.name} (${s.drawn} of ${s.wanted})`).join(', ')}
              {". Those areas still count for their full share, measured on fewer questions."}
            </div>
          </div>
        )}
        {result.weightedScore && result.weightedScore.uncovered.length > 0 && (
          <div style={{ ...card(theme), marginBottom: 14, borderColor: AMBER }}>
            <div style={{ fontSize: 12.5, color: '#f0dcb4', lineHeight: 1.55 }}>
              {"No questions were drawn from "}
              {result.weightedScore.uncovered.join(', ')}
              {". Their share was spread across the rest rather than scored as zero, so this result covers only what you were asked."}
            </div>
          </div>
        )}

        <div style={{ ...card(theme), marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent, marginBottom: 10 }}>
            {result.weightedScore ? 'By category · points of 100' : 'By topic'}
          </div>
          {result.weightedScore ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.weightedScore.categories.map((c) => {
                const pct = c.accuracy == null ? 0 : Math.round(c.accuracy);
                return (
                  <div key={c.name}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#e7e0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: muted }}>
                        {Math.round(c.pointsAvailable * 10) / 10}% of exam
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 8, background: theme.navBorder, borderRadius: 5, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${c.total > 0 ? pct : 0}%`,
                            background: c.accuracy == null ? theme.navBorder : pct >= passLine ? GREEN : AMBER,
                          }}
                        />
                      </div>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: muted, width: 128, textAlign: 'right' }}>
                        {c.total > 0
                          ? `${c.correct}/${c.total} · ${Math.round(c.pointsEarned * 10) / 10} pts`
                          : 'not covered'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
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
          )}
        </div>

        {/* Where the marks actually went. Ranked by points lost rather than by
            accuracy, because a weak area worth 5% of the paper costs less than
            a middling one worth 30% — and the point of weighting is to make
            that difference visible. */}
        {result.weightedScore && focus.length > 0 && (
          <div style={{ ...card(theme), marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent, marginBottom: 10 }}>
              {"Where the marks went"}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {focus.map((c) => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5, color: '#e7e0ff' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: RED }}>
                    −{Math.round((c.pointsAvailable - c.pointsEarned) * 10) / 10} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setPhase('intro')} style={primaryBtn(theme, accentGrad)}>
            {"Take another"}
          </button>
          <button onClick={onBack} style={ghostBtn(theme)}>
            {"Done"}
          </button>
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
                  {selected == null ? "Select an answer" : "Check answer"}
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

// One of the two scoring modes on the intro screen.
function ScoreChoice({
  theme,
  selected,
  onSelect,
  title,
  detail,
}: {
  theme: Theme;
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        textAlign: 'left',
        padding: '11px 13px',
        borderRadius: 10,
        border: `1px solid ${selected ? theme.accent : theme.navBorder}`,
        background: selected ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)',
        color: '#e7e0ff',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          flex: 'none',
          width: 15,
          height: 15,
          marginTop: 2,
          borderRadius: '50%',
          border: `1px solid ${selected ? theme.accent : muted}`,
          background: selected ? theme.accent : 'transparent',
        }}
      />
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#fff' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: muted, lineHeight: 1.5, marginTop: 3 }}>{detail}</span>
      </span>
    </button>
  );
}

// What a weighted sitting of this length will actually be made of. Shown before
// the test rather than after, because the length is the one setting that
// changes it — a 10-question sitting cannot give a 15% category more than one
// or two, and that is worth seeing while the length can still be changed.
function BlueprintPreview({ deck, size }: { deck: TeamDeckDetail; size: number }) {
  const rows = useMemo(() => {
    const { allocations } = drawWeighted(
      deck.questions,
      (q) => q.topic,
      deck.categories,
      deck.categoryWeights,
      size,
      (a) => a,
    );
    return allocations;
  }, [deck, size]);
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12, color: muted }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: r.drawn < r.wanted ? AMBER : '#e7e0ff' }}>
            {r.drawn} question{r.drawn === 1 ? '' : 's'}
            {r.drawn < r.wanted ? ` (of ${r.wanted})` : ''}
          </span>
        </div>
      ))}
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
