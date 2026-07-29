import type { CSSProperties } from 'react';

// When a position opened, and when it closed — the one place those stamps are
// formatted. Every surface that shows a position (the Live Wall cards and the
// Master board's Positions tile, the Trade Log deck + tape, History, the Funded
// book, Manual Trades, Deleted Trades) renders them from here, so a trade reads
// the same wherever you look at it.
//
// Everything is in Eastern Time — the clock the desk already runs on for
// session windows, market hours and the trade code — so a stamp means the same
// instant to every teammate regardless of where they are. DST is Intl's problem.

const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const MONO = "'IBM Plex Mono', monospace";
const ET = 'America/New_York';

const stampFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const fullFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

// "Jul 29, 9:31 AM" — the compact stamp shown on a card or in a table cell.
export function etStamp(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return stampFmt.format(new Date(ms));
}

// "Jul 29, 2026, 9:31:05 AM ET" — the unambiguous form, used as the tooltip on
// every compact stamp so the year and the seconds are always one hover away.
export function etStampFull(ms: number | null | undefined): string {
  if (ms == null) return '';
  return `${fullFmt.format(new Date(ms))} ET`;
}

// "18m" / "5h 18m" — the gap between two instants, rounded to the minute.
function spanLabel(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// "5h 18m ago" — how long a position has been open.
export function etSince(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${spanLabel(ms, Date.now())} ago`;
}

// "held 5h 18m" — how long a closed trade ran, once both ends are known. Null
// when either stamp is missing, so a caller can fall back to the open reading.
export function heldFor(openedAt: number | null | undefined, closedAt: number | null | undefined): string | null {
  if (openedAt == null || closedAt == null) return null;
  return `held ${spanLabel(openedAt, closedAt)}`;
}

// The reading that sits furthest right on a position: how long it has been open
// while it's live, or how long it was held once it's closed.
export function ageLabel(openedAt: number | null | undefined, closedAt?: number | null): string {
  return heldFor(openedAt, closedAt) ?? etSince(openedAt);
}

// The labelled open/close block for a position card — "OPENED Jul 29, 9:31 AM"
// with a "CLOSED …" line beneath it once the trade is done. Sits in the card's
// bottom-right, to the left of the "5h 18m ago" reading.
export function TradeTimes({
  openedAt,
  closedAt,
  align = 'right',
}: {
  openedAt: number | null | undefined;
  closedAt?: number | null;
  align?: 'left' | 'right';
}) {
  if (openedAt == null && closedAt == null) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 1,
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <TimeLine label="Opened" ms={openedAt ?? null} />
      {closedAt != null && <TimeLine label="Closed" ms={closedAt} />}
    </span>
  );
}

function TimeLine({ label, ms }: { label: string; ms: number | null }) {
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}
      title={ms == null ? '' : `${label} ${etStampFull(ms)}`}
    >
      <span style={timeTag}>{label}</span>
      <span style={timeValue}>{etStamp(ms)}</span>
    </span>
  );
}

// The same pair of stamps for a dense table cell: the open time with the close
// time stacked beneath it, so one column carries both ends of the trade. Font
// size and family are inherited from the row.
export function TradeTimesCell({
  openedAt,
  closedAt,
  openLabel = 'open',
}: {
  openedAt: number | null | undefined;
  closedAt?: number | null;
  // What the second line says while the trade is still running.
  openLabel?: string;
}) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, lineHeight: 1.35 }}>
      <span style={{ color: MUTED, whiteSpace: 'nowrap' }} title={openedAt == null ? 'Open time unknown' : `Opened ${etStampFull(openedAt)}`}>
        {etStamp(openedAt)}
      </span>
      <span style={{ color: FAINT, whiteSpace: 'nowrap' }} title={closedAt == null ? 'Still open' : `Closed ${etStampFull(closedAt)}`}>
        {closedAt == null ? `→ ${openLabel}` : `→ ${etStamp(closedAt)}`}
      </span>
    </span>
  );
}

const timeTag: CSSProperties = { fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT };
const timeValue: CSSProperties = { fontSize: 10.5, color: MUTED, fontFamily: MONO };
