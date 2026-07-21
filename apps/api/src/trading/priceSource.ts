import { oandaConfig, type OandaConfig } from './config.js';
import { getAllActiveDecrypted, type OandaCreds } from './connections.js';
import { fetchOandaPrices } from './brokers/oanda.js';

// Shared live-price source for anything that needs a mark independent of an open
// position — today the price-alert watch. OANDA prices are account-independent
// (the same market data on every account), so ANY working OANDA connection can
// price arbitrary instruments. We prefer the env-config OANDA account, then fall
// back to the first active OANDA broker connection on the install. Returns null
// when no OANDA credentials exist anywhere — callers then simply can't mark.

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

// Live mid prices for the given instruments (display form, e.g. "EUR/USD"),
// keyed by that same display form. Empty map when no OANDA source is available
// or none of the instruments are priceable. Best-effort — never throws.
export async function fetchLivePrices(instruments: string[]): Promise<Map<string, number>> {
  if (instruments.length === 0) return new Map();
  const cfg = await resolveOandaPricingConfig();
  if (!cfg) return new Map();
  try {
    return await fetchOandaPrices(cfg, instruments);
  } catch {
    return new Map();
  }
}

// Whether any OANDA pricing source is configured right now. Used to give the
// price-alert UI an honest "price alerts need an OANDA connection" hint.
export async function hasPriceSource(): Promise<boolean> {
  return (await resolveOandaPricingConfig()) !== null;
}
