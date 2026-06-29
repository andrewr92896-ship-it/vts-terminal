import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { TradeSide } from '../../api/types';

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
  source: 'live' | 'sample' | null;
  generatedAt: number | null;
  // Look up the current mark for a free-typed instrument (e.g. "EUR/USD",
  // "eur_usd", "EURUSD" all resolve to the same wall position).
  priceFor: (instrument: string | null | undefined) => LiveMark | null;
}

const REFRESH_MS = 30_000;

// Funded instruments are typed/screenshot-read free text ("EUR/USD", "NAS100"),
// while the wall uses broker symbols ("EUR_USD"). Strip separators and case so
// the two line up.
function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function useLivePrices(): LivePrices {
  const [marks, setMarks] = useState<Map<string, LiveMark>>(new Map());
  const [source, setSource] = useState<'live' | 'sample' | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const wall = await api.liveWall();
      if (!alive.current) return;
      const next = new Map<string, LiveMark>();
      // The wall is sorted newest-first; keep the first mark per instrument and
      // prefer a real price over none.
      for (const t of wall.trades) {
        if (t.currentPrice == null) continue;
        const key = normalize(t.instrument);
        if (!key || next.has(key)) continue;
        next.set(key, { instrument: t.instrument, price: t.currentPrice, side: t.side, owner: t.owner });
      }
      setMarks(next);
      setSource(wall.source);
      setGeneratedAt(wall.generatedAt);
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

  return { marks, source, generatedAt, priceFor };
}
