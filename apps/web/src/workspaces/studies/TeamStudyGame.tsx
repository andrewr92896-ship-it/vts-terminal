import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { DeckQuestion, LeaderboardEntry, TeamDeckDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import { isAdmin } from '../../auth/access';
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
import { SettingField, StudyProgressBars } from './StudyProgress';
import { ScoreNote, StudyDisclaimer } from './StudyDisclaimer';
import { clampRapidSeconds, loadStudyPrefs, saveStudyPrefs, type StudyPrefs } from './studyPrefs';
import { loadDeckSession, saveDeckSession } from './studySession';
import { TutorChat } from './TutorChat';
import { buildCategoryReport, categorySummary, CategoryBreakdown } from './CategoryBreakdown';
import {
  buildDraw,
  canDrawByBlueprint,
  clearDraw,
  drawNext,
  dropSeq,
  loadDraw,
  passRemaining,
  passSize,
  reconcileDraw,
  saveDraw,
  serializeDraw,
  type DrawState,
} from './deckDraw';

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

// A blueprint draw falls back to an even pass by itself when the deck's
// questions carry no weighted category, so either mode is safe to ask for on
// any game.
const drawMode = (blueprint: boolean) => (blueprint ? 'blueprint' : 'even');

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
  // Two kinds of game carry a board: a built-in one, ranked publicly across
  // every copy on the install, and a package-backed one, ranked among the
  // package's own audience. A legacy user-made game has none. The server states
  // which this is and is the enforcer — it 404s the endpoint for anything else.
  const hasLeaderboard = !!deck?.hasLeaderboard;

  useEffect(() => {
    if (!hasLeaderboard && view === 'leaderboard') setView('quiz');
  }, [hasLeaderboard, view]);

  const [game, setGame] = useState<DeckGameState | null>(null);
  // How the next question is picked (see deckDraw.ts). The pass it holds is
  // SAVED, so leaving the game and coming back carries on through the deck
  // instead of reshuffling it and starting again — which is what was serving
  // the same questions over and over while whole stretches of a big deck went
  // unasked.
  const drawRef = useRef<DrawState | null>(null);
  const [current, setCurrent] = useState<DeckQuestion | null>(null);
  // What is on screen, readable from an async callback that was created before
  // it was drawn (the account reconcile below).
  const currentRef = useRef<DeckQuestion | null>(null);
  currentRef.current = current;
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

  // Rapid fire: pressing an option submits it — there is no confirm step — and
  // the next question is drawn once the reveal has been on screen for the
  // learner's chosen number of seconds. There is deliberately NO limit on how
  // long they may take to answer: the timer is only ever the gap between seeing
  // the result and being handed the next question. Persisted per deck, like
  // practice mode; how long the reveal lasts is a personal pref (studyPrefs).
  const [rapidFire, setRapidFire] = useState(false);
  // Draw questions in the proportions this game's category weights describe,
  // rather than evenly across the deck. Per deck, persisted with the rest of
  // the session; only offered on a game that carries a blueprint.
  const [blueprintDraw, setBlueprintDraw] = useState(false);
  // Where the current pass is up to: how many questions are still to be asked
  // before anything repeats, out of how many the pass holds. Read off the draw
  // rather than counted from the score — the score counts answers, and a pass
  // is about questions.
  const [pass, setPass] = useState<{ left: number; of: number } | null>(null);
  // Seconds left on the open reveal, or null when nothing is counting.
  const [countdown, setCountdown] = useState<number | null>(null);
  const counting = countdown != null;
  // True once the learner has engaged with THIS reveal — opened the tutor or the
  // fix editor, pressed "Stay on this", or left the tab. Rapid fire is a
  // convenience for the ordinary case; the moment somebody is reading or typing,
  // the screen must not be taken away from them. Cleared by advance().
  const [countdownHeld, setCountdownHeld] = useState(false);
  // In "guess the source" mode the reveal still owes the learner a question, so
  // the countdown waits for their guess rather than answering it for them.
  const guessOwed = guessMode && !!current?.sourceName && sourceGuess == null;

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

  // Pick up where this deck left off, in the mode asked for. Every rebuild goes
  // through here rather than through `buildDraw`, so there is one place that
  // decides what "carry on" means.
  function continueDraw(d: TeamDeckDetail, blueprint: boolean): DrawState {
    return loadDraw(user?.id, deckId, d.questions, d.categories, d.categoryWeights, drawMode(blueprint));
  }

  // Keep the pass. The device copy is written at once — the tab can be closed
  // or the app killed from the switcher, and where the learner is up to has to
  // survive that — while the account copy is debounced, since it is what
  // carries between devices rather than what makes the next question right.
  // The demo writes to neither: its run is canned and every write is refused.
  const drawSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function keepDraw(state: DrawState) {
    saveDraw(user?.id, deckId, state);
    setPass({ left: passRemaining(state), of: passSize(state) });
    if (readOnly) return;
    const pass = serializeDraw(state);
    if (drawSaveRef.current) clearTimeout(drawSaveRef.current);
    drawSaveRef.current = setTimeout(() => {
      void api.saveStudyDeckDraw(deckId, pass).catch(() => {});
    }, 800);
  }
  useEffect(() => () => {
    if (drawSaveRef.current) clearTimeout(drawSaveRef.current);
  }, []);

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
        // Read the saved draw mode here rather than waiting for the restore
        // effect below, so the very first question already follows it.
        drawRef.current = loadDraw(
          user?.id,
          deckId,
          d.questions,
          d.categories,
          d.categoryWeights,
          drawMode(loadDeckSession(user?.id, deckId).blueprintDraw),
        );
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

  // Fold in the account's copy of the pass once it arrives, so a deck studied on
  // a phone and a laptop is worked through between them rather than twice.
  //
  // It merges rather than replaces: two remainders intersect to the union of
  // what the two devices have asked (see reconcileDraw). It also runs AFTER the
  // local pass has already produced a question, deliberately — the first
  // question must not wait on the network — so whatever is on screen is dropped
  // from the merged pass rather than being left to come round again.
  useEffect(() => {
    if (!deck) return;
    let alive = true;
    api
      .studyDeckDraw(deckId)
      .then(({ pass }) => {
        if (!alive || !pass || !drawRef.current) return;
        drawRef.current = reconcileDraw(drawRef.current, pass);
        const onScreen = currentRef.current;
        if (onScreen) dropSeq(drawRef.current, onScreen.seq);
        keepDraw(drawRef.current);
      })
      .catch(() => {
        /* offline or refused — the device copy carries on alone */
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
    setRapidFire(sess.rapidFire);
    setBlueprintDraw(sess.blueprintDraw);
    const cur = sess.current;
    const q = cur ? deck.questions.find((x) => x.seq === cur.seq) : null;
    if (cur && q) {
      setCurrent(q);
      setSelected(cur.selected);
      setRevealed(cur.revealed);
      setOutcome(cur.outcome);
      setSourceGuess(cur.sourceGuess);
      setPracticeAttempt(cur.practiceAttempt);
      // Coming back to an answer that was already on screen must not start a
      // countdown on it. They left mid-reveal; returning is not the same act as
      // having just answered, and the point of the timer is time to read.
      setCountdownHeld(cur.revealed);
      // Don't let the restored question resurface immediately in this run.
      if (drawRef.current) {
        dropSeq(drawRef.current, q.seq);
        keepDraw(drawRef.current);
      }
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
      rapidFire,
      blueprintDraw,
      current: current
        ? { seq: current.seq, selected, revealed, outcome, sourceGuess, practiceAttempt }
        : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck, viewReady, practice, rapidFire, blueprintDraw, current, selected, revealed, outcome, sourceGuess, practiceAttempt]);

  // One interval drives the rapid-fire countdown on the open reveal. It restarts
  // whenever the question or the chosen length changes, and stops outright the
  // moment any of the conditions above says it must not run.
  useEffect(() => {
    if (!rapidFire || !revealed || countdownHeld || guessOwed) {
      setCountdown(null);
      return;
    }
    setCountdown(prefs.rapidSeconds);
    const id = setInterval(() => setCountdown((s) => (s == null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapidFire, revealed, countdownHeld, guessOwed, prefs.rapidSeconds, current?.seq]);

  // Drawing the next question is its own effect rather than something the
  // interval callback does, so the advance happens in render order — advance()
  // clears `revealed`, which is what tears the interval above down.
  useEffect(() => {
    if (countdown === 0) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  // A backgrounded tab keeps ticking, so a learner who glances away would come
  // back to a question they never saw the answer to. Hold the countdown instead
  // — the reveal is still on screen when they return.
  useEffect(() => {
    if (!counting) return;
    const onHide = () => {
      if (document.hidden) setCountdownHeld(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [counting]);

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
    setCountdown(null);
    setCountdownHeld(false);
    if (!d || d.questions.length === 0) {
      setCurrent(null);
      return;
    }
    if (!drawRef.current || drawRef.current.all.length !== d.questions.length) {
      drawRef.current = continueDraw(d, blueprintDraw);
    }
    const seq = drawNext(drawRef.current);
    const next = seq == null ? null : d.questions.find((q) => q.seq === seq) ?? null;
    if (!next) {
      setCurrent(null);
      return;
    }
    keepDraw(drawRef.current);
    setCurrent(next);
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
          : `Correct answer set to ${newAnswer} — saved for everyone who plays it.`,
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
      // The draw referenced the old question set; rebuild it against the new
      // one. The saved pass carries over — the deleted question drops out of it
      // rather than taking the rest of the pass with it.
      drawRef.current = continueDraw(updated, blueprintDraw);
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
    // Resetting progress starts the deck again, so the pass starts again too —
    // on every device, which is why the fresh one is written to the account
    // rather than only cleared here.
    clearDraw(user?.id, deckId);
    drawRef.current = deck
      ? buildDraw(deck.questions, deck.categories, deck.categoryWeights, drawMode(blueprintDraw))
      : null;
    if (drawRef.current) keepDraw(drawRef.current);
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
          {"Couldn’t load this study game."}
        </div>
      </div>
    );
  }
  if (!deck || !game) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          {"Loading…"}
        </div>
      </div>
    );
  }

  const ov = overallLevel(game.levelCorrect);
  const streakMult = streakMultiplier(game.streak);
  // The distinct source games (set on a combined game), for the guess mode.
  const sources = sourcesForDeck(deck);
  // How the learner is doing area by area, and what mix of the practice each
  // area has had. The same report the Progress screen draws, from the same
  // function, so the two screens cannot disagree about it.
  const report = buildCategoryReport(deck.categories, deck.categoryWeights, game);
  const reportLine = categorySummary(report);
  const canBlueprint = canDrawByBlueprint(deck.questions, deck.categories, deck.categoryWeights);
  // Who may fix a question inline — mirrors the server's deck-edit rule: the
  // game's creator, or an admin/founder. Never the read-only demo.
  const canEdit = !readOnly && !!user && (isAdmin(user.roles) || (deck.createdBy != null && deck.createdBy === user.id));

  // How this game is played, rendered at the top of the Settings panel behind
  // the cog on the Progress card — the one place a study game is set up. Kept in
  // the panel's own `SettingField` rows so it reads as one panel with the
  // progress-bar prefs underneath, rather than as two stacked ones.
  const playSettings = (
    <>
      <SettingField label="Practice mode">
        <input
          type="checkbox"
          checked={practice}
          onChange={(e) => setPractice(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: theme.accent, cursor: 'pointer' }}
        />
      </SettingField>

      <SettingField label="Rapid fire">
        <input
          type="checkbox"
          checked={rapidFire}
          onChange={(e) => {
            setRapidFire(e.target.checked);
            if (!e.target.checked) return;
            // Switching it on while an answer is already on screen takes effect
            // from the next question — it must not start counting down the
            // reveal the learner is in the middle of reading.
            if (revealed) setCountdownHeld(true);
            // Switching it on over a highlighted-but-unsubmitted choice drops
            // the highlight, because the confirm button that would have
            // submitted it has just gone. Left lit, the option reads as answered
            // when nothing has been recorded.
            else setSelected(null);
          }}
          style={{ width: 16, height: 16, accentColor: theme.accent, cursor: 'pointer' }}
        />
      </SettingField>

      {/* Only meaningful with rapid fire on, so it is drawn only then rather
          than sitting there disabled. */}
      {rapidFire && (
        <SettingField label="Show the answer for">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => updatePrefs({ ...prefs, rapidSeconds: clampRapidSeconds(prefs.rapidSeconds - 1) })}
              style={stepBtn(theme)}
              aria-label="Show the answer for less time"
            >
              −
            </button>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: '#fff', minWidth: 34, textAlign: 'center' }}>
              {prefs.rapidSeconds}s
            </span>
            <button
              onClick={() => updatePrefs({ ...prefs, rapidSeconds: clampRapidSeconds(prefs.rapidSeconds + 1) })}
              style={stepBtn(theme)}
              aria-label="Show the answer for longer"
            >
              +
            </button>
          </div>
        </SettingField>
      )}

      {/* Only on a game whose blueprint the deck can actually be drawn to —
          offered anywhere else it would be a switch that changes nothing. */}
      {canBlueprint && (
        <SettingField label="Draw by exam weight">
          <input
            type="checkbox"
            checked={blueprintDraw}
            onChange={(e) => {
              const on = e.target.checked;
              setBlueprintDraw(on);
              // Takes effect from the next question: the one on screen has
              // already been asked, and swapping it out would throw away an
              // answer in progress.
              drawRef.current = continueDraw(deck, on);
              keepDraw(drawRef.current);
            }}
            style={{ width: 16, height: 16, accentColor: theme.accent, cursor: 'pointer' }}
          />
        </SettingField>
      )}

      {/* The demo may not reset — it writes, and its run is canned. */}
      {!readOnly && (
        <SettingField label="Progress on this game">
          <button onClick={() => setResetConfirm(true)} style={{ ...ghostBtn(theme), minHeight: 34, fontSize: 12 }}>
            {"Reset"}
          </button>
        </SettingField>
      )}
    </>
  );

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
      {/* Two kinds of game have a board — a built-in one, public across every
          account, and a package-backed one, among the package's own audience.
          A legacy user-made game has none, so the tab is hidden rather than
          opening on an empty board that reads as broken. */}
      <div
        style={{
          display: hasLeaderboard ? 'inline-flex' : 'none',
          border: `1px solid ${theme.navBorder}`,
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
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
        {/* The one place a study percentage could be read as a claim about
            investment ability, so the correction is drawn here and nowhere
            else. */}
        <ScoreNote theme={theme} />
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
        {sources.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: muted, cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={guessMode} onChange={(e) => setGuessMode(e.target.checked)} style={{ width: 15, height: 15, accentColor: theme.accent }} />
            {"Guess the source"}
          </label>
        )}
      </div>

      {/* Lifetime + session progress bars, with the Settings panel behind the
          cog carrying how the game is played as well as what the bars measure
          against. */}
      <div style={{ ...card(theme), marginBottom: 14, padding: '14px 16px' }}>
        <StudyProgressBars
          theme={theme}
          game={game}
          prefs={prefs}
          onPrefsChange={updatePrefs}
          settingsExtra={playSettings}
        />
        {/* Where the pass is up to. A deck is worked through, not sampled from,
            and this is the reading that says so — it is also the one thing that
            makes an unexpected repeat legible rather than looking like a fault.
            Stated as questions not yet asked, which is true in both draw modes;
            in blueprint mode a heavier area finishes its own pass first. */}
        {pass && pass.of > 0 && (
          <div style={{ fontSize: 11, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
            {pass.left > 0
              ? `${pass.left} of ${pass.of} not yet asked this round`
              : `all ${pass.of} asked — the next question starts a new round`}
          </div>
        )}
      </div>

      {/* How the practice is going area by area, folded away by default so the
          question stays near the top of the screen. The header carries the
          reading itself — the weighted score and the area costing the most —
          so a closed panel still says something rather than only offering to.
          Open or closed is remembered, since somebody who wants the detail
          wants it every time. */}
      {report.rows.length > 0 && (
        <div style={{ ...card(theme), marginBottom: 14, padding: '12px 16px' }}>
          <button
            onClick={() => updatePrefs({ ...prefs, categoriesOpen: !prefs.categoriesOpen })}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              minHeight: 34,
              color: 'inherit',
            }}
            aria-expanded={prefs.categoriesOpen}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent }}>
              {"By category"}
            </span>
            {reportLine && (
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {reportLine}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: muted }}>{prefs.categoriesOpen ? '▴' : '▾'}</span>
          </button>
          {prefs.categoriesOpen && (
            <div style={{ marginTop: 12 }}>
              <CategoryBreakdown theme={theme} report={report} title={report.weighted ? 'Points of 100' : 'Accuracy by topic'} />
            </div>
          )}
        </div>
      )}

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
          {"Practice mode is on — answers won’t affect your score, level, streak, or the leaderboard."}
        </div>
      )}

      {resetConfirm && (
        <div style={{ ...card(theme), marginBottom: 14, borderColor: '#e0a23a' }}>
          <div style={{ fontSize: 13, color: '#e7e0ff', marginBottom: 10 }}>
            {"Reset your progress on this study game? Your current run is saved to the leaderboard first."}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetProgress} style={{ ...primaryBtn(theme, accentGrad), minHeight: 38 }}>
              {"Save run & reset"}
            </button>
            <button onClick={() => setResetConfirm(false)} style={{ ...ghostBtn(theme), minHeight: 38 }}>
              {"Cancel"}
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
          {"This study game has no questions yet."}
        </div>
      ) : (
        <div style={card(theme)}>
          {/* The topic, and — since the toggle itself now lives behind the
              Settings cog — whether rapid fire is on. Without it the only sign
              before answering is the confirm button being absent, which says
              nothing on its own. */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 10.5, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {current.topic}
            </div>
            {rapidFire && (
              <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                {"Rapid fire mode enabled"}
              </div>
            )}
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
                  onClick={() => {
                    if (revealed) return;
                    // Rapid fire: the press IS the answer — no confirm step.
                    if (rapidFire) submit(o.label);
                    else setSelected(o.label);
                  }}
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
              {/* No confirm button in rapid fire — the option press submitted it
                  already. "I Don’t Know" stays either way: it is one press and
                  the only way to reveal an answer you can't attempt. */}
              {!rapidFire && (
                <button
                  onClick={() => selected && submit(selected)}
                  disabled={selected == null}
                  style={{ ...primaryBtn(theme, accentGrad), flex: 1, minWidth: 160, opacity: selected == null ? 0.6 : 1 }}
                >
                  {selected == null ? "Select an answer" : `Confirm ${selected}`}
                </button>
              )}
              <button
                onClick={() => submit(null)}
                style={{ ...ghostBtn(theme), borderStyle: 'dashed', ...(rapidFire ? { flex: 1, minWidth: 160 } : null) }}
              >
                {"I Don’t Know"}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: outcome ? GREEN : RED, marginBottom: 6 }}>
                {outcome ? "Correct" : "Incorrect"}
                {practiceAttempt ? (
                  <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 8, color: muted }}>
                    {"🎯 Practice — not counted"}
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
                  {"Talk it through with VTS AI"}
                </div>
                <TutorChat
                  key={current.seq}
                  theme={theme}
                  isPhone={isPhone}
                  context={tutorContextFor(current)}
                  seedLabel="💡 Break this down"
                  seedPrompt="Walk me through this question in plain, simple terms — why the correct answer is right, and why the other options are wrong. If I picked the wrong one, explain what I likely misunderstood."
                  placeholder="Ask about this question…"
                  onActivity={() => setCountdownHeld(true)}
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
                        // Editing a question takes as long as it takes.
                        setCountdownHeld(true);
                      }}
                      style={{ ...ghostBtn(theme), minHeight: 34, fontSize: 12 }}
                    >
                      {"✎ Something wrong? Fix this question"}
                    </button>
                  ) : (
                    <div style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: 14, background: 'rgba(255,255,255,.03)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, marginBottom: 10 }}>
                        {"Fix this question"}
                      </div>

                      {/* Change the correct answer */}
                      <div style={{ fontSize: 12, color: muted, marginBottom: 7 }}>
                        {"Correct answer — tap the right one to change it:"}
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
                          {"Delete this question"}
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: '#ffb4ab' }}>
                            {"Delete this question for everyone who plays it?"}
                          </span>
                          <button
                            onClick={() => void deleteCurrentQuestion()}
                            disabled={fixSaving}
                            style={{ ...primaryBtn(theme, accentGrad), minHeight: 34, padding: '7px 14px', background: RED }}
                          >
                            {"Delete"}
                          </button>
                          <button
                            onClick={() => setFixDeleteConfirm(false)}
                            disabled={fixSaving}
                            style={{ ...ghostBtn(theme), minHeight: 34 }}
                          >
                            {"Cancel"}
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
                          {"Done"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Rapid fire draws the next question on its own, so the wait is
                  shown rather than left to surprise the learner — and "Stay on
                  this" stops it without turning the mode off. */}
              {countdown != null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(countdown / Math.max(1, prefs.rapidSeconds)) * 100}%`,
                        background: accentGrad,
                        transition: 'width 1s linear',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => advance()} style={{ ...primaryBtn(theme, accentGrad), flex: 1, minWidth: 180 }}>
                      {`Next question › · ${countdown}s`}
                    </button>
                    <button onClick={() => setCountdownHeld(true)} style={ghostBtn(theme)}>
                      {"Stay on this"}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => advance()} style={primaryBtn(theme, accentGrad)}>
                  {"Next question ›"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <StudyDisclaimer theme={theme} />
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

  if (error) return <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>{"Couldn’t load the leaderboard."}</div>;
  if (!entries) return <div style={{ ...card(theme), color: muted, fontSize: 13 }}>{"Loading…"}</div>;
  if (entries.length === 0)
    return <div style={{ ...card(theme), color: muted, fontSize: 13 }}>{"No scores yet — be the first to play."}</div>;

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

// The − / + on the rapid-fire seconds control. Small enough to sit inline in the
// HUD row beside the toggle it belongs to.
function stepBtn(theme: Theme): CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
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
