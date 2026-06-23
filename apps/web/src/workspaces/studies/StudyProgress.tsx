import { useMemo, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useAuth } from '../../auth/AuthContext';
import {
  CATEGORY_META,
  PASS_THRESHOLD,
  gameKey,
  levelInfo,
  loadGame,
  round1,
  scorePct,
} from './series65Game';
import { requestStudyView } from './studiesNav';

// Read-only view of the Study Game progress: overall score vs. the pass line,
// plus each category's level and score.
export function StudyProgress({ theme, onNavigate }: { theme: Theme; onNavigate: (screen: string) => void }) {
  const { user } = useAuth();
  const accentGrad = accentGradient(theme);
  const game = useMemo(() => loadGame(gameKey(user?.id)), [user?.id]);
  const muted = '#a99ff0';

  const overall = scorePct(game.recent);
  const passing = overall != null && overall >= PASS_THRESHOLD;
  const delta = overall == null ? 0 : round1(overall - PASS_THRESHOLD);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Progress</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          Series 65 · your Study Game levels and scores on this device
        </p>
      </div>

      {game.totalAttempted === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No questions answered yet</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
            Play the Study Game and your levels and accuracy will show up here.
          </div>
          <button onClick={() => onNavigate('st_game')} style={primaryBtn(theme, accentGrad)}>
            Play the Study Game
          </button>
        </div>
      ) : (
        <>
          <div style={{ ...card(theme), marginBottom: 14 }}>
            <div style={statLabel}>Overall score · last {Math.min(100, game.recent.length)}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 700, color: '#fff' }}>
                {overall == null ? '—' : `${overall.toFixed(1)}%`}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: overall == null ? muted : passing ? '#35c47b' : '#ef5468' }}>
                {overall == null ? '' : passing ? `PASSING · +${delta.toFixed(1)}` : `NOT PASSING · ${delta.toFixed(1)}`}
              </span>
            </div>
            <div style={{ height: 9, background: theme.navBorder, borderRadius: 5, overflow: 'hidden', marginTop: 12, position: 'relative' }}>
              <div style={{ position: 'absolute', left: `${PASS_THRESHOLD}%`, top: 0, width: 2, height: '100%', background: '#fff', opacity: 0.6 }} />
              <div style={{ height: '100%', width: `${overall ?? 0}%`, background: accentGrad }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
              <span>Pass {PASS_THRESHOLD.toFixed(1)}%</span>
              <span>Attempted {game.totalAttempted} · Correct {game.totalCorrect}</span>
            </div>
          </div>

          <div style={card(theme)}>
            <div style={statLabel}>By category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 12 }}>
              {CATEGORY_META.map((c) => {
                const cs = game.cats[c.topic];
                const cl = levelInfo(cs.answered);
                const sc = scorePct(cs.recent);
                return (
                  <div key={c.topic}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 5 }}>
                      <span style={{ color: '#fff', fontWeight: 600 }}>
                        {'👑'.repeat(cl.prestige)}{cl.level.icon} {c.topic}
                      </span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#fff' }}>
                        {sc == null ? '—' : `${sc.toFixed(1)}%`}
                      </span>
                    </div>
                    <div style={{ height: 7, background: theme.navBorder, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${sc ?? 0}%`, background: accentGrad }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: muted, marginTop: 4 }}>
                      <span>Level {cl.index + 1} · {cl.level.name}{cl.prestige > 0 ? ` · Prestige ${cl.prestige}` : ''}</span>
                      <span>{cs.answered} answered · {c.weight}% of exam</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => { requestStudyView('quiz'); onNavigate('st_game'); }} style={primaryBtn(theme, accentGrad)}>
              Continue playing
            </button>
            <button onClick={() => { requestStudyView('cards'); onNavigate('st_game'); }} style={ghostBtn(theme)}>
              Flashcards
            </button>
          </div>
        </>
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
    padding: '11px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}
