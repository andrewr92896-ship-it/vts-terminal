import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tradingAlerts,
  tradingTrades,
  tradingStrategies,
  tradingStrategyPrefs,
  tradingBacktestTrades,
  type TradeResult,
  type TradeSide,
  type TradingAlertRow,
  type TradingTradeRow,
} from '../db/schema.js';

// Strategy performance: ties each TradingView alert (the hypothetical / paper
// trade) to the real Trade Log trade it produced, then rolls both streams up
// per strategy so you can compare "how the strategy does on paper" against "how
// I actually traded it". Alerts already carry instrument/side/entry/result; the
// matching engine here links a real trade placed for the same instrument, same
// side, within an hour of the alert. The link is stored on the alert's existing
// trade_id column (the screenshot-analysis flow already uses it), so an alert
// has at most one real trade and a real trade backs at most one alert.

const MATCH_WINDOW_MS = 60 * 60 * 1000; // ±1 hour

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// Normalize an instrument symbol so "COINBASE:BTCUSD", "BTC/USD", and "btcusd"
// all compare equal: drop any exchange prefix before ':', uppercase, and strip
// non-alphanumerics.
export function normInstrument(s: string | null | undefined): string {
  if (!s) return '';
  const afterColon = s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s;
  return afterColon.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Direction words that vary per alert but don't identify the strategy.
const DIRECTION_WORDS = ['both', 'long', 'short', 'longs', 'shorts', 'buy', 'sell', 'buys', 'sells'];

// Collapse a noisy alert label down to a stable strategy name by stripping the
// volatile bits: lot size, version number, trade direction, and any user-defined
// "ignore" words (e.g. a brand tag like "VTS"). Example:
//   "NAS100 BOTH (Lot 8) 5m mk1 VTS v2.4"  →  "NAS100 5m mk1"
// so changing the lot or version never fragments a strategy's track record.
export function canonicalStrategy(raw: string | null | undefined, ignore: string[] = []): string {
  if (!raw || !raw.trim()) return 'Unlabeled';
  let s = ` ${raw} `;
  s = s.replace(/\((?:[^)]*\blots?\b[^)]*)\)/gi, ' '); // "(Lot 8)"
  s = s.replace(/\blots?\s*\d+(?:\.\d+)?\b/gi, ' '); // bare "lot 8" / "lot 1.0"
  s = s.replace(/\bv\d+(?:\.\d+)*\b/gi, ' '); // "v2.4"
  s = s.replace(/\bversion\s*\d+(?:\.\d+)*\b/gi, ' '); // "version 2.4"
  s = s.replace(/\b\d+\.\d+\b/g, ' '); // bare decimal version, e.g. "VTS 2.0"
  s = s.replace(new RegExp(`\\b(?:${DIRECTION_WORDS.join('|')})\\b`, 'gi'), ' ');
  for (const tok of ignore) {
    const t = tok.trim();
    if (t) s = s.replace(new RegExp(`\\b${escapeRegExp(t)}\\b`, 'gi'), ' ');
  }
  s = s.replace(/\(\s*\)/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s || raw.trim();
}

