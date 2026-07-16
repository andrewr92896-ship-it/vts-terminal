import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import type { LeaderboardEntry, TeamRef } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { PASS_THRESHOLD, levelAtStep } from './series65Game';

// The badge (emoji + level + stars) for the highest level a run reached.
function bestBadge(bestStep: number) {
  const lvl = levelAtStep(bestStep);
  return { emoji: lvl.main.emoji, label: `Lv ${lvl.mainIndex + 1}`, stars: lvl.stars, bg: lvl.bg, text: lvl.text };
}

// Short "reset MM/DD" tag for a banked past run.
function bankedTag(when: number | null): string {
  if (!when) return 'past run';
  const d = new Date(when);
  return `reset ${d.getMonth() + 1}/${d.getDate()}`;
}

const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const muted = '#a99ff0';

// High-score table for the Study Game: every player's headline stats, ranked by
// current score, so learners can see where they stand and compare progress.
export function Leaderboard({ theme }: { theme: Theme }) {
  const { isPhone } = useResponsive();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [team, setTeam] = useState<TeamRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .studyLeaderboard()
      .then((r) => {
        if (!alive) return;
        setEntries(r.entries);
        setTeam(r.team);
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
        {team && <div style={{ ...teamPill(theme), marginBottom: 10 }}>🏦 {team.name}</div>}
        <div style={{ color: muted, fontSize: 13, lineHeight: 1.6 }}>
          No scores{team ? ` on ${team.name}` : ''} yet. Answer a few questions in the Quiz and
          you’ll be the first on the board.
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
        <div style={{ ...card(theme), flex: '1 1 200px' }}>
          <div style={statLabel}>Your session · current 100</div>
          <div style={{ ...statBig, color: scoreColor(me?.sessionScore ?? null) }}>
            {me == null || me.sessionScore == null ? '—' : `${me.sessionScore.toFixed(1)}%`}
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
            {me && me.sessionScore != null
              ? `${me.sessionCorrect}/${me.sessionAttempted} this block`
              : 'Answer a question to start a block'}
          </div>
        </div>
      </div>

      <div style={card(theme)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={statLabel}>High scores</div>
            {team && <span style={teamPill(theme)} title="Ranked against your trading team only">🏦 {team.name}</span>}
          </div>
          <div style={{ fontSize: 10.5, color: muted }}>Score = lifetime accuracy · Session = current 100 questions · pass {PASS_THRESHOLD.toFixed(1)}% · reset runs are banked here</div>
        </div>

        {isPhone ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {rows.map(({ e, rank }) => {
              const best = bestBadge(e.bestStep);
              return (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 11,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${e.isMe ? theme.accent : theme.navBorder}`,
                    background: e.isMe ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)',
                    opacity: e.archived ? 0.9 : 1,
                  }}
                >
                  <span style={{ ...rankBadge(rank), flexShrink: 0 }}>{medal(rank)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.name}
                      {e.isMe && <span style={{ color: theme.accent, fontWeight: 600 }}> · you</span>}
                      {e.archived && <span style={{ color: muted, fontWeight: 600 }}> · {bankedTag(e.when)}</span>}
                    </div>
                    <div style={{ fontSize: 10.5, color: muted, marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {e.correct}/{e.attempted} correct
                      {e.sessionScore != null && (
                        <>
                          {' · session '}
                          <span style={{ color: scoreColor(e.sessionScore), fontWeight: 700 }}>{e.sessionScore.toFixed(1)}%</span>
                          {` (${e.sessionCorrect}/${e.sessionAttempted})`}
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    title="Best level reached"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: best.bg, color: best.text, borderRadius: 999, padding: '2px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}
                  >
                    {best.emoji} {best.label}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 700, color: scoreColor(e.score), flexShrink: 0 }}>
                    {e.score == null ? '—' : `${e.score.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: muted, textAlign: 'left' }}>
                  <th style={{ ...th, width: 56 }}>Rank</th>
                  <th style={th}>Player</th>
                  <th style={{ ...th, textAlign: 'right' }}>Score</th>
                  <th style={{ ...th, textAlign: 'right' }}>Session</th>
                  <th style={{ ...th, textAlign: 'right' }}>Answered</th>
                  <th style={{ ...th, textAlign: 'right' }}>Correct</th>
                  <th style={{ ...th, textAlign: 'right' }}>Best level</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, rank }) => {
                  const best = bestBadge(e.bestStep);
                  return (
                    <tr
                      key={e.id}
                      style={{
                        background: e.isMe ? 'rgba(255,255,255,.06)' : 'transparent',
                        outline: e.isMe ? `1px solid ${theme.accent}` : 'none',
                        opacity: e.archived ? 0.88 : 1,
                      }}
                    >
                      <td style={td}>
                        <span style={rankBadge(rank)}>{medal(rank)}</span>
                      </td>
                      <td style={{ ...td, color: '#fff', fontWeight: 600 }}>
                        {e.name}
                        {e.isMe && <span style={{ color: theme.accent, fontWeight: 600 }}> · you</span>}
                        {e.archived && <span style={{ color: muted, fontWeight: 500 }}> · {bankedTag(e.when)}</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: scoreColor(e.score) }}>
                        {e.score == null ? '—' : `${e.score.toFixed(1)}%`}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {e.sessionScore == null ? (
                          <span style={{ color: muted }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: scoreColor(e.sessionScore) }}>
                              {e.sessionScore.toFixed(1)}%
                            </span>
                            <span style={{ fontSize: 10, color: muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                              {e.sessionCorrect}/{e.sessionAttempted}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#dfe7fa' }}>{e.attempted}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: '#dfe7fa' }}>{e.correct}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: best.bg, color: best.text, borderRadius: 999, padding: '2px 9px', fontWeight: 700 }}>
                          {best.emoji} {best.label} <span style={{ letterSpacing: '1px' }}>{best.stars}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
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

// Pill labelling the team a board is scoped to.
function teamPill(theme: Theme): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    color: theme.accent,
    background: 'rgba(255,255,255,.05)',
    border: `1px solid ${theme.accent}`,
    borderRadius: 999,
    padding: '2px 10px',
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
