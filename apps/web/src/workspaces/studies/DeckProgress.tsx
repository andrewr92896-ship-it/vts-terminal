import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { TeamDeckDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { useAuth } from '../../auth/AuthContext';
import { overallLevel, levelAtStep } from './gameEngine';
import { deckGameKey, deckLifetimeAccuracy, emptyDeckGame, parseDeckGame, type DeckGameState } from './studyEngine';
import { StudyProgressBars } from './StudyProgress';
import { StudyDisclaimer } from './StudyDisclaimer';
import { loadStudyPrefs, saveStudyPrefs, type StudyPrefs } from './studyPrefs';
import { buildCategoryReport, CategoryBreakdown } from './CategoryBreakdown';

// A read-only progress summary for one team-built study game: the learner's
// level, lifetime accuracy, best level reached, and per-category accuracy. Reads
// the same per-deck game state the player saves (local-first, reconciled with
// the account), so it mirrors what the game HUD shows without playing.
//
// When the game carries category weights (see examWeights.ts) it also shows a
// WEIGHTED score — each category's accuracy against its share of the exam,
// rather than one number over every answer regardless of where it came from.
// Playing does not draw to the blueprint the way a practice test does, so this
// is the figure that says what the exam would give for the understanding shown
// so far, however lopsided the practice happened to be.
//
// It is deliberately LIFETIME, not the 100-answer window the plain per-category
// bars use: it sits beside the Lifetime accuracy card and answers the same
// question weighted, so the two have to be measured over the same answers. That
// is also why the weighted breakdown restates each category on the lifetime
// basis — a breakdown that could not reconcile with the headline above it is
// worse than no breakdown.

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
  // The per-category report — the same one the game screen draws, from the same
  // function, so the two screens read identically.
  const report = buildCategoryReport(deck.categories, deck.categoryWeights, game);
  const weightedScore = report.weighted ? report.score : null;

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
            {/* The same answers scored against the exam's own mix, so practice
                that has been heavy on one area does not read as mastery of the
                whole paper. Shown only when the game carries a blueprint. */}
            {weightedScore != null && (
              <div style={{ ...card(theme), flex: '1 1 200px' }}>
                <div style={{ fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {"Weighted score"}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: '4px 0' }}>
                  {`${(Math.round(weightedScore * 10) / 10).toFixed(1)}%`}
                </div>
                <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.45 }}>
                  {lifetime != null && Math.abs(weightedScore - lifetime) >= 1
                    ? weightedScore < lifetime
                      ? 'Below your plain accuracy — the areas the exam weighs most are the weaker ones.'
                      : 'Above your plain accuracy — your weaker areas count for less of the exam.'
                    : 'Each category counted for its share of the exam.'}
                </div>
              </div>
            )}
          </div>

          {/* Lifetime + session progress bars, with the learner's thresholds. */}
          <div style={{ ...card(theme), marginBottom: 14 }}>
            <StudyProgressBars theme={theme} game={game} prefs={prefs} onPrefsChange={updatePrefs} />
          </div>

          {/* Per-category accuracy, and where the marks are going. The same
              component the game screen draws, so the breakdown reads the same
              wherever it is met. */}
          {report.rows.length > 0 && (
            <div style={card(theme)}>
              <CategoryBreakdown theme={theme} report={report} />
            </div>
          )}

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
