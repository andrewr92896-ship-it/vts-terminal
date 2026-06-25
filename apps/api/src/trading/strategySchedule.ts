// Read-only trading schedule derived from the live Pine strategies. Times are
// the FILL hour in Eastern Time (when the trade actually opens). Because it
// mirrors the strategies it is computed, never stored — edit here when a Pine
// cell changes. "active/opening/idle" status is derived from the ET clock,
// day-of-week aware (these strategies fire on specific weekday + hour cells).

export type Bias = 'bull' | 'bear';

interface Window {
  days: number[]; // ET day-of-week the fill lands on (0=Sun … 6=Sat)
  start: number; // minute-of-day, ET
  end: number; // minute-of-day, ET
  bias: Bias;
  signal?: string;
}
interface Strategy {
  name: string; // canonical name (matches the Strategies tab + backtests)
  instrument: string;
  timeframe: string;
  windows: Window[];
  blocked: string; // human note of the hard blocks
}

const Su = 0, Mo = 1, Tu = 2, We = 3, Th = 4;
const hr = (h: number) => h * 60;
const allDay = (days: number[], bias: Bias): Window => ({ days, start: 0, end: 1440, bias });
// A one-hour fill cell starting at hour h.
const cell = (days: number[], h: number, bias: Bias, signal?: string): Window => ({ days, start: hr(h), end: hr(h + 1), bias, signal });

const SCHEDULE: Strategy[] = [
  {
    name: 'NAS100 1H mk2',
    instrument: 'NAS100',
    timeframe: '1H',
    windows: [allDay([Tu], 'bull')],
    blocked: 'Tuesday only. Blocks the 5PM ET rollover signal; Wed–Mon all blocked.',
  },
  {
    name: 'NAS100 15m mk1',
    instrument: 'NAS100',
    timeframe: '15m',
    windows: [
      cell([Mo], 9, 'bull', 'BOL'),
      cell([Tu], 9, 'bull', 'PBL'),
      cell([We], 14, 'bull', 'PBL'),
      cell([We], 21, 'bull', 'PBL'),
      cell([Th], 8, 'bull', 'BOL'),
    ],
    blocked: '5PM ET rollover; Fri/Sat/Sun.',
  },
  {
    name: 'NAS100 5m mk1',
    instrument: 'NAS100',
    timeframe: '5m',
    windows: [
      cell([We], 19, 'bull', 'ORBL'),
      cell([Th], 7, 'bull', 'PBL'),
      cell([Th], 8, 'bear', 'PBS'),
    ],
    blocked: 'ORBS (1PM short) disabled. Wed/Thu cells only.',
  },
  {
    name: 'BTC 4H mk1',
    instrument: 'BTCUSD',
    timeframe: '4H',
    windows: [allDay([Su, Mo, Tu], 'bull')],
    blocked: 'Sun/Mon/Tue only. Blocks 04:00, 08:00, 23:00 ET fills; Wed–Sat blocked.',
  },
  {
    name: 'BTC 5m mk1',
    instrument: 'BTCUSD',
    timeframe: '5m',
    windows: [
      cell([Su, Mo, Tu, We], 3, 'bull', 'Burst'),
      cell([Su, Mo, Tu, We], 6, 'bull', 'Burst/Bounce'),
      cell([Mo, Tu, We], 10, 'bull', 'Bounce'),
      cell([Su, Mo, Tu, We, Th], 11, 'bull', 'Burst'),
      cell([Su, Mo, Tu, We, Th], 15, 'bull', 'Burst'),
      cell([Su, Mo, Tu, We, Th], 20, 'bull', 'Burst'),
      cell([Su, Mo, Tu, We, Th], 21, 'bull', 'Burst'),
    ],
    blocked: 'Thu 3AM & 6AM blocked; Fri/Sat blocked.',
  },
  {
    name: 'BTC 5m mk2',
    instrument: 'BTCUSD',
    timeframe: '5m',
    windows: [
      cell([Su, Tu, We], 2, 'bull'),
      cell([Su, Tu, We], 4, 'bull'),
      cell([Su, Tu], 10, 'bull'),
      cell([We], 20, 'bull'),
      cell([We], 21, 'bull'),
    ],
    blocked: 'Mon/Thu fail Y2; Fri/Sat blocked.',
  },
  {
    name: 'US30 15m mk1',
    instrument: 'US30',
    timeframe: '15m',
    windows: [
      cell([Mo], 6, 'bull'),
      cell([Mo], 12, 'bull'),
      cell([Tu], 2, 'bull'),
      cell([Tu], 16, 'bull'),
      cell([We], 13, 'bull'),
      cell([We], 16, 'bull'),
    ],
    blocked: 'Thu/Fri/Sat/Sun; 5PM ET rollover.',
  },
  {
    name: 'US30 5m mk1',
    instrument: 'US30',
    timeframe: '5m',
    windows: [cell([Tu], 10, 'bull', 'DTB_L')],
    blocked: 'Single cell (Tue 10AM). Thu/Fri/Sat + 5PM rollover blocked.',
  },
  {
    name: 'XAUUSD 4H mk1',
    instrument: 'XAUUSD',
    timeframe: '4H',
    windows: [cell([We], 9, 'bull', 'PBL'), cell([We], 17, 'bull', 'PBL')],
    blocked: 'Wednesday only (9AM + 5PM fills).',
  },
  {
    name: 'XAUUSD 15m mk1',
    instrument: 'XAUUSD',
    timeframe: '15m',
    windows: [
      cell([Tu], 2, 'bull', 'PBL'),
      cell([Tu], 9, 'bull', 'PBL'),
      cell([Tu], 10, 'bull', 'PBL'),
      cell([Tu], 21, 'bull', 'PBL'),
    ],
    blocked: 'Tuesday only.',
  },
  {
    name: 'XAUUSD 5m mk1',
    instrument: 'XAUUSD',
    timeframe: '5m',
    windows: [
      cell([Tu], 8, 'bull', 'BRKL'),
      cell([Tu], 15, 'bull', 'BRKL'),
      cell([Tu], 10, 'bear', 'BRKS'),
      cell([Th], 10, 'bear', 'BRKS'),
    ],
    blocked: 'PBS & ORBL disabled. Tue/Thu only.',
  },
];

