import { useMemo, type CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useAuth } from '../../auth/AuthContext';
import { SERIES65_TOPICS } from './series65Questions';
import { computeStats, historyKey, loadHistory } from './series65Progress';

// Read-only view of the Series 65 quiz stats saved by the Practice Quiz:
// overall accuracy (last 100) and per-topic accuracy (last 20 each).
export function StudyProgress({ theme, onNavigate }: { theme: Theme; onNavigate: (screen: string) => void }) {
  const { user } = useAuth();
  const accentGrad = accentGradient(theme);
  const stats = useMemo(() => computeStats(loadHistory(historyKey(user?.id))), [user?.id]);

  const muted = '#a99ff0';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Progress</h2>
        <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
          Series 65 · accuracy from your practice quiz on this device
        </p>
      </div>

      {stats.total === 0 ? (
        <div style={{ ...card(theme), textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No quiz answers yet</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
            Take the practice quiz and your accuracy will show up here.
          </div>
          <button onClick={() => onNavigate('st_quiz')} style={primaryBtn(theme, accentGrad)}>
            Start practice quiz
          </button>
        </div>
      ) : (
        <>
          <div style={{ ...card(theme), marginBottom: 14 }}>
            <div style={statLabel}>Overall accuracy</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 34, fontWeight: 700, color: '#fff' }}>
                {stats.overall == null ? '—' : `${stats.overall}%`}
              </span>
              <span style={{ fontSize: 12, color: muted }}>
                last {Math.min(100, stats.overallN)} answered · {stats.total} total
              </span>
            </div>
            <div style={{ height: 9, background: theme.navBorder, borderRadius: 5, overflow: 'hidden', marginTop: 12, position: 'relative' }}>
              <div style={{ position: 'absolute', left: '72%', top: 0, width: 2, height: '100%', background: '#fff', opacity: 0.55 }} title="Passing ≈ 72%" />
              <div style={{ height: '100%', width: `${stats.overall ?? 0}%`, background: accentGrad }} />
            </div>
            <div style={{ fontSize: 11, color: '#8a7fc8', marginTop: 8 }}>
              The marker shows the ~72% passing line.
            </div>
          </div>

          <div style={card(theme)}>
            <div style={statLabel}>By topic (last 20 answers each)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {SERIES65_TOPICS.map((t) => {
                const pt = stats.perTopic[t];
                return (
                  <div key={t}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                      <span style={{ color: '#cdbcff' }}>{t}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#fff' }}>
                        {pt.pct == null ? '—' : `${pt.pct}%`}
                        <span style={{ color: muted }}> · {pt.n}</span>
                      </span>
                    </div>
                    <div style={{ height: 7, background: theme.navBorder, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pt.pct ?? 0}%`, background: accentGrad }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('st_quiz')} style={primaryBtn(theme, accentGrad)}>
              Continue quiz
            </button>
            <button onClick={() => onNavigate('st_cards')} style={ghostBtn(theme)}>
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
