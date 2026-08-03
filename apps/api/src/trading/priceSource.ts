import { oandaPricingConfig, type OandaConfig } from './config.js';
import { fetchOandaPrices } from './brokers/oanda.js';
import { fetchCryptoPrices, isCryptoInstrument } from './brokers/crypto.js';

// Shared live-price source for anything that needs a mark independent of an open
// position — the Market Data board and the price-alert watch. Instruments are
// routed by kind: crypto pairs go to a keyless public feed (no credential at
// all); forex, metals and indices go to OANDA.
//
// **Pricing is install-owned. It never touches a user's broker connection.**
//
// It used to. OANDA's rates are account-independent, so any working OANDA
// connection can price any instrument — and this borrowed the first active one on
// the whole install when the environment had none of its own. That is indefensible
// once the terminal has customers rather than one team: the borrowed-from trader
// was never told, could not see it, could not opt out, and every call spent their
// rate limit and appeared in their account activity as theirs. It fed the Market
// Data board (every signed-in account, ~20 calls on a cold pass, polled every two
// minutes per open tab) and every price alert on the install (a 20-second loop) —
// so one customer's key was quietly serving every other customer.
//
// The replacement is a dedicated practice account of the install's own
// (`OANDA_PRICING_*`), which prices the board exactly as well because the rates
// are the same, and reaches nothing if it leaks. With none configured, non-crypto
// instruments simply go unpriced — see the degradation notes on each caller.

// Resolved from the environment, synchronously and with no database access. The
// synchronousness is the point rather than a tidy-up: a function that cannot
// await cannot read a connection, so "pricing never borrows a customer's
// credential" is enforced by the shape of the code instead of by a comment.
export function resolveOandaPricingConfig(): OandaConfig | null {
  return oandaPricingConfig();
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
    const cfg = resolveOandaPricingConfig();
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
// price-alert UI uses it for an honest "those cannot be marked here" hint.
//
// This is a free environment read. It used to decrypt every broker credential on
// the install to answer a boolean, on an ordinary authenticated GET that any
// signed-in user could call.
export function hasPriceSource(): boolean {
  return resolveOandaPricingConfig() !== null;
}
