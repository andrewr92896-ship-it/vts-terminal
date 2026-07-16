import type { CSSProperties } from 'react';
import type { BoardTile, BoardTileKind } from '../../api/types';

// Shared config for the Live Wall chart board: the trading palette, the
// TradingView candle-style / interval / indicator option lists, and a small
// symbol dictionary that maps the desk's instruments to TradingView symbols.
// All of it feeds the ChartTile / WatchlistTile widgets and their editors.

// Trading navy/gold palette — matches the Live Wall so the board reads as one
// screen. (The trading screens each own their palette; kept in sync by hand.)
export const GOLD = '#EBCB74';
export const GREEN = '#35c47b';
export const RED = '#ef5468';
export const TEXT = '#eef3ff';
export const MUTED = '#9fb0d6';
export const FAINT = '#6f84b0';
export const CARD = 'rgba(13,31,68,.5)';
export const PANEL = 'rgba(11,26,58,.72)';
export const BORDER = '#16294f';
export const BORDER2 = '#1c3a7a';
export const MONO = "'IBM Plex Mono', monospace";

// TradingView Advanced Chart "style" codes. Candles and Heikin Ashi are the two
// the desk cares about most; the rest are available from the chart toolbar too.
export const CANDLE_STYLES: { code: string; label: string }[] = [
  { code: '1', label: 'Candles' },
  { code: '8', label: 'Heikin Ashi' },
  { code: '9', label: 'Hollow' },
  { code: '0', label: 'Bars' },
  { code: '2', label: 'Line' },
  { code: '3', label: 'Area' },
  { code: '10', label: 'Baseline' },
];

// TradingView interval codes → friendly labels.
export const INTERVALS: { code: string; label: string }[] = [
  { code: '1', label: '1m' },
  { code: '5', label: '5m' },
  { code: '15', label: '15m' },
  { code: '30', label: '30m' },
  { code: '60', label: '1h' },
  { code: '240', label: '4h' },
  { code: 'D', label: '1D' },
  { code: 'W', label: '1W' },
];

// A curated set of TradingView "basic studies" for the indicator picker.
export const STUDIES: { id: string; label: string }[] = [
  { id: 'RSI@tv-basicstudies', label: 'RSI' },
  { id: 'MACD@tv-basicstudies', label: 'MACD' },
  { id: 'MAExp@tv-basicstudies', label: 'EMA' },
  { id: 'MASimple@tv-basicstudies', label: 'SMA' },
  { id: 'BB@tv-basicstudies', label: 'Bollinger Bands' },
  { id: 'VWAP@tv-basicstudies', label: 'VWAP' },
  { id: 'Volume@tv-basicstudies', label: 'Volume' },
  { id: 'Stochastic@tv-basicstudies', label: 'Stochastic' },
  { id: 'ATR@tv-basicstudies', label: 'ATR' },
  { id: 'IchimokuCloud@tv-basicstudies', label: 'Ichimoku' },
  { id: 'PivotPointsStandard@tv-basicstudies', label: 'Pivots' },
];

// Common desk instruments → TradingView symbols, for the symbol pickers. Users
// can also type any TradingView symbol (e.g. "NASDAQ:AAPL", "COINBASE:SOLUSD").
export const SYMBOL_SUGGESTIONS: { symbol: string; label: string }[] = [
  { symbol: 'OANDA:EURUSD', label: 'EUR/USD' },
  { symbol: 'OANDA:GBPUSD', label: 'GBP/USD' },
  { symbol: 'OANDA:USDJPY', label: 'USD/JPY' },
  { symbol: 'OANDA:AUDUSD', label: 'AUD/USD' },
  { symbol: 'OANDA:USDCAD', label: 'USD/CAD' },
  { symbol: 'OANDA:NZDUSD', label: 'NZD/USD' },
  { symbol: 'OANDA:USDCHF', label: 'USD/CHF' },
  { symbol: 'OANDA:XAUUSD', label: 'Gold (XAU/USD)' },
  { symbol: 'OANDA:XAGUSD', label: 'Silver (XAG/USD)' },
  { symbol: 'OANDA:NAS100USD', label: 'NAS100' },
  { symbol: 'OANDA:US30USD', label: 'US30 (Dow)' },
  { symbol: 'OANDA:SPX500USD', label: 'SPX500' },
  { symbol: 'OANDA:BCOUSD', label: 'Brent Crude' },
  { symbol: 'OANDA:WTICOUSD', label: 'WTI Crude' },
  { symbol: 'BINANCE:BTCUSDT', label: 'BTC/USD' },
  { symbol: 'BINANCE:ETHUSDT', label: 'ETH/USD' },
  { symbol: 'BINANCE:SOLUSDT', label: 'SOL/USD' },
];

