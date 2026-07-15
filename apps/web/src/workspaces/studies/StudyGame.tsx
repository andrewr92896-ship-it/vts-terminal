import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import type { StudySection } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import {
  SERIES65_QUESTIONS,
  type Series65Question,
  type Series65Topic,
} from './series65Questions';
import { SERIES65_EXPLANATIONS } from './series65Explanations';
import { Flashcards } from './Flashcards';
import { Leaderboard } from './Leaderboard';
import { TestMode } from './TestMode';
import { TutorChat } from './TutorChat';
import { consumeStudyView, type StudyView } from './studiesNav';
import { emitStudyLevelChange } from './studyTheme';
import {
  CATEGORY_META,
  PASS_THRESHOLD,
  applyTestLevel,
  buildPools,
  emptyGame,
  gameKey,
  levelAtStep,
  lifetimeAccuracy,
  loadCurrentSnapshot,
  loadGame,
  loadStarred,
  metaFor,
  saveCurrent,
  overallLevel,
  parseGame,
  recordAnswer,
  round1,
  saveGame,
  saveStarred,
  scorePct,
  weightedCategory,
  type GameState,
  type TestLevelUp,
} from './series65Game';

const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const STAR = '#f5c451';
type Letter = 'A' | 'B' | 'C' | 'D';
type Mode = 'mix' | 'starred' | Series65Topic | `sec:${string}`;

const isSectionMode = (m: Mode): m is `sec:${string}` =>
  typeof m === 'string' && m.startsWith('sec:');
const sectionIdOf = (m: string): string => m.slice(4);

interface LevelEvent {
  mainUp: boolean; // crossed into a new main level (fresh emoji + hue)
  emoji: string;
  name: string;
  sub: number;
  stars: string;
  bg: string;
  text: string;
  correct: number;
}

// A snapshot taken just before an answer is scored, so the Undo button can
// restore the prior score/stats and re-present the same question.
interface UndoSnapshot {
  game: GameState;
  current: { q: Series65Question; topic: Series65Topic };
}

// Answered questions that must elapse after an undo before it can be used again.
const UNDO_COOLDOWN = 10;

