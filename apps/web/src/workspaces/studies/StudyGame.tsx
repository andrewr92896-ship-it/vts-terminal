import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
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
import { TutorChat } from './TutorChat';
import { consumeStudyView, type StudyView } from './studiesNav';
import {
  CATEGORY_META,
  PASS_THRESHOLD,
  buildPools,
  emptyGame,
  gameKey,
  levelInfo,
  loadGame,
  loadStarred,
  metaFor,
  parseGame,
  recordAnswer,
  round1,
  saveGame,
  saveStarred,
  scorePct,
  weightedCategory,
  type GameState,
} from './series65Game';

const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const STAR = '#f5c451';
type Letter = 'A' | 'B' | 'C' | 'D';
type Mode = 'mix' | 'starred' | Series65Topic;

interface LevelEvent {
  prestige: boolean;
  icon: string;
  name: string;
  category: Series65Topic;
  answered: number;
  crowns: number;
}

export function StudyGame({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);
  const storageKey = gameKey(user?.id);

  const poolsRef = useRef(buildPools());
  const [game, setGame] = useState<GameState>(() => loadGame(storageKey));
  const [view, setView] = useState<StudyView>(() => consumeStudyView() ?? 'quiz');
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
  const [current, setCurrent] = useState<{ q: Series65Question; topic: Series65Topic } | null>(null);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<boolean | null>(null);
  const [scoreChange, setScoreChange] = useState<number | null>(null);
  const [levelEvent, setLevelEvent] = useState<LevelEvent | null>(null);

  // Whether the saved server copy has been pulled yet, and the last state we
  // pushed up (to skip redundant writes).
  const [hydrated, setHydrated] = useState(false);
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    saveGame(storageKey, game);
  }, [game, storageKey]);

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

  function resetQuestionState() {
    setSelected(null);
    setRevealed(false);
    setOutcome(null);
    setScoreChange(null);
    setLevelEvent(null);
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

  // Load a question on mount and whenever the category mode changes.
  useEffect(() => {
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

  function answer(label: Letter) {
    if (!current || revealed) return;
    const { q, topic } = current;
    const correct = label === q.answer;

    const prevScore = scorePct(game.recent) ?? 0;
    const prevLevel = levelInfo(game.cats[topic].answered);
    const next = recordAnswer(game, topic, correct);
    const newScore = scorePct(next.recent) ?? 0;
    const newLevel = levelInfo(next.cats[topic].answered);

    setScoreChange(round1(newScore - prevScore));
    if (newLevel.prestige > prevLevel.prestige) {
      setLevelEvent({ prestige: true, icon: '👑', name: 'Grandmaster', category: topic, answered: next.cats[topic].answered, crowns: newLevel.prestige });
    } else if (newLevel.index > prevLevel.index) {
      setLevelEvent({ prestige: false, icon: newLevel.level.icon, name: newLevel.level.name, category: topic, answered: next.cats[topic].answered, crowns: newLevel.prestige });
    }

    setGame(next);
    setSelected(label);
    setRevealed(true);
    setOutcome(correct);
  }

  function resetProgress() {
    setGame(emptyGame());
    poolsRef.current = buildPools();
    advance();
  }

  const overallScore = scorePct(game.recent);
  const muted = '#a99ff0';

  // Shared header with the Quiz / Flashcards view toggle.
  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Study Game</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          Series 65 · level up each category · pass line {PASS_THRESHOLD.toFixed(1)}%
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: `1px solid ${theme.navBorder}`, borderRadius: 999, overflow: 'hidden' }}>
          {(['quiz', 'cards', 'leaderboard'] as const).map((v) => (
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
              {v === 'quiz' ? 'Quiz' : v === 'cards' ? 'Flashcards' : 'Leaderboard'}
            </button>
          ))}
        </div>
        {view === 'quiz' && !readOnly && (
          <button onClick={resetProgress} style={ghostBtn(theme)} title="Clear all levels and scores">
            Reset progress
          </button>
        )}
      </div>
    </div>
  );

  // Category selector (Mix · Starred · the four topics). Shared between the empty
  // and active states so the user can always switch modes.
  const categorySelector = (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
      {(['mix', 'starred', ...CATEGORY_META.map((c) => c.topic)] as Mode[]).map((m) => {
        const on = mode === m;
        const isStar = m === 'starred';
        const label = m === 'mix' ? 'Mix (weighted)' : isStar ? '★ Starred' : metaFor(m as Series65Topic).topic;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: '7px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              border: `1px solid ${on ? (isStar ? STAR : theme.accent) : theme.navBorder}`,
              background: on ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
              color: on ? (isStar ? STAR : '#fff') : muted,
            }}
          >
            {label}
            {isStar && <span style={{ color: muted, marginLeft: 6 }}>{starred.size}</span>}
            {m !== 'mix' && !isStar && <span style={{ color: muted, marginLeft: 6 }}>{metaFor(m as Series65Topic).weight}%</span>}
          </button>
        );
      })}
    </div>
  );

  if (view === 'cards') {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <Flashcards theme={theme} embedded readOnly={readOnly} />
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

  if (!current) {
    const noStarred = mode === 'starred' && starred.size === 0;
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        {categorySelector}
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
  const lvl = levelInfo(game.cats[cat].answered);
  const crowns = '👑'.repeat(lvl.prestige);
  const passing = overallScore != null && overallScore >= PASS_THRESHOLD;
  const delta = overallScore == null ? 0 : round1(overallScore - PASS_THRESHOLD);
  const explanation = revealed ? SERIES65_EXPLANATIONS[q.id] : undefined;

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {header}

      {categorySelector}

      {/* Level-up / prestige banner */}
      {levelEvent && (
        <div
          style={{
            background: levelEvent.prestige ? 'linear-gradient(90deg,rgba(224,162,58,.25),rgba(224,162,58,.12))' : 'rgba(53,196,123,.14)',
            border: `1px solid ${levelEvent.prestige ? AMBER : GREEN}`,
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: levelEvent.prestige ? AMBER : GREEN, letterSpacing: '0.5px' }}>
            🎉 {levelEvent.prestige ? 'PRESTIGE!' : 'LEVEL UP!'} 🎉
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 4 }}>
            {levelEvent.prestige && <span>{'👑'.repeat(levelEvent.crowns)} </span>}
            {levelEvent.icon} {metaFor(levelEvent.category).topic} — {levelEvent.name}
          </div>
          <div style={{ fontSize: 11.5, color: muted, marginTop: 3 }}>
            {levelEvent.answered} answered in this category
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1.7fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Question + level HUD */}
        <div style={card(theme)}>
          {/* Level HUD for the current category */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>{crowns}{lvl.level.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>
                Level {lvl.index + 1} · {lvl.level.name}
                {lvl.prestige > 0 && <span style={{ color: AMBER }}> · Prestige {lvl.prestige}</span>}
              </div>
              <div style={{ fontSize: 10.5, color: muted }}>
                {meta.topic} · {meta.weight}% of exam
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10.5, color: muted, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>
                {lvl.toNext} to {lvl.nextLabel}
              </span>
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
            <div style={{ height: '100%', width: `${Math.min(100, ((lvl.within - lvl.level.at) / Math.max(1, lvl.nextAt - lvl.level.at)) * 100)}%`, background: accentGrad }} />
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
            <div style={statLabel}>Current score · last {Math.min(100, game.recent.length)}</div>
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

          <div style={card(theme)}>
            <div style={statLabel}>Categories</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 10 }}>
              {CATEGORY_META.map((c) => {
                const cs = game.cats[c.topic];
                const cl = levelInfo(cs.answered);
                const sc = scorePct(cs.recent);
                const isCurrent = c.topic === cat;
                return (
                  <div key={c.topic} style={{ opacity: isCurrent ? 1 : 0.85 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: isCurrent ? '#fff' : '#cdbcff', fontWeight: isCurrent ? 700 : 500 }}>
                        {'👑'.repeat(cl.prestige)}{cl.level.icon} {c.topic}
                      </span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: '#fff' }}>
                        {sc == null ? '—' : `${sc.toFixed(1)}%`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: muted, marginTop: 2 }}>
                      <span>L{cl.index + 1} {cl.level.name} · {cs.answered} answered</span>
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
