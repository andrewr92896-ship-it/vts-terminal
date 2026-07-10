import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingDeskSettings } from '../db/schema.js';

// Desk-wide settings live in a single row keyed 'desk'. The trading desk is a
// shared team, so these apply to everyone's view of the desk (unlike the
// per-user challenge or funded settings).
const DESK = 'desk';

export interface DeskSettings {
  // ± price-move band (percent) inside which a closed trade counts as break-even
  // rather than a win or a loss. 0 disables the band.
  breakEvenPct: number;
}

export async function getDeskSettings(): Promise<DeskSettings> {
  const row = (
    await db.select().from(tradingDeskSettings).where(eq(tradingDeskSettings.id, DESK)).limit(1)
  )[0];
  return { breakEvenPct: row?.breakEvenPct ?? 0 };
}

export async function updateDeskSettings(patch: Partial<DeskSettings>): Promise<DeskSettings> {
  const now = new Date();
  const current = await getDeskSettings();
  // Clamp to a sane band: a negative band is meaningless, and no desk wants a
  // 100%+ move to still read as break-even.
  const raw = patch.breakEvenPct ?? current.breakEvenPct;
  const breakEvenPct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : current.breakEvenPct;
  await db
    .insert(tradingDeskSettings)
    .values({ id: DESK, breakEvenPct, updatedAt: now })
    .onConflictDoUpdate({ target: tradingDeskSettings.id, set: { breakEvenPct, updatedAt: now } });
  return { breakEvenPct };
}
