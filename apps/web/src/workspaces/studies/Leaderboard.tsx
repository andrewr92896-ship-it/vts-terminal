import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { LeaderboardEntry } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { PASS_THRESHOLD } from './series65Game';

const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const muted = '#a99ff0';

// High-score table for the Study Game: every player's headline stats, ranked by
// current score, so learners can see where they stand and compare progress.
export function Leaderboard({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .studyLeaderboard()
      .then((r) => {
        if (alive) setEntries(r.entries);
      })
      .catch(() => {
        if (alive) setError('Could not load the leaderboard right now.');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <div style={{ color: muted, padding: 20, fontSize: 13 }}>{error}</div>;
  }
  if (!entries) {
    return <div style={{ color: muted, padding: 20, fontSize: 13 }}>Loading leaderboard…</div>;
  }
  if (!entries.length) {
    return (
      <div style={card(theme)}>
        <div style={{ color: muted, fontSize: 13, lineHeight: 1.6 }}>
          No scores yet. Answer a few questions in the Quiz and you’ll be the first on the board.
        </div>
      </div>
    );
  }

  const me = entries.find((e) => e.isMe);
  const myRank = me ? entries.indexOf(me) + 1 : null;
  const leader = entries[0];

  // Phone: a stacked card per player. Desktop: a proper ranked table.
  const rows = entries.map((e, i) => ({ e, rank: i + 1 }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...card(theme), flex: '1 1 200px' }}>
          <div style={statLabel}>Players ranked</div>
          <div style={statBig}>{entries.length}</div>
        </div>
        <div style={{ ...card(theme), flex: '1 1 200px' }}>
          <div style={statLabel}>Top score</div>
          <div style={statBig}>{leader.score == null ? '—' : `${leader.score.toFixed(1)}%`}</div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{leader.name}</div>
        </div>
        <div style={{ ...card(theme), flex: '1 1 200px' }}>
          <div style={statLabel}>Your rank</div>
          <div style={statBig}>{myRank ? `#${myRank}` : '—'}</div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
            {me ? `${me.score == null ? '—' : `${me.score.toFixed(1)}%`} · ${me.correct}/${me.attempted} correct` : 'Play to join the board'}
          </div>
        </div>
      </div>

      <div style={card(theme)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={statLabel}>High scores</div>
          <div style={{ fontSize: 10.5, color: muted }}>Score = accuracy over last 100 · pass {PASS_THRESHOLD.toFixed(1)}%</div>
        </div>

        {isPhone ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rows.map(({ e, rank }) => (
              <div
                key={e.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${e.isMe ? theme.accent : theme.navBorder}`,
                  background: e.isMe ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)',
                }}
              >
                <span style={{ ...rankBadge(rank), flexShrink: 0 }}>{medal(rank)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.name}
                    {e.isMe && <span style={{ color: theme.accent, fontWeight: 600 }}> · you</span>}
                    {e.crowns > 0 && <span> {'👑'.repeat(Math.min(e.crowns, 5))}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: muted, marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {e.correct}/{e.attempted} correct · {e.accuracy == null ? '—' : `${e.accuracy.toFixed(0)}%`} lifetime
                  </div>
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color: scoreColor(e.score) }}>
                  {e.score == null ? '—' : `${e.score.toFixed(1)}%`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: muted, textAlign: 'left' }}>
                  <th style={{ ...th, width: 56 }}>Rank</th>
                  <th style={th}>Player</th>
                  <th style={{ ...th, textAlign: 'right' }}>Score</th>
                  <th style={{ ...th, textAlign: 'right' }}>Answered</th>
                  <th style={{ ...th, textAlign: 'right' }}>Correct</th>
                  <th style={{ ...th, textAlign: 'right' }}>Lifetime</th>
                  <th style={{ ...th, textAlign: 'right' }}>Crowns</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, rank }) => (
                  <tr
                    key={e.userId}
                    style={{
                      background: e.isMe ? 'rgba(255,255,255,.06)' : 'transparent',
                      outline: e.isMe ? `1px solid ${theme.accent}` : 'none',
                    }}
                  >
                    <td style={td}>
                      <span style={rankBadge(rank)}>{medal(rank)}</span>
                    </td>
                    <td style={{ ...td, color: '#fff', fontWeight: 600 }}>
                      {e.name}
                      {e.isMe && <span style={{ color: theme.accent, fontWeight: 600 }}> · you</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: scoreColor(e.score) }}>
                      {e.score == null ? '—' : `${e.score.toFixed(1)}%`}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#dfe7fa' }}>{e.attempted}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#dfe7fa' }}>{e.correct}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: muted }}>
                      {e.accuracy == null ? '—' : `${e.accuracy.toFixed(0)}%`}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{e.crowns > 0 ? '👑'.repeat(Math.min(e.crowns, 5)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

function scoreColor(score: number | null): string {
  if (score == null) return muted;
  if (score >= PASS_THRESHOLD) return GREEN;
  if (score >= PASS_THRESHOLD - 12) return AMBER;
  return RED;
}

function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: 20,
  };
}

function rankBadge(rank: number): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 26,
    height: 26,
    fontSize: rank <= 3 ? 16 : 12,
    fontWeight: 700,
    fontFamily: "'IBM Plex Mono', monospace",
    color: rank <= 3 ? '#fff' : muted,
  };
}

const statLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: muted,
};

const statBig: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 26,
  fontWeight: 700,
  color: '#fff',
  marginTop: 4,
};

const th: CSSProperties = {
  padding: '8px 10px',
  fontSize: 10.5,
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,.08)',
};

const td: CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid rgba(255,255,255,.05)',
  color: '#e7e0ff',
};
