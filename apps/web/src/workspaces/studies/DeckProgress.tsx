import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TeamDeckDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { useAuth } from '../../auth/AuthContext';
import { overallLevel, levelAtStep, scorePct } from './gameEngine';
import { deckGameKey, deckLifetimeAccuracy, emptyDeckGame, parseDeckGame, type DeckGameState } from './studyEngine';
import { StudyProgressBars } from './StudyProgress';
import { StudyDisclaimer } from './StudyDisclaimer';
import { loadStudyPrefs, saveStudyPrefs, type StudyPrefs } from './studyPrefs';

// A read-only progress summary for one team-built study game: the learner's
// level, lifetime accuracy, best level reached, and per-category accuracy. Reads
// the same per-deck game state the player saves (local-first, reconciled with
// the account), so it mirrors what the game HUD shows without playing.

const muted = '#a99ff0';

export function DeckProgress({ theme, deckId, onBack, onPlay }: { theme: Theme; deckId: string; onBack: () => void; onPlay: () => void }) {
  const { user } = useAuth();
  const [deck, setDeck] = useState<TeamDeckDetail | null>(null);
  const [game, setGame] = useState<DeckGameState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [prefs, setPrefs] = useState<StudyPrefs>(() => loadStudyPrefs(user?.id));
  useEffect(() => setPrefs(loadStudyPrefs(user?.id)), [user?.id]);
  function updatePrefs(p: StudyPrefs) {
    setPrefs(p);
    saveStudyPrefs(user?.id, p);
  }

  useEffect(() => {
    let alive = true;
    api
      .studyDeck(deckId)
      .then((r) => {
        if (!alive) return;
        const d = r.deck;
        const cats = d.categories.length ? d.categories : ['General'];
        setDeck(d);
        const local = parseDeckGame(localStorage.getItem(deckGameKey(user?.id, deckId)), cats) ?? emptyDeckGame(cats);
        setGame(local);
        // Reconcile with the account copy (best-effort).
        api
          .studyDeckGame(deckId)
          .then((g) => {
            if (!alive) return;
            const remote = parseDeckGame(g.state, cats);
            if (remote) setGame(remote);
          })
          .catch(() => {});
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

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
  if (!deck || !game) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff' }}>
        <div style={{ marginBottom: 12 }}>{backBtn}</div>
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          {"Loading…"}
        </div>
      </div>
    );
  }

  const ov = overallLevel(game.levelCorrect);
  const best = levelAtStep(Math.max(game.allTimeBestStep, game.bestStep));
  const lifetime = deckLifetimeAccuracy(game);
  const cats = deck.categories.length ? deck.categories : ['General'];

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {backBtn}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{deck.name} · Progress</h2>
        </div>
        <p style={{ margin: '5px 0 0', fontSize: 12, color: muted }}>
          {"Your progress on this study game, synced to your account."}
        </p>
      </div>

      {game.totalAttempted === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            {"No progress yet"}
          </div>
          <div style={{ fontSize: 12.5, color: muted, marginBottom: 14 }}>
            {"Play this game to start levelling up and tracking your accuracy."}
          </div>
          <button onClick={onPlay} style={primaryBtn(theme)}>
            {"Play now"}
          </button>
        </div>
      ) : (
        <>
          {/* Level + score */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ ...card(theme), flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: ov.bg, color: ov.text, borderRadius: 12, padding: '9px 13px' }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>{ov.main.emoji}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Lv {ov.mainIndex + 1} · {ov.main.name}</div>
                  <div style={{ fontSize: 14, letterSpacing: '1.5px' }}>{ov.stars}</div>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: muted }}>
                {"Best reached"}<br />
                <span style={{ color: '#fff', fontWeight: 600 }}>{best.main.emoji} Lv {best.mainIndex + 1} {best.stars}</span>
              </div>
            </div>
            <div style={{ ...card(theme), flex: '1 1 200px' }}>
              <div style={{ fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {"Lifetime accuracy"}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: '4px 0' }}>
                {lifetime != null ? `${lifetime.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: muted }}>{game.totalCorrect}/{game.totalAttempted} correct · best streak {game.bestStreak}</div>
            </div>
          </div>

          {/* Lifetime + session progress bars, with the learner's thresholds. */}
          <div style={{ ...card(theme), marginBottom: 14 }}>
            <StudyProgressBars theme={theme} game={game} prefs={prefs} onPrefsChange={updatePrefs} />
          </div>

          {/* Per-category accuracy (last 100 answers) */}
          <div style={card(theme)}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent, marginBottom: 10 }}>
              {"Accuracy by topic"}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {cats.map((c) => {
                const cs = game.cats[c] ?? { answered: 0, correct: 0, recent: [] };
                const pct = scorePct(cs.recent);
                return (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#e7e0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                    <div style={{ flex: 2, height: 8, background: theme.navBorder, borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct ?? 0}%`, background: theme.accent }} />
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: muted, width: 92, textAlign: 'right' }}>
                      {pct != null ? `${pct.toFixed(0)}% · ${cs.answered}` : `— · ${cs.answered}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button onClick={onPlay} style={primaryBtn(theme)}>
              {"Play this game ›"}
            </button>
          </div>
        </>
      )}

      <StudyDisclaimer theme={theme} />
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
function primaryBtn(theme: Theme): CSSProperties {
  return {
    border: 'none',
    background: `linear-gradient(180deg, ${theme.accent}, ${theme.accent})`,
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
