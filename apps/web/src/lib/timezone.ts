// The clock the terminal DISPLAYS times in. Set from My Terminal ▸ Preferences,
// stored per device (localStorage) alongside the other view choices there.
//
// The default is Eastern, and that matters: every stamp in the terminal was ET
// before this existed, so anything other than an explicit choice by the user has
// to keep reading exactly as it did.
//
// What this governs is the "when did this happen" displays — the top-bar clock,
// a position's opened/closed stamps, an alert's arrival time, a headline's time,
// the chart's own axis. What it deliberately does NOT govern:
//
//   • session windows, market hours and the FOMC schedule (`etClock.ts`,
//     MarketData's Fed bar and calendar) — those are facts about the MARKET, not
//     about the reader, and 2:00 PM ET is when the statement lands wherever you
//     are;
//   • anything that buckets by trading DAY — History's day/month grouping, the
//     news feed's Today/Yesterday split, the trade code — since a trading day is
//     an Eastern concept (a 6pm Sunday forex open belongs to Monday);
//   • the Trade Log's CSV export, which is a shared artifact and states ET in
//     the file so it reads the same for whoever opens it.
//
// A teammate on another zone therefore reads the same trade at a different
// wall-clock time. The top-bar clock names the zone in force at all times, and
// every compact stamp carries the full form with its abbreviation in the hover
// title, so the instant is always recoverable.

const KEY = 'vts.display.timezone';

// The stored value: an IANA zone name, or 'auto' to follow the device.
export const AUTO = 'auto';

export const DEFAULT_ZONE = 'America/New_York';

export interface ZoneOption {
  zone: string;
  label: string;
}

export interface ZoneGroup {
  label: string;
  zones: ZoneOption[];
}

