import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingDeskSettings, tradingBeOverrides, tradingTrades, tradingPositions, users } from '../db/schema.js';
import { DEMO_USERNAME } from '../demo/identity.js';
import {
  buildBreakEvenConfig,
  type BreakEvenBand,
  type BreakEvenConfig,
  type BreakEvenMode,
  type BreakEvenOverride,
} from './outcome.js';

// Desk settings are per trader: each row is keyed by the trader's userId and
// governs that trader's own view of the desk (break-even scoring + test-trade
// floor). The reserved key 'desk' holds the shared DEFAULT that a trader who has
// never customized falls back to — so nothing changes for anyone until their own
// settings are saved (by them, or by a leader / analyst on their behalf).
const DEFAULT_BUCKET = 'desk';

const BE_MODES: readonly BreakEvenMode[] = ['percent', 'dollars', 'pips'];
function isMode(v: unknown): v is BreakEvenMode {
  return typeof v === 'string' && (BE_MODES as readonly string[]).includes(v);
}

// Canonical instrument symbol stored as the override's key: trimmed, upper-cased,
// capped so a stray long string can't bloat the row. Empty once trimmed → null.
function canonInstrument(v: string): string | null {
  const t = v.trim().toUpperCase().slice(0, 40);
  return t || null;
}

// Clamp a band's numbers to sane ranges (percent 0–100, dollar/pip ≥ 0).
function clampBand(mode: BreakEvenMode, pct: number, amount: number): BreakEvenBand {
  const safePct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return { mode, pct: safePct, amount: safeAmount };
}

export interface DeskSettings {
  // How the DEFAULT break-even buffer is measured: a percent of price move, a
  // flat realized-$ amount, or a pip distance. Applies to any instrument that
  // doesn't have its own override below.
  breakEvenMode: BreakEvenMode;
  // ± price-move band (percent), used in 'percent' mode. 0 disables it.
  breakEvenPct: number;
  // ± dollar or pip band, used in 'dollars' / 'pips' mode. 0 disables it.
  breakEvenAmount: number;
  // Per-instrument buffers that override the default for a specific instrument.
  breakEvenOverrides: BreakEvenOverride[];
  // Ignore broker fills smaller than this many units in the Trade Log / History.
  // The desk's "test trade" floor: 1-unit connection tests stop skewing the
  // stats (and drop out of the list). 0 = keep every trade (the default).
  minTradeUnits: number;
}

async function getOverrides(ownerId: string): Promise<BreakEvenOverride[]> {
  const rows = await db
    .select()
    .from(tradingBeOverrides)
    .where(eq(tradingBeOverrides.ownerId, ownerId));
  return rows
    .map((r) => ({
      instrument: r.instrument,
      mode: isMode(r.mode) ? r.mode : ('percent' as BreakEvenMode),
      pct: r.pct,
      amount: r.amount,
    }))
    .sort((a, b) => a.instrument.localeCompare(b.instrument));
}

// A trader's effective desk settings: their own row when they've customized,
// otherwise the shared 'desk' default. Overrides come from the same bucket, so a
// trader on the default sees the default's per-instrument buffers and a
// customized trader sees only their own.
export async function getDeskSettings(userId: string): Promise<DeskSettings> {
  const own = (
    await db.select().from(tradingDeskSettings).where(eq(tradingDeskSettings.id, userId)).limit(1)
  )[0];
  const r =
    own ??
    (await db.select().from(tradingDeskSettings).where(eq(tradingDeskSettings.id, DEFAULT_BUCKET)).limit(1))[0];
  const bucket = own ? userId : DEFAULT_BUCKET;
  const breakEvenOverrides = await getOverrides(bucket);
  return {
    breakEvenMode: isMode(r?.breakEvenMode) ? r!.breakEvenMode : 'percent',
    breakEvenPct: r?.breakEvenPct ?? 0,
    breakEvenAmount: r?.breakEvenAmount ?? 0,
    breakEvenOverrides,
    minTradeUnits: r?.minTradeUnits ?? 0,
  };
}

