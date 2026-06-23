import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useAuth } from '../../auth/AuthContext';
import {
  SERIES65_QUESTIONS,
  type Series65Question,
  type Series65Topic,
} from './series65Questions';
import { SERIES65_VOCAB } from './series65Vocab';
import { Flashcards } from './Flashcards';
import { consumeStudyView, type StudyView } from './studiesNav';
import {
  CATEGORY_META,
  PASS_THRESHOLD,
  buildPools,
  emptyGame,
  gameKey,
  levelInfo,
  loadGame,
  metaFor,
  recordAnswer,
  round1,
  saveGame,
  scorePct,
  weightedCategory,
  type GameState,
} from './series65Game';

const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
type Letter = 'A' | 'B' | 'C' | 'D';
type Mode = 'mix' | Series65Topic;

// A short, sourced explanation: if a vocabulary term appears in the question or
// its correct answer, surface its definition. (The bank has no explanations.)
function hintFor(q: Series65Question): string | null {
  const correct = q.options.find((o) => o.label === q.answer)?.text ?? '';
  const hay = (q.stem + ' ' + correct).toLowerCase();
  let best: { term: string; def: string } | null = null;
  for (const c of SERIES65_VOCAB) {
    const core = c.term.replace(/\(.*?\)/g, '').trim().toLowerCase();
    if (core.length >= 4 && hay.includes(core) && (!best || core.length > best.term.length)) {
      best = { term: c.term, def: c.def };
    }
  }
  return best ? `${best.term} — ${best.def}` : null;
}

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
  const accentGrad = accentGradient(theme);
  const storageKey = gameKey(user?.id);

  const poolsRef = useRef(buildPools());
  const [game, setGame] = useState<GameState>(() => loadGame(storageKey));
  const [view, setView] = useState<StudyView>(() => consumeStudyView() ?? 'quiz');
  const [mode, setMode] = useState<Mode>('mix');
  const [current, setCurrent] = useState<{ q: Series65Question; topic: Series65Topic } | null>(null);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<boolean | null>(null);
  const [scoreChange, setScoreChange] = useState<number | null>(null);
  const [levelEvent, setLevelEvent] = useState<LevelEvent | null>(null);

  useEffect(() => {
    saveGame(storageKey, game);
  }, [game, storageKey]);

  function draw(cat: Series65Topic): number {
    let pool = poolsRef.current[cat];
    if (!pool.length) {
      poolsRef.current[cat] = buildPools()[cat]; // reshuffle this category
      pool = poolsRef.current[cat];
    }
    return pool.pop()!;
  }

  function advance() {
    const cat = mode === 'mix' ? weightedCategory() : mode;
    const qi = draw(cat);
    setCurrent({ q: SERIES65_QUESTIONS[qi], topic: cat });
    setSelected(null);
    setRevealed(false);
    setOutcome(null);
    setScoreChange(null);
    setLevelEvent(null);
  }

  // Load a question on mount and whenever the category mode changes.
  useEffect(() => {
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
          {(['quiz', 'cards'] as const).map((v) => (
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
              {v === 'quiz' ? 'Quiz' : 'Flashcards'}
            </button>
          ))}
        </div>
        {view === 'quiz' && (
          <button onClick={resetProgress} style={ghostBtn(theme)} title="Clear all levels and scores">
            Reset progress
          </button>
        )}
      </div>
    </div>
  );

  if (view === 'cards') {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
        {header}
        <Flashcards theme={theme} embedded />
      </div>
    );
  }

  if (!current) {
    return (
      <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff' }}>
        {header}
        <div style={{ color: muted, padding: 20, fontSize: 13 }}>Loading game…</div>
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
  const hint = revealed && !outcome ? hintFor(q) : null;

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      {header}

      {/* Category selector */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['mix', ...CATEGORY_META.map((c) => c.topic)] as Mode[]).map((m) => {
          const on = mode === m;
          const label = m === 'mix' ? 'Mix (weighted)' : metaFor(m).topic;
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
                border: `1px solid ${on ? theme.accent : theme.navBorder}`,
                background: on ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)',
                color: on ? '#fff' : muted,
              }}
            >
              {label}
              {m !== 'mix' && <span style={{ color: muted, marginLeft: 6 }}>{metaFor(m).weight}%</span>}
            </button>
          );
        })}
      </div>

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
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: muted, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>
              {lvl.toNext} to {lvl.nextLabel}
            </span>
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
                <div style={{ fontSize: 13, color: '#d7ccff', lineHeight: 1.55, marginBottom: hint ? 8 : 10 }}>
                  Correct answer: <strong style={{ color: '#fff' }}>{q.answer})</strong>{' '}
                  {q.options.find((o) => o.label === q.answer)?.text}
                </div>
              )}
              {hint && (
                <div style={{ fontSize: 12, color: muted, lineHeight: 1.5, marginBottom: 10, paddingLeft: 10, borderLeft: `2px solid ${theme.accent}` }}>
                  {hint}
                </div>
              )}
              <button onClick={advance} style={primaryBtn(theme, accentGrad)}>
                Next question ›
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={advance} style={ghostBtn(theme)} title="Skip without scoring">
                Skip
              </button>
            </div>
          )}
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