// The financial centres, not every IANA zone. Anywhere not on the list is
// covered by Automatic, which reads the device's own zone — so the tail is
// handled without a 400-entry picker.
export const ZONE_GROUPS: ZoneGroup[] = [
  {
    label: 'United States',
    zones: [
      { zone: 'America/New_York', label: 'Eastern — New York' },
      { zone: 'America/Chicago', label: 'Central — Chicago' },
      { zone: 'America/Denver', label: 'Mountain — Denver' },
      { zone: 'America/Phoenix', label: 'Arizona — Phoenix' },
      { zone: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
      { zone: 'America/Anchorage', label: 'Alaska — Anchorage' },
      { zone: 'Pacific/Honolulu', label: 'Hawaii — Honolulu' },
    ],
  },
  {
    label: 'Americas',
    zones: [
      { zone: 'America/Toronto', label: 'Toronto' },
      { zone: 'America/Mexico_City', label: 'Mexico City' },
      { zone: 'America/Bogota', label: 'Bogotá' },
      { zone: 'America/Sao_Paulo', label: 'São Paulo' },
    ],
  },
  {
    label: 'Europe, Middle East & Africa',
    zones: [
      { zone: 'Europe/London', label: 'London' },
      { zone: 'Europe/Dublin', label: 'Dublin' },
      { zone: 'Europe/Lisbon', label: 'Lisbon' },
      { zone: 'Europe/Paris', label: 'Paris' },
      // Berlin, not Europe/Frankfurt: Frankfurt is an alias some ICU builds do
      // not carry (Node rejects it outright), and a zone the browser refuses
      // would fall silently back to Eastern when picked.
      { zone: 'Europe/Berlin', label: 'Frankfurt · Berlin' },
      { zone: 'Europe/Zurich', label: 'Zurich' },
      { zone: 'Europe/Amsterdam', label: 'Amsterdam' },
      { zone: 'Europe/Stockholm', label: 'Stockholm' },
      { zone: 'Europe/Warsaw', label: 'Warsaw' },
      { zone: 'Europe/Athens', label: 'Athens' },
      { zone: 'Europe/Istanbul', label: 'Istanbul' },
      { zone: 'Europe/Moscow', label: 'Moscow' },
      { zone: 'Asia/Jerusalem', label: 'Tel Aviv' },
      { zone: 'Asia/Dubai', label: 'Dubai' },
      { zone: 'Africa/Lagos', label: 'Lagos' },
      { zone: 'Africa/Johannesburg', label: 'Johannesburg' },
      { zone: 'UTC', label: 'UTC' },
    ],
  },
  {
    label: 'Asia-Pacific',
    zones: [
      { zone: 'Asia/Kolkata', label: 'Mumbai' },
      { zone: 'Asia/Bangkok', label: 'Bangkok' },
      { zone: 'Asia/Singapore', label: 'Singapore' },
      { zone: 'Asia/Hong_Kong', label: 'Hong Kong' },
      { zone: 'Asia/Shanghai', label: 'Shanghai' },
      { zone: 'Asia/Seoul', label: 'Seoul' },
      { zone: 'Asia/Tokyo', label: 'Tokyo' },
      { zone: 'Australia/Perth', label: 'Perth' },
      { zone: 'Australia/Sydney', label: 'Sydney' },
      { zone: 'Pacific/Auckland', label: 'Auckland' },
    ],
  },
];

// The picker's groups, minus anything this browser's ICU build cannot format.
// Zone names drift — Europe/Frankfurt is an alias Node rejects outright — and an
// option that cannot be formatted would fall silently back to Eastern the moment
// it was chosen. Filtering here means the list can never offer a dud.
// Computed once: the answer cannot change while the tab is open, and the card
// that reads it re-renders every second to tick its sample clock.
let usableGroups: ZoneGroup[] | null = null;

export function usableZoneGroups(): ZoneGroup[] {
  if (!usableGroups) {
    usableGroups = ZONE_GROUPS.map((g) => ({
      ...g,
      zones: g.zones.filter((z) => usableZone(z.zone)),
    })).filter((g) => g.zones.length > 0);
  }
  return usableGroups;
}

// The zone the device reports. Falls back to Eastern if the browser cannot say,
// so a failure here never moves anyone off the desk's clock by accident.
export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

// Whether a string is a zone this browser can actually format in. A stored value
// is checked through this on read, so a zone saved on one device (or a renamed
// IANA entry) can never leave every timestamp in the terminal blank.
function usableZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// The raw preference: 'auto', or an IANA zone name. What the picker shows.
export function getZonePref(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (!v) return DEFAULT_ZONE;
    if (v === AUTO) return AUTO;
    return usableZone(v) ? v : DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

// The IANA zone actually in force — the preference with 'auto' resolved.
export function getDisplayZone(): string {
  const pref = getZonePref();
  return pref === AUTO ? deviceZone() : pref;
}

type Listener = () => void;
const listeners = new Set<Listener>();

// Subscribed by the parts of the shell that stay mounted while the setting is
// changed — the top-bar clock, which would otherwise keep ticking in the old
// zone until something else forced it to re-render. Screens that render stamps
// pick the new zone up on their next render, which is the navigation away from
// Preferences.
export function subscribeZone(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setZonePref(v: string): void {
  try {
    localStorage.setItem(KEY, v === AUTO || usableZone(v) ? v : DEFAULT_ZONE);
  } catch {
    /* ignore — private mode / storage disabled */
  }
  for (const fn of listeners) fn();
}

// Intl.DateTimeFormat is expensive enough that every caller in this codebase
// hoists one to module scope. They can't anymore — the zone is a runtime value —
// so they go through this cache instead, keyed on zone + options. Same cost as
// the module-level constants once warm.
const formatters = new Map<string, Intl.DateTimeFormat>();

export function zoneFmt(options: Intl.DateTimeFormatOptions, zone = getDisplayZone()): Intl.DateTimeFormat {
  const key = `${zone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone });
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: DEFAULT_ZONE });
    }
    formatters.set(key, f);
  }
  return f;
}

// The terminal's own short labels for the US zones. Intl would say "EDT"/"EST"
// here, but the terminal has always written "ET" and every stamp that names a
// zone would change for somebody who never touched this setting. Everywhere else
// falls through to Intl's short name, which is both correct and DST-aware
// ("BST", "JST", "GMT+1").
const SHORT_NAMES: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Phoenix': 'MST',
  'America/Los_Angeles': 'PT',
  'America/Anchorage': 'AKT',
  'Pacific/Honolulu': 'HT',
};

// "ET" / "PT" / "JST" — the abbreviation for the zone in force, for the label
// beside a time. Takes the instant because a zone's abbreviation moves with DST.
export function zoneAbbr(ms: number = Date.now()): string {
  const zone = getDisplayZone();
  const named = SHORT_NAMES[zone];
  if (named) return named;
  try {
    const part = zoneFmt({ timeZoneName: 'short' }, zone)
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? zone;
  } catch {
    return zone;
  }
}

// The long name a picker shows for a zone, with its current offset — "Eastern
// Time (GMT-4)". Used on the Preferences screen to say what was chosen.
export function zoneOffsetLabel(zone: string, ms: number = Date.now()): string {
  try {
    const part = zoneFmt({ timeZoneName: 'shortOffset' }, zone)
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}
