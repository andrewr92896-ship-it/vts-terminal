import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TestLeaderboardEntry, TestResult } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import type { Series65Question } from './series65Questions';
import { SERIES65_EXPLANATIONS } from './series65Explanations';
import {
  TEST_BLUEPRINT,
  TEST_PASS,
  TEST_SIZE,
  answeredCount as countAnswered,
  buildTest,
  clearTestProgress,
  gradeTest,
  loadTestProgress,
  parseTestProgress,
  questionsFromIds,
  saveTestProgress,
  type Letter,
  type TestProgress,
  type TestScore,
} from './series65Test';

const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const muted = '#a99ff0';

type Phase = 'intro' | 'running' | 'done';

// The Series 65 mock test: a one-shot, 100-question sitting drawn to the real
// exam blueprint (25 Investments · 30 Client Management · 30 Regulations &
// Ethics · 15 Economics), each question asked once, in random order. There is
// no per-question feedback during the test — like the real exam, you find out
// how you did at the end. Completing a test records the score (and the attempt
// number) to the test leaderboard.
export function TestMode({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);

  const [phase, setPhase] = useState<Phase>('intro');
  const [questions, setQuestions] = useState<Series65Question[]>([]);
  const [answers, setAnswers] = useState<(Letter | null)[]>([]);
  const [index, setIndex] = useState(0);
  const startedAtRef = useRef<number>(0);
  const [resumed, setResumed] = useState(false);

  // Account sync: whether the server copy has been reconciled yet, the last
  // state we pushed up (to skip redundant writes), and whether the learner has
  // manually started a fresh test this mount (so a late server reconcile doesn't
  // yank them out of it).
  const [hydrated, setHydrated] = useState(false);
  const lastSavedRef = useRef<string | null>(null);
  const freshStartRef = useRef(false);

  // Final grade + the server-recorded result (with its attempt number).
  const [graded, setGraded] = useState<TestScore | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Leaderboard + the learner's own attempt history.
  const [board, setBoard] = useState<TestLeaderboardEntry[] | null>(null);
  const [mine, setMine] = useState<TestResult[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);

  const refreshBoard = () => {
    api
      .studyTestLeaderboard()
      .then((r) => {
        setBoard(r.entries);
        setMine(r.mine);
      })
      .catch(() => setBoardError('Could not load the test leaderboard right now.'));
  };

  // Adopt a saved in-progress test (from localStorage or the account) into the
  // running view.
  function applyProgress(qs: Series65Question[], p: TestProgress) {
    setQuestions(qs);
    setAnswers(p.answers);
    setIndex(p.index);
    startedAtRef.current = p.startedAt || Date.now();
    setResumed(true);
    setPhase('running');
  }

  // On mount: pull the board and resume an in-progress sitting. The localStorage
  // copy resumes instantly; the account copy (synced from other devices) is then
  // reconciled in — whichever has more answered questions wins, so a resume never
  // loses work and a test started on another device follows the learner here.
  useEffect(() => {
    refreshBoard();
    const local = loadTestProgress(user?.id);
    let localAnswered = -1;
    if (local) {
      const qs = questionsFromIds(local.ids);
      if (qs) {
        applyProgress(qs, local);
        localAnswered = countAnswered(local);
      } else {
        clearTestProgress(user?.id);
      }
    }
    api
      .studyTestProgress()
      .then((r) => {
        const remote = parseTestProgress(r.state);
        if (remote && !freshStartRef.current) {
          const qs = questionsFromIds(remote.ids);
          if (qs && countAnswered(remote) >= localAnswered) {
            applyProgress(qs, remote);
            saveTestProgress(user?.id, remote); // keep the local copy in step
            lastSavedRef.current = JSON.stringify(remote);
          }
        }
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the in-progress test to localStorage on every change while it's
  // running (instant, offline-safe local copy).
  useEffect(() => {
    if (phase !== 'running' || questions.length !== TEST_SIZE) return;
    saveTestProgress(user?.id, {
      ids: questions.map((q) => q.id),
      answers,
      index,
      startedAt: startedAtRef.current,
    });
  }, [phase, questions, answers, index, user?.id]);

  // Sync the in-progress test to the account (debounced) so it follows the
  // learner across devices. Gated on hydration so we never clobber the server
  // copy before reconciling it, skipped for the read-only demo account, and
  // skipped when the state matches what we last pushed.
  useEffect(() => {
    if (!hydrated || readOnly) return;
    if (phase !== 'running' || questions.length !== TEST_SIZE) return;
    const json = JSON.stringify({
      ids: questions.map((q) => q.id),
      answers,
      index,
      startedAt: startedAtRef.current,
    });
    if (json === lastSavedRef.current) return;
    const id = setTimeout(() => {
      lastSavedRef.current = json;
      void api.saveStudyTestProgress(json).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [phase, questions, answers, index, hydrated, readOnly]);

  function startTest() {
    const qs = buildTest();
    freshStartRef.current = true; // a late server reconcile must not replace this
    lastSavedRef.current = null; // force the new sitting to be pushed up
    setQuestions(qs);
    setAnswers(new Array(qs.length).fill(null));
    setIndex(0);
    startedAtRef.current = Date.now();
    setResumed(false);
    setGraded(null);
    setResult(null);
    setRecordError(null);
    setReviewOpen(false);
    setPhase('running');
  }

  function choose(label: Letter) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = next[index] === label ? null : label; // tap again to clear
      return next;
    });
  }

  const answeredCount = useMemo(() => answers.filter((a) => a != null).length, [answers]);

  async function finish() {
    const score = gradeTest(questions, answers);
    setGraded(score);
    setPhase('done');
    clearTestProgress(user?.id); // clear the local in-progress copy
    lastSavedRef.current = null;
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : null;

    if (readOnly) return; // demo account: show the grade, don't record it
    void api.clearStudyTestProgress().catch(() => {}); // clear the account copy
    setRecording(true);
    setRecordError(null);
    try {
      const r = await api.recordStudyTest({
        score: score.score,
        correct: score.correct,
        total: score.total,
        passed: score.passed,
        durationMs,
        breakdown: score.breakdown,
      });
      setResult(r.result);
      refreshBoard();
    } catch {
      setRecordError('Your test was graded, but we could not save it to the leaderboard.');
    } finally {
      setRecording(false);
    }
  }

  function abandon() {
    clearTestProgress(user?.id);
    lastSavedRef.current = null;
    freshStartRef.current = false;
    if (!readOnly) void api.clearStudyTestProgress().catch(() => {});
    setPhase('intro');
    setQuestions([]);
    setAnswers([]);
    setIndex(0);
  }

  // ---- Intro / start screen ----
  if (phase === 'intro') {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={card(theme)}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>Series 65 mock test</h3>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.6, color: '#d7ccff' }}>
              A full {TEST_SIZE}-question sitting drawn to the real exam mix. Each question is asked
              once, in a random order of mixed difficulty. There's no feedback until you finish —
              just like the real thing. Your score and attempt number go on the leaderboard.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4,1fr)', gap: 10, margin: '16px 0' }}>
              {TEST_BLUEPRINT.map((s) => (
                <div key={s.topic} style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: '11px 12px' }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 700, color: '#fff' }}>{s.count}</div>
                  <div style={{ fontSize: 10.5, color: muted, marginTop: 2, lineHeight: 1.3 }}>{s.topic}</div>
                </div>
              ))}
            </div>

            <ul style={{ margin: '4px 0 18px', paddingLeft: 18, fontSize: 12.5, color: muted, lineHeight: 1.7 }}>
              <li>Pass line is {TEST_PASS.toFixed(0)}%, the same as the real Series 65.</li>
              <li>Answers can be changed until you submit; tap a choice again to clear it.</li>
              <li>Skipped questions are marked wrong — leaving one blank costs you.</li>
              <li>Your progress is saved, so a refresh won't lose the sitting.</li>
            </ul>

            <button onClick={startTest} style={primaryBtn(theme, accentGrad)}>
              Start the test
            </button>
            {readOnly && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: muted }}>
                Demo account: you can take the test, but results aren't saved to the leaderboard.
              </div>
            )}
          </div>

          <TestBoard theme={theme} board={board} mine={mine} error={boardError} isPhone={isPhone} />
        </div>
      </div>
    );
  }

  // ---- Running the test ----
  if (phase === 'running') {
    const q = questions[index];
    const chosen = answers[index];
    const last = index === questions.length - 1;
    const pct = Math.round(((index + 1) / questions.length) * 100);

    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff' }}>
        {resumed && (
          <div style={{ background: 'rgba(224,162,58,.12)', border: `1px solid ${AMBER}`, borderRadius: 10, padding: '9px 13px', marginBottom: 12, fontSize: 12, color: '#f0d9a8' }}>
            Resumed your test in progress — {answeredCount} of {questions.length} answered.
          </div>
        )}

        {/* Progress header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>
            Question {index + 1} <span style={{ color: muted, fontWeight: 500 }}>of {questions.length}</span>
          </div>
          <div style={{ fontSize: 11.5, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
            {answeredCount} answered · {questions.length - answeredCount} left
          </div>
        </div>
        <div style={{ height: 6, background: theme.navBorder, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: accentGrad, transition: 'width .2s' }} />
        </div>

        <div style={card(theme)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '3px 9px', opacity: 0.85 }}>
              {q.topic}
            </span>
          </div>
          <div style={{ fontSize: isPhone ? 15 : 16, lineHeight: 1.55, color: '#fff', fontWeight: 600, marginBottom: 16 }}>
            {q.stem}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {q.options.map((o) => {
              const isChosen = chosen === o.label;
              return (
                <button
                  key={o.label}
                  onClick={() => choose(o.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 11,
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${isChosen ? theme.accent : theme.navBorder}`,
                    background: isChosen ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)',
                    color: '#e7e0ff',
                    cursor: 'pointer',
                    fontSize: 13.5,
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: isChosen ? theme.accent : muted }}>
                    {o.label}
                  </span>
                  <span style={{ flex: 1 }}>{o.text}</span>
                  {isChosen && <span style={{ color: theme.accent, fontWeight: 700 }}>●</span>}
                </button>
              );
            })}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              style={{ ...ghostBtn(theme), opacity: index === 0 ? 0.4 : 1, cursor: index === 0 ? 'default' : 'pointer' }}
            >
              ‹ Back
            </button>
            {!last ? (
              <button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} style={primaryBtn(theme, accentGrad)}>
                Next ›
              </button>
            ) : (
              <button onClick={finish} style={{ ...primaryBtn(theme, accentGrad), background: `linear-gradient(90deg,${GREEN},#27a866)`, color: '#04120b' }}>
                Finish &amp; grade
              </button>
            )}
            <button onClick={finish} style={{ ...ghostBtn(theme), marginLeft: 'auto' }} title="Grade the test now, even with questions left blank">
              Submit test
            </button>
          </div>
          {last && answeredCount < questions.length && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: AMBER }}>
              {questions.length - answeredCount} question{questions.length - answeredCount === 1 ? '' : 's'} still blank — those count as wrong.
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button onClick={abandon} style={{ background: 'none', border: 'none', color: muted, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>
            Abandon this test
          </button>
        </div>
      </div>
    );
  }

  // ---- Results ----
  const score = graded!;
  const attemptLabel = result
    ? `Recorded as attempt #${result.attempt}`
    : readOnly
      ? 'Demo — not recorded'
      : recording
        ? 'Saving to leaderboard…'
        : 'Not recorded';

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Headline score */}
          <div style={{ ...card(theme), borderLeft: `3px solid ${score.passed ? GREEN : RED}` }}>
            <div style={statLabel}>Your result</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 44, fontWeight: 700, color: score.passed ? GREEN : RED }}>
                {score.score.toFixed(1)}%
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: score.passed ? GREEN : RED }}>
                {score.passed ? 'PASS' : 'DID NOT PASS'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: muted, marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
              {score.correct} / {score.total} correct · pass line {TEST_PASS.toFixed(0)}%
            </div>
            <div style={{ height: 8, background: theme.navBorder, borderRadius: 5, overflow: 'hidden', marginTop: 12, position: 'relative' }}>
              <div style={{ position: 'absolute', left: `${TEST_PASS}%`, top: 0, width: 2, height: '100%', background: '#fff', opacity: 0.6 }} />
              <div style={{ height: '100%', width: `${score.score}%`, background: score.passed ? `linear-gradient(90deg,${GREEN},#27a866)` : accentGrad }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: result ? GREEN : muted, border: `1px solid ${result ? GREEN : theme.navBorder}`, borderRadius: 6, padding: '4px 10px' }}>
                {attemptLabel}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={startTest} style={primaryBtn(theme, accentGrad)}>
                  Take another test
                </button>
              </div>
            </div>
            {recordError && <div style={{ marginTop: 10, fontSize: 11.5, color: '#ffb4ab' }}>{recordError}</div>}
          </div>

          {/* Per-topic breakdown */}
          <div style={card(theme)}>
            <div style={statLabel}>By topic</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 12 }}>
              {TEST_BLUEPRINT.map((s) => {
                const b = score.breakdown[s.topic] ?? { correct: 0, total: s.count };
                const pct = b.total ? Math.round((100 * b.correct) / b.total) : 0;
                const good = pct >= TEST_PASS;
                return (
                  <div key={s.topic}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#e7e0ff', fontWeight: 600 }}>{s.topic}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: good ? GREEN : pct >= TEST_PASS - 12 ? AMBER : RED }}>
                        {b.correct}/{b.total} · {pct}%
                      </span>
                    </div>
                    <div style={{ height: 5, background: theme.navBorder, borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: good ? GREEN : pct >= TEST_PASS - 12 ? AMBER : RED }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Question review */}
          <div style={card(theme)}>
            <button
              onClick={() => setReviewOpen((v) => !v)}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#fff' }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>Review all {questions.length} questions</span>
              <span style={{ color: muted, fontSize: 13 }}>{reviewOpen ? 'Hide ▲' : 'Show ▼'}</span>
            </button>
            {reviewOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                {questions.map((q, i) => (
                  <ReviewRow key={q.id} q={q} chosen={answers[i]} n={i + 1} />
                ))}
              </div>
            )}
          </div>
        </div>

        <TestBoard theme={theme} board={board} mine={mine} error={boardError} isPhone={isPhone} />
      </div>
    </div>
  );
}

// One reviewed question on the results screen: shows the learner's choice, the
// correct answer, and the explanation.
function ReviewRow({ q, chosen, n }: { q: Series65Question; chosen: Letter | null; n: number }) {
  const right = chosen === q.answer;
  const explanation = SERIES65_EXPLANATIONS[q.id];
  return (
    <div style={{ borderLeft: `3px solid ${right ? GREEN : RED}`, paddingLeft: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: muted }}>{n}.</span>
        <span style={{ fontSize: 13, color: '#fff', fontWeight: 600, lineHeight: 1.45 }}>{q.stem}</span>
      </div>
      <div style={{ fontSize: 12, color: muted, lineHeight: 1.5, marginLeft: 18 }}>
        <span style={{ color: right ? GREEN : RED, fontWeight: 700 }}>
          {right ? '✓ Correct' : chosen ? `✗ You chose ${chosen}` : '✗ Left blank'}
        </span>
        {!right && (
          <span>
            {' '}· Answer: <strong style={{ color: '#fff' }}>{q.answer})</strong> {q.options.find((o) => o.label === q.answer)?.text}
          </span>
        )}
        {explanation && <div style={{ marginTop: 4, color: '#c9bdf5' }}>{explanation}</div>}
      </div>
    </div>
  );
}

