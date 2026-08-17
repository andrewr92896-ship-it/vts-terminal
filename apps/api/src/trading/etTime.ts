// Eastern-Time clock primitives. Pure, with no database and no network, so
// anything built on them can be checked against fixed inputs offline — the same
// reason `forex.ts` keeps its pip math free of everything else.
//
// These live apart from `sessions.ts` (which re-exports them, so every existing
// caller is unchanged) because the session store opens a database connection at
// import time, and a check that only wants "what minute is it in New York" has
// no business needing one.
//
// Eastern is the terminal's trading clock: a session window, a rollover, a
// trading day. Derived per reader those move when somebody changes their display
// zone, which is why they are composed here rather than from `now + offset`.

// ET weekday index: 0=Sun … 6=Sat.
export type EtWeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Current Eastern-Time clock as { minutes-since-midnight, weekday index }.
export function etNow(now: Date = new Date()): { min: number; dow: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
  return { min: h * 60 + m, dow };
}

// A stable ET calendar-day stamp ('YYYY-MM-DD'). Two instants belong to the same
// trading day exactly when their stamps match, which needs no zone arithmetic to
// get wrong across a DST change.
export function etDayStamp(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// 'HH:MM' → minutes since midnight, or null when it is not a real time.
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 'HH:MM' → "4:45 PM ET", for copy somebody reads on a lock screen.
export function etTimeLabel(hhmm: string): string {
  const min = parseHHMM(hhmm);
  if (min == null) return hhmm;
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix} ET`;
}
