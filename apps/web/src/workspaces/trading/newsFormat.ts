// Shared, palette-independent formatting helpers for the market-news UI (the
// Market News screen and the Live Wall's News / Calendar board tiles). Kept in
// one place so headline times and feed text render identically everywhere.

const ET = 'America/New_York';

// A time-of-day label in Eastern Time (e.g. "8:30 AM").
export function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }).format(ms);
}

// A short ET day label (e.g. "Wed, Jul 16").
export function fmtDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' }).format(ms);
}

// "just now" / "5m ago" / "3h ago", falling back to the ET day for older items.
// Future timestamps (an upcoming event) show their clock time.
export function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return fmtTime(ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return fmtDayKey(ms);
}

// Decode HTML entities in feed text for display. Server-side ingest already
// decodes new items, but rows stored before that fix can still carry raw
// "&#x2019;"-style codes — decoding again here is idempotent and guarantees
// clean headlines everywhere.
function entityCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  } catch {
    return '';
  }
}
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => entityCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => entityCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&(?:rsquo|lsquo|apos);/g, "'")
    .replace(/&(?:ldquo|rdquo);/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