export type ScheduleStatus = 'active' | 'opening' | 'idle';
const OPENING_LEAD_MIN = 30;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function nowEt(): { dow: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { dow: WD[wd] ?? 0, min: h * 60 + m };
}

function hhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Minutes from now until this window next opens on `day` (0 if open right now).
function minsUntil(dow: number, now: number, day: number, start: number, end: number): number {
  if (dow === day && now >= start && now < end) return 0;
  let mins = ((day - dow + 7) % 7) * 1440 + start - now;
  if (mins <= 0) mins += 7 * 1440;
  return mins;
}

export interface ScheduleWindowOut {
  days: string[];
  time: string; // "09:00–10:00" or "all day"
  bias: Bias;
  signal: string | null;
  active: boolean;
}
export interface StrategyScheduleItem {
  name: string;
  instrument: string;
  timeframe: string;
  bias: Bias | 'both';
  blocked: string;
  status: ScheduleStatus;
  nextOpenMins: number | null; // minutes to the next open (null when active)
  nextOpenLabel: string | null; // e.g. "Tue 09:00 ET"
  windows: ScheduleWindowOut[];
}

export function getStrategySchedule(): { strategies: StrategyScheduleItem[]; nowEtMin: number } {
  const { dow, min } = nowEt();

  const items: StrategyScheduleItem[] = SCHEDULE.map((s) => {
    let active = false;
    let opening = false;
    let bestMins = Infinity;
    let bestLabel: string | null = null;

    const windows: ScheduleWindowOut[] = s.windows.map((w) => {
      const wActive = w.days.includes(dow) && min >= w.start && min < w.end;
      if (wActive) active = true;
      for (const day of w.days) {
        const until = minsUntil(dow, min, day, w.start, w.end);
        if (until > 0 && until <= OPENING_LEAD_MIN) opening = true;
        if (until > 0 && until < bestMins) {
          bestMins = until;
          bestLabel = `${DAY_NAMES[day]} ${hhmm(w.start)} ET`;
        }
      }
      return {
        days: w.days.map((d) => DAY_NAMES[d]),
        time: w.start === 0 && w.end === 1440 ? 'all day' : `${hhmm(w.start)}–${hhmm(w.end)}`,
        bias: w.bias,
        signal: w.signal ?? null,
        active: wActive,
      };
    });

    const biases = new Set(s.windows.map((w) => w.bias));
    const bias: Bias | 'both' = biases.size > 1 ? 'both' : [...biases][0];
    const status: ScheduleStatus = active ? 'active' : opening ? 'opening' : 'idle';

    return {
      name: s.name,
      instrument: s.instrument,
      timeframe: s.timeframe,
      bias,
      blocked: s.blocked,
      status,
      nextOpenMins: active ? null : Number.isFinite(bestMins) ? bestMins : null,
      nextOpenLabel: active ? null : bestLabel,
      windows,
    };
  });

  const RANK: Record<ScheduleStatus, number> = { active: 0, opening: 1, idle: 2 };
  items.sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.nextOpenMins ?? 0) - (b.nextOpenMins ?? 0) ||
      a.name.localeCompare(b.name),
  );

  return { strategies: items, nowEtMin: min };
}