// Per-user list of extra words to strip during canonicalization.
export async function getIgnoreTokens(userId: string): Promise<string[]> {
  const row = (
    await db.select().from(tradingStrategyPrefs).where(eq(tradingStrategyPrefs.userId, userId)).limit(1)
  )[0];
  if (!row?.ignoreTokens) return [];
  try {
    const parsed = JSON.parse(row.ignoreTokens);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function setIgnoreTokens(userId: string, tokens: string[]): Promise<void> {
  const clean = Array.from(
    new Set(tokens.map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 40)),
  ).slice(0, 50);
  const now = new Date();
  await db
    .insert(tradingStrategyPrefs)
    .values({ userId, ignoreTokens: JSON.stringify(clean), updatedAt: now })
    .onConflictDoUpdate({ target: tradingStrategyPrefs.userId, set: { ignoreTokens: JSON.stringify(clean), updatedAt: now } });
}

// Ensure a registry row exists for each given strategy name (so a start date can
// be set even before any metrics exist). 'Unlabeled' is a display bucket, not a
// real strategy, so it is never persisted.
export async function ensureStrategies(userId: string, names: Iterable<string>): Promise<void> {
  const now = new Date();
  const wanted = new Set<string>();
  for (const n of names) {
    const t = n.trim();
    if (t && t !== 'Unlabeled') wanted.add(t.slice(0, 80));
  }
  for (const name of wanted) {
    await db
      .insert(tradingStrategies)
      .values({ userId, name, startedAt: null, notes: null, createdAt: now, updatedAt: now })
      .onConflictDoNothing();
  }
}

// Link unmatched alerts to real trades by instrument + side + time proximity.
// Idempotent: alerts that already have a trade_id (manual link or screenshot
// analysis) are left alone, and each real trade backs at most one alert.
export async function autoMatch(userId: string): Promise<number> {
  const alerts = await db.select().from(tradingAlerts).where(eq(tradingAlerts.userId, userId));
  const trades = await db.select().from(tradingTrades).where(eq(tradingTrades.userId, userId));

  // Trades already claimed by some alert can't be reused.
  const taken = new Set<string>();
  for (const a of alerts) if (a.tradeId) taken.add(a.tradeId);

  const candidates = alerts
    .filter((a) => !a.tradeId && a.status !== 'dismissed' && a.instrument && a.side)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  const links: { alertId: string; tradeId: string }[] = [];
  for (const a of candidates) {
    const ni = normInstrument(a.instrument);
    const at = a.receivedAt.getTime();
    let best: TradingTradeRow | null = null;
    let bestDelta = Infinity;
    for (const t of trades) {
      if (taken.has(t.id)) continue;
      if (t.side !== a.side) continue;
      if (normInstrument(t.instrument) !== ni) continue;
      const delta = Math.abs(t.openedAt.getTime() - at);
      if (delta <= MATCH_WINDOW_MS && delta < bestDelta) {
        best = t;
        bestDelta = delta;
      }
    }
    if (best) {
      taken.add(best.id);
      links.push({ alertId: a.id, tradeId: best.id });
    }
  }

  const now = new Date();
  for (const l of links) {
    await db
      .update(tradingAlerts)
      .set({ tradeId: l.tradeId, updatedAt: now })
      .where(and(eq(tradingAlerts.id, l.alertId), eq(tradingAlerts.userId, userId)));
  }
  return links.length;
}

// Manually link an alert to a specific real trade (overrides the auto-match).
export async function linkAlertTrade(userId: string, alertId: string, tradeId: string): Promise<void> {
  const trade = (
    await db
      .select({ id: tradingTrades.id })
      .from(tradingTrades)
      .where(and(eq(tradingTrades.id, tradeId), eq(tradingTrades.userId, userId)))
      .limit(1)
  )[0];
  if (!trade) throw new Error('Trade not found');

  // Free the trade from any other alert first (one trade backs one alert).
  await db
    .update(tradingAlerts)
    .set({ tradeId: null, updatedAt: new Date() })
    .where(and(eq(tradingAlerts.tradeId, tradeId), eq(tradingAlerts.userId, userId)));

  const res = await db
    .update(tradingAlerts)
    .set({ tradeId, updatedAt: new Date() })
    .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, userId)))
    .returning({ id: tradingAlerts.id });
  if (!res[0]) throw new Error('Alert not found');
}

export async function unlinkAlertTrade(userId: string, alertId: string): Promise<void> {
  await db
    .update(tradingAlerts)
    .set({ tradeId: null, updatedAt: new Date() })
    .where(and(eq(tradingAlerts.id, alertId), eq(tradingAlerts.userId, userId)));
}

export async function setStrategyMeta(
  userId: string,
  input: { name: string; startedAt?: number | null; notes?: string | null },
): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error('Strategy name is required');
  const startedAt =
    input.startedAt != null && Number.isFinite(input.startedAt) ? new Date(input.startedAt) : null;
  const notes = input.notes != null ? input.notes.trim().slice(0, 500) || null : null;
  const now = new Date();
  await db
    .insert(tradingStrategies)
    .values({ userId, name, startedAt, notes, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [tradingStrategies.userId, tradingStrategies.name],
      set: { startedAt, notes, updatedAt: now },
    });
}

// One side of the comparison (hypothetical from alerts, or actual from trades).
export interface StratSideStat {
  trades: number; // entries with a recorded result (win+loss+breakeven)
  wins: number;
  losses: number;
  breakeven: number;
  open: number; // entries with no result yet
  winRate: number | null; // 0–100 over decided (win+loss); null when none decided
  totalPnl: number | null; // points (hypothetical) or account currency (actual)
  avgPnl: number | null; // mean over entries that carry a P&L
  profitFactor: number | null; // gross win ÷ gross loss
}

