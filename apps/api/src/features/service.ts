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
  // Private mode. RETIRED as a user-facing switch (owner decision, 2026-08):
  // with trade visibility now self-only (trading/scope.ts) there is nothing left
  // for it to hide, so offering the choice would have been promising something
  // already true. The field is kept, and kept honest, so the column and the
  // acknowledgement stamp survive if a shared desk ever returns.
  shareBook: boolean;
  // When the user acknowledged what sharing exposes (ms), or null if never.
  bookAckAt: number | null;
  // Trading Teams — GRANTED by a software developer, never chosen. See the
  // schema comment and `setUserFeatures` below: the self-service route refuses
  // to set this, so the only way to hold it is for a founder to grant it.
  tradingTeams: boolean;
}

export const DEFAULT_FEATURES: UserFeatures = {
  advancedTrading: false,
  funded: false,
  tradingAckAt: null,
  shareBook: false,
  bookAckAt: null,
  tradingTeams: false,
};

// What the self-service route may change. Deliberately short: `shareBook` and
// its acknowledgement are gone with private mode, and `tradingTeams` was never
// here — it is granted, not chosen.
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
    shareBook: row.shareBook,
    bookAckAt: row.bookAckAt ? row.bookAckAt.getTime() : null,
    tradingTeams: row.tradingTeams,
  };
}

// The effective features: the nesting rule applied, so Funded reads false
// whenever the desk is off no matter what the row says. This is what every guard
// and every client sees.
export async function getUserFeatures(userId: string): Promise<UserFeatures> {
  const raw = await rawFeatures(userId);
  return { ...raw, funded: raw.funded && raw.advancedTrading };
}

// Whether these roles are founder-level (founder or software developer).
//
// Deliberately a LOCAL check rather than an import of auth/rbac.ts's isFounder:
// rbac.ts already imports DEFAULT_FEATURES from this file, so importing it back
// would be a genuine runtime cycle — the same one memberships/tiers.ts was split
// out to avoid. The two role strings are stable keys in `users.roles` and are
// asserted against ROLE_KEYS by the typecheck at every other call site.
function rolesAreFounderLevel(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    return parsed.includes('founder') || parsed.includes('software_developer');
  } catch {
    return false;
  }
}

// The features as they should be presented for a given account.
//
// Two accounts are resolved rather than read:
//   • The public demo is a look-only showcase: it sees the desk so the tour is
//     complete, but never the Funded tracker (see requireFunded), and never
//     Trading Teams — the tour must show what a public account actually gets.
//   • Founder-level accounts always hold Trading Teams, with no stored grant,
//     the same way getMembership resolves an admin to Max. That is what keeps
//     the owner from being able to lock themselves out of the feature they are
//     the one granting.
export async function featuresForUser(user: {
  id: string;
  username: string;
  roles?: string | null;
}): Promise<UserFeatures> {
  const stored = await getUserFeatures(user.id);
  if (isDemoUser(user)) {
    return { ...stored, advancedTrading: true, funded: false, tradingTeams: false };
  }
  if (rolesAreFounderLevel(user.roles)) {
    return { ...stored, tradingTeams: true };
  }
  return stored;
}

// (`sharingBookUserIds` used to live here — the bulk read behind private mode's
// visibility filter. It is deleted rather than left exported with no callers:
// trade visibility is self-only now, so nothing asks who is sharing, and a live
// exported query reads like a working feature to the next person through. The
// `share_book` column and its acknowledgement stamp are untouched, so bringing
// the filter back means writing this query again against data that never went
// away.)

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

  // Private mode is retired as a switch, so nothing self-service changes it any
  // more. The stored value and its acknowledgement stamp are carried through
  // untouched rather than defaulted, so a re-enabled shared desk would find them
  // exactly as the user last left them.
  const bookAckAt = current.bookAckAt;
  const shareBook = current.shareBook;

  // Trading Teams is NOT in FeaturePatch and is NOT read from `patch` here.
  // It is a grant a software developer makes from Admin ▸ Users, so the
  // self-service route has no way to set it however the request is shaped — the
  // stored value is carried straight through. Keep it that way: the moment this
  // reads from the patch, the "manually and manually only" rule is gone.
  const tradingTeams = current.tradingTeams;

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
      tradingTeams,
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
        tradingTeams,
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
    tradingTeams,
  };
}

// Grant or revoke Trading Teams for `userId`. The ONLY way this flag changes.
//
// Authorization is the caller's job — this is reached from Admin ▸ Users behind
// `requireFounder`, matching the rule that only a software developer or founder
// hands the feature out. Revoking does not touch the user's team membership or
// any content: it hides the surfaces, exactly like every other feature switch in
// this file, so re-granting restores what was there.
export async function setTradingTeamsGrant(userId: string, granted: boolean): Promise<UserFeatures> {
  const current = await rawFeatures(userId);
  const now = new Date();
  await db
    .insert(userFeatures)
    .values({
      id: crypto.randomUUID(),
      userId,
      advancedTrading: current.advancedTrading,
      funded: current.funded,
      tradingAckAt: current.tradingAckAt ? new Date(current.tradingAckAt) : null,
      shareBook: current.shareBook,
      bookAckAt: current.bookAckAt ? new Date(current.bookAckAt) : null,
      tradingTeams: granted,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userFeatures.userId,
      set: { tradingTeams: granted, updatedAt: now },
    });
  return { ...current, funded: current.funded && current.advancedTrading, tradingTeams: granted };
}
