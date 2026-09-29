// The economic calendar on the demo board, read live from Forex Factory's
// keyless weekly JSON — the same feed the private terminal ingests.
//
// It exists because the calendar sits on the SAME SCREEN as the market board
// (Market Data is the calendar's only home), so a live board beside a calendar
// of invented releases reads worse than either alone: the one panel on that
// screen with dates and times on it would be the made-up one.
//
// **Headlines are deliberately NOT read here.** A calendar is a schedule of
// public statistical releases; a news feed is somebody's copy, and republishing
// it on a public marketing demo is a licensing question rather than a build.
// The demo's headlines stay the bundled set, each naming "Fictional Wire" so
// nobody can mistake one for a report.
//
// Best-effort and never throws: nothing read means the bundled calendar stands,
// which says outright that it is fictional.

const FEEDS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

const TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 12_000;
const MAX_EVENTS = 60;
// A release that has just happened still matters — its `actual` lands minutes
// after the time, and that is the moment a desk looks at the row.
const LOOK_BACK_MS = 6 * 3600_000;
const LOOK_AHEAD_MS = 8 * 86400_000;

const USER_AGENT = 'Mozilla/5.0 (compatible; VTS Terminal demo)';

const str = (value, max) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

// Forex Factory writes impact as a word, and anything it does not recognise is
// low rather than dropped — an unrecognised word must not silently remove a
// release from the schedule.
function impactOf(value) {
  const s = String(value ?? '').toLowerCase();
  if (s.includes('high')) return 'high';
  if (s.includes('medium') || s.includes('moderate')) return 'medium';
  return 'low';
}

// Pure, and mirrors the private terminal's own normalizer. Each entry carries a
// title, a currency code, an ISO date with a timezone offset, an impact word and
// forecast/previous/actual strings — `actual` fills in once the release lands.
export function mapCalendar(json) {
  if (!Array.isArray(json)) return [];
  const out = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const title = str(raw.title, 160);
    if (!title) continue;
    // The current feed uses a single ISO `date`; older variants split it into
    // `date` + `time`, so joining them is the fallback.
    const rawDate = typeof raw.date === 'string' ? raw.date : '';
    let ms = Date.parse(rawDate);
    if (!Number.isFinite(ms) && rawDate && typeof raw.time === 'string') ms = Date.parse(`${rawDate} ${raw.time}`);
    if (!Number.isFinite(ms)) continue;
    out.push({
      // Content-keyed, because the feed carries no stable id: the same currency
      // and title at the same minute is the same release across polls, and the
      // screen uses this as a React key.
      id: `ff:${(str(raw.country, 40) ?? '').toLowerCase()}:${title.toLowerCase().replace(/\s+/g, '-')}:${Math.round(ms / 60000)}`,
      title,
      country: str(raw.country, 40),
      impact: impactOf(raw.impact),
      eventTime: ms,
      forecast: str(raw.forecast, 40),
      previous: str(raw.previous, 40),
      actual: str(raw.actual, 40),
      // NO EXPLAINER. The private board's plain-language note is written by AI,
      // and AI fails closed everywhere on the public terminal until the provider
      // migration — so this is null rather than a sentence nothing wrote.
      explainer: null,
      source: 'Forex Factory',
    });
  }
  return out;
}

async function getJson(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function windowAndSort(events, now) {
  const from = now - LOOK_BACK_MS;
  const to = now + LOOK_AHEAD_MS;
  const seen = new Set();
  return events
    .filter((e) => e.eventTime >= from && e.eventTime <= to)
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.eventTime - b.eventTime)
    .slice(0, MAX_EVENTS);
}

let cached = null;
let inFlight = null;

async function refresh(now) {
  const parts = await Promise.all(FEEDS.map(getJson));
  const events = windowAndSort(parts.flatMap((json) => mapCalendar(json)), now);
  // Never replace a good calendar with an empty one: the feeds go quiet
  // occasionally and an empty schedule reads as "nothing is coming", which is a
  // claim rather than an absence.
  if (events.length === 0 && cached) return cached.events;
  cached = { at: now, events };
  return events;
}

export async function readPublicCalendar(now = Date.now()) {
  if (cached && now - cached.at < TTL_MS) return cached.events;
  if (!inFlight) {
    inFlight = refresh(now)
      .catch(() => cached?.events ?? [])
      .finally(() => { inFlight = null; });
  }
  if (cached) return cached.events;
  return inFlight;
}

export function resetPublicCalendar() {
  cached = null;
  inFlight = null;
}
