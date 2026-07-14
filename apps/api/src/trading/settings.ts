import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingDeskSettings, tradingBeOverrides } from '../db/schema.js';
import {
  buildBreakEvenConfig,
  type BreakEvenBand,
  type BreakEvenConfig,
  type BreakEvenMode,
  type BreakEvenOverride,
} from './outcome.js';

// Desk-wide settings live in a single row keyed 'desk'. The trading desk is a
// shared team, so these apply to everyone's view of the desk (unlike the
// per-user challenge or funded settings).
const DESK = 'desk';

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
}

async function getOverrides(): Promise<BreakEvenOverride[]> {
  const rows = await db.select().from(tradingBeOverrides);
  return rows
    .map((r) => ({
      instrument: r.instrument,
      mode: isMode(r.mode) ? r.mode : ('percent' as BreakEvenMode),
      pct: r.pct,
      amount: r.amount,
    }))
    .sort((a, b) => a.instrument.localeCompare(b.instrument));
}

export async function getDeskSettings(): Promise<DeskSettings> {
  const [row, breakEvenOverrides] = await Promise.all([
    db.select().from(tradingDeskSettings).where(eq(tradingDeskSettings.id, DESK)).limit(1),
    getOverrides(),
  ]);
  const r = row[0];
  return {
    breakEvenMode: isMode(r?.breakEvenMode) ? r!.breakEvenMode : 'percent',
    breakEvenPct: r?.breakEvenPct ?? 0,
    breakEvenAmount: r?.breakEvenAmount ?? 0,
    breakEvenOverrides,
  };
}

export async function updateDeskSettings(patch: Partial<DeskSettings>): Promise<DeskSettings> {
  const now = new Date();
  const current = await getDeskSettings();
  const breakEvenMode = isMode(patch.breakEvenMode) ? patch.breakEvenMode : current.breakEvenMode;
  // Clamp to a sane band: a negative band is meaningless, and no desk wants a
  // 100%+ move to still read as break-even.
  const rawPct = patch.breakEvenPct ?? current.breakEvenPct;
  const breakEvenPct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : current.breakEvenPct;
  // A dollar/pip band only needs to be non-negative; there's no natural ceiling.
  const rawAmt = patch.breakEvenAmount ?? current.breakEvenAmount;
  const breakEvenAmount = Number.isFinite(rawAmt) ? Math.max(0, rawAmt) : current.breakEvenAmount;
  const values = { breakEvenMode, breakEvenPct, breakEvenAmount, updatedAt: now };
  await db
    .insert(tradingDeskSettings)
    .values({ id: DESK, ...values })
    .onConflictDoUpdate({ target: tradingDeskSettings.id, set: values });

  // Overrides, when supplied, fully replace the stored set — the client sends
  // the whole list. Canonicalize + de-dupe by instrument so one instrument keeps
  // exactly one buffer even if the client sent it twice.
  if (patch.breakEvenOverrides !== undefined) {
    const byInstrument = new Map<string, BreakEvenOverride>();
    for (const o of patch.breakEvenOverrides) {
      const instrument = canonInstrument(o.instrument ?? '');
      if (!instrument || !isMode(o.mode)) continue;
      const band = clampBand(o.mode, o.pct, o.amount);
      byInstrument.set(instrument, { instrument, ...band });
    }
    await db.delete(tradingBeOverrides);
    const rows = [...byInstrument.values()].map((o) => ({
      instrument: o.instrument,
      mode: o.mode,
      pct: o.pct,
      amount: o.amount,
      updatedAt: now,
    }));
    if (rows.length > 0) await db.insert(tradingBeOverrides).values(rows);
  }

  return getDeskSettings();
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