export interface StrategyRow {
  name: string;
  startedAt: number | null; // ms; null = all-time
  notes: string | null;
  hypothetical: StratSideStat; // from alerts — P&L in price points
  actual: StratSideStat; // from linked/real trades — P&L in account currency
  backtest: StratSideStat; // from an imported TradingView CSV — P&L in USD
  hasBacktest: boolean; // a backtest CSV has been imported for this strategy
  signals: number; // alerts in scope (the denominator for taken rate)
  taken: number; // alerts in scope that have a linked real trade
  takenRate: number | null; // 0–100, taken ÷ signals
}

export interface StrategyBoard {
  strategies: StrategyRow[];
  canSeeBalances: boolean;
  ignoreTokens: string[]; // words stripped when collapsing labels to a strategy
}

function rollup(items: { result: TradeResult | null; pnl: number | null }[]): StratSideStat {
  let wins = 0,
    losses = 0,
    breakeven = 0,
    open = 0,
    pnlSum = 0,
    pnlCount = 0,
    grossWin = 0,
    grossLoss = 0;
  for (const it of items) {
    if (it.result === 'win') wins++;
    else if (it.result === 'loss') losses++;
    else if (it.result === 'breakeven') breakeven++;
    else open++;
    if (it.pnl != null) {
      pnlSum += it.pnl;
      pnlCount++;
      if (it.pnl > 0) grossWin += it.pnl;
      else if (it.pnl < 0) grossLoss += -it.pnl;
    }
  }
  const trades = wins + losses + breakeven;
  const decided = wins + losses;
  return {
    trades,
    wins,
    losses,
    breakeven,
    open,
    winRate: decided > 0 ? round((wins / decided) * 100, 1) : null,
    totalPnl: pnlCount > 0 ? round(pnlSum, 6) : null,
    avgPnl: pnlCount > 0 ? round(pnlSum / pnlCount, 6) : null,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
  };
}

// Outcome of a real Trade Log trade, in account currency. Prefers the broker's
// realized P/L; falls back to entry-vs-exit by side when only prices are known.
function tradeOutcome(
  t: TradingTradeRow,
  canSeeBalances: boolean,
): { result: TradeResult | null; pnl: number | null } {
  const closed = t.status === 'closed' || t.exitPrice != null;
  let result: TradeResult | null = null;
  if (t.realizedPl != null) {
    result = t.realizedPl > 0 ? 'win' : t.realizedPl < 0 ? 'loss' : 'breakeven';
  } else if (closed && t.exitPrice != null) {
    const diff = t.exitPrice - t.entryPrice;
    const signed = t.side === 'short' ? -diff : diff;
    result = signed > 0 ? 'win' : signed < 0 ? 'loss' : 'breakeven';
  }
  // P&L is only meaningful (and visible) in account currency from realizedPl.
  const pnl = canSeeBalances && t.realizedPl != null ? t.realizedPl : null;
  return { result, pnl };
}

