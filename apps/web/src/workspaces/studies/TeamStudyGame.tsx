import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { DeckQuestion, LeaderboardEntry, TeamDeckDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin } from '../../auth/access';
import { EditableText } from '../../copy/SiteCopy';
import { overallLevel, levelAtStep, streakMultiplier, STREAK_STEP, round1 } from './gameEngine';
import { setStudyTint } from './studyTint';
import {
  deckGameKey,
  deckLifetimeAccuracy,
  emptyDeckGame,
  parseDeckGame,
  recordDeckAnswer,
  type DeckGameState,
} from './studyEngine';
import { StudyProgressBars } from './StudyProgress';
import { loadStudyPrefs, saveStudyPrefs, type StudyPrefs } from './studyPrefs';
import { loadDeckSession, saveDeckSession } from './studySession';
import { TutorChat } from './TutorChat';

const GREEN = '#35c47b';
const RED = '#ef5468';
const FLAME = '#ff7a3d';
const muted = '#a99ff0';
type Letter = 'A' | 'B' | 'C' | 'D';

interface LevelEvent {
  mainUp: boolean;
  emoji: string;
  name: string;
  stars: string;
  bg: string;
  text: string;
}

// The distinct source-game names on a combined game's questions (empty for a
// normal game). Enables the optional "guess the source" mode.
function sourcesForDeck(deck: TeamDeckDetail): string[] {
  const set = new Set<string>();
  for (const q of deck.questions) if (q.sourceName) set.add(q.sourceName);
  return [...set];
}

function shuffledIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Play a team-built study deck. Uses the shared level ladder, streak
// multiplier, and session/lifetime scoring (via studyEngine), just over the
// team's own questions and categories. Progress is per-user, per-deck, synced to
// the account; the demo plays locally without saving.
export function TeamStudyGame({ theme, deckId, onBack }: { theme: Theme; deckId: string; onBack: () => void }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);

  const [deck, setDeck] = useState<TeamDeckDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<'quiz' | 'leaderboard'>('quiz');

  const [game, setGame] = useState<DeckGameState | null>(null);
  const poolRef = useRef<number[]>([]);
  const [current, setCurrent] = useState<DeckQuestion | null>(null);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<boolean | null>(null);
  const [levelEvent, setLevelEvent] = useState<LevelEvent | null>(null);
  const [scoreChange, setScoreChange] = useState<number | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  // Practice mode: answers still reveal + explain, but don't touch the score,
  // level, streak, or leaderboard. Persisted per-user, per-deck.
  const [practice, setPractice] = useState(false);
  // Whether the currently-revealed answer was submitted in practice mode (so its
  // result wasn't recorded) — drives the "not counted" note, independent of the
  // live toggle.
  const [practiceAttempt, setPracticeAttempt] = useState(false);
  // Set true once the saved session (practice flag + current question) has been
  // restored, gating the persistence effect so it never clobbers what we're
  // about to restore on first load.
  const [viewReady, setViewReady] = useState(false);
  // "Guess the source" mode, available only on combined games whose questions
  // remember which game they came from.
  const [guessMode, setGuessMode] = useState(false);
  const [sourceGuess, setSourceGuess] = useState<string | null>(null);

  // Inline "fix this question" editor (creator/admin only): correct a flawed
  // answer key or drop a bad question, without leaving the game.
  const [fixOpen, setFixOpen] = useState(false);
  const [fixDeleteConfirm, setFixDeleteConfirm] = useState(false);
  const [fixSaving, setFixSaving] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixNote, setFixNote] = useState<string | null>(null);

  // Personal progress-bar preferences (session window + passing thresholds),
  // saved per-user on this device.
  const [prefs, setPrefs] = useState<StudyPrefs>(() => loadStudyPrefs(user?.id));
  useEffect(() => setPrefs(loadStudyPrefs(user?.id)), [user?.id]);
  function updatePrefs(p: StudyPrefs) {
    setPrefs(p);
    saveStudyPrefs(user?.id, p);
  }

  const hydratedRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  // The game state + category as they were BEFORE the current question's answer
  // was recorded, so an answer-key correction can replay the attempt from the
  // exact prior state (un-counting a fixed miss, or dropping a fixed hit).
  const preAnswerRef = useRef<{ game: DeckGameState; topic: string } | null>(null);

  const cats = deck && deck.categories.length ? deck.categories : ['General'];

  // Load the deck, then seed the game from the local copy for an instant start.
  useEffect(() => {
    let alive = true;
    api
      .studyDeck(deckId)
      .then((r) => {
        if (!alive) return;
        const d = r.deck;
        const c = d.categories.length ? d.categories : ['General'];
        setDeck(d);
        const local = parseDeckGame(localStorage.getItem(deckGameKey(user?.id, deckId)), c) ?? emptyDeckGame(c);
        setGame(local);
        poolRef.current = shuffledIndices(d.questions.length);
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  // Reconcile the account copy once the deck is known, so progress follows the
  // learner across devices (best-effort; demo/offline keeps the local copy).
  useEffect(() => {
    if (!deck) return;
    let alive = true;
    const c = deck.categories.length ? deck.categories : ['General'];
    api
      .studyDeckGame(deckId)
      .then((r) => {
        if (!alive) return;
        const remote = parseDeckGame(r.state, c);
        if (remote) {
          lastSavedRef.current = JSON.stringify(remote);
          setGame(remote);
        }
        hydratedRef.current = true;
      })
      .catch(() => {
        if (alive) hydratedRef.current = true;
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck]);

  // Persist locally on every change.
  useEffect(() => {
    if (game) localStorage.setItem(deckGameKey(user?.id, deckId), JSON.stringify(game));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // Persist to the account (debounced), after hydration, skipped for the demo.
  useEffect(() => {
    if (!game || !hydratedRef.current || readOnly) return;
    const json = JSON.stringify(game);
    if (json === lastSavedRef.current) return;
    const id = setTimeout(() => {
      lastSavedRef.current = json;
      void api.saveStudyDeckGame(deckId, json).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, readOnly]);

  // Once the deck is ready, restore the saved session — the practice toggle and
  // the exact question the learner was on (in its answered/unanswered state), so
  // leaving the tab or relaunching lands them right back on it. Falls back to
  // drawing a fresh question when there's nothing to restore. Runs once.
  useEffect(() => {
    if (!deck || viewReady) return;
    const sess = loadDeckSession(user?.id, deckId);
    setPractice(sess.practice);
    const cur = sess.current;
    const q = cur ? deck.questions.find((x) => x.seq === cur.seq) : null;
    if (cur && q) {
      setCurrent(q);
      setSelected(cur.selected);
      setRevealed(cur.revealed);
      setOutcome(cur.outcome);
      setSourceGuess(cur.sourceGuess);
      setPracticeAttempt(cur.practiceAttempt);
      // Don't let the restored question resurface immediately in this run.
      poolRef.current = poolRef.current.filter((i) => deck.questions[i]?.seq !== q.seq);
    } else {
      advance();
    }
    setViewReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, viewReady]);

  // Persist the session (practice flag + current question view) on every change,
  // after the restore above has run so it can't overwrite what we just loaded.
  useEffect(() => {
    if (!deck || !viewReady) return;
    saveDeckSession(user?.id, deckId, {
      practice,
      current: current
        ? { seq: current.seq, selected, revealed, outcome, sourceGuess, practiceAttempt }
        : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, viewReady, practice, current, selected, revealed, outcome, sourceGuess, practiceAttempt]);

  // Recolour the Studies workspace to the current level while this game is open,
  // and clear the tint when the player leaves.
  useEffect(() => {
    if (!game) return;
    const lv = overallLevel(game.levelCorrect);
    setStudyTint({ hue: lv.main.hue, sat: lv.main.sat });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.levelCorrect]);
  useEffect(() => () => setStudyTint(null), []);

  function advance(d: TeamDeckDetail | null = deck) {
    setFixOpen(false);
    setFixDeleteConfirm(false);
    setFixError(null);
    setFixNote(null);
    preAnswerRef.current = null;
    if (!d || d.questions.length === 0) {
      setCurrent(null);
      return;
    }
    if (poolRef.current.length === 0) poolRef.current = shuffledIndices(d.questions.length);
    const idx = poolRef.current.pop()!;
    setCurrent(d.questions[idx]);
    setSelected(null);
    setRevealed(false);
    setOutcome(null);
    setLevelEvent(null);
    setScoreChange(null);
    setSourceGuess(null);
    setPracticeAttempt(false);
  }

  // Record one answer against `base` and update the score-delta / level-up
  // display to match. Shared by the first submit and by an answer-key
  // correction (which replays from the pre-answer baseline).
  function applyRecordedAnswer(base: DeckGameState, topic: string, correct: boolean) {
    const prevScore = deckLifetimeAccuracy(base);
    const prevOv = overallLevel(base.levelCorrect);
    const next = recordDeckAnswer(base, topic, correct);
    const newScore = deckLifetimeAccuracy(next);
    const nextOv = overallLevel(next.levelCorrect);
    setScoreChange(round1((newScore ?? 0) - (prevScore ?? (newScore ?? 0))));
    setLevelEvent(
      nextOv.step > prevOv.step
        ? {
            mainUp: nextOv.mainIndex > prevOv.mainIndex,
            emoji: nextOv.main.emoji,
            name: nextOv.main.name,
            stars: nextOv.stars,
            bg: nextOv.bg,
            text: nextOv.text,
          }
        : null,
    );
    setGame(next);
  }

  function submit(label: Letter | null) {
    if (!current || revealed || !game) return;
    const correct = label === current.answer;
    setSelected(label);
    setRevealed(true);
    setOutcome(correct);
    // Practice mode: reveal + explain, but don't record — score, level, streak,
    // and the leaderboard stay untouched.
    if (practice) {
      setPracticeAttempt(true);
      setScoreChange(null);
      setLevelEvent(null);
      preAnswerRef.current = null;
      return;
    }
    setPracticeAttempt(false);
    // Snapshot the state before this attempt is recorded, so a later answer-key
    // fix can replay it exactly (recordDeckAnswer is pure).
    preAnswerRef.current = { game, topic: current.topic };
    applyRecordedAnswer(game, current.topic, correct);
  }

  // A short preamble folded into the first tutor turn, so the back-and-forth
  // chat about a just-answered question stays on-topic: the question, its
  // options, the correct answer, what the learner picked, and any explanation.
  function tutorContextFor(q: DeckQuestion): string {
    const optionsText = q.options.map((o) => `${o.label}) ${o.text}`).join('\n');
    const chosenText = selected
      ? `${selected}) ${q.options.find((o) => o.label === selected)?.text ?? ''}`
      : 'no answer (I skipped it)';
    const correctText = `${q.answer}) ${q.options.find((o) => o.label === q.answer)?.text ?? ''}`;
    return [
      `I'm studying the "${deck?.name ?? ''}" study game.`,
      q.topic ? `Topic: ${q.topic}.` : '',
      `Question: ${q.stem}`,
      `Options:\n${optionsText}`,
      `The correct answer is ${correctText}.`,
      `I answered ${chosenText}, which was ${outcome ? 'correct' : 'incorrect'}.`,
      q.explanation ? `Explanation given: ${q.explanation}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Map a loaded question back to the edit payload shape the API expects when
  // replacing the deck's question set.
  function toQuestionInput(q: DeckQuestion) {
    return {
      topic: q.topic,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      sourceName: q.sourceName,
    };
  }

  function fixErrorMessage(e: unknown): string {
    if (e instanceof ApiError && e.status === 403) return 'Only the game’s creator or an admin can edit it.';
    return 'Could not save the change — try again.';
  }

  // Correct a flawed answer key on the current question. Sends the whole
  // question set with just this one's answer changed; the deck is re-scoped and
  // re-sequenced server-side, so future rounds (and everyone's) see the fix.
  async function changeAnswer(newAnswer: Letter) {
    if (!deck || !current || fixSaving) return;
    if (newAnswer === current.answer) return;
    setFixSaving(true);
    setFixError(null);
    setFixNote(null);
    try {
      const questions = deck.questions.map((q) => (q.seq === current.seq ? { ...q, answer: newAnswer } : q));
      const { deck: updated } = await api.updateStudyDeck(deckId, { questions: questions.map(toQuestionInput) });
      setDeck(updated);
      // Reflect the corrected key in the open reveal: move the ✓ and re-mark
      // this attempt against the new answer.
      setCurrent((c) => (c ? { ...c, answer: newAnswer } : c));
      const nowCorrect = selected === newAnswer;
      setOutcome(nowCorrect);
      // Re-score this attempt against the corrected key: replay from the
      // pre-answer baseline so a fixed miss is un-counted (and a fixed hit
      // dropped) — streak, level, and lifetime accuracy all stay exact.
      const base = preAnswerRef.current;
      if (base) applyRecordedAnswer(base.game, base.topic, nowCorrect);
      setFixNote(
        nowCorrect && !practiceAttempt
          ? `Correct answer set to ${newAnswer} — your answer now counts as correct.`
          : `Correct answer set to ${newAnswer} — saved for your team.`,
      );
    } catch (e) {
      setFixError(fixErrorMessage(e));
    } finally {
      setFixSaving(false);
    }
  }

  // Remove the current question from the deck entirely (for a flawed/duplicate
  // question). Refuses on the last remaining question — deleting the whole game
  // is done from Study Creation. On success, moves on to the next question.
  async function deleteCurrentQuestion() {
    if (!deck || !current || fixSaving) return;
    if (deck.questions.length <= 1) {
      setFixDeleteConfirm(false);
      setFixError('This is the only question — delete the whole game from Study Creation instead.');
      return;
    }
    setFixSaving(true);
    setFixError(null);
    setFixNote(null);
    try {
      const remaining = deck.questions.filter((q) => q.seq !== current.seq);
      const { deck: updated } = await api.updateStudyDeck(deckId, { questions: remaining.map(toQuestionInput) });
      setDeck(updated);
      // The index pool referenced the old length; rebuild it for the new set.
      poolRef.current = [];
      advance(updated);
    } catch (e) {
      setFixError(fixErrorMessage(e));
    } finally {
      setFixSaving(false);
    }
  }

  function resetProgress() {
    if (!game) return;
    if (!readOnly && game.totalAttempted > 0) {
      void api.archiveStudyDeckGame(deckId, JSON.stringify(game)).catch(() => {});
    }
    const carriedBest = Math.max(game.allTimeBestStep, game.bestStep);
    setGame({ ...emptyDeckGame(cats), allTimeBestStep: carriedBest });
    poolRef.current = deck ? shuffledIndices(deck.questions.length) : [];
    setResetConfirm(false);
    advance();
  }

  const backBtn = (
    <button onClick={onBack} style={ghostBtn(theme)}>
      ‹ All study games
    </button>
  );

  if (loadError) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          <EditableText id="studygameplay.load_error" text="Couldn’t load this study game." />
        </div>
      </div>
    );
  }
  if (!deck || !game) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          <EditableText id="studygameplay.loading" text="Loading…" />
        </div>
      </div>
    );
  }

  const ov = overallLevel(game.levelCorrect);
  const streakMult = streakMultiplier(game.streak);
  // The distinct source games (set on a combined game), for the guess mode.
  const sources = sourcesForDeck(deck);
  // Who may fix a question inline — mirrors the server's deck-edit rule: the
  // game's creator, or an admin/founder. Never the read-only demo.
  const canEdit = !readOnly && !!user && (isAdmin(user.roles) || (deck.createdBy != null && deck.createdBy === user.id));

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {backBtn}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{deck.name}</h2>
        </div>
        <p style={{ margin: '5px 0 0', fontSize: 12, color: muted }}>
          {deck.questionCount} questions · level up as you answer correctly · {STREAK_STEP} in a row for a multiplier
        </p>
      </div>
      <div style={{ display: 'inline-flex', border: `1px solid ${theme.navBorder}`, borderRadius: 999, overflow: 'hidden' }}>
        {(['quiz', 'leaderboard'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: '7px 15px',
              cursor: 'pointer',
              border: 'none',
              background: view === v ? theme.accent : 'transparent',
              color: view === v ? theme.accentText : muted,
            }}
          >
            {v === 'quiz' ? 'Quiz' : 'Leaderboard'}
          </button>
        ))}
      </div>
    </div>
  );

  if (view === 'leaderboard') {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <DeckLeaderboard theme={theme} deckId={deckId} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {header}

      {/* Level + streak HUD */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: ov.bg, color: ov.text, borderRadius: 12, padding: '7px 12px' }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{ov.main.emoji}</span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Lv {ov.mainIndex + 1} · {ov.main.name}</div>
            <div style={{ fontSize: 13, letterSpacing: '1.5px' }}>{ov.stars}</div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: streakMult > 1 ? 'linear-gradient(135deg,rgba(255,122,61,.22),rgba(224,162,58,.14))' : 'rgba(255,255,255,.04)',
            border: `1px solid ${streakMult > 1 ? FLAME : theme.navBorder}`,
            borderRadius: 12,
            padding: '7px 12px',
          }}
        >
          <span style={{ fontSize: 20, filter: game.streak > 0 ? 'none' : 'grayscale(1)', opacity: game.streak > 0 ? 1 : 0.5 }}>🔥</span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: streakMult > 1 ? FLAME : '#fff' }}>
              {streakMult > 1 ? `×${streakMult} multiplier` : 'Streak'}
            </div>
            <div style={{ fontSize: 10.5, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>{game.streak} in a row</div>
          </div>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
            color: practice ? theme.accent : muted,
            border: `1px solid ${practice ? theme.accent : theme.navBorder}`,
            background: practice ? 'rgba(255,255,255,.07)' : 'transparent',
            borderRadius: 999,
            padding: '6px 12px',
          }}
        >
          <input
            type="checkbox"
            checked={practice}
            onChange={(e) => setPractice(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: theme.accent }}
          />
          <EditableText id="studygameplay.practice_toggle" text="Practice mode" />
        </label>
        {sources.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: muted, cursor: 'pointer', marginLeft: sources.length > 0 && !readOnly ? 0 : 'auto' }}>
            <input type="checkbox" checked={guessMode} onChange={(e) => setGuessMode(e.target.checked)} style={{ width: 15, height: 15, accentColor: theme.accent }} />
            <EditableText id="studygameplay.guess_source" text="Guess the source" />
          </label>
        )}
        {!readOnly && (
          <button onClick={() => setResetConfirm(true)} style={{ ...ghostBtn(theme), marginLeft: 'auto', minHeight: 36 }}>
            <EditableText id="studygameplay.reset" text="Reset" />
          </button>
        )}
      </div>

      {/* Lifetime + session progress bars, with the learner's own thresholds. */}
      <div style={{ ...card(theme), marginBottom: 14, padding: '14px 16px' }}>
        <StudyProgressBars theme={theme} game={game} prefs={prefs} onPrefsChange={updatePrefs} />
      </div>

      {practice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,.05)',
            border: `1px dashed ${theme.accent}`,
            borderRadius: 12,
            padding: '9px 13px',
            marginBottom: 14,
            fontSize: 12,
            color: '#e7e0ff',
          }}
        >
          <span style={{ fontSize: 15 }}>🎯</span>
          <EditableText
            id="studygameplay.practice_banner"
            text="Practice mode is on — answers won’t affect your score, level, streak, or the leaderboard."
          />
        </div>
      )}

      {resetConfirm && (
        <div style={{ ...card(theme), marginBottom: 14, borderColor: '#e0a23a' }}>
          <div style={{ fontSize: 13, color: '#e7e0ff', marginBottom: 10 }}>
            <EditableText id="studygameplay.reset_confirm" text="Reset your progress on this study game? Your current run is saved to the leaderboard first." />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetProgress} style={{ ...primaryBtn(theme, accentGrad), minHeight: 38 }}>
              <EditableText id="studygameplay.reset_save" text="Save run & reset" />
            </button>
            <button onClick={() => setResetConfirm(false)} style={{ ...ghostBtn(theme), minHeight: 38 }}>
              <EditableText id="studygameplay.reset_cancel" text="Cancel" />
            </button>
          </div>
        </div>
      )}

      {levelEvent && (
        <div
          style={{
            background: levelEvent.mainUp ? 'linear-gradient(90deg,rgba(224,162,58,.25),rgba(224,162,58,.12))' : 'rgba(53,196,123,.14)',
            border: `1px solid ${levelEvent.mainUp ? '#e0a23a' : GREEN}`,
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 14,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: levelEvent.mainUp ? '#e0a23a' : GREEN }}>
            🎉 {levelEvent.mainUp ? 'LEVEL UP!' : 'SUB-LEVEL UP!'}{' '}
          </span>
          <span style={{ background: levelEvent.bg, color: levelEvent.text, borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>
            {levelEvent.emoji} {levelEvent.name}
          </span>{' '}
          <span style={{ color: '#f5c451', letterSpacing: '1px' }}>{levelEvent.stars}</span>
        </div>
      )}

      {!current ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          <EditableText id="studygameplay.no_questions" text="This study game has no questions yet." />
        </div>
      ) : (
        <div style={card(theme)}>
          <div style={{ fontSize: 10.5, color: muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {current.topic}
          </div>
          <div style={{ fontSize: isPhone ? 15 : 16, lineHeight: 1.55, color: '#fff', fontWeight: 600, marginBottom: 16 }}>
            {current.stem}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {current.options.map((o) => {
              const isCorrect = o.label === current.answer;
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
              } else if (isChosen) {
                border = theme.accent;
                bg = 'rgba(255,255,255,.10)';
              }
              return (
                <button
                  key={o.label}
                  onClick={() => !revealed && setSelected(o.label)}
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

          {!revealed ? (
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => selected && submit(selected)}
                disabled={selected == null}
                style={{ ...primaryBtn(theme, accentGrad), flex: 1, minWidth: 160, opacity: selected == null ? 0.6 : 1 }}
              >
                {selected == null ? <EditableText id="studygameplay.select_answer" text="Select an answer" /> : `Confirm ${selected}`}
              </button>
              <button onClick={() => submit(null)} style={{ ...ghostBtn(theme), borderStyle: 'dashed' }}>
                <EditableText id="studygameplay.dont_know" text="I Don’t Know" />
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: outcome ? GREEN : RED, marginBottom: 6 }}>
                {outcome ? <EditableText id="studygameplay.correct" text="Correct" /> : <EditableText id="studygameplay.incorrect" text="Incorrect" />}
                {practiceAttempt ? (
                  <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 8, color: muted }}>
                    <EditableText id="studygameplay.practice_not_counted" text="🎯 Practice — not counted" />
                  </span>
                ) : (
                  scoreChange != null && (
                    <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 8, color: muted }}>
                      Lifetime{' '}
                      <span style={{ color: scoreChange >= 0 ? GREEN : RED, fontWeight: 700 }}>
                        {scoreChange >= 0 ? '+' : ''}
                        {scoreChange.toFixed(1)}%
                      </span>
                    </span>
                  )
                )}
              </div>
              {current.explanation && (
                <div style={{ fontSize: 12.5, color: '#d7ccff', lineHeight: 1.55, marginBottom: 12 }}>{current.explanation}</div>
              )}

              {/* Guess the source: on a combined game with sources, either ask the
                  learner which game this came from, or just show it. */}
              {current.sourceName && (
                guessMode ? (
                  sourceGuess == null ? (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>Which game is this question from?</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {sources.map((s) => (
                          <button key={s} onClick={() => setSourceGuess(s)} style={{ ...ghostBtn(theme), minHeight: 34, padding: '6px 11px' }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, marginBottom: 12, color: sourceGuess === current.sourceName ? GREEN : RED }}>
                      {sourceGuess === current.sourceName ? '✓ Right' : '✗ Not quite'} — from <strong style={{ color: '#fff' }}>{current.sourceName}</strong>
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 11.5, color: muted, marginBottom: 12 }}>From <strong style={{ color: '#cdbcff' }}>{current.sourceName}</strong></div>
                )
              )}

              {/* Talk it through: a back-and-forth VTS AI tutor chat about this
                  exact question, seeded with the full context and the learner's
                  answer. Keyed on the question so each one starts fresh. */}
              <div style={{ marginBottom: 16, paddingTop: 14, borderTop: `1px solid ${theme.navBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, marginBottom: 10 }}>
                  <EditableText id="studygameplay.tutor_heading" text="Talk it through with VTS AI" />
                </div>
                <TutorChat
                  key={current.seq}
                  theme={theme}
                  isPhone={isPhone}
                  context={tutorContextFor(current)}
                  seedLabel="💡 Break this down"
                  seedPrompt="Walk me through this question in plain, simple terms — why the correct answer is right, and why the other options are wrong. If I picked the wrong one, explain what I likely misunderstood."
                  placeholder="Ask about this question…"
                />
              </div>

              {/* Fix this question: creator/admin-only inline correction — change
                  the answer key if it's wrong, or delete a flawed question. */}
              {canEdit && (
                <div style={{ marginBottom: 16 }}>
                  {!fixOpen ? (
                    <button
                      onClick={() => {
                        setFixOpen(true);
                        setFixError(null);
                        setFixNote(null);
                      }}
                      style={{ ...ghostBtn(theme), minHeight: 34, fontSize: 12 }}
                    >
                      <EditableText id="studygameplay.fix_open" text="✎ Something wrong? Fix this question" />
                    </button>
                  ) : (
                    <div style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: 14, background: 'rgba(255,255,255,.03)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, marginBottom: 10 }}>
                        <EditableText id="studygameplay.fix_heading" text="Fix this question" />
                      </div>

                      {/* Change the correct answer */}
                      <div style={{ fontSize: 12, color: muted, marginBottom: 7 }}>
                        <EditableText id="studygameplay.fix_answer_label" text="Correct answer — tap the right one to change it:" />
                      </div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
                        {current.options.map((o) => {
                          const isCur = o.label === current.answer;
                          return (
                            <button
                              key={o.label}
                              disabled={fixSaving || isCur}
                              onClick={() => void changeAnswer(o.label)}
                              title={o.text}
                              style={{
                                ...ghostBtn(theme),
                                minHeight: 34,
                                padding: '6px 13px',
                                cursor: fixSaving || isCur ? 'default' : 'pointer',
                                border: `1px solid ${isCur ? GREEN : theme.navBorder}`,
                                background: isCur ? 'rgba(53,196,123,.14)' : 'rgba(255,255,255,.05)',
                                color: isCur ? GREEN : '#cdbcff',
                                fontWeight: 700,
                              }}
                            >
                              {o.label}
                              {isCur ? ' ✓' : ''}
                            </button>
                          );
                        })}
                      </div>

                      {/* Delete the question */}
                      {!fixDeleteConfirm ? (
                        <button
                          onClick={() => setFixDeleteConfirm(true)}
                          disabled={fixSaving}
                          style={{ ...ghostBtn(theme), minHeight: 34, borderColor: RED, color: '#ffb4ab' }}
                        >
                          <EditableText id="studygameplay.fix_delete" text="Delete this question" />
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: '#ffb4ab' }}>
                            <EditableText id="studygameplay.fix_delete_confirm" text="Delete this question for the whole team?" />
                          </span>
                          <button
                            onClick={() => void deleteCurrentQuestion()}
                            disabled={fixSaving}
                            style={{ ...primaryBtn(theme, accentGrad), minHeight: 34, padding: '7px 14px', background: RED }}
                          >
                            <EditableText id="studygameplay.fix_delete_yes" text="Delete" />
                          </button>
                          <button
                            onClick={() => setFixDeleteConfirm(false)}
                            disabled={fixSaving}
                            style={{ ...ghostBtn(theme), minHeight: 34 }}
                          >
                            <EditableText id="studygameplay.fix_delete_no" text="Cancel" />
                          </button>
                        </div>
                      )}

                      {fixError && <div style={{ marginTop: 11, fontSize: 12, color: '#ffb4ab' }}>{fixError}</div>}
                      {fixNote && <div style={{ marginTop: 11, fontSize: 12, color: GREEN }}>{fixNote}</div>}

                      <div style={{ marginTop: 14 }}>
                        <button
                          onClick={() => {
                            setFixOpen(false);
                            setFixDeleteConfirm(false);
                            setFixError(null);
                            setFixNote(null);
                          }}
                          disabled={fixSaving}
                          style={{ ...ghostBtn(theme), minHeight: 32, fontSize: 12 }}
                        >
                          <EditableText id="studygameplay.fix_done" text="Done" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button onClick={() => advance()} style={primaryBtn(theme, accentGrad)}>
                <EditableText id="studygameplay.next_question" text="Next question ›" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeckLeaderboard({ theme, deckId }: { theme: Theme; deckId: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .studyDeckLeaderboard(deckId)
      .then((r) => alive && setEntries(r.entries))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [deckId]);

  if (error) return <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}><EditableText id="studygameplay.lb_error" text="Couldn’t load the leaderboard." /></div>;
  if (!entries) return <div style={{ ...card(theme), color: muted, fontSize: 13 }}><EditableText id="studygameplay.lb_loading" text="Loading…" /></div>;
  if (entries.length === 0)
    return <div style={{ ...card(theme), color: muted, fontSize: 13 }}><EditableText id="studygameplay.lb_empty" text="No scores yet — be the first to play." /></div>;

  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map((e, i) => {
          const lvl = levelAtStep(e.bestStep);
          return (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 11px',
                borderRadius: 10,
                background: e.isMe ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
                border: `1px solid ${e.isMe ? theme.accent : theme.navBorder}`,
              }}
            >
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: muted, width: 22 }}>{i + 1}</span>
              <span style={{ background: lvl.bg, color: lvl.text, borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700, flex: 'none' }}>
                {lvl.main.emoji} Lv {lvl.mainIndex + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name}
                {e.archived && <span style={{ color: muted, fontWeight: 400, fontSize: 11 }}> · past run</span>}
              </span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color: theme.accent }}>
                {e.score != null ? `${e.score.toFixed(1)}%` : '—'}
              </span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: muted, width: 70, textAlign: 'right' }}>
                {e.correct}/{e.attempted}
              </span>
            </div>
          );
        })}
      </div>
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
