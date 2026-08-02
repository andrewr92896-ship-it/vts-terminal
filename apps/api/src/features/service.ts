import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userFeatures } from '../db/schema.js';
import { isDemoUser } from '../demo/identity.js';

// Feature Access — the optional parts of the terminal a user turns on for
// themselves from My Terminal ▸ Feature Access.
//
// Only the optional ones live here. Markets, Investments, Studies, My Terminal and
// Site Help are included with every account: they hold no money, place no
// orders, and a terminal without them is worth nothing to an average user, so
// there is deliberately nothing to opt into.
//
// Two rules are enforced here rather than in the UI, because the UI is not the
// enforcer:
//   • Funded is nested under Advanced Trading. The challenge tracker is part of
//     the desk, so Funded always reads false while the desk is off — though the
//     user's own tick is kept, so switching the desk back on brings it back.
//   • Advanced Trading cannot be switched on without the acknowledgement that it
//     places real orders with the user's own broker. The stamp survives an
//     opt-out, so coming back does not ask twice.
//
// Turning something off only hides it — no trade, account or setting is deleted,
// and turning it back on restores the workspace as it was.

export interface UserFeatures {
  advancedTrading: boolean;
  funded: boolean;
  // When the user acknowledged what the desk does (ms), or null if never.
  tradingAckAt: number | null;
}

export const DEFAULT_FEATURES: UserFeatures = {
  advancedTrading: false,
  funded: false,
  tradingAckAt: null,
};

export interface FeaturePatch {
  advancedTrading?: boolean;
  funded?: boolean;
  // Set with (or before) advancedTrading: true. Records the acknowledgement.
  acknowledgeTrading?: boolean;
}

// The stored row, verbatim. `funded` here is the user's own tick, which is kept
// even while the desk is off — so switching Advanced Trading off and back on
// brings Funded back with it rather than silently forgetting it. Everything that
// GATES on features reads the masked view below instead.
async function rawFeatures(userId: string): Promise<UserFeatures> {
  const row = (
    await db.select().from(userFeatures).where(eq(userFeatures.userId, userId)).limit(1)
  )[0];
  if (!row) return { ...DEFAULT_FEATURES };
  return {
    advancedTrading: row.advancedTrading,
    funded: row.funded,
    tradingAckAt: row.tradingAckAt ? row.tradingAckAt.getTime() : null,
  };
}

// The effective features: the nesting rule applied, so Funded reads false
// whenever the desk is off no matter what the row says. This is what every guard
// and every client sees.
export async function getUserFeatures(userId: string): Promise<UserFeatures> {
  const raw = await rawFeatures(userId);
  return { ...raw, funded: raw.funded && raw.advancedTrading };
}

// The features as they should be presented for a given account. The public demo
// is a look-only showcase: it sees the desk so the tour is complete, but never
// the Funded tracker (a private feature, same as before — see requireFunded).
export async function featuresForUser(user: {
  id: string;
  username: string;
}): Promise<UserFeatures> {
  const stored = await getUserFeatures(user.id);
  if (isDemoUser(user)) return { ...stored, advancedTrading: true, funded: false };
  return stored;
}

export class FeatureError extends Error {}

export async function setUserFeatures(userId: string, patch: FeaturePatch): Promise<UserFeatures> {
  // The raw row, so an untouched Funded tick survives a desk off/on cycle.
  const current = await rawFeatures(userId);
  const now = new Date();

  const ackAt = patch.acknowledgeTrading
    ? now.getTime()
    : current.tradingAckAt;

  const advancedTrading = patch.advancedTrading ?? current.advancedTrading;
  if (advancedTrading && !ackAt) {
    throw new FeatureError('Acknowledge what the trading desk does before turning it on');
  }

  // Funded rides on the desk. Asking for Funded while the desk is off is a
  // contradiction rather than an implicit request to enable both, so refuse it
  // instead of quietly widening what the user asked for.
  const funded = patch.funded ?? current.funded;
  if (funded && !advancedTrading && patch.funded === true) {
    throw new FeatureError('Funded Account needs Advanced Trading turned on first');
  }

  await db
    .insert(userFeatures)
    .values({
      id: crypto.randomUUID(),
      userId,
      advancedTrading,
      funded,
      tradingAckAt: ackAt ? new Date(ackAt) : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userFeatures.userId,
      set: {
        advancedTrading,
        funded,
        tradingAckAt: ackAt ? new Date(ackAt) : null,
        updatedAt: now,
      },
    });

  // Report the effective view, not the row — Funded reads false while the desk
  // is off even though the tick is still stored.
  return { advancedTrading, funded: funded && advancedTrading, tradingAckAt: ackAt };
}
