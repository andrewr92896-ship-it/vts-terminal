import { oandaConfig, type OandaConfig } from './config.js';
import { getAllActiveDecrypted, type OandaCreds } from './connections.js';
import { fetchOandaPrices } from './brokers/oanda.js';
import { fetchCryptoPrices, isCryptoInstrument } from './brokers/crypto.js';

// Shared live-price source for anything that needs a mark independent of an open
// position — today the price-alert watch. Instruments are routed by kind: crypto
// pairs go to a keyless public feed (no connection needed); forex, metals and
// indices go to OANDA. OANDA prices are account-independent (the same market data
// on every account), so ANY working OANDA connection can price arbitrary
// instruments. We prefer the env-config OANDA account, then fall back to the
// first active OANDA broker connection on the install. Returns null when no OANDA
// credentials exist anywhere — non-crypto callers then simply can't mark.

export async function resolveOandaPricingConfig(): Promise<OandaConfig | null> {
  const env = oandaConfig();
  if (env) return env;

  // Borrow any active OANDA connection purely as a pricing source. Load the whole
  // install (no scope) — we're not surfacing anyone's positions, only reading
  // shared market data through their account.
  const conns = await getAllActiveDecrypted();
  const oanda = conns.find((c) => c.broker === 'oanda');
  if (!oanda) return null;
  const cr = oanda.creds as OandaCreds;
  return {
    token: cr.token,
    accountId: cr.accountId,
    base: cr.env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com',
  };
}

// Live mid prices for the given instruments (display form, e.g. "EUR/USD" or
// "BTC/USDT"), keyed by that same display form. Crypto is priced from the keyless
// public feed; the rest from OANDA when a source is configured. Unpriceable
// instruments are simply absent. Best-effort — never throws.
export async function fetchLivePrices(instruments: string[]): Promise<Map<string, number>> {
  if (instruments.length === 0) return new Map();

  const crypto: string[] = [];
  const oanda: string[] = [];
  for (const i of instruments) (isCryptoInstrument(i) ? crypto : oanda).push(i);

  const out = new Map<string, number>();

  if (crypto.length > 0) {
    for (const [k, v] of await fetchCryptoPrices(crypto)) out.set(k, v);
  }

  if (oanda.length > 0) {
    const cfg = await resolveOandaPricingConfig();
    if (cfg) {
      try {
        for (const [k, v] of await fetchOandaPrices(cfg, oanda)) out.set(k, v);
      } catch {
        /* leave OANDA marks absent — crypto marks (if any) still returned */
      }
    }
  }

  return out;
}

// Whether an OANDA pricing source is configured right now. Crypto is always
// priceable (keyless), so this only governs the forex/metals/indices side — the
// price-alert UI uses it for an honest "those need an OANDA connection" hint.
export async function hasPriceSource(): Promise<boolean> {
  return (await resolveOandaPricingConfig()) !== null;
}
