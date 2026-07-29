// Eastern-Time arithmetic for the Market Data screen.
//
// `newsFormat.ts` covers *formatting* an instant in ET. This module covers the
// other direction — composing an absolute instant from an ET wall-clock date and
// time, which is what a scheduled release or an FOMC statement actually is.
// "2:00 PM Eastern on Sep 16" is a fixed moment; `now + offset` is not, and
// drifts an hour across the DST boundary. Everything here goes through
// `Intl.DateTimeFormat` so the rules come from the platform's tz database rather
// than a hardcoded −4/−5.

const ET = 'America/New_York';

export interface EtParts {
  y: number;
  m: number; // 1-12
  d: number;
  h: number; // 0-23
  mi: number;
  s: number;
}

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// The ET calendar/clock fields of an instant.
export function etParts(ms: number): EtParts {
  const out: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(ms)) out[p.type] = p.value;
  return {
    y: Number(out.year),
    m: Number(out.month),
    d: Number(out.day),
    h: Number(out.hour) % 24,
    mi: Number(out.minute),
    s: Number(out.second),
  };
}

// ET's offset from UTC at a given instant, in minutes (240 in EDT, 300 in EST).
function etOffsetMin(ms: number): number {
  const p = etParts(ms);
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000;
}

// The instant at which ET's wall clock reads the given date and time. Two-step:
// guess as if the fields were UTC, read the offset that actually applies there,
// then correct. Handles month/day overflow (day 32 rolls forward) because
// Date.UTC does.
export function etStampYMD(
  y: number,
  m: number,
  d: number,
  hh: number,
  mi: number,
): number {
  const guess = Date.UTC(y, m - 1, d, hh, mi);
  return guess - etOffsetMin(guess) * 60000;
}

// The same wall-clock time, `dayOffset` days from the ET day containing `now`.
export function etStampFromToday(now: number, dayOffset: number, hhmm: string): number {
  const p = etParts(now);
  return etStampYMD(p.y, p.m, p.d + dayOffset, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
}

// Minutes since ET midnight — the unit trading-session windows are stored in.
export function etMinuteOfDay(ms: number): number {
  const p = etParts(ms);
  return p.h * 60 + p.mi;
}

// A minutes-since-midnight value as a clock label ("4:00 PM"). Used for the
// "closes 4:00 PM" / "opens 7:00 PM" line on a session tile.
export function clockLabel(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(mins % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

// Is a session open right now? A window that wraps midnight (Tokyo 19:00→04:00)
// is open when the clock is past the open OR before the close.
export function sessionOpen(now: number, window: [number, number]): boolean {
  const cur = etMinuteOfDay(now);
  const [open, close] = window;
  return open < close ? cur >= open && cur < close : cur >= open || cur < close;
}

// ---- Labels ----

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  hour: 'numeric',
  minute: '2-digit',
});
const clockFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});
const dayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const mdFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric' });

export const etTime = (ms: number): string => timeFmt.format(ms);
export const etClock = (ms: number): string => clockFmt.format(ms); // with seconds
export const etDay = (ms: number): string => dayFmt.format(ms); // "Wed, Sep 16"
export const etMonthDay = (ms: number): string => mdFmt.format(ms); // "Sep 16"

// Are two instants on the same ET calendar day?
export function sameEtDay(a: number, b: number): boolean {
  const x = etParts(a);
  const y = etParts(b);
  return x.y === y.y && x.m === y.m && x.d === y.d;
}

// "in 18m" / "in 2h 18m" / "in 1d 17h" — how far ahead a scheduled release is.
export function etGap(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `in ${d}d ${h % 24}h`;
  if (h >= 1) return `in ${h}h ${mins % 60}m`;
  return `in ${mins}m`;
}

// "48d 20h" beyond a day, "HH:MM:SS" inside one — the Fed-bar countdown.
export function countdown(ms: number): string {
  const t = Math.max(0, ms);
  if (t >= 86400000) {
    return `${Math.floor(t / 86400000)}d ${Math.floor((t % 86400000) / 3600000)}h`;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600000))}:${p(Math.floor((t % 3600000) / 60000))}:${p(
    Math.floor((t % 60000) / 1000),
  )}`;
}

// ---- FOMC schedule ----
// Statement dates arrive as 'MM-DD' for a given year and are composed onto
// 2:00 PM ET. Real published dates, never derived by adding six weeks.

const STATEMENT_HOUR = 14;

function meetingStamp(year: number, md: string): number {
  return etStampYMD(year, Number(md.slice(0, 2)), Number(md.slice(3)), STATEMENT_HOUR, 0);
}

// The next statement — the first one less than an hour past, so the bar keeps
// showing today's meeting through the decision itself. Rolls to the first
// meeting of the following year once the list is exhausted.
export function nextMeetingStamp(now: number, meetings: string[], year: number): number {
  for (const md of meetings) {
    const t = meetingStamp(year, md);
    if (now < t + 3600000) return t;
  }
  return meetingStamp(year + 1, meetings[0] ?? '01-28');
}

// The most recent statement before `t`, for the Fed bar's "last reviewed".
export function prevMeetingStamp(t: number, meetings: string[], year: number): number {
  let prev: number | null = null;
  for (const md of meetings) {
    const st = meetingStamp(year, md);
    if (st < t) prev = st;
  }
  if (prev !== null) return prev;
  return meetingStamp(year - 1, meetings[meetings.length - 1] ?? '12-09');
}

// An ISO date (a review date) as an instant, anchored at 9:00 AM ET so the
// "due within 7 days" test compares like with like.
export function isoStamp(iso: string): number {
  const [y, m, d] = iso.split('-');
  return etStampYMD(Number(y), Number(m), Number(d), 9, 0);
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
