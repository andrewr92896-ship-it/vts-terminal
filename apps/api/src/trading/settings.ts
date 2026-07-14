import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingDeskSettings } from '../db/schema.js';
import type { BreakEvenBand, BreakEvenMode } from './outcome.js';

// Desk-wide settings live in a single row keyed 'desk'. The trading desk is a
// shared team, so these apply to everyone's view of the desk (unlike the
// per-user challenge or funded settings).
const DESK = 'desk';

const BE_MODES: readonly BreakEvenMode[] = ['percent', 'dollars', 'pips'];
function isMode(v: unknown): v is BreakEvenMode {
  return typeof v === 'string' && (BE_MODES as readonly string[]).includes(v);
}

export interface DeskSettings {
  // How the break-even buffer is measured: a percent of price move, a flat
  // realized-$ amount, or a pip distance.
  breakEvenMode: BreakEvenMode;
  // ± price-move band (percent), used in 'percent' mode. 0 disables it.
  breakEvenPct: number;
  // ± dollar or pip band, used in 'dollars' / 'pips' mode. 0 disables it.
  breakEvenAmount: number;
}

export async function getDeskSettings(): Promise<DeskSettings> {
  const row = (
    await db.select().from(tradingDeskSettings).where(eq(tradingDeskSettings.id, DESK)).limit(1)
  )[0];
  return {
    breakEvenMode: isMode(row?.breakEvenMode) ? row!.breakEvenMode : 'percent',
    breakEvenPct: row?.breakEvenPct ?? 0,
    breakEvenAmount: row?.breakEvenAmount ?? 0,
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
  return { breakEvenMode, breakEvenPct, breakEvenAmount };
}

// The break-even buffer as the band object classifyOutcome expects.
export function bandOf(s: DeskSettings): BreakEvenBand {
  return { mode: s.breakEvenMode, pct: s.breakEvenPct, amount: s.breakEvenAmount };
}
