import type { ExcludedTrades } from '../../api/types';

// How the desk says what a trade view left OUT.
//
// The Trade Log, its CSV export and the Live Wall's Desk Metrics tile all report
// figures narrowed by the same two settings — a connection's "count trades
// since" cutoff and the "ignore test trades" floor — so the sentence lives here
// rather than being written three times. Three surfaces phrasing one fact
// differently is how they come to disagree about it.
//
// Why it exists at all: both filters were silent. An export headed
// "2026-06-01 to 2026-08-09" listed no June trades while nine real ones sat
// behind a July cutoff, which reads as "there were no June trades" rather than
// "June is not being counted". On a figure somebody may present as a track
// record, that is the difference between a narrowed number and a wrong one.

// The cutoff is a DATE the trader picked on a connection, not a moment something
// happened, so it renders on the desk's own ET calendar rather than following
// the reader's display zone — the same rule History's day buckets follow.
function cutoffDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// The two clauses, longest-form, for a screen with room. Empty when nothing was
// excluded — the absence of a note then correctly means "everything is counted".
export function excludedParts(excluded: ExcludedTrades | undefined): string[] {
  if (!excluded) return [];
  const parts: string[] = [];
  if (excluded.beforeCutoff > 0) {
    parts.push(
      excluded.cutoffFrom != null
        ? `${plural(excluded.beforeCutoff, 'earlier trade', 'earlier trades')} before ${cutoffDate(excluded.cutoffFrom)}`
        : `${plural(excluded.beforeCutoff, 'earlier trade', 'earlier trades')} before your connection cutoffs`,
    );
  }
  if (excluded.belowFloor > 0) {
    parts.push(`${plural(excluded.belowFloor, 'test fill', 'test fills')}`);
  }
  return parts;
}

// One sentence for the Trade Log and the CSV. Null when nothing was left out.
export function excludedNote(excluded: ExcludedTrades | undefined): string | null {
  const parts = excludedParts(excluded);
  if (parts.length === 0) return null;
  return `Not counted: ${parts.join(' and ')}.`;
}

// The compact form for a Live Wall tile, where a full sentence will not fit.
export function excludedShort(excluded: ExcludedTrades | undefined): string | null {
  if (!excluded) return null;
  const n = excluded.beforeCutoff + excluded.belowFloor;
  return n > 0 ? `${n} not counted` : null;
}
