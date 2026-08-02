import { config } from '../../config.js';

// FRED (Federal Reserve Economic Data, St. Louis Fed) — the macro side of the
// Market Data board. One published series in, a list of dated observations out.
//
// **Two routes, and the keyless one is the default.** FRED's documented JSON API
// needs a free key; the CSV behind the download button on every FRED chart
// (`fredgraph.csv?id=…`) needs nothing. This module prefers the JSON API when
// `FRED_API_KEY` is set and falls back to the CSV when it is not, so the board
// reads live on a fresh install with no signup — the same shape as the Market
// News live wall, which watches channels keylessly and spends a key only on the
// extras. Setting the key is the upgrade, not the price of entry: it is the
// documented interface, so it is the one to reach for if the CSV ever stops
// answering.
//
// Everything here is best-effort and never throws. A series that fails to read
// simply has no observations, and its board row keeps the catalog's sample
// figures with the grey Sample dot — which is the honest outcome, and much
// better than a blank or a stale number presented as live.

const FRED_API = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

const TIMEOUT_MS = 12_000;

// One published reading: the date it is *for* (not the date it was released) and
// its value. FRED writes a missing reading as ".", and those are dropped here so
// callers never have to think about them.
export interface FredObservation {
  date: string; // ISO 'YYYY-MM-DD'
  timeMs: number; // that date at UTC midnight, for look-back arithmetic
  value: number;
}

export function fredConfigured(): boolean {
  return !!config.FRED_API_KEY;
}

async function getText(url: string): Promise<string | null> {
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
function toObservation(date: string, raw: string): FredObservation | null {
  const d = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) return null;
  const timeMs = Date.parse(`${d}T00:00:00Z`);
  if (!Number.isFinite(timeMs)) return null;
  return { date: d, timeMs, value };
}

interface FredApiResponse {
  observations?: { date?: string; value?: string }[];
}

async function readViaApi(seriesId: string, start: string): Promise<FredObservation[]> {
  const url =
    `${FRED_API}?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(config.FRED_API_KEY ?? '')}` +
    `&file_type=json&observation_start=${start}`;
  const body = await getText(url);
  if (!body) return [];
  let json: FredApiResponse;
  try {
    json = JSON.parse(body) as FredApiResponse;
  } catch {
    return [];
  }
  const out: FredObservation[] = [];
  for (const o of json.observations ?? []) {
    const parsed = toObservation(o.date ?? '', o.value ?? '');
    if (parsed) out.push(parsed);
  }
  return out;
}

// The chart-download CSV. Two columns — a date and the series — with a header
// row this skips by simply refusing any row whose first cell is not a date.
// FRED has shipped the date column under two names over the years
// (`DATE` and `observation_date`), so nothing here reads the header at all.
export function parseFredCsv(body: string): FredObservation[] {
  const out: FredObservation[] = [];
  for (const line of body.split('\n')) {
    const [date = '', value = ''] = line.split(',');
    const parsed = toObservation(date, value);
    if (parsed) out.push(parsed);
  }
  return out;
}

async function readViaCsv(seriesId: string, start: string): Promise<FredObservation[]> {
  const url = `${FRED_CSV}?id=${encodeURIComponent(seriesId)}&cosd=${start}`;
  const body = await getText(url);
  if (!body) return [];
  return parseFredCsv(body);
}

// Observations for one FRED series, oldest first, from `start` (ISO date).
//
// The two routes are tried in order rather than in parallel: the fallback exists
// for a missing key or a dead endpoint, not to race a working one. A key that is
// set but rejected (revoked, typo'd) still falls through to the keyless read, so
// a bad key degrades to the no-key behaviour instead of taking the board down.
export async function fetchFredSeries(
  seriesId: string,
  start: string,
): Promise<FredObservation[]> {
  if (config.FRED_API_KEY) {
    const viaApi = await readViaApi(seriesId, start);
    if (viaApi.length > 0) return viaApi;
  }
  return readViaCsv(seriesId, start);
}
