import { getActiveDecrypted, type OandaCreds } from './connections.js';
import { fetchOandaAccountSummary } from './brokers/oanda.js';

// Live capital from the broker accounts that actually report it (OANDA has a
// real API, so its NAV/balance moves the moment a trade is placed or closed).
// Shown on Account Metrics, gated to full traders (not the view-only role) at
// the route. Scoped to the calling trader's own OANDA connections.

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
  generatedAt: number;
}

function oandaBase(env: OandaCreds['env']): string {
  return env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
}

export async function getOandaCapital(userId: string): Promise<OandaCapital> {
  const conns = (await getActiveDecrypted(userId)).filter((c) => c.broker === 'oanda');
  const generatedAt = Date.now();
  if (conns.length === 0) {
    return { configured: false, accounts: [], currency: null, balance: null, nav: null, unrealizedPl: null, generatedAt };
  }

  const accounts: OandaCapitalAccount[] = await Promise.all(
    conns.map(async (c) => {
      const cr = c.creds as OandaCreds;
      try {
        const cap = await fetchOandaAccountSummary({ token: cr.token, accountId: cr.accountId, base: oandaBase(cr.env) });
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

  return {
    configured: true,
    accounts,
    currency: sameCcy,
    balance: sameCcy ? sum((a) => a.balance) : null,
    nav: sameCcy ? sum((a) => a.nav) : null,
    unrealizedPl: sameCcy ? sum((a) => a.unrealizedPl) : null,
    generatedAt,
  };
}