export function StudyGame({ theme, initialView }: { theme: Theme; initialView?: StudyView }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);
  const storageKey = gameKey(user?.id);

  const poolsRef = useRef(buildPools());
  const [game, setGame] = useState<GameState>(() => loadGame(storageKey));
  const [view, setView] = useState<StudyView>(() => initialView ?? consumeStudyView() ?? 'quiz');
  const [mode, setMode] = useState<Mode>('mix');
  // Question ids the user flagged to revisit. Loaded from localStorage for an
  // instant render, then reconciled with the account copy on mount.
  const [starred, setStarred] = useState<Set<number>>(() => loadStarred(user?.id));
  // Map a question id to its index in the static bank (ids are not guaranteed to
  // equal the array position), used when drawing from the starred set.
  const idToIndex = useRef<Map<number, number>>(
    new Map(SERIES65_QUESTIONS.map((q, i) => [q.id, i])),
  );
  // Shuffled queue of starred ids to serve from in "Starred" mode, rebuilt from
  // the current starred set when it empties.
  const starredQueueRef = useRef<number[]>([]);
  // Learner-defined subsections (e.g. "Bonds"), synced from the account. Each is
  // a named set of question ids Claude classified from the static bank.
  const [sections, setSections] = useState<StudySection[]>([]);
  // Practice mode: while on, answering never touches the score, levels, or
  // lifetime totals — so drilling a specific subsection can't hurt your stats.
  const [practice, setPractice] = useState(false);
  // The "new subsection" composer.
  const [composerOpen, setComposerOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Shuffled index queues per subsection id, refilled from its ids when empty.
  const sectionQueuesRef = useRef<Map<string, number[]>>(new Map());
  // The question the learner was last on (persisted locally), resolved once on
  // mount so reopening the app returns to it instead of drawing a new one.
  const initialCurrentRef = useRef<ReturnType<typeof loadCurrentSnapshot> | undefined>(undefined);
  if (initialCurrentRef.current === undefined) {
    initialCurrentRef.current = loadCurrentSnapshot(user?.id);
  }
  const [current, setCurrent] = useState<{ q: Series65Question; topic: Series65Topic } | null>(() => {
    const snap = initialCurrentRef.current;
    if (!snap) return null;
    const q = SERIES65_QUESTIONS.find((x) => x.id === snap.id);
    return q ? { q, topic: snap.topic } : null;
  });
  // `selected` is the highlighted answer before confirmation, and the submitted
  // answer once `revealed` — no answer is scored until it is confirmed. Seeded
  // from the persisted snapshot so a restored question keeps its answer state.
  const [selected, setSelected] = useState<Letter | null>(() => initialCurrentRef.current?.selected ?? null);
  const [revealed, setRevealed] = useState(() => initialCurrentRef.current?.revealed ?? false);
  const [outcome, setOutcome] = useState<boolean | null>(() => initialCurrentRef.current?.outcome ?? null);
  const [scoreChange, setScoreChange] = useState<number | null>(null);
  const [levelEvent, setLevelEvent] = useState<LevelEvent | null>(null);
  // Undo: the pre-answer snapshot to revert to, plus a cooldown (scored answers
  // remaining) so undo can only be used once every UNDO_COOLDOWN questions.
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [undoCooldown, setUndoCooldown] = useState(0);
  // Two-step confirmation for resetting progress (which banks the run first).
  const [resetConfirm, setResetConfirm] = useState(false);

  // Whether the saved server copy has been pulled yet, and the last state we
  // pushed up (to skip redundant writes).
  const [hydrated, setHydrated] = useState(false);
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    saveGame(storageKey, game);
  }, [game, storageKey]);

  // Persist the question the learner is on (and its answer state) so closing and
  // reopening the app returns them to it. Cleared when there is no current
  // question (e.g. an empty starred deck).
  useEffect(() => {
    if (!current) {
      saveCurrent(user?.id, null);
      return;
    }
    saveCurrent(user?.id, {
      id: current.q.id,
      topic: current.topic,
      selected,
      revealed,
      outcome,
    });
  }, [current, selected, revealed, outcome, user?.id]);

  // Tell the shell to re-tint the studies workspace whenever the level moves, so
  // the whole page's colour follows the current level.
  useEffect(() => {
    emitStudyLevelChange();
  }, [game.levelCorrect]);

  // Pull saved progress from the account once. The localStorage copy renders
  // instantly; a server copy (if any) takes precedence so levels and scores
  // follow the user across devices. On failure (offline, demo) the local copy
  // stays in use, and any local progress is pushed up once we know none exists.
  useEffect(() => {
    let alive = true;
    api
      .studyGame()
      .then((r) => {
        if (!alive) return;
        const remote = parseGame(r.state);
        if (remote) {
          lastSavedRef.current = JSON.stringify(remote);
          setGame(remote);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // After hydration, persist progress to the account (debounced). Skipped while
  // the state matches what we last stored, and best-effort so demo/offline
  // sessions simply keep their local copy.
  useEffect(() => {
    if (!hydrated || readOnly) return;
    const json = JSON.stringify(game);
    if (json === lastSavedRef.current) return;
    const id = setTimeout(() => {
      lastSavedRef.current = json;
      void api.saveStudyGame(json).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [game, hydrated, readOnly]);

  function draw(cat: Series65Topic): number {
    let pool = poolsRef.current[cat];
    if (!pool.length) {
      poolsRef.current[cat] = buildPools()[cat]; // reshuffle this category
      pool = poolsRef.current[cat];
    }
    return pool.pop()!;
  }

  // Pull the next starred question index, skipping ids that were unstarred since
  // the queue was built and rebuilding (reshuffled) when it runs dry. Returns
  // null when nothing is starred.
  function drawStarred(): number | null {
    if (starred.size === 0) return null;
    let queue = starredQueueRef.current.filter((id) => starred.has(id));
    while (queue.length) {
      const id = queue.pop()!;
      const idx = idToIndex.current.get(id);
      if (idx != null) {
        starredQueueRef.current = queue;
        return idx;
      }
    }
    // Rebuild a freshly shuffled queue from the current starred set.
    const ids = [...starred];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    queue = ids;
    while (queue.length) {
      const id = queue.pop()!;
      const idx = idToIndex.current.get(id);
      if (idx != null) {
        starredQueueRef.current = queue;
        return idx;
      }
    }
    return null;
  }

  // Build a freshly shuffled queue of bank indices for a subsection's ids.
  function buildSectionQueue(sectionId: string): number[] {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return [];
    const idxs = sec.questionIds
      .map((qid) => idToIndex.current.get(qid))
      .filter((x): x is number => x != null);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    return idxs;
  }

  // Pull the next question index for a subsection, reshuffling when it runs dry.
  function drawSection(sectionId: string): number | null {
    let queue = sectionQueuesRef.current.get(sectionId) ?? [];
    if (!queue.length) queue = buildSectionQueue(sectionId);
    if (!queue.length) return null;
    const qi = queue.pop()!;
    sectionQueuesRef.current.set(sectionId, queue);
    return qi;
  }

  function resetQuestionState() {
    setSelected(null);
    setRevealed(false);
    setOutcome(null);
    setScoreChange(null);
    setLevelEvent(null);
  }

  // Pull the learner's custom subsections once so they follow across devices.
  useEffect(() => {
    let alive = true;
    api
      .studySections()
      .then((r) => alive && setSections(r.sections))
      .catch(() => {
        /* offline / demo: no custom subsections */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Ask Claude to build a subsection from the whole bank, then switch to it.
  async function createSection() {
    const name = newSectionName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const compact = SERIES65_QUESTIONS.map((q) => ({ id: q.id, stem: q.stem, topic: q.topic }));
      const r = await api.createStudySection(name, compact);
      setSections(r.sections);
      sectionQueuesRef.current.delete(r.section.id);
      setNewSectionName('');
      setComposerOpen(false);
      setMode(`sec:${r.section.id}`);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : 'Could not build the subsection');
    } finally {
      setCreating(false);
    }
  }

  async function deleteSection(id: string) {
    try {
      const r = await api.deleteStudySection(id);
      setSections(r.sections);
      sectionQueuesRef.current.delete(id);
      if (mode === `sec:${id}`) setMode('mix');
    } catch {
      /* best-effort */
    }
  }

  function advance() {
    let qi: number;
    let cat: Series65Topic;
    if (mode === 'starred') {
      const drawn = drawStarred();
      if (drawn == null) {
        setCurrent(null);
        resetQuestionState();
        return;
      }
      qi = drawn;
      cat = SERIES65_QUESTIONS[qi].topic; // a starred question keeps its own topic
    } else if (isSectionMode(mode)) {
      const drawn = drawSection(sectionIdOf(mode));
      if (drawn == null) {
        setCurrent(null);
        resetQuestionState();
        return;
      }
      qi = drawn;
      cat = SERIES65_QUESTIONS[qi].topic; // a subsection question keeps its own topic
    } else {
      cat = mode === 'mix' ? weightedCategory() : mode;
      qi = draw(cat);
    }
    setCurrent({ q: SERIES65_QUESTIONS[qi], topic: cat });
    resetQuestionState();
  }

  // Toggle a star on a question, updating localStorage immediately and syncing to
  // the account best-effort (demo/offline simply keep the local copy).
  function toggleStar(id: number) {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        void api.removeStarredQuestion(id).catch(() => {});
      } else {
        next.add(id);
        void api.addStarredQuestion(id).catch(() => {});
      }
      saveStarred(user?.id, next);
      return next;
    });
  }

  // Pull the starred set from the account once so it follows the user across
  // devices. On failure (offline, demo) the localStorage copy stays in use.
  useEffect(() => {
    let alive = true;
    api
      .studyStarred()
      .then((r) => {
        if (!alive) return;
        const s = new Set(r.ids);
        setStarred(s);
        saveStarred(user?.id, s);
      })
      .catch(() => {
        /* keep the localStorage copy */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a question on mount and whenever the category mode changes. On the very
  // first mount, keep any question restored from a previous session instead of
  // drawing a new one — that is what keeps the learner on their question.
  const advanceInitRef = useRef(false);
  useEffect(() => {
    if (!advanceInitRef.current) {
      advanceInitRef.current = true;
      if (current) return;
    }
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // If the user is on the Starred tab when the starred set first arrives (server
  // sync) or grows from empty, serve the first one. Advancing sets `current`, so
  // this does not loop.
  useEffect(() => {
    if (mode === 'starred' && !current && starred.size > 0) advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starred, mode]);

  // Keyboard answering: A–D highlights an option, Enter/Space confirms it (and,
  // once revealed, moves to the next question). The starred deck has its own
  // inline cards, so it opts out.
  useEffect(() => {
    if (view !== 'quiz' || mode === 'starred') return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!current) return;
      if (revealed) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          advance();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'b' || k === 'c' || k === 'd') {
        const label = k.toUpperCase() as Letter;
        if (current.q.options.some((o) => o.label === label)) {
          e.preventDefault();
          setSelected(label);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (selected != null) {
          e.preventDefault();
          submit(selected);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mode, current, revealed, selected, practice, game]);

  // First step of answering: highlight a choice without scoring it. A different
  // choice can be picked freely until it is confirmed.
  function selectOption(label: Letter) {
    if (revealed) return;
    setSelected(label);
  }

  // Second step: confirm the highlighted choice, which scores it.
  function confirm() {
    if (revealed || selected == null) return;
    submit(selected);
  }

  // Score an answer and reveal the outcome. `label` is null when the user taps
  // "I Don't Know" — counted as wrong with no option highlighted as chosen.
  function submit(label: Letter | null) {
    if (!current || revealed) return;
    const { q, topic } = current;
    const correct = label === q.answer;

    // Reveal the outcome in every mode so the user always sees if they were right.
    setSelected(label);
    setRevealed(true);
    setOutcome(correct);

    // Starred is a practice deck, and Practice mode makes any category
    // consequence-free: answering never changes the score, levels, or lifetime
    // totals, so drilling a specific subsection can't hurt (or inflate) stats.
    if (mode === 'starred' || practice) return;

    // The live score moves on every answer, so the change is always non-zero.
    // Before the first answer there is no prior, so measure from the neutral seed.
    const prevGame = game;
    const prevScore = lifetimeAccuracy(prevGame);
    const prevOv = overallLevel(prevGame.levelCorrect);
    const next = recordAnswer(prevGame, topic, correct);
    const newScore = lifetimeAccuracy(next);
    const nextOv = overallLevel(next.levelCorrect);

    // Show the change in lifetime accuracy (0 before there was any prior).
    setScoreChange(round1((newScore ?? 0) - (prevScore ?? (newScore ?? 0))));
    // The overall level only advances on correct answers (it counts correct
    // answers), so a rise in `step` means a sub-level — or main-level — up.
    if (nextOv.step > prevOv.step) {
      setLevelEvent({
        mainUp: nextOv.mainIndex > prevOv.mainIndex,
        emoji: nextOv.main.emoji,
        name: nextOv.main.name,
        sub: nextOv.sub,
        stars: nextOv.stars,
        bg: nextOv.bg,
        text: nextOv.text,
        correct: next.totalCorrect,
      });
    }

    setGame(next);

    // Snapshot the pre-answer state and this question so Undo can revert it, and
    // count down any cooldown left from a previous undo.
    setUndoSnapshot({ game: prevGame, current });
    setUndoCooldown((c) => (c > 0 ? c - 1 : 0));
  }

  const undoReady = !!undoSnapshot && undoCooldown === 0;

  // Revert the last scored answer: restore the prior score/stats and re-present
  // that same question unanswered. Locked again for UNDO_COOLDOWN questions.
  function undo() {
    if (!undoReady || !undoSnapshot) return;
    setGame(undoSnapshot.game);
    setCurrent(undoSnapshot.current);
    resetQuestionState();
    setUndoSnapshot(null);
    setUndoCooldown(UNDO_COOLDOWN);
  }

  // Fold a finished mock test's correct answers into the level only: it advances
  // the level (and best-level marks) but never touches lifetime accuracy, the
  // per-category stats, or the leaderboard. Returns a summary of any level-up so
  // the test screen can celebrate it.
  function applyTestToLevel(correctCount: number): TestLevelUp | null {
    if (readOnly) return null;
    const before = overallLevel(game.levelCorrect);
    const next = applyTestLevel(game, correctCount);
    const after = overallLevel(next.levelCorrect);
    setGame(next);
    if (after.step <= before.step) return null;
    return {
      mainUp: after.mainIndex > before.mainIndex,
      emoji: after.main.emoji,
      name: after.main.name,
      mainIndex: after.mainIndex,
      stars: after.stars,
      bg: after.bg,
      text: after.text,
      gained: after.step - before.step,
    };
  }

  // Reset the game. The run just played is banked to the leaderboard first (so a
  // reset preserves the session as a past run rather than erasing it), and the
  // best level ever reached carries over so the "best reached" badge never drops.
  function resetProgress() {
    if (readOnly) return;
    // Bank the current run before clearing it (best-effort; skipped when empty).
    if (game.totalAttempted > 0) {
      void api.archiveStudyGame(JSON.stringify(game)).catch(() => {});
    }
    const carriedBest = Math.max(game.allTimeBestStep, game.bestStep);
    const fresh: GameState = { ...emptyGame(), allTimeBestStep: carriedBest };
    setGame(fresh);
    poolsRef.current = buildPools();
    setUndoSnapshot(null);
    setUndoCooldown(0);
    setResetConfirm(false);
    advance();
  }

  const overallScore = lifetimeAccuracy(game);
  const bestEver = levelAtStep(game.allTimeBestStep);
  const muted = '#a99ff0';

  // Shared header with the Quiz / Flashcards view toggle.
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Study Game</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          Series 65 · level up as you answer correctly · pass line {PASS_THRESHOLD.toFixed(1)}%
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${theme.navBorder}`, borderRadius: 999, overflow: 'hidden' }}>
          {(['quiz', 'test', 'cards', 'leaderboard'] as const).map((v) => (
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
              {v === 'quiz' ? 'Quiz' : v === 'test' ? 'Test' : v === 'cards' ? 'Flashcards' : 'Leaderboard'}
            </button>
          ))}
        </div>
        {view === 'quiz' && !readOnly && (
          <button
            onClick={() => setResetConfirm(true)}
            style={ghostBtn(theme)}
            title="Save this run to the leaderboard, then start fresh"
          >
            Reset progress
          </button>
        )}
      </div>
    </div>
  );

  // Category selector: Mix · Starred · the four topics · the learner's custom
  // subsections · a "New subsection" builder, plus the Practice toggle. Shared
  // between the empty and active states so the user can always switch modes.
  const chip = (m: Mode, label: string, on: boolean, accent: string, extra?: ReactNode, onDelete?: () => void) => (
    <span
      key={m}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        border: `1px solid ${on ? accent : theme.navBorder}`,
        background: on ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setMode(m)}
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          padding: '7px 12px',
          cursor: 'pointer',
          border: 'none',
          background: 'transparent',
          color: on ? (accent === STAR ? STAR : '#fff') : muted,
        }}
      >
        {label}
        {extra}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete this subsection"
          aria-label={`Delete subsection ${label}`}
          style={{
            border: 'none',
            background: 'transparent',
            color: muted,
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1,
            padding: '7px 9px 7px 2px',
          }}
        >
          ×
        </button>
      )}
    </span>
  );

  const categorySelector = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {chip('mix', 'Mix (weighted)', mode === 'mix', theme.accent)}
        {chip('starred', '★ Starred', mode === 'starred', STAR, <span style={{ color: muted, marginLeft: 6 }}>{starred.size}</span>)}
        {CATEGORY_META.map((c) =>
          chip(c.topic, c.topic, mode === c.topic, theme.accent, <span style={{ color: muted, marginLeft: 6 }}>{c.weight}%</span>),
        )}
        {sections.map((s) => {
          const m: Mode = `sec:${s.id}`;
          return chip(
            m,
            s.name,
            mode === m,
            theme.accent,
            <span style={{ color: muted, marginLeft: 6 }}>{s.questionIds.length}</span>,
            readOnly ? undefined : () => void deleteSection(s.id),
          );
        })}
        {!readOnly && (
          <button
            onClick={() => {
              setComposerOpen((v) => !v);
              setCreateError(null);
            }}
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              padding: '7px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              border: `1px dashed ${composerOpen ? theme.accent : theme.navBorder}`,
              background: 'rgba(255,255,255,.03)',
              color: composerOpen ? '#fff' : muted,
            }}
          >
            ✦ New subsection
          </button>
        )}
      </div>

      {/* Practice toggle + subsection composer */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <button
          onClick={() => setPractice((v) => !v)}
          aria-pressed={practice}
          title="While on, answering doesn't change your score, levels, or totals"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11.5,
            fontWeight: 600,
            padding: '7px 12px',
            borderRadius: 999,
            cursor: 'pointer',
            border: `1px solid ${practice ? AMBER : theme.navBorder}`,
            background: practice ? 'rgba(224,162,58,.14)' : 'rgba(255,255,255,.03)',
            color: practice ? AMBER : muted,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 26,
              height: 15,
              borderRadius: 999,
              background: practice ? AMBER : theme.navBorder,
              position: 'relative',
              flex: 'none',
              transition: 'background .15s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: practice ? 13 : 2,
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left .15s',
              }}
            />
          </span>
          Practice mode {practice ? '· not scoring' : '· off'}
        </button>
        {mode === 'starred' && (
          <span style={{ fontSize: 11, color: muted }}>Starred review never affects your score.</span>
        )}
      </div>

      {composerOpen && !readOnly && (
        <div
          style={{
            marginTop: 10,
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${theme.navBorder}`,
            background: 'rgba(255,255,255,.03)',
          }}
        >
          <div style={{ fontSize: 12, color: '#e7e0ff', marginBottom: 8, lineHeight: 1.5 }}>
            Name a topic and Claude will scan all {SERIES65_QUESTIONS.length} questions and gather the ones that fit — e.g. <em>Bonds</em>, <em>Compliance</em>, <em>Options</em>, <em>Retirement plans</em>.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
            <input
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createSection()}
              placeholder="Subsection name (e.g. Bonds)"
              maxLength={60}
              disabled={creating}
              style={{
                flex: 1,
                minWidth: isPhone ? '100%' : 0,
                background: 'rgba(10,8,26,.6)',
                border: `1px solid ${theme.navBorder}`,
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                padding: '9px 12px',
                outline: 'none',
              }}
            />
            <button
              onClick={createSection}
              disabled={creating || !newSectionName.trim()}
              style={{
                border: 'none',
                background: accentGrad,
                color: theme.accentText,
                fontWeight: 700,
                fontSize: 12.5,
                padding: '0 16px',
                borderRadius: 8,
                minHeight: 40,
                cursor: creating || !newSectionName.trim() ? 'default' : 'pointer',
                opacity: creating || !newSectionName.trim() ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {creating ? 'Building…' : '✦ Build with Claude'}
            </button>
          </div>
          {createError && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#ffb4ab' }}>{createError}</div>
          )}
        </div>
      )}
    </div>
  );

  // Reset confirmation: banks the current run to the leaderboard, then clears it.
  const runBest = levelAtStep(game.bestStep);
  const runAccuracy = lifetimeAccuracy(game);
  const resetPanel = resetConfirm ? (
    <div
      style={{
        marginBottom: 14,
        padding: '14px 16px',
        borderRadius: 12,
        border: `1px solid ${AMBER}`,
        background: 'rgba(224,162,58,.10)',
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Reset your Study Game?</div>
      <div style={{ fontSize: 12, color: '#e7e0ff', lineHeight: 1.55, marginBottom: 10 }}>
        {game.totalAttempted > 0 ? (
          <>
            This run — <strong>{game.totalCorrect}/{game.totalAttempted} correct</strong>
            {runAccuracy != null && <> · <strong>{runAccuracy.toFixed(1)}%</strong></>} · best{' '}
            <span style={{ background: runBest.bg, color: runBest.text, borderRadius: 6, padding: '1px 6px' }}>
              {runBest.main.emoji} Lv {runBest.mainIndex + 1} {runBest.stars}
            </span>{' '}
            — will be saved to the leaderboard, then your levels and score start fresh. Your best level ever
            reached is kept.
          </>
        ) : (
          <>You haven’t answered anything yet, so there’s nothing to save. This just starts a fresh game.</>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={resetProgress} style={{ ...primaryBtn(theme, accentGrad), minHeight: 38 }}>
          {game.totalAttempted > 0 ? 'Save run & reset' : 'Reset'}
        </button>
        <button onClick={() => setResetConfirm(false)} style={{ ...ghostBtn(theme), minHeight: 38 }}>
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  if (view === 'cards') {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <Flashcards theme={theme} embedded readOnly={readOnly} />
      </div>
    );
  }

  if (view === 'test') {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <TestMode theme={theme} onTestComplete={applyTestToLevel} />
      </div>
    );
  }

  if (view === 'leaderboard') {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <Leaderboard theme={theme} />
      </div>
    );
  }

  // Starred is a review deck: show every favorited question on one screen. Each
  // can be answered inline for practice, which never touches the score, levels,
  // or totals (that state lives in `game` and is only written from the quiz).
  if (view === 'quiz' && mode === 'starred') {
    const starredQuestions = [...starred]
      .map((id) => idToIndex.current.get(id))
      .filter((idx): idx is number => idx != null)
      .map((idx) => SERIES65_QUESTIONS[idx]);
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        {categorySelector}
        {resetPanel}
        {starredQuestions.length === 0 ? (
          <div style={{ ...card(theme), textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>☆</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No starred questions yet</div>
            <div style={{ fontSize: 12.5, color: muted, maxWidth: 360, margin: '0 auto 16px', lineHeight: 1.5 }}>
              Tap the ☆ on any quiz question to save it here, then come back to review them all in one place.
            </div>
            <button onClick={() => setMode('mix')} style={primaryBtn(theme, accentGrad)}>
              Back to the quiz
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                background: 'rgba(245,196,81,.1)',
                border: `1px solid ${STAR}`,
                borderRadius: 12,
                padding: '10px 14px',
                marginBottom: 14,
                fontSize: 12.5,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 700, color: '#f3d38a' }}>★ Starred review</span>
              <span style={{ color: muted }}>
                {starredQuestions.length} saved · answer freely — nothing here affects your score.
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {starredQuestions.map((sq) => (
                <StarredQuestionCard
                  key={sq.id}
                  q={sq}
                  theme={theme}
                  isPhone={isPhone}
                  onUnstar={() => toggleStar(sq.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (!current) {
    const noStarred = mode === 'starred' && starred.size === 0;
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        {categorySelector}
        {resetPanel}
        {noStarred ? (
          <div style={{ ...card(theme), textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>☆</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No starred questions yet</div>
            <div style={{ fontSize: 12.5, color: muted, maxWidth: 360, margin: '0 auto 16px', lineHeight: 1.5 }}>
              Tap the ☆ on any question to save it here, then come back to drill the
              ones you want to revisit.
            </div>
            <button onClick={() => setMode('mix')} style={primaryBtn(theme, accentGrad)}>
              Back to the quiz
            </button>
          </div>
        ) : (
          <div style={{ color: muted, padding: 20, fontSize: 13 }}>Loading game…</div>
        )}
      </div>
    );
  }

  const q = current.q;
  const cat = current.topic;
  const meta = metaFor(cat);
  const ov = overallLevel(game.levelCorrect);
  // Percent correct in the current category (matches the "Accuracy by category"
  // panel), shown next to the category name in the HUD.
  const catPct = scorePct(game.cats[cat].recent);
  const passing = overallScore != null && overallScore >= PASS_THRESHOLD;
  const delta = overallScore == null ? 0 : round1(overallScore - PASS_THRESHOLD);
  const explanation = revealed ? SERIES65_EXPLANATIONS[q.id] : undefined;
  const undoTitle = undoCooldown > 0
    ? `Undo unlocks in ${undoCooldown} question${undoCooldown === 1 ? '' : 's'}`
    : undoSnapshot
      ? 'Undo your last answer'
      : 'Answer a question to enable undo';

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {header}

      {categorySelector}
        {resetPanel}

      {/* Level-up banner + a burst of confetti (bigger on a new main level) */}
      {levelEvent && (
        <Confetti key={levelEvent.correct} big={levelEvent.mainUp} accent={theme.accent} />
      )}
      {levelEvent && (
        <div
          style={{
            background: levelEvent.mainUp ? 'linear-gradient(90deg,rgba(224,162,58,.25),rgba(224,162,58,.12))' : 'rgba(53,196,123,.14)',
            border: `1px solid ${levelEvent.mainUp ? AMBER : GREEN}`,
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 14,
            textAlign: 'center',
            animation: 'celebratePop .45s ease-out',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: levelEvent.mainUp ? AMBER : GREEN, letterSpacing: '0.5px' }}>
            🎉 {levelEvent.mainUp ? 'LEVEL UP!' : 'SUB-LEVEL UP!'} 🎉
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ background: levelEvent.bg, color: levelEvent.text, borderRadius: 8, padding: '3px 10px' }}>
              {levelEvent.emoji} {levelEvent.name}
            </span>
            <span style={{ color: STAR, letterSpacing: '1px' }}>{levelEvent.stars}</span>
          </div>
          <div style={{ fontSize: 11.5, color: muted, marginTop: 3 }}>
            {levelEvent.correct} correct answers
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.7fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Question + level HUD */}
        <div style={card(theme)}>
          {/* Overall level HUD (topic-agnostic: one ladder across every category) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                background: ov.bg,
                color: ov.text,
                borderRadius: 12,
                padding: '7px 12px',
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>{ov.main.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>Lv {ov.mainIndex + 1} · {ov.main.name}</div>
                <div style={{ fontSize: 13, letterSpacing: '1.5px' }} aria-label={`Sub-level ${ov.sub} of ${5}`}>
                  {ov.stars}
                </div>
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: muted }}>
                {meta.topic}
                {catPct != null && (
                  <span style={{ color: theme.accent, fontWeight: 700 }}> · {catPct.toFixed(0)}% correct</span>
                )}
                {' · '}{meta.weight}% of exam
              </div>
              <div style={{ fontSize: 10.5, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                {ov.isMax ? 'Max level reached' : `${ov.toNext} correct to ${ov.nextLabel}`}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={undo}
                disabled={!undoReady}
                title={undoTitle}
                aria-label="Undo last answer"
                style={{
                  border: `1px solid ${undoReady ? theme.accent : theme.navBorder}`,
                  background: undoReady ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.02)',
                  color: undoReady ? '#fff' : muted,
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1,
                  borderRadius: 8,
                  cursor: undoReady ? 'pointer' : 'not-allowed',
                  opacity: undoReady ? 1 : 0.5,
                  padding: '8px 11px',
                  minHeight: 34,
                  whiteSpace: 'nowrap',
                }}
              >
                ↩ Undo{undoCooldown > 0 ? ` (${undoCooldown})` : ''}
              </button>
              <button
                onClick={() => toggleStar(q.id)}
                aria-pressed={starred.has(q.id)}
                title={starred.has(q.id) ? 'Starred — tap to remove' : 'Star this question to revisit'}
                aria-label={starred.has(q.id) ? 'Remove star from this question' : 'Star this question'}
                style={{
                  border: `1px solid ${starred.has(q.id) ? STAR : theme.navBorder}`,
                  background: starred.has(q.id) ? 'rgba(245,196,81,.14)' : 'rgba(255,255,255,.04)',
                  color: starred.has(q.id) ? STAR : muted,
                  fontSize: 16,
                  lineHeight: 1,
                  borderRadius: 8,
                  cursor: 'pointer',
                  padding: '6px 10px',
                  minHeight: 34,
                }}
              >
                {starred.has(q.id) ? '★' : '☆'}
              </button>
            </div>
          </div>
          <div style={{ height: 5, background: theme.navBorder, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: '100%', width: `${(ov.intoSub / ov.subCost) * 100}%`, background: accentGrad }} />
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
                if (isCorrect) { border = GREEN; bg = 'rgba(53,196,123,.12)'; mark = '✓'; }
                else if (isChosen) { border = RED; bg = 'rgba(239,84,104,.12)'; mark = '✗'; }
              } else if (isChosen) {
                // Highlight the pre-confirmation selection (not yet scored).
                border = theme.accent;
                bg = 'rgba(255,255,255,.10)';
              }
              return (
                <button
                  key={o.label}
                  onClick={() => selectOption(o.label)}
                  disabled={revealed}
                  aria-pressed={!revealed && isChosen}
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

          {!revealed && (
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={confirm}
                disabled={selected == null}
                title={selected == null ? 'Pick an answer first' : 'Confirm and submit'}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: selected == null ? 'rgba(255,255,255,.06)' : accentGrad,
                  color: selected == null ? muted : theme.accentText,
                  cursor: selected == null ? 'not-allowed' : 'pointer',
                  fontSize: 13.5,
                  fontWeight: 700,
                  opacity: selected == null ? 0.7 : 1,
                }}
              >
                {selected == null ? 'Select an answer' : `Confirm ${selected} ↵`}
              </button>
              <button
                onClick={() => submit(null)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px dashed ${theme.navBorder}`,
                  background: 'rgba(255,255,255,.03)',
                  color: muted,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                I Don't Know
              </button>
            </div>
          )}

          {revealed ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: outcome ? GREEN : RED, marginBottom: 6 }}>
                {outcome ? 'Correct' : 'Incorrect'}
                {scoreChange != null && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: scoreChange >= 0 ? GREEN : RED, marginLeft: 8 }}>
                    {scoreChange >= 0 ? '+' : ''}{scoreChange.toFixed(1)}%
                  </span>
                )}
              </div>
              {!outcome && (
                <div style={{ fontSize: 13, color: '#d7ccff', lineHeight: 1.55, marginBottom: 8 }}>
                  Correct answer: <strong style={{ color: '#fff' }}>{q.answer})</strong>{' '}
                  {q.options.find((o) => o.label === q.answer)?.text}
                </div>
              )}
              {explanation && (
                <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.55, marginBottom: 12, paddingLeft: 10, borderLeft: `2px solid ${theme.accent}` }}>
                  {explanation}
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <button onClick={advance} style={primaryBtn(theme, accentGrad)}>
                  Next question ›
                </button>
              </div>
              <TutorChat
                key={q.id}
                theme={theme}
                isPhone={isPhone}
                seedLabel="✦ More Details"
                seedPrompt="Explain why the correct answer is right and why the others are wrong."
                context={[
                  'Here is a Series 65 practice question I am studying:',
                  q.stem,
                  q.options.map((o) => `${o.label}) ${o.text}`).join('\n'),
                  `The correct answer is ${q.answer}.`,
                ].join('\n')}
              />
            </div>
          ) : null}
        </div>

        {/* Scoreboard + categories */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={card(theme)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={statLabel}>Score · lifetime accuracy</span>
              {practice && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: AMBER,
                    border: `1px solid ${AMBER}`,
                    borderRadius: 5,
                    padding: '2px 7px',
                  }}
                >
                  Practice · paused
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color: '#fff' }}>
                {overallScore == null ? '—' : `${overallScore.toFixed(1)}%`}
              </span>
              {scoreChange != null && (
                <span style={{ fontSize: 12.5, fontWeight: 600, color: scoreChange >= 0 ? GREEN : RED }}>
                  {scoreChange >= 0 ? '+' : ''}{scoreChange.toFixed(1)}%
                </span>
              )}
            </div>
            <div style={{ height: 8, background: theme.navBorder, borderRadius: 5, overflow: 'hidden', marginTop: 10, position: 'relative' }}>
              <div style={{ position: 'absolute', left: `${PASS_THRESHOLD}%`, top: 0, width: 2, height: '100%', background: '#fff', opacity: 0.6 }} />
              <div style={{ height: '100%', width: `${overallScore ?? 0}%`, background: passing ? `linear-gradient(90deg,${GREEN},#27a866)` : accentGrad }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11.5 }}>
              <span style={{ color: muted }}>Pass: {PASS_THRESHOLD.toFixed(1)}%</span>
              <span style={{ fontWeight: 700, color: overallScore == null ? muted : passing ? GREEN : RED }}>
                {overallScore == null ? '—' : passing ? `PASSING · +${delta.toFixed(1)}` : `NOT PASSING · ${delta.toFixed(1)}`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
              <span>Attempted: {game.totalAttempted}</span>
              <span>Correct: {game.totalCorrect}</span>
            </div>
          </div>

          {/* Overall level (one topic-agnostic ladder — 10 correct = 1 sub-level) */}
          <div style={card(theme)}>
            <div style={statLabel}>Level · {ov.correct} correct answers</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: ov.bg,
                  color: ov.text,
                  borderRadius: 12,
                  padding: '8px 12px',
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{ov.main.emoji}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Lv {ov.mainIndex + 1} · {ov.main.name}</div>
                  <div style={{ fontSize: 14, letterSpacing: '2px' }}>{ov.stars}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                {ov.isMax ? 'Max level' : `${ov.toNext} to ${ov.nextLabel}`}
              </div>
            </div>
            <div style={{ height: 6, background: theme.navBorder, borderRadius: 4, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ height: '100%', width: `${(ov.intoSub / ov.subCost) * 100}%`, background: accentGrad }} />
            </div>
            {/* Highest level ever reached — survives a reset */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: muted }}>
              <span style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}>Best reached</span>
              <span
                title={`Highest level you've ever reached: Level ${bestEver.mainIndex + 1} ${bestEver.main.name}, sub-level ${bestEver.sub}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: bestEver.bg,
                  color: bestEver.text,
                  borderRadius: 999,
                  padding: '3px 9px',
                  fontWeight: 700,
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>{bestEver.main.emoji}</span>
                Lv {bestEver.mainIndex + 1}
                <span style={{ letterSpacing: '1px' }}>{bestEver.stars}</span>
              </span>
            </div>
          </div>

          <div style={card(theme)}>
            <div style={statLabel}>Accuracy by category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 10 }}>
              {CATEGORY_META.map((c) => {
                const cs = game.cats[c.topic];
                const sc = scorePct(cs.recent);
                const isCurrent = c.topic === cat;
                return (
                  <div key={c.topic} style={{ opacity: isCurrent ? 1 : 0.85 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: isCurrent ? '#fff' : '#cdbcff', fontWeight: isCurrent ? 700 : 500 }}>
                        {c.topic}
                      </span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#fff' }}>
                        {sc == null ? '—' : `${sc.toFixed(1)}%`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: muted, marginTop: 2 }}>
                      <span>{cs.answered} answered</span>
                      <span>{c.weight}% of exam</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// A short confetti burst shown on level-up. Pieces are generated once when the
// component mounts (the caller remounts it per event via a changing `key`), fall
// from the top of the screen, and fade out — a purely decorative overlay that
// ignores pointer events and hides itself for reduced-motion users (via CSS).
function Confetti({ big, accent }: { big: boolean; accent: string }) {
  const palette = big
    ? ['#e0a23a', '#f5c451', '#fff2c2', '#ffd76a']
    : ['#35c47b', accent, '#7fe0c0', '#f5c451', '#8ab4ff'];
  const [pieces] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.4 + Math.random() * 1.1,
      size: 6 + Math.random() * 6,
      color: palette[Math.floor(Math.random() * palette.length)],
      round: Math.random() > 0.5,
    })),
  );
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 60,
      }}
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 1.6),
            background: p.color,
            borderRadius: p.round ? '50%' : 2,
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

// One starred question in the review list: shows the stem and options, reveals
// the correct answer (and explanation) when an option is picked or "Show answer"
// is tapped, and can be unstarred. Its answer state is local — it never touches
// the Study Game score, so reviewing favorites is consequence-free.
function StarredQuestionCard({
  q,
  theme,
  isPhone,
  onUnstar,
}: {
  q: Series65Question;
  theme: Theme;
  isPhone: boolean;
  onUnstar: () => void;
}) {
  const [selected, setSelected] = useState<Letter | null>(null);
  const [revealed, setRevealed] = useState(false);
  const muted = '#a99ff0';
  const explanation = revealed ? SERIES65_EXPLANATIONS[q.id] : undefined;

  function pick(label: Letter) {
    if (revealed) return;
    setSelected(label);
    setRevealed(true);
  }

  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '3px 9px', opacity: 0.85 }}>
          {q.topic}
        </span>
        <button
          onClick={onUnstar}
          title="Remove from starred"
          aria-label="Remove this question from starred"
          style={{ flex: 'none', border: `1px solid ${STAR}`, background: 'rgba(245,196,81,.14)', color: STAR, fontSize: 14, lineHeight: 1, borderRadius: 8, cursor: 'pointer', padding: '6px 10px', minHeight: 32 }}
        >
          ★
        </button>
      </div>
      <div style={{ fontSize: isPhone ? 14 : 15, lineHeight: 1.5, color: '#fff', fontWeight: 600, marginBottom: 12 }}>
        {q.stem}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((o) => {
          const isCorrect = o.label === q.answer;
          const isChosen = selected === o.label;
          let border = theme.navBorder;
          let bg = 'rgba(255,255,255,.04)';
          let mark = '';
          if (revealed) {
            if (isCorrect) { border = GREEN; bg = 'rgba(53,196,123,.12)'; mark = '✓'; }
            else if (isChosen) { border = RED; bg = 'rgba(239,84,104,.12)'; mark = '✗'; }
          }
          return (
            <button
              key={o.label}
              onClick={() => pick(o.label)}
              disabled={revealed}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                textAlign: 'left',
                padding: '10px 13px',
                borderRadius: 10,
                border: `1px solid ${border}`,
                background: bg,
                color: '#e7e0ff',
                cursor: revealed ? 'default' : 'pointer',
                fontSize: 13,
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
      {revealed ? (
        <div style={{ marginTop: 12 }}>
          {selected != null && (
            <div style={{ fontSize: 13, fontWeight: 700, color: selected === q.answer ? GREEN : RED, marginBottom: 6 }}>
              {selected === q.answer ? 'Correct' : 'Incorrect'}
            </div>
          )}
          {explanation && (
            <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.55, paddingLeft: 10, borderLeft: `2px solid ${theme.accent}` }}>
              {explanation}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setRevealed(true)}
          style={{ marginTop: 10, background: 'none', border: 'none', color: theme.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
        >
          Show answer
        </button>
      )}
    </div>
  );
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
