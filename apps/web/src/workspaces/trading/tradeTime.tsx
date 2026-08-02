import type { CSSProperties } from 'react';
import { zoneAbbr, zoneFmt } from '../../lib/timezone';

// When a position opened, and when it closed — the one place those stamps are
// formatted. Every surface that shows a position (the Live Wall cards and the
// Master board's Positions tile, the Trade Log deck + tape, History, the Funded
// book, Manual Trades, Deleted Trades) renders them from here, so a trade reads
// the same wherever you look at it.
//
// Stamps render in the zone the reader has chosen (My Terminal ▸ Preferences),
// which is Eastern unless they changed it — the clock the desk runs on for
// session windows, market hours and the trade code. DST is Intl's problem.
//
// The compact stamp deliberately carries no zone label: the top-bar clock names
// the zone in force continuously, and the full form below — with its
// abbreviation — is the hover title on every one of these, so the instant is
// always one hover away. Adding it to the stamp itself would print the same
// three characters twice in every stacked open/close cell.

const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const MONO = "'IBM Plex Mono', monospace";

const STAMP_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};
const FULL_OPTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
};

// "Jul 29, 9:31 AM" — the compact stamp shown on a card or in a table cell.
export function etStamp(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return zoneFmt(STAMP_OPTS).format(new Date(ms));
}

// "Jul 29, 2026, 9:31:05 AM ET" — the unambiguous form, used as the tooltip on
// every compact stamp so the year, the seconds and the zone are always one
// hover away.
export function etStampFull(ms: number | null | undefined): string {
  if (ms == null) return '';
  return `${zoneFmt(FULL_OPTS).format(new Date(ms))} ${zoneAbbr(ms)}`;
}

// "18m" / "5h 18m" — the gap between two instants, rounded to the minute.
// `withDays` rolls anything past a day up into "4d" / "4d 3h" instead of "96h",
// which a multi-day swing hold needs to stay readable. It is off for the live
// "x ago" reading, which has always counted in hours.
function spanLabel(fromMs: number, toMs: number, withDays = false): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (withDays && h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh ? `${d}d ${rh}h` : `${d}d`;
  }
  return m ? `${h}h ${m}m` : `${h}h`;
}

// "5h 18m ago" — how long a position has been open.
export function etSince(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return `${spanLabel(ms, Date.now())} ago`;
}

// "held 5h 18m" / "held 4d 3h" — how long a closed trade ran, once both ends are
// known. Null when either stamp is missing, so a caller can fall back to the
// open reading.
export function heldFor(openedAt: number | null | undefined, closedAt: number | null | undefined): string | null {
  if (openedAt == null || closedAt == null) return null;
  return `held ${spanLabel(openedAt, closedAt, true)}`;
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
// size and family are inherited from the row. `showHeld` adds a third, smaller
// line with how long the trade ran — it needs both ends, so it stays hidden on
// a still-open row or one missing an open time.
export function TradeTimesCell({
  openedAt,
  closedAt,
  openLabel = 'open',
  showHeld = false,
}: {
  openedAt: number | null | undefined;
  closedAt?: number | null;
  // What the second line says while the trade is still running.
  openLabel?: string;
  showHeld?: boolean;
}) {
  const held = showHeld ? heldFor(openedAt, closedAt) : null;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, lineHeight: 1.35 }}>
      <span style={{ color: MUTED, whiteSpace: 'nowrap' }} title={openedAt == null ? 'Open time unknown' : `Opened ${etStampFull(openedAt)}`}>
        {etStamp(openedAt)}
      </span>
      <span style={{ color: FAINT, whiteSpace: 'nowrap' }} title={closedAt == null ? 'Still open' : `Closed ${etStampFull(closedAt)}`}>
        {closedAt == null ? `→ ${openLabel}` : `→ ${etStamp(closedAt)}`}
      </span>
      {held && (
        <span style={heldLine} title="How long the trade ran, open to close">
          {held}
        </span>
      )}
    </span>
  );
}

const timeTag: CSSProperties = { fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT };
const timeValue: CSSProperties = { fontSize: 10.5, color: MUTED, fontFamily: MONO };
// Smaller than the two stamps above it, the way a row's pip figure sits under
// its P/L — the held time is a reading off the stamps, not a third fact.
const heldLine: CSSProperties = { fontSize: 9.5, color: FAINT, whiteSpace: 'nowrap' };
