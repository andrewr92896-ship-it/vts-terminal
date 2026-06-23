import { addTrade, getTrades, type TradeLogData } from './trades.js';
import { TRADE_SIDES, TRADE_STATUSES, type TradeSide, type TradeStatus } from '../db/schema.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Plain-English trade logger for the Trade Log. Claude (Sonnet) turns a short
// note into one or more structured trades, validated and applied via addTrade.

export interface TradeCommandResult {
  log: TradeLogData | null; // refreshed when a trade was logged
  applied: string[];
  skipped: string[];
  reply: string;
}

interface ParsedTrade {
  broker?: unknown;
  instrument?: unknown;
  side?: unknown;
  status?: unknown;
  plannedEntry?: unknown;
  entryPrice?: unknown;
  exitPrice?: unknown;
  takeProfit?: unknown;
  stopLoss?: unknown;
  units?: unknown;
  realizedPl?: unknown;
  strategy?: unknown;
  timeframe?: unknown;
  notes?: unknown;
}

const MAX_ACTIONS = 15;

// Float coercion — prices keep their decimals (do NOT round).
function fnum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,]/g, '').trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function pickEnum<T extends string>(v: unknown, allowed: readonly string[]): T | undefined {
  return typeof v === 'string' && allowed.includes(v) ? (v as T) : undefined;
}

const SYSTEM = [
  'You turn a trader\'s short note into a JSON list of trades and return ONLY a JSON object.',
  'Shape: {"trades":[TRADE,...],"reply":string}. Each TRADE:',
  '  {"instrument":string,"side":"long"|"short","status":"open"|"closed","entryPrice":number,"plannedEntry":number?,"exitPrice":number?,"takeProfit":number?,"stopLoss":number?,"units":number?,"realizedPl":number?,"broker":string?,"strategy":string?,"timeframe":string?,"notes":string?}',
  'instrument and entryPrice are required. Infer side from "long"/"buy"/"bought" (long) vs "short"/"sell"/"sold" (short); default long.',
  'A trade is "open" unless an exit/result is given (then "closed"). "units" is the position size/lots. Keep price decimals exactly as written (do not round).',
  'Common shorthands: SL = stopLoss, TP = takeProfit. realizedPl is the closed P/L in dollars if stated.',
  'Omit any trade missing an instrument or entry price rather than guessing. Keep "reply" to one short sentence.',
  'Return {"trades":[],"reply":"<ask for what is missing>"} if nothing is actionable.',
].join('\n');

export async function runTradeCommand(
  userId: string,
  note: string,
  canSeeBalances: boolean,
): Promise<TradeCommandResult> {
  const text = note.trim();
  if (!text) return { log: null, applied: [], skipped: [], reply: 'Describe a trade to log.' };

  const raw = await askClaude(`NOTE: ${text}`, SYSTEM);
  const parsed = extractJson(raw) as { trades?: unknown; reply?: unknown } | null;
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 300) : '';
  const trades = Array.isArray(parsed?.trades) ? (parsed!.trades as ParsedTrade[]).slice(0, MAX_ACTIONS) : [];

  const applied: string[] = [];
  const skipped: string[] = [];
  let changed = false;

  for (const t of trades) {
    const instrument = str(t.instrument);
    const entryPrice = fnum(t.entryPrice);
    if (!instrument) {
      skipped.push('trade — needs an instrument');
      continue;
    }
    if (entryPrice == null) {
      skipped.push(`${instrument} — needs an entry price`);
      continue;
    }
    try {
      const side: TradeSide = pickEnum<TradeSide>(t.side, TRADE_SIDES) ?? 'long';
      const status: TradeStatus = pickEnum<TradeStatus>(t.status, TRADE_STATUSES) ?? (t.exitPrice != null || t.realizedPl != null ? 'closed' : 'open');
      await addTrade(userId, {
        instrument,
        entryPrice,
        side,
        status,
        plannedEntry: fnum(t.plannedEntry),
        exitPrice: fnum(t.exitPrice),
        takeProfit: fnum(t.takeProfit),
        stopLoss: fnum(t.stopLoss),
        units: fnum(t.units),
        realizedPl: fnum(t.realizedPl),
        broker: str(t.broker),
        strategy: str(t.strategy),
        timeframe: str(t.timeframe),
        notes: str(t.notes),
      });
      applied.push(`${side === 'short' ? 'Short' : 'Long'} ${instrument} @ ${entryPrice}${status === 'open' ? ' (open)' : ''}`);
      changed = true;
    } catch (err) {
      skipped.push(`${instrument} — ${err instanceof Error ? err.message : 'could not log'}`);
    }
  }

  const fallback = applied.length
    ? `Logged ${applied.length} trade${applied.length === 1 ? '' : 's'}.`
    : 'Nothing to log — try "Long 2 lots EUR/USD entry 1.0850 SL 1.0820 TP 1.0920".';

  return {
    log: changed ? await getTrades(userId, canSeeBalances) : null,
    applied,
    skipped,
    reply: reply || fallback,
  };
}
