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

// OLDEST FIRST, ALWAYS. Both routes happen to serve ascending today and
// everything downstream depends on it — the latest reading is read off the end
// of the array, and the look-back walk stops at the first observation past its
// target, which is only correct on a sorted one. Established here rather than
// assumed: a provider that changed its mind about the order would otherwise put
// the wrong figure on the board, silently, looking like an ordinary number.
const sorted = (rows: FredObservation[]): FredObservation[] =>
  rows.sort((a, b) => a.timeMs - b.timeMs);

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
  return sorted(out);
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
  return sorted(out);
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

// ---- release schedules ----
//
// When a figure was actually PUBLISHED, and when it is published next. This is
// the one thing the observations cannot answer: a FRED observation is dated for
// the period it *measures* — June CPI is dated 2026-06-01 and released in July —
// so the board's "Last → next review" column has always carried hand-entered
// catalog dates instead.
//
// **Keyed only.** There is no keyless equivalent of these two endpoints, so an
// install with no `FRED_API_KEY` keeps the catalog's dates. That asymmetry is
// the deliberate cost of having the column be real where it can be.
//
//   /fred/series/release?series_id=CPIAUCSL   -> which release publishes it
//   /fred/release/dates?release_id=10         -> that release's dates
//
// `include_release_dates_with_no_data=true` is what makes FUTURE dates appear —
// without it the response stops at the last release that actually carried data,
// which is exactly the half we already had.

const FRED_RELEASE_OF_SERIES = 'https://api.stlouisfed.org/fred/series/release';
const FRED_RELEASE_DATES = 'https://api.stlouisfed.org/fred/release/dates';

async function getJson<T>(url: string): Promise<T | null> {
  const body = await getText(url);
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

// Which release publishes a series. Stable forever in practice, so the caller
// caches it for the life of the process.
export async function fetchFredReleaseId(seriesId: string): Promise<number | null> {
  if (!config.FRED_API_KEY) return null;
  const json = await getJson<{ releases?: { id?: number }[] }>(
    `${FRED_RELEASE_OF_SERIES}?series_id=${encodeURIComponent(seriesId)}` +
      `&api_key=${encodeURIComponent(config.FRED_API_KEY)}&file_type=json`,
  );
  const id = json?.releases?.[0]?.id;
  return typeof id === 'number' ? id : null;
}

// Every date a release publishes on, within a window, oldest first.
export async function fetchFredReleaseDates(
  releaseId: number,
  from: string,
  to: string,
): Promise<string[]> {
  if (!config.FRED_API_KEY) return [];
  const json = await getJson<{ release_dates?: { date?: string }[] }>(
    `${FRED_RELEASE_DATES}?release_id=${releaseId}` +
      `&api_key=${encodeURIComponent(config.FRED_API_KEY)}&file_type=json` +
      `&realtime_start=${from}&realtime_end=${to}` +
      `&include_release_dates_with_no_data=true&sort_order=asc`,
  );
  const out: string[] = [];
  for (const d of json?.release_dates ?? []) {
    const date = (d.date ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) out.push(date);
  }
  return out;
}