// The friendly label for a TradingView symbol, if we know it; else the bare
// symbol after the exchange prefix (e.g. "NASDAQ:AAPL" → "AAPL").
export function symbolLabel(symbol: string): string {
  const hit = SYMBOL_SUGGESTIONS.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
  if (hit) return hit.label;
  const parts = symbol.split(':');
  return parts[parts.length - 1] || symbol;
}

export function styleLabel(code: string | undefined): string {
  return CANDLE_STYLES.find((s) => s.code === code)?.label ?? 'Candles';
}
export function intervalLabel(code: string | undefined): string {
  return INTERVALS.find((i) => i.code === code)?.label ?? code ?? '1h';
}

// Defaults for a freshly-added tile of each kind.
export function newTile(kind: BoardTileKind, at: { x: number; y: number }): BoardTile {
  const id = `${kind}-${Math.round(at.x)}-${Math.round(at.y)}-${idCounter()}`;
  if (kind === 'chart') {
    return { id, kind, x: at.x, y: at.y, w: 6, h: 14, symbol: 'OANDA:EURUSD', interval: '60', style: '1', studies: [] };
  }
  if (kind === 'positions') {
    return { id, kind, x: at.x, y: at.y, w: 4, h: 12, title: 'Open Positions' };
  }
  return {
    id,
    kind,
    x: at.x,
    y: at.y,
    w: 12,
    h: 3,
    title: 'Watchlist',
    symbols: ['OANDA:EURUSD', 'OANDA:GBPUSD', 'OANDA:XAUUSD', 'OANDA:NAS100USD', 'BINANCE:BTCUSDT'],
  };
}

// The default board a trader sees before they've saved any presets: a ticker
// strip across the top and a single chart below it.
export function starterTiles(): BoardTile[] {
  return [
    {
      id: `watchlist-start-${idCounter()}`,
      kind: 'watchlist',
      x: 0,
      y: 0,
      w: 12,
      h: 3,
      title: 'Watchlist',
      symbols: ['OANDA:EURUSD', 'OANDA:GBPUSD', 'OANDA:USDJPY', 'OANDA:XAUUSD', 'OANDA:NAS100USD', 'BINANCE:BTCUSDT'],
    },
    // Chart and the live positions list side by side, so a fresh board already
    // shows charts and open positions on one screen.
    { id: `chart-start-${idCounter()}`, kind: 'chart', x: 0, y: 3, w: 8, h: 16, symbol: 'OANDA:EURUSD', interval: '60', style: '1', studies: [] },
    { id: `positions-start-${idCounter()}`, kind: 'positions', x: 8, y: 3, w: 4, h: 16, title: 'Open Positions' },
  ];
}

// A monotonic counter so ids added in the same millisecond don't collide
// (Date.now() alone can repeat within a burst of "Add chart" clicks).
let _n = 0;
function idCounter(): number {
  _n = (_n + 1) % 100000;
  return _n;
}

// Small shared styles reused by the tiles/board editors.
export const chip: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: MUTED,
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '3px 8px',
  background: 'rgba(255,255,255,.03)',
};
export const ghostBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#dfe7fa',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  padding: '7px 12px',
  borderRadius: 7,
  cursor: 'pointer',
};
export const goldBtn: CSSProperties = {
  border: 'none',
  background: `linear-gradient(180deg,${GOLD},#C9A24B)`,
  color: '#0c2768',
  fontWeight: 700,
  fontSize: 11.5,
  padding: '8px 14px',
  borderRadius: 7,
  cursor: 'pointer',
};
export const input: CSSProperties = {
  fontSize: 12,
  color: TEXT,
  background: 'rgba(4,12,30,.6)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 7,
  padding: '7px 9px',
  fontFamily: 'inherit',
  outline: 'none',
};
