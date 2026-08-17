import type { CSSProperties } from 'react';
import type { NoteOutcome, TradingNote } from '../../api/types';
import { zoneFmt } from '../../lib/timezone';

// Shared Trading Notes vocabulary — the colours, the words for an outcome, and
// the two date formatters. Lives outside the screen so the Live Wall tile reads
// the same rules rather than restating them, the way tradeFormat.ts serves both
// the trade card and the position editor.

export const GOLD = '#EBCB74';
export const GREEN = '#35c47b';
export const RED = '#ef5468';
export const AMBER = '#e0a23a';
export const TEXT = '#eef3ff';
export const MUTED = '#9fb0d6';
export const FAINT = '#6f84b0';
export const CARD = 'rgba(13,31,68,.5)';
export const PANEL = 'rgba(11,26,58,.5)';
export const INPUT_BG = '#091633';
export const BORDER = '#16294f';
export const BORDER2 = '#1c3a7a';

// How each outcome reads and what colour it takes.
//
// `unsettleable` is deliberately NEUTRAL rather than red. It is not a bad
// result — nothing was established either way — and colouring it like a miss
// would tell the trader they were wrong about something the terminal simply
// could not read.
export const OUTCOME: Record<NoteOutcome, { label: string; color: string }> = {
  hit: { label: 'Came true', color: GREEN },
  miss: { label: 'Did not', color: RED },
  partial: { label: 'Partly', color: AMBER },
  unsettleable: { label: 'Not settled', color: FAINT },
};

export const DIRECTION_LABEL = { up: 'Up', down: 'Down' } as const;

// What a confidence level asserts. Mirrors CONFIDENCE_STATED on the server; the
// server is what computes the calibration table, this is only for the composer.
export const CONFIDENCE_STATED: Record<number, number> = { 1: 55, 2: 65, 3: 75, 4: 85, 5: 95 };

// A date and time in the reader's chosen zone — a "when did this happen"
// reading, so it follows the display-timezone setting like every other stamp.
export function noteStamp(ms: number): string {
  return zoneFmt({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

// A week's date range for the board heading. The two ends are plain ET date
// strings from the server (a trading week is an Eastern concept and must not
// shift per reader), so they are formatted as calendar dates with no zone
// conversion — parsing them as UTC noon keeps them off a day boundary.
export function weekLabel(startsOn: string, endsOn: string): string {
  const f = (s: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${s}T12:00:00Z`),
    );
  return `${f(startsOn)} – ${f(endsOn)}`;
}

// One line describing the call itself, for a tile or a dense row.
export function callLine(n: TradingNote): string {
  if (!n.instrument || !n.direction) return n.title;
  const dir = DIRECTION_LABEL[n.direction];
  return n.targetPrice != null
    ? `${n.instrument} ${dir.toLowerCase()} to ${n.targetPrice}`
    : `${n.instrument} ${dir.toLowerCase()}`;
}

export const pill = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color,
  background: `color-mix(in srgb, ${color} 14%, transparent)`,
  border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
  whiteSpace: 'nowrap',
});
