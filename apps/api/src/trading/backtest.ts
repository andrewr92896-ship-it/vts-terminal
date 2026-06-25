import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingBacktestTrades, type TradeSide } from '../db/schema.js';
import { canonicalStrategy, ensureStrategies, getIgnoreTokens } from './strategies.js';

// Importer for TradingView Strategy Tester "List of Trades" CSV exports. Each
// backtested trade is two rows — an "Entry <side>" row and an "Exit <side>" row
// sharing one "Net PnL USD" — which we fold into a single trade. One file maps
// to one (canonical) strategy; re-importing replaces that strategy's rows.

export interface ParsedBacktestTrade {
  tradeNumber: number;
  side: TradeSide;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number | null; // Net P&L in account USD; null while the trade is open
  openedAt: number; // ms — the entry timestamp
}

// Split one CSV line, honoring simple double-quoted fields.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v.replace(/[^0-9.\-eE]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// "2024-07-09 02:00" → ms (treated as UTC; day-level filtering only).
function parseDateTime(v: string | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v.trim().replace(' ', 'T') + (/\d{2}:\d{2}$/.test(v.trim()) ? ':00Z' : 'Z'));
  return Number.isFinite(t) ? t : null;
}

export function parseTradingViewTrades(csv: string): ParsedBacktestTrade[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Header → column index, tolerant to ordering/casing and a leading BOM.
  const header = splitCsvLine(lines[0].replace(/^﻿/, '')).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iNum = col('trade number');
  const iType = col('type');
  const iDate = col('date and time');
  const iPrice = col('price usd');
  const iPnl = col('net pnl usd');
  if (iType < 0 || iPrice < 0) return []; // not a recognizable List of Trades export

  // Fold the entry/exit rows of each trade number together.
  const byTrade = new Map<number, ParsedBacktestTrade>();
  for (let r = 1; r < lines.length; r++) {
    const f = splitCsvLine(lines[r]);
    const tradeNumber = iNum >= 0 ? num(f[iNum]) : r;
    if (tradeNumber == null) continue;
    const type = (f[iType] ?? '').trim().toLowerCase();
    const isEntry = type.includes('entry') || type.includes('open');
    const isExit = type.includes('exit');
    const side: TradeSide = type.includes('short') ? 'short' : 'long';
    const price = num(f[iPrice]);
    const pnl = iPnl >= 0 ? num(f[iPnl]) : null;

    let t = byTrade.get(tradeNumber);
    if (!t) {
      t = { tradeNumber, side, entryPrice: null, exitPrice: null, pnl: null, openedAt: 0 };
      byTrade.set(tradeNumber, t);
    }
    t.side = side;
    if (isEntry) {
      t.entryPrice = price;
      t.openedAt = parseDateTime(f[iDate]) ?? t.openedAt;
    } else if (isExit) {
      t.exitPrice = price;
      t.pnl = pnl; // realized P&L lives on the closed trade
    }
    // Some exports repeat Net PnL on both rows — keep whichever is non-null.
    if (t.pnl == null && isExit) t.pnl = pnl;
  }

  // Keep only trades that actually opened, in trade order.
  return [...byTrade.values()]
    .filter((t) => t.entryPrice != null && t.openedAt > 0)
    .sort((a, b) => a.tradeNumber - b.tradeNumber);
}

export interface BacktestImportResult {
  strategy: string; // the canonical strategy the rows were attached to
  imported: number;
  wins: number;
  losses: number;
}

export async function importBacktest(
  userId: string,
  strategyName: string,
  csv: string,
): Promise<BacktestImportResult> {
  const ignore = await getIgnoreTokens(userId);
  const strategy = canonicalStrategy(strategyName, ignore);
  if (strategy === 'Unlabeled') throw new Error('Give the strategy a name to import its backtest');

  const trades = parseTradingViewTrades(csv);
  if (trades.length === 0) {
    throw new Error('No trades found — expected a TradingView “List of Trades” CSV export');
  }

  await ensureStrategies(userId, [strategy]);

  const now = new Date();
  const rows = trades.map((t) => ({
    id: crypto.randomUUID(),
    userId,
    strategy,
    side: t.side,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    pnl: t.pnl,
    openedAt: new Date(t.openedAt),
    createdAt: now,
  }));

  // Replace this strategy's previous import, then insert the new set.
  await db
    .delete(tradingBacktestTrades)
    .where(and(eq(tradingBacktestTrades.userId, userId), eq(tradingBacktestTrades.strategy, strategy)));
  // Chunked insert keeps the SQL parameter count well within limits.
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(tradingBacktestTrades).values(rows.slice(i, i + 200));
  }

  const wins = trades.filter((t) => t.pnl != null && t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl != null && t.pnl < 0).length;
  return { strategy, imported: trades.length, wins, losses };
}
