import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { configFrom, type BreakEvenConfig } from './outcome';
import type { LiveWall, TradeSide } from '../../api/types';

// Current marks for the instruments currently open on the desk, read straight
// from the Live Wall. The Funded section has no price feed of its own (FTP/prop
// accounts have no API), so it borrows the same marks the rest of the desk sees
// to show the current price of whatever a funded trade is in.
export interface LiveMark {
  instrument: string; // the symbol as it appears on the Live Wall
  price: number;
  side: TradeSide;
  owner: string;
}

export interface LivePrices {
  marks: Map<string, LiveMark>; // keyed by normalized symbol
  // Taken off the wall payload rather than restated, so a new state there can
  // never leave this reporting one of two when the wall has three.
  source: LiveWall['source'] | null;
  generatedAt: number | null;
  // Look up the current mark for a free-typed instrument (e.g. "EUR/USD",
  // "eur_usd", "EURUSD" all resolve to the same wall position).
  priceFor: (instrument: string | null | undefined) => LiveMark | null;
  // What an OPEN funded position is currently up or down, keyed by the funded
  // trade's own id. Deliberately the desk's own figure rather than one derived
  // here: a funded position's P/L is pip math against an OANDA mid, and only the
  // server knows the money-per-pip and the FTP lot-to-unit scaling. Reading it
  // off the wall is what keeps the funded stats and the Live Wall agreeing about
  // the same position. Null means the desk could not mark it (no price source,
  // or a non-forex instrument with no contract size to assume).
  fundedPlFor: (tradeId: string) => number | null;
  // The viewer's own break-even buffer, as the wall sends it — so a screen
  // scoring hand-kept trades classifies a scratch the same way the Trade Log
  // does. Null until the first read lands.
  breakEven: BreakEvenConfig | null;
}

const REFRESH_MS = 30_000;

// Funded instruments are typed/screenshot-read free text ("EUR/USD", "NAS100"),
// while the wall uses broker symbols ("EUR_USD"). Strip separators and case so
// the two line up.
function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// A funded position reaches the wall under this id (see loadFundedLiveTrades),
// which is what lets its P/L be read back out. A sample trade never carries it.
const FUNDED_PREFIX = 'funded:';

export function useLivePrices(): LivePrices {
  const [marks, setMarks] = useState<Map<string, LiveMark>>(new Map());
  const [fundedPl, setFundedPl] = useState<Map<string, number | null>>(new Map());
  const [source, setSource] = useState<LiveWall['source'] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [breakEven, setBreakEven] = useState<BreakEvenConfig | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const wall = await api.liveWall();
      if (!alive.current) return;
      const next = new Map<string, LiveMark>();
      const pl = new Map<string, number | null>();
      // The wall is sorted newest-first; keep the first mark per instrument and
      // prefer a real price over none.
      for (const t of wall.trades) {
        if (t.id.startsWith(FUNDED_PREFIX)) pl.set(t.id.slice(FUNDED_PREFIX.length), t.unrealizedPl);
        if (t.currentPrice == null) continue;
        const key = normalize(t.instrument);
        if (!key || next.has(key)) continue;
        next.set(key, { instrument: t.instrument, price: t.currentPrice, side: t.side, owner: t.owner });
      }
      setMarks(next);
      setFundedPl(pl);
      setSource(wall.source);
      setGeneratedAt(wall.generatedAt);
      setBreakEven(configFrom(wall));
    } catch {
      // A failed price refresh is non-fatal — the funded section works without it.
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  const priceFor = useCallback(
    (instrument: string | null | undefined): LiveMark | null => {
      if (!instrument) return null;
      return marks.get(normalize(instrument)) ?? null;
    },
    [marks],
  );

  const fundedPlFor = useCallback((tradeId: string): number | null => fundedPl.get(tradeId) ?? null, [fundedPl]);

  return { marks, source, generatedAt, priceFor, fundedPlFor, breakEven };
}
