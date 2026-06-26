import { getActiveDecrypted, type OandaCreds } from './connections.js';
import { fetchOandaAccountSummary, fetchOandaClosedTrades, type OandaClosedTradePnl } from './brokers/oanda.js';

// Live capital from the broker accounts that actually report it (OANDA has a
// real API, so its NAV/balance moves the moment a trade is placed or closed).
// Shown on Account Metrics, gated to full traders (not the view-only role) at
// the route. Scoped to the calling trader's own OANDA connections.

// Capital gained from trades over rolling windows. Built from closed-trade
// realized P/L only, so adding/withdrawing money never shows up as a "gain".
export interface OandaPnl {
  daily: number; // since the start of today (Eastern Time)
  weekly: number; // last 7 days
  monthly: number; // last 30 days
}

export interface OandaCapitalAccount {
  connectionId: string;
  label: string;
  currency: string;
  balance: number | null;
  nav: number | null; // balance + open P/L — the "capital" figure
  unrealizedPl: number | null;
  marginUsed: number | null;
  marginAvailable: number | null;
  openTradeCount: number | null;
  pnl: OandaPnl | null; // capital gained from trades; null if history couldn't be read
  ok: boolean;
  error: string | null;
}

export interface OandaCapital {
  configured: boolean; // the trader has at least one active OANDA connection
  accounts: OandaCapitalAccount[];
  // Combined totals across the accounts, present only when every account shares
  // one currency (so we never add GBP to USD). Null otherwise — read per account.
  currency: string | null;
  balance: number | null;
  nav: number | null;
  unrealizedPl: number | null;
  pnl: OandaPnl | null; // combined capital gained from trades (single-currency only)
  generatedAt: number;
}

function oandaBase(env: OandaCreds['env']): string {
  return env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
}

// Start of "today" in Eastern Time as a UTC timestamp, robust to the server's
// own timezone — we subtract the seconds elapsed since ET midnight from now.
function etDayStart(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const secsIntoDay = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  return now - secsIntoDay * 1000 - (now % 1000);
}

// Total realized P/L of trades closed at/after `since`.
function sumSince(trades: OandaClosedTradePnl[], since: number): number {
  const total = trades.reduce((s, t) => (t.closeTimeMs >= since ? s + t.realizedPl : s), 0);
  return Number(total.toFixed(2));
}

function pnlWindows(trades: OandaClosedTradePnl[], now: number): OandaPnl {
  return {
    daily: sumSince(trades, etDayStart(now)),
    weekly: sumSince(trades, now - 7 * 86_400_000),
    monthly: sumSince(trades, now - 30 * 86_400_000),
  };
}

export async function getOandaCapital(userId: string): Promise<OandaCapital> {
  const conns = (await getActiveDecrypted(userId)).filter((c) => c.broker === 'oanda');
  const generatedAt = Date.now();
  if (conns.length === 0) {
    return { configured: false, accounts: [], currency: null, balance: null, nav: null, unrealizedPl: null, pnl: null, generatedAt };
  }

  const accounts: OandaCapitalAccount[] = await Promise.all(
    conns.map(async (c) => {
      const cr = c.creds as OandaCreds;
      const cfg = { token: cr.token, accountId: cr.accountId, base: oandaBase(cr.env) };
      try {
        // Capital and trade-only P/L windows in parallel. The closed-trade pull
        // is best-effort — if only it fails, we still show the capital figures.
        const [cap, trades] = await Promise.all([
          fetchOandaAccountSummary(cfg),
          fetchOandaClosedTrades(cfg).catch(() => null),
        ]);
        return {
          connectionId: c.id,
          label: c.label,
          currency: cap.currency,
          balance: cap.balance,
          nav: cap.nav,
          unrealizedPl: cap.unrealizedPl,
          marginUsed: cap.marginUsed,
          marginAvailable: cap.marginAvailable,
          openTradeCount: cap.openTradeCount,
          pnl: trades ? pnlWindows(trades, generatedAt) : null,
          ok: true,
          error: null,
        };
      } catch (err) {
        return {
          connectionId: c.id,
          label: c.label,
          currency: 'USD',
          balance: null,
          nav: null,
          unrealizedPl: null,
          marginUsed: null,
          marginAvailable: null,
          openTradeCount: null,
          pnl: null,
          ok: false,
          error: err instanceof Error ? err.message : 'Fetch failed',
        };
      }
    }),
  );

  // Combine only when every responding account shares one currency.
  const ok = accounts.filter((a) => a.ok);
  const currencies = new Set(ok.map((a) => a.currency));
  const sameCcy = currencies.size === 1 ? [...currencies][0] : null;
  const sum = (pick: (a: OandaCapitalAccount) => number | null): number | null => {
    const vals = ok.map(pick).filter((v): v is number => v != null);
    return vals.length ? Number(vals.reduce((s, v) => s + v, 0).toFixed(2)) : null;
  };

  // Combined trade-only P/L windows, single-currency only.
  const okPnl = ok.map((a) => a.pnl).filter((p): p is OandaPnl => p != null);
  const combinedPnl: OandaPnl | null =
    sameCcy && okPnl.length
      ? {
          daily: Number(okPnl.reduce((s, p) => s + p.daily, 0).toFixed(2)),
          weekly: Number(okPnl.reduce((s, p) => s + p.weekly, 0).toFixed(2)),
          monthly: Number(okPnl.reduce((s, p) => s + p.monthly, 0).toFixed(2)),
        }
      : null;

  return {
    configured: true,
    accounts,
    currency: sameCcy,
    balance: sameCcy ? sum((a) => a.balance) : null,
    nav: sameCcy ? sum((a) => a.nav) : null,
    unrealizedPl: sameCcy ? sum((a) => a.unrealizedPl) : null,
    pnl: combinedPnl,
    generatedAt,
  };
}
