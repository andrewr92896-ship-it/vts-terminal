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
import { hasUsableWeights, weightedResult } from './examWeights';

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
const AMBER = '#e0a23a';

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

  // The weighted score, when this game carries a blueprint. Built from the
  // LIFETIME per-category counts so it is measured over the same answers as the
  // Lifetime accuracy card beside it. Null when the game is unweighted, or when
  // nothing weighted has been answered yet — never quietly swapped for the
  // plain figure, since the two are different claims.
  const weighted = hasUsableWeights(deck.categories, deck.categoryWeights)
    ? weightedResult(
        deck.categories,
        deck.categoryWeights,
        new Map(
          cats.map((c) => {
            const cs = game.cats[c] ?? { answered: 0, correct: 0, recent: [] };
            return [c, { correct: cs.correct, total: cs.answered }];
          }),
        ),
      )
    : null;
  // Where the practice has actually gone: the categories costing the most
  // points. Ranked by points lost rather than by accuracy, because a weak area
  // worth 5% of the exam costs less than a middling one worth 30%.
  const pointsLost = (c: { pointsAvailable: number; pointsEarned: number }) => c.pointsAvailable - c.pointsEarned;
  const focus = weighted
    ? weighted.categories
        .filter((c) => c.total > 0 && pointsLost(c) >= 0.05)
        .sort((a, b) => pointsLost(b) - pointsLost(a))
        .slice(0, 3)
    : [];

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
            {weighted && (
              <div style={{ ...card(theme), flex: '1 1 200px' }}>
                <div style={{ fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {"Weighted score"}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: '4px 0' }}>
                  {`${(Math.round(weighted.score * 10) / 10).toFixed(1)}%`}
                </div>
                <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.45 }}>
                  {lifetime != null && Math.abs(weighted.score - lifetime) >= 1
                    ? weighted.score < lifetime
                      ? 'Below your plain accuracy — the areas the exam weighs most are the weaker ones.'
                      : 'Above your plain accuracy — your weaker areas count for less of the exam.'
                    : 'Each category counted for its share of the exam.'}
                </div>
              </div>
            )}
          </div>

          {/* A category never practised is rescaled out rather than scored as
              zero — the same rule the practice test follows. Saying which ones
              is the point: an untouched area is exactly what this screen exists
              to surface. */}
          {weighted && weighted.uncovered.length > 0 && (
            <div style={{ ...card(theme), marginBottom: 14, borderColor: AMBER }}>
              <div style={{ fontSize: 12.5, color: '#f0dcb4', lineHeight: 1.55 }}>
                {"Not practised yet: "}
                {weighted.uncovered.join(', ')}
                {". Those areas are left out of the weighted score rather than counted as zero, so it covers only what you have answered."}
              </div>
            </div>
          )}

          {/* Lifetime + session progress bars, with the learner's thresholds. */}
          <div style={{ ...card(theme), marginBottom: 14 }}>
            <StudyProgressBars theme={theme} game={game} prefs={prefs} onPrefsChange={updatePrefs} />
          </div>

          {/* Per-category accuracy. Weighted games restate it on the LIFETIME
              basis the weighted score above is built from, with each category's
              share and what it contributed, so the breakdown reconciles with
              the headline. Unweighted games keep the 100-answer window they
              have always shown. */}
          <div style={card(theme)}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent, marginBottom: 10 }}>
              {weighted ? 'By category · points of 100' : 'Accuracy by topic'}
            </div>
            {weighted ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {weighted.categories.map((c) => {
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
                              background: c.accuracy == null ? theme.navBorder : theme.accent,
                            }}
                          />
                        </div>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: muted, width: 128, textAlign: 'right' }}>
                          {c.total > 0
                            ? `${c.correct}/${c.total} · ${Math.round(c.pointsEarned * 10) / 10} pts`
                            : 'not practised'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
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
            )}
          </div>

          {/* Where the practice is costing the most. Same ranking as the
              practice test result, so the two screens agree about priorities. */}
          {focus.length > 0 && (
            <div style={{ ...card(theme), marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent, marginBottom: 10 }}>
                {"Where the marks are going"}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {focus.map((c) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5, color: '#e7e0ff' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#ef5468' }}>
                      −{Math.round(pointsLost(c) * 10) / 10} pts
                    </span>
                  </div>
                ))}
              </div>
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
