import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userFeatures, users } from '../db/schema.js';
import { isDemoUser } from '../demo/identity.js';

// Feature Access — the optional parts of the terminal a user turns on for
// themselves from My Terminal ▸ Premium Features.
//
// Only the optional ones live here. Markets, Investments, Studies, My Terminal and
// Site Help are included with every account: they hold no money, place no
// orders, and a terminal without them is worth nothing to an average user, so
// there is deliberately nothing to opt into.
//
// It also holds PRIVATE MODE (`shareBook`), which is a privacy setting rather
// than an opt-in — it is edited from My Terminal ▸ Trading Team, where the team
// is, not from this screen. It lives in this table because the plumbing is
// identical: one row per user, a switch beside an acknowledgement stamp, already
// in the per-user delete list, already carried to the client on
// `user.access.features`.
//
// Three rules are enforced here rather than in the UI, because the UI is not the
// enforcer:
//   • Funded is nested under Advanced Trading. The challenge tracker is part of
//     the desk, so Funded always reads false while the desk is off — though the
//     user's own tick is kept, so switching the desk back on brings it back.
//   • Advanced Trading cannot be switched on without the acknowledgement that it
//     places real orders with the user's own broker. The stamp survives an
//     opt-out, so coming back does not ask twice.
//   • Sharing your book cannot be switched on without the acknowledgement of
//     what a teammate would then see. Same stamp rule.
//
// Turning something off only hides it — no trade, account or setting is deleted,
// and turning it back on restores the workspace as it was. That holds for
// private mode too: going private hides the book, it does not remove a trade.

export interface UserFeatures {
  advancedTrading: boolean;
  funded: boolean;
  // When the user acknowledged what the desk does (ms), or null if never.
  tradingAckAt: number | null;
  // Private mode, inverted: false (the default) keeps this trader's book to
  // themselves. Deliberately NOT nested under advancedTrading — a trader who
  // switches the desk off still has closed trades on the team's Trade Log, and
  // their answer about who may see them should not depend on another switch.
  shareBook: boolean;
  // When the user acknowledged what sharing exposes (ms), or null if never.
  bookAckAt: number | null;
}

export const DEFAULT_FEATURES: UserFeatures = {
  advancedTrading: false,
  funded: false,
  tradingAckAt: null,
  shareBook: false,
  bookAckAt: null,
};

export interface FeaturePatch {
  advancedTrading?: boolean;
  funded?: boolean;
  // Set with (or before) advancedTrading: true. Records the acknowledgement.
  acknowledgeTrading?: boolean;
  shareBook?: boolean;
  // Set with (or before) shareBook: true. Records the acknowledgement.
  acknowledgeBook?: boolean;
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
    shareBook: row.shareBook,
    bookAckAt: row.bookAckAt ? row.bookAckAt.getTime() : null,
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
// It is shown as sharing so the tour's Trading Team screen doesn't open on a
// "you are private" notice about an account nobody can change.
export async function featuresForUser(user: {
  id: string;
  username: string;
}): Promise<UserFeatures> {
  const stored = await getUserFeatures(user.id);
  if (isDemoUser(user)) {
    return { ...stored, advancedTrading: true, funded: false, shareBook: true };
  }
  return stored;
}

// Which of `userIds` are currently sharing their book with their teammates.
// The one bulk read behind trading/scope.ts's visibleTraderIds, kept here so the
// demo override above and the visibility filter can never disagree about who is
// sharing.
//
// LEFT JOIN, not a select over user_features: a user with no row at all is a
// perfectly ordinary account that has never touched a switch, and the absence of
// a row has to read as private — the same answer rawFeatures gives it.
export async function sharingBookUserIds(userIds: Set<string>): Promise<Set<string>> {
  if (userIds.size === 0) return new Set();
  const rows = await db
    .select({ id: users.id, username: users.username, shareBook: userFeatures.shareBook })
    .from(users)
    .leftJoin(userFeatures, eq(userFeatures.userId, users.id))
    .where(inArray(users.id, [...userIds]));
  const sharing = new Set<string>();
  for (const r of rows) {
    if (r.shareBook || isDemoUser({ username: r.username })) sharing.add(r.id);
  }
  return sharing;
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

  // Private mode, same acknowledgement rule as the desk: a book cannot start
  // being shared without the user having read what a teammate would see. The
  // stamp is kept when they go private again, so returning does not ask twice.
  const bookAckAt = patch.acknowledgeBook ? now.getTime() : current.bookAckAt;
  const shareBook = patch.shareBook ?? current.shareBook;
  if (shareBook && !bookAckAt) {
    throw new FeatureError('Acknowledge what your team would see before sharing your book');
  }

  await db
    .insert(userFeatures)
    .values({
      id: crypto.randomUUID(),
      userId,
      advancedTrading,
      funded,
      tradingAckAt: ackAt ? new Date(ackAt) : null,
      shareBook,
      bookAckAt: bookAckAt ? new Date(bookAckAt) : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userFeatures.userId,
      set: {
        advancedTrading,
        funded,
        tradingAckAt: ackAt ? new Date(ackAt) : null,
        shareBook,
        bookAckAt: bookAckAt ? new Date(bookAckAt) : null,
        updatedAt: now,
      },
    });

  // Report the effective view, not the row — Funded reads false while the desk
  // is off even though the tick is still stored.
  return {
    advancedTrading,
    funded: funded && advancedTrading,
    tradingAckAt: ackAt,
    shareBook,
    bookAckAt,
  };
}