// The test high-score board: each player's best sitting, tagged with the attempt
// that produced it, plus the caller's own recent attempts.
function TestBoard({
  theme,
  board,
  mine,
  error,
  isPhone,
}: {
  theme: Theme;
  board: TestLeaderboardEntry[] | null;
  mine: TestResult[];
  error: string | null;
  isPhone: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card(theme)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={statLabel}>Test leaderboard</div>
          <div style={{ fontSize: 10.5, color: muted }}>Best score · pass {TEST_PASS.toFixed(0)}%</div>
        </div>
        {error ? (
          <div style={{ color: muted, fontSize: 12.5 }}>{error}</div>
        ) : !board ? (
          <div style={{ color: muted, fontSize: 12.5 }}>Loading…</div>
        ) : !board.length ? (
          <div style={{ color: muted, fontSize: 12.5, lineHeight: 1.6 }}>
            No tests yet. Finish a mock test and you'll be the first on the board.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {board.map((e, i) => (
              <div
                key={e.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 11px',
                  borderRadius: 10,
                  border: `1px solid ${e.isMe ? theme.accent : theme.navBorder}`,
                  background: e.isMe ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)',
                }}
              >
                <span style={{ ...rankBadge(i + 1), flexShrink: 0 }}>{medal(i + 1)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.name}
                    {e.isMe && <span style={{ color: theme.accent, fontWeight: 600 }}> · you</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: muted, marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                    attempt #{e.attempt} · {e.correct}/{e.total}
                    {e.attempts > 1 ? ` · ${e.attempts} taken` : ''}
                  </div>
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color: e.passed ? GREEN : RED }}>
                  {e.score}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <div style={card(theme)}>
          <div style={statLabel}>Your attempts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {mine.slice(0, isPhone ? 6 : 10).map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 2px' }}>
                <span style={{ color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                  #{t.attempt} · {new Date(t.createdAt).toLocaleDateString()}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: t.passed ? GREEN : RED }}>
                  {t.score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

function rankBadge(rank: number): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 26,
    height: 26,
    fontSize: rank <= 3 ? 16 : 12,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    color: rank <= 3 ? '#fff' : muted,
  };
}

function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: 20,
  };
}

const statLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: muted,
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
