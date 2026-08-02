import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { InvestmentPortfolio } from '../../api/types';

// The portfolio is read by four of the eight screens (Overview, Accounts,
// Holdings, Allocation). Routing in this app is state-based, so switching
// between them unmounts and remounts — without a shared snapshot every switch
// would repaint from a spinner and re-hit the price provider.
//
// So the last good payload is held module-side and served immediately on mount
// while a fresh read runs behind it: stale-while-revalidate, the same shape the
// Market Data board uses server-side. A write anywhere in the workspace calls
// `publishPortfolio` with the recomputed payload every mutating endpoint
// returns, so the other screens are already correct when you reach them.

let snapshot: InvestmentPortfolio | null = null;
const listeners = new Set<(p: InvestmentPortfolio) => void>();

export function publishPortfolio(p: InvestmentPortfolio): void {
  snapshot = p;
  for (const fn of listeners) fn(p);
}

/** Drop the shared snapshot — used on sign-out so one account never briefly
 *  paints the previous account's figures. */
export function clearPortfolioCache(): void {
  snapshot = null;
}

export interface PortfolioState {
  portfolio: InvestmentPortfolio | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function usePortfolio(): PortfolioState {
  const [portfolio, setPortfolio] = useState<InvestmentPortfolio | null>(snapshot);
  const [loading, setLoading] = useState(snapshot == null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    setError(null);
    if (snapshot == null) setLoading(true);
    api
      .investmentPortfolio()
      .then((p) => {
        if (!alive) return;
        publishPortfolio(p);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Could not load your portfolio');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const off = load();
    listeners.add(setPortfolio);
    return () => {
      off();
      listeners.delete(setPortfolio);
    };
  }, [load]);

  return { portfolio, loading, error, reload: load };
}
