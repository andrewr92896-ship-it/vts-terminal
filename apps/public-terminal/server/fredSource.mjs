// FRED (Federal Reserve Economic Data, St. Louis Fed) and the keyless coin feed,
// read by the PUBLIC terminal's own server for the demo board.
//
// **Why this exists at all.** The demo runs in a browser with no session, and
// the public terminal is a static bundle: it can reach no service, and its
// content-security policy allows `connect-src 'self'` and TradingView and
// nothing else — so a browser-side fetch to a data provider is blocked before
// it is made. The one process that can read a provider on the demo's behalf is
// the small server that serves the bundle, which is where this is mounted.
//
// **It is a deliberate, narrow MIRROR and must stay narrow.** The private
// terminal has its own FRED reader and a catalog of seventy-odd series; this is
// a separate deployment and may not import from it, so the reader is copied.
// What is NOT copied is the catalog: the demo board shows a short showcase row
// set, so this carries only the transforms those rows need (`level`, `yoy`,
// `ytdIndex`) and none of the rest. Widening it to the full catalog would be a
// mirror nobody could keep in step — see `marketFeed.mjs` for the row list.
//
// **Two routes, and the keyless one is the default.** FRED's documented JSON
// interface needs a free key; the CSV behind the download button on every FRED
// chart needs nothing. A key is preferred when `FRED_API_KEY` is set and the CSV
// is the fallback, so the board reads live with no signup — and a key that is
// set but REJECTED falls through to the keyless read, so a typo degrades to the
// no-key behaviour rather than blanking the board.
//
// Everything here is best-effort and never throws. A series that fails to read
// simply has no observations, and its row keeps the bundled fallback figure with
// the grey Sample dot — which is the honest outcome, and much better than a
// blank or a stale number presented as live.

const FRED_JSON = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const KRAKEN_OHLC = 'https://api.kraken.com/0/public/OHLC';

const TIMEOUT_MS = 12_000;

const key = () => (process.env.FRED_API_KEY || '').trim();

export const fredKeyed = () => key().length > 0;

async function getText(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: '*/*' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// A parsed observation, or null for a row that is a header, blank, or one of
// FRED's "." no-reading markers.
function toObservation(date, raw) {
  const d = String(date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const value = Number(String(raw).trim());
  if (!Number.isFinite(value)) return null;
  const timeMs = Date.parse(`${d}T00:00:00Z`);
  if (!Number.isFinite(timeMs)) return null;
  return { date: d, timeMs, value };
}

// The chart-download CSV. Two columns — a date and the series — with a header
// row this skips by simply refusing any row whose first cell is not a date.
// FRED has shipped the date column under two names over the years
// (`DATE` and `observation_date`), so nothing here reads the header at all.
export function parseFredCsv(body) {
  const out = [];
  for (const line of String(body).split('\n')) {
    const [date = '', value = ''] = line.split(',');
    const parsed = toObservation(date, value);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function parseFredJson(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  const out = [];
  for (const o of json?.observations ?? []) {
    const parsed = toObservation(o?.date ?? '', o?.value ?? '');
    if (parsed) out.push(parsed);
  }
  return out;
}

// Observations for one FRED series, oldest first, from `start` (ISO date).
//
// The two routes are tried in order rather than in parallel: the fallback exists
// for a missing key or a dead endpoint, not to race a working one.
export async function fetchFredSeries(seriesId, start) {
  if (fredKeyed()) {
    const body = await getText(
      `${FRED_JSON}?series_id=${encodeURIComponent(seriesId)}` +
        `&api_key=${encodeURIComponent(key())}` +
        `&file_type=json&observation_start=${start}`,
    );
    const viaJson = body ? parseFredJson(body) : [];
    if (viaJson.length > 0) return viaJson;
  }
  const csv = await getText(`${FRED_CSV}?id=${encodeURIComponent(seriesId)}&cosd=${start}`);
  return csv ? parseFredCsv(csv) : [];
}

// ---- coins ----
//
// Keyless, and the one demo row FRED cannot fill. Kraken's public OHLC endpoint
// is the same keyless source the private board already falls back to for daily
// crypto closes, so the two deployments read a coin the same way.
//
// **Kraken answers HTTP 200 to a refusal**, with the reason in an `error` array,
// so that is checked before anything else is read. Taking the status code at
// face value here would put a fabricated figure on the board.
export function parseKrakenOhlc(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  if (Array.isArray(json?.error) && json.error.length > 0) return [];
  const result = json?.result;
  if (!result || typeof result !== 'object') return [];
  // Kraken names the result key after its own internal pair code (XBTUSD comes
  // back as XXBTZUSD), so the candles are taken from the first array-valued
  // entry rather than from a name this would have to keep a table of.
  const candles = Object.entries(result).find(([k, v]) => k !== 'last' && Array.isArray(v))?.[1];
  if (!Array.isArray(candles)) return [];
  const out = [];
  for (const row of candles) {
    const seconds = Number(row?.[0]);
    const close = Number(row?.[4]);
    if (!Number.isFinite(seconds) || !Number.isFinite(close)) continue;
    const timeMs = seconds * 1000;
    out.push({ date: new Date(timeMs).toISOString().slice(0, 10), timeMs, value: close });
  }
  return out;
}

export async function fetchCoinCloses(pair) {
  const body = await getText(`${KRAKEN_OHLC}?pair=${encodeURIComponent(pair)}&interval=1440`);
  return body ? parseKrakenOhlc(body) : [];
}
