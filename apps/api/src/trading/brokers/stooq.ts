// Keyless daily quotes from Stooq, used for the Market Data board's METALS.
//
// Gold and silver are the last price rows on the board with no source. OANDA
// quotes both, but only from an entity that carries metals — the owner's is
// forex-only — and no other free feed the portal already talks to publishes
// them: FRED withdrew its LBMA series, and Coinbase and Kraken deal in coins.
// Stooq serves both as plain CSV with no key and no signup, which is the same
// bargain the FRED chart-download CSV strikes for the macro half.
//
// Two endpoints, both CSV:
//   last quote  /q/l/?s=xauusd&f=sd2t2ohlcv&h&e=csv
//               -> Symbol,Date,Time,Open,High,Low,Close,Volume
//   daily bars  /q/d/l/?s=xauusd&i=d
//               -> Date,Open,High,Low,Close,Volume   (oldest first)
//
// **A wrong number here is worse than no number**, because a row that goes live
// loses the Sample dot that would otherwise warn the reader. So a quote is used
// only if it parses to a positive finite price AND is dated within the last few
// days; anything else is dropped and the row keeps its sample figure. Being an
// unofficial endpoint, that guard is the whole safety story.

const STOOQ_QUOTE = 'https://stooq.com/q/l/';
const STOOQ_DAILY = 'https://stooq.com/q/d/l/';

const TIMEOUT_MS = 10_000;
const DAY_MS = 86400_000;

// How stale a "last" quote may be before it is refused. Metals trade Sunday
// evening to Friday evening, so a Saturday read legitimately sees Friday's bar;
// five days covers a long weekend plus a holiday without ever letting a feed
// that quietly froze pass as live.
const MAX_QUOTE_AGE_MS = 5 * DAY_MS;

export interface StooqDailyClose {
  timeMs: number;
  close: number;
}

async function getText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'text/csv,*/*' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseDate(raw: string): number | null {
  const d = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

function parsePrice(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The latest close for a symbol, or null. Stooq answers a symbol it does not
// know with "N/D" in the price columns, which fails `parsePrice` and so is
// refused like any other unusable row.
export function parseStooqQuote(body: string, now: number): number | null {
  const lines = body.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return null;
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  const cells = lines[1].split(',');
  if (cells.length < 7) return null;
  const at = parseDate(cells[1] ?? '');
  const close = parsePrice(cells[6] ?? '');
  if (at == null || close == null) return null;
  // A frozen feed is the failure mode this exists to catch: without the age
  // check a months-old price would render as live, with no Sample dot to warn.
  if (now - at > MAX_QUOTE_AGE_MS) return null;
  return close;
}

// Daily closes, oldest first, dropping the header and any unparseable row.
export function parseStooqDaily(body: string): StooqDailyClose[] {
  const out: StooqDailyClose[] = [];
  for (const line of body.split('\n')) {
    const cells = line.split(',');
    if (cells.length < 5) continue;
    const timeMs = parseDate(cells[0] ?? '');
    const close = parsePrice(cells[4] ?? '');
    if (timeMs == null || close == null) continue;
    out.push({ timeMs, close });
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

export async function fetchStooqQuote(symbol: string): Promise<number | null> {
  const body = await getText(
    `${STOOQ_QUOTE}?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`,
  );
  return body ? parseStooqQuote(body, Date.now()) : null;
}

export async function fetchStooqDailyCloses(symbol: string): Promise<StooqDailyClose[]> {
  const body = await getText(`${STOOQ_DAILY}?s=${encodeURIComponent(symbol)}&i=d`);
  return body ? parseStooqDaily(body) : [];
}