// Write `userId`'s own desk settings. A partial patch preserves the trader's
// current effective values (their own, or the inherited default). When the
// override list is supplied it replaces that trader's own set — the client
// always sends the full list, so an inherited default carries over on first save
// rather than being dropped.
export async function updateDeskSettings(userId: string, patch: Partial<DeskSettings>): Promise<DeskSettings> {
  const now = new Date();
  const current = await getDeskSettings(userId);
  const breakEvenMode = isMode(patch.breakEvenMode) ? patch.breakEvenMode : current.breakEvenMode;
  // Clamp to a sane band: a negative band is meaningless, and no desk wants a
  // 100%+ move to still read as break-even.
  const rawPct = patch.breakEvenPct ?? current.breakEvenPct;
  const breakEvenPct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : current.breakEvenPct;
  // A dollar/pip band only needs to be non-negative; there's no natural ceiling.
  const rawAmt = patch.breakEvenAmount ?? current.breakEvenAmount;
  const breakEvenAmount = Number.isFinite(rawAmt) ? Math.max(0, rawAmt) : current.breakEvenAmount;
  // The test-trade floor is a non-negative unit count; 0 turns it off.
  const rawMin = patch.minTradeUnits ?? current.minTradeUnits;
  const minTradeUnits = Number.isFinite(rawMin) ? Math.max(0, rawMin) : current.minTradeUnits;
  const values = { breakEvenMode, breakEvenPct, breakEvenAmount, minTradeUnits, updatedAt: now };
  await db
    .insert(tradingDeskSettings)
    .values({ id: userId, ...values })
    .onConflictDoUpdate({ target: tradingDeskSettings.id, set: values });

  // Overrides, when supplied, fully replace this trader's own set — the client
  // sends the whole list. Canonicalize + de-dupe by instrument so one instrument
  // keeps exactly one buffer even if the client sent it twice.
  if (patch.breakEvenOverrides !== undefined) {
    const byInstrument = new Map<string, BreakEvenOverride>();
    for (const o of patch.breakEvenOverrides) {
      const instrument = canonInstrument(o.instrument ?? '');
      if (!instrument || !isMode(o.mode)) continue;
      const band = clampBand(o.mode, o.pct, o.amount);
      byInstrument.set(instrument, { instrument, ...band });
    }
    await db.delete(tradingBeOverrides).where(eq(tradingBeOverrides.ownerId, userId));
    const rows = [...byInstrument.values()].map((o) => ({
      ownerId: userId,
      instrument: o.instrument,
      mode: o.mode,
      pct: o.pct,
      amount: o.amount,
      updatedAt: now,
    }));
    if (rows.length > 0) await db.insert(tradingBeOverrides).values(rows);
  }

  return getDeskSettings(userId);
}

// Every instrument the viewer's team has traded — distinct symbols from the
// manual Trade Log and the recorded positions (History), canonicalized to match
// how overrides are stored. This powers the per-instrument buffer picker, so a
// trader chooses from what they've actually traded instead of typing. Scoped to
// the team via `scopeIds` (matching the Trade Log / History), with the demo
// sandbox excluded. Derived live, so a newly-traded instrument shows up next load.
export async function getDeskInstruments(scopeIds: Set<string>): Promise<string[]> {
  const inTeam = inArray(users.id, [...scopeIds]);
  const [manual, positions] = await Promise.all([
    db
      .selectDistinct({ instrument: tradingTrades.instrument })
      .from(tradingTrades)
      .innerJoin(users, eq(users.id, tradingTrades.userId))
      .where(and(ne(users.username, DEMO_USERNAME), inTeam)),
    db
      .selectDistinct({ instrument: tradingPositions.instrument })
      .from(tradingPositions)
      .innerJoin(users, eq(users.id, tradingPositions.userId))
      .where(and(ne(users.username, DEMO_USERNAME), inTeam)),
  ]);
  const set = new Set<string>();
  for (const r of [...manual, ...positions]) {
    const v = r.instrument?.trim().toUpperCase();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// The desk's DEFAULT break-even band (ignores per-instrument overrides).
export function bandOf(s: DeskSettings): BreakEvenBand {
  return { mode: s.breakEvenMode, pct: s.breakEvenPct, amount: s.breakEvenAmount };
}

// The full break-even resolver — default band plus per-instrument overrides —
// that classifyOutcome consults to score each trade by its own instrument.
export function configOf(s: DeskSettings): BreakEvenConfig {
  return buildBreakEvenConfig(bandOf(s), s.breakEvenOverrides);
}

// Whether a broker fill falls below the desk's "test trade" floor and so should
// be left out of the Trade Log / History entirely. A zero floor keeps
// everything; a trade with no recorded size (0 units) is never treated as
// "small" — we can't tell, so it's kept.
export function isSmallTrade(units: number, minTradeUnits: number): boolean {
  return minTradeUnits > 0 && units > 0 && units < minTradeUnits;
}
