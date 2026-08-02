import type { CSSProperties } from 'react';
import { classifyOutcome, type BreakEvenConfig } from './outcome';
import { fmtPips, tradePips } from './pips';

// The per-strategy / per-instrument breakdowns and the day/month filters that
// used to live on the History screen. History was removed (owner decision,
// 2026-08) because it listed the same closed trades the Trade Log already had,
// from the same rows — two screens answering one question, free to disagree
// about it. These are the parts of it worth keeping, moved here so the Trade Log
// scores a filtered selection exactly the way the server scores the whole set.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const BORDER = '#16294f';
const MONO = "'IBM Plex Mono', monospace";

const ET = 'America/New_York';

// Day-of-week / month stay Eastern whatever clock the reader has chosen in
// Preferences: a trading day is an Eastern concept (a 6pm Sunday forex open
// belongs to Monday), so grouping by the reader's own calendar day would move
// trades between buckets — and between two teammates' buckets. The Opened /
// Closed column does follow the reader's zone, so a trade near midnight can read
// as one date and group under the trading day it actually belonged to.
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const etWeekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'long' });
const etMonthLabelFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: 'long' });
const etMonthPartsFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit' });

/** Full weekday name in ET, e.g. "Monday". */
export function etWeekday(ms: number): string {
  return etWeekdayFmt.format(new Date(ms));
}

/** Sortable month key in ET, e.g. "2026-01" — stable for filtering and grouping. */
export function etMonthKey(ms: number): string {
  const p = etMonthPartsFmt.formatToParts(new Date(ms));
  const y = p.find((x) => x.type === 'year')?.value ?? '';
  const m = p.find((x) => x.type === 'month')?.value ?? '';
  return `${y}-${m}`;
}

/** Human month label in ET, e.g. "January 2026". */
export function etMonthLabel(ms: number): string {
  return etMonthLabelFmt.format(new Date(ms));
}

// The least a trade has to carry to be scored. Structural, so this works for the
// Trade Log's records without either screen owning the other's type.
export interface ScorableTrade {
  instrument: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number | null;
  realizedPl: number | null;
  strategy: string | null;
}

export interface TradeGroup {
  label: string;
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  realizedPl: number | null;
  pips: number;
}

// Group closed trades the same way the server's groupBy does, so a filtered
// breakdown scores identically to the unfiltered one.
export function groupTrades<T extends ScorableTrade>(
  trades: T[],
  pick: (t: T) => string | null,
  canSeeBalances: boolean,
  config: BreakEvenConfig,
): TradeGroup[] {
  const map = new Map<
    string,
    { count: number; wins: number; losses: number; breakeven: number; pl: number; pips: number }
  >();
  for (const t of trades) {
    const label = (pick(t) ?? '—').trim() || '—';
    const g = map.get(label) ?? { count: 0, wins: 0, losses: 0, breakeven: 0, pl: 0, pips: 0 };
    g.count += 1;
    const pips = tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument);
    if (pips != null) g.pips += pips;
    if (t.realizedPl != null) {
      g.pl += t.realizedPl;
      const outcome = classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config);
      if (outcome === 'win') g.wins += 1;
      else if (outcome === 'loss') g.losses += 1;
      else g.breakeven += 1;
    }
    map.set(label, g);
  }
  return [...map.entries()]
    .map(([label, g]) => ({
      label,
      count: g.count,
      wins: g.wins,
      losses: g.losses,
      breakeven: g.breakeven,
      realizedPl: canSeeBalances ? g.pl : null,
      pips: Number(g.pips.toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);
}

export function Breakdown({
  title,
  groups,
  money,
  showPips,
}: {
  title: string;
  groups: TradeGroup[];
  money: (n: number | null) => string;
  showPips: boolean;
}) {
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 600, color: '#fff' }}>
        {title}
      </div>
      {groups.length === 0 ? (
        <div style={{ padding: '14px 16px', fontSize: 12, color: MUTED }}>{"No data yet."}</div>
      ) : (
        groups.slice(0, 6).map((g) => {
          const pl = g.realizedPl;
          return (
            <div
              key={g.label}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderTop: `1px solid ${BORDER}`, gap: 10 }}
            >
              <span style={{ fontSize: 12.5, color: TEXT, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.label}
              </span>
              <span style={{ fontSize: 10.5, color: MUTED, fontFamily: MONO }}>
                {g.count} · {g.wins}W {g.losses}L{g.breakeven > 0 ? ` ${g.breakeven}BE` : ''}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 64 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: MONO, color: pl == null ? FAINT : pl >= 0 ? GREEN : RED, textAlign: 'right' }}>
                  {pl == null ? '—' : money(pl)}
                </span>
                {showPips && <span style={{ fontSize: 9.5, color: MUTED, fontFamily: MONO }}>{`(${fmtPips(g.pips, true)})`}</span>}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

const card: CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 14,
};

export const filterField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
export const filterLabel: CSSProperties = {
  fontSize: 9.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: FAINT,
};
export const filterSelect: CSSProperties = {
  background: '#091633',
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  color: TEXT,
  fontSize: 12,
  fontFamily: 'inherit',
  padding: '7px 10px',
  minHeight: 34,
};
export const filterGold = GOLD;
