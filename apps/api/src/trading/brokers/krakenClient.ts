import crypto from 'node:crypto';
import type { KrakenConfig } from '../config.js';

// Kraken Spot REST — the shared transport. Signing, the nonce, timeouts and
// error decoding live here so the read connector (brokers/kraken.ts) and the
// write connector (brokers/krakenOrders.ts) speak to Kraken the same way.
//
// This file cannot trade on its own: it knows how to sign a request, not which
// paths exist. AddOrder / CancelOrder are only ever named in krakenOrders.ts, so
// the file that can move money stays one small, auditable unit — the same split
// OANDA has between brokers/oanda.ts and brokers/oandaOrders.ts.
//
// Two things about this API that are easy to get wrong, and that everything
// below is shaped around:
//
//   1. **A refusal comes back as HTTP 200.** Kraken answers 200 with
//      `{"error":["EOrder:Insufficient funds"],"result":{}}`. Reading `res.ok`
//      as success reports a trade that never happened — the same trap OANDA
//      sets by answering 201 to an order it immediately cancels. The `error`
//      array is checked first here, before the status, so no caller can skip it.
//   2. **The nonce must strictly increase per API key, forever.** Two requests
//      inside the same millisecond would otherwise collide and Kraken rejects
//      the second with `EAPI:Invalid nonce` — and a desk fires several calls at
//      once, so this is not theoretical. `nextNonce()` is monotonic across the
//      whole process for exactly that reason.

const API_BASE = 'https://api.kraken.com';
const TIMEOUT_MS = 12_000;

// A Kraken refusal, carrying its own code ("EOrder:Insufficient funds",
// "EAPI:Invalid key", …) so the ticket can show what the exchange actually said
// rather than "failed".
export class KrakenError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'KrakenError';
    this.code = code;
  }
}

// Monotonic per-process nonce. Kraken counts nonces per API key and refuses any
// value that is not higher than the last one it saw, so microsecond-resolution
// wall time alone is not enough under concurrency.
let lastNonce = 0;
export function nextNonce(): string {
  const now = Date.now() * 1000;
  lastNonce = now > lastNonce ? now : lastNonce + 1;
  return String(lastNonce);
}

// API-Sign = HMAC-SHA512(base64decode(privateKey), path + SHA256(nonce + body)).
function sign(path: string, body: string, nonce: string, secret: string): string {
  const secretBuf = Buffer.from(secret, 'base64');
  const hash = crypto.createHash('sha256').update(nonce + body).digest();
  const hmac = crypto.createHmac('sha512', secretBuf);
  hmac.update(path);
  hmac.update(hash);
  return hmac.digest('base64');
}

interface KrakenEnvelope<T> {
  error?: string[];
  result?: T;
}

// The handful of codes worth restating in plain words. Anything else is shown
// verbatim — Kraken's own wording is usually clearer than a paraphrase, and a
// code we have never seen must not be swallowed.
const FRIENDLY: Record<string, string> = {
  'EAPI:Invalid key': 'Kraken rejected the API key',
  'EAPI:Invalid signature': 'Kraken rejected the API key’s signature — check the private key was pasted whole',
  'EAPI:Invalid nonce': 'Kraken rejected the request as out of order — try again',
  'EGeneral:Permission denied': 'This Kraken key is not permitted to do that — check its permissions',
  'EOrder:Insufficient funds': 'Not enough funds in the account for that order',
  'EOrder:Order minimum not met': 'That size is below Kraken’s minimum for this pair',
  'EOrder:Cost minimum not met': 'That order is worth less than Kraken’s minimum for this pair',
  'EOrder:Rate limit exceeded': 'Too many orders sent to Kraken just now — wait a moment',
  'EService:Unavailable': 'Kraken is temporarily unavailable',
  'EService:Busy': 'Kraken is busy — try again in a moment',
};

function raise(errors: string[]): never {
  // Kraken can return several; the first is the actionable one. Warnings are
  // prefixed "W" and are not failures, so they are filtered out before this.
  const code = errors[0] ?? 'EGeneral:Unknown';
  throw new KrakenError(FRIENDLY[code] ?? `Kraken: ${code}`, code);
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new KrakenError(
      aborted ? 'Kraken did not respond in time' : 'Could not reach Kraken',
      aborted ? 'TIMEOUT' : 'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: KrakenEnvelope<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as KrakenEnvelope<T>) : null;
  } catch {
    json = null;
  }

  // The error array first, deliberately: a refusal rides on a 200.
  const errors = (json?.error ?? []).filter((e) => !e.startsWith('W'));
  if (errors.length > 0) raise(errors);

  if (!res.ok) {
    if (res.status === 429) throw new KrakenError('Kraken is rate-limiting this key — wait a moment', 'RATE_LIMIT');
    throw new KrakenError(`Kraken responded ${res.status}`, `HTTP_${res.status}`);
  }
  if (!json || json.result === undefined) {
    throw new KrakenError('Kraken returned nothing for that request', 'EMPTY');
  }
  return json.result;
}

// A public (unauthenticated) market-data call. Used for pairs, tickers and the
// quote-currency conversion the ticket prices risk through.
export async function krakenPublic<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}/0/public/${path}${query ? `?${query}` : ''}`;
  return send<T>(url, { method: 'GET', headers: { Accept: 'application/json' } });
}

// A private (signed) call. Every one is a POST with the nonce in the body.
export async function krakenPrivate<T>(
  cfg: KrakenConfig,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const nonce = nextNonce();
  const body = new URLSearchParams({ nonce, ...params }).toString();
  const urlPath = `/0/private/${path}`;
  return send<T>(API_BASE + urlPath, {
    method: 'POST',
    headers: {
      'API-Key': cfg.apiKey,
      'API-Sign': sign(urlPath, body, nonce, cfg.apiSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
}

// ---- asset naming ----
//
// Kraken carries two names for most things: a legacy code (XXBT, ZUSD, XDG) and
// a modern one. The terminal shows the names a trader reads on a chart — BTC, USD,
// DOGE — so every display path funnels through here, and every request path
// funnels back through `toKrakenAsset`. brokers/kraken.ts already tidied pair
// names this way for the Live Wall; this is the same mapping, shared, so the
// desk and the wall never disagree about what a position is called.

const DISPLAY_ALIASES: Record<string, string> = { XBT: 'BTC', XDG: 'DOGE' };

// Strip Kraken's legacy X/Z prefix from a four-character code (XXBT → XBT,
// ZUSD → USD) and map the result to the name a trader knows.
export function displayAsset(code: string): string {
  const raw = code.trim().toUpperCase();
  // Staked / bonded balances carry a suffix: XBT.S, ETH2.S, USD.M.
  const [base = '', suffix] = raw.split('.');
  const stripped = base.length === 4 && /^[XZ]/.test(base) ? base.slice(1) : base;
  const name = DISPLAY_ALIASES[stripped] ?? stripped;
  return suffix ? `${name}.${suffix}` : name;
}

// Fiat currencies Kraken quotes in. A balance in one of these is cash on the
// account, not a holding to be sold, so the desk lists them separately.
export const KRAKEN_FIAT = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'AED']);