export async function getStrategyBoard(
  userId: string,
  canSeeBalances: boolean,
): Promise<StrategyBoard> {
  const [alerts, trades, registry, backtest, ignore] = await Promise.all([
    db.select().from(tradingAlerts).where(eq(tradingAlerts.userId, userId)),
    db.select().from(tradingTrades).where(eq(tradingTrades.userId, userId)),
    db.select().from(tradingStrategies).where(eq(tradingStrategies.userId, userId)),
    db.select().from(tradingBacktestTrades).where(eq(tradingBacktestTrades.userId, userId)),
    getIgnoreTokens(userId),
  ]);

  // Collapse each volatile label to its stable strategy name up front.
  const canon = (s: string | null | undefined) => canonicalStrategy(s, ignore);

  // Persist any canonical strategy names we have seen but not yet registered.
  const seen = new Set<string>();
  for (const a of alerts) if (a.strategy?.trim()) seen.add(canon(a.strategy));
  for (const t of trades) if (t.strategy?.trim()) seen.add(canon(t.strategy));
  for (const b of backtest) seen.add(b.strategy); // already canonical at import
  seen.delete('Unlabeled');
  await ensureStrategies(userId, seen);

  const startedFor = new Map<string, number | null>();
  const notesFor = new Map<string, string | null>();
  for (const r of registry) {
    startedFor.set(r.name, r.startedAt ? r.startedAt.getTime() : null);
    notesFor.set(r.name, r.notes);
  }

  // A trade may belong to a strategy by its own (canonical) label OR by the
  // alert it is linked to.
  const tradeById = new Map<string, TradingTradeRow>();
  for (const t of trades) tradeById.set(t.id, t);

  // Build the full set of strategy buckets to show.
  const names = new Set<string>([...seen, ...registry.map((r) => r.name)]);
  if (alerts.some((a) => a.status !== 'dismissed' && !a.strategy?.trim())) names.add('Unlabeled');

  const rows: StrategyRow[] = [];
  for (const name of names) {
    const startedAt = startedFor.get(name) ?? null;
    const inScope = (ms: number) => startedAt == null || ms >= startedAt;

    // Hypothetical: alerts whose canonical strategy is this one (non-dismissed),
    // scoped by start date.
    const stratAlerts = alerts.filter(
      (a) => a.status !== 'dismissed' && canon(a.strategy) === name && inScope(a.receivedAt.getTime()),
    );
    const hypothetical = rollup(
      stratAlerts.map((a) => ({ result: (a.result as TradeResult | null) ?? null, pnl: a.pnl })),
    );

    // Actual: real trades canonically labeled this strategy, plus trades linked
    // from this strategy's alerts. Deduped, scoped by start.
    const tradeIds = new Set<string>();
    for (const t of trades) if (canon(t.strategy) === name) tradeIds.add(t.id);
    for (const a of stratAlerts) if (a.tradeId) tradeIds.add(a.tradeId);
    const stratTrades: TradingTradeRow[] = [];
    for (const id of tradeIds) {
      const t = tradeById.get(id);
      if (t && inScope(t.openedAt.getTime())) stratTrades.push(t);
    }
    const actual = rollup(stratTrades.map((t) => tradeOutcome(t, canSeeBalances)));

    // Backtest: imported CSV trades for this strategy, scoped by start date.
    // Result comes from the realized P&L sign; P&L is in USD.
    const btTrades = backtest.filter((b) => b.strategy === name && inScope(b.openedAt.getTime()));
    const backtestStat = rollup(
      btTrades.map((b) => ({
        result: b.pnl == null ? null : b.pnl > 0 ? 'win' : b.pnl < 0 ? 'loss' : 'breakeven',
        pnl: b.pnl,
      })),
    );

    const signals = stratAlerts.length;
    const taken = stratAlerts.filter((a) => a.tradeId).length;

    rows.push({
      name,
      startedAt,
      notes: notesFor.get(name) ?? null,
      hypothetical,
      actual,
      backtest: backtestStat,
      hasBacktest: backtest.some((b) => b.strategy === name),
      signals,
      taken,
      takenRate: signals > 0 ? round((taken / signals) * 100, 1) : null,
    });
  }

  const activity = (r: StrategyRow) => r.hypothetical.trades + r.actual.trades + r.backtest.trades;
  rows.sort(
    (a, b) => activity(b) - activity(a) || b.signals - a.signals || a.name.localeCompare(b.name),
  );

  return { strategies: rows, canSeeBalances, ignoreTokens: ignore };
}

// Compact summary of the real trade an alert is linked to, for the Alerts page
// comparison view.
export interface LinkedTradeSummary {
  id: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice: number | null;
  slippage: number | null; // entryPrice − plannedEntry
  realizedPl: number | null; // null when balances are hidden
  status: string;
  openedAt: number;
}

export function linkedTradeSummary(
  row: TradingAlertRow,
  trades: Map<string, TradingTradeRow>,
  canSeeBalances: boolean,
): LinkedTradeSummary | null {
  if (!row.tradeId) return null;
  const t = trades.get(row.tradeId);
  if (!t) return null;
  return {
    id: t.id,
    side: (t.side as TradeSide) ?? 'long',
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    slippage: t.plannedEntry != null ? round(t.entryPrice - t.plannedEntry, 8) : null,
    realizedPl: canSeeBalances ? t.realizedPl : null,
    status: t.status,
    openedAt: t.openedAt.getTime(),
  };
}
