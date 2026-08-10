import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyPackageShares, studyPackages, users, type ShareStatus } from '../db/schema.js';
import { PackageError } from './packageStore.js';

// Handing a Study Package to another person.
//
// This is CONTENT ACCESS and nothing else. There is no chat attached to a share,
// no feed, no follow, no group to join — one person names another by username,
// that person accepts or declines, and the accepted ones can study the content.
// A recipient never becomes a member of anything, which is the entire reason
// Study sharing was moved off the trading/private-group model.

export const MAX_SHARES_PER_PACKAGE = 200;

export interface ShareView {
  /** The share's own id — what accept/decline/revoke act on. */
  id: string;
  packageId: string;
  packageName: string;
  packageSubject: string | null;
  status: ShareStatus;
  /** Who it is with, or who it came from, depending on which list this is. */
  personName: string;
  personUsername: string;
  createdAt: number;
  respondedAt: number | null;
}

/**
 * Find the person somebody typed in.
 *
 * By USERNAME or display name, both of which are unique across the platform
 * (migration 0102 made display names unique for exactly this kind of reason).
 * Nothing about the match is fuzzy: a typo finds nobody and says so, rather than
 * sharing a package with whoever happened to be closest.
 *
 * It answers with the display name and username and NOTHING else — no id, no
 * email, no roles. A share form must not become a way to read the user table.
 */
export async function findRecipient(handle: string): Promise<{ id: string; displayName: string; username: string } | null> {
  const needle = handle.trim().toLowerCase();
  if (!needle) return null;
  const row = (
    await db
      .select({ id: users.id, displayName: users.displayName, username: users.username, active: users.active })
      .from(users)
      .where(
        and(
          or2(
            sql`lower(trim(${users.username})) = ${needle}`,
            sql`lower(trim(${users.displayName})) = ${needle}`,
          ),
          eq(users.active, true),
        ),
      )
      .limit(1)
  )[0];
  return row ? { id: row.id, displayName: row.displayName, username: row.username } : null;
}

// drizzle's `or` with two raw sql fragments, kept local so the import list above
// does not need it just for this.
function or2(a: ReturnType<typeof sql>, b: ReturnType<typeof sql>) {
  return sql`(${a} OR ${b})`;
}

/**
 * Offer a package to somebody.
 *
 * IDEMPOTENT by construction: the table allows one share relationship per person
 * per package, so sharing twice re-offers the same one rather than stacking a
 * second. Re-sharing to somebody who DECLINED puts the offer back to pending —
 * an owner asking again is a real thing to want, and a permanent refusal that
 * cannot be revisited would be the wrong default. Re-sharing to somebody who
 * already accepted changes nothing at all.
 */
export async function sharePackage(input: {
  packageId: string;
  ownerUserId: string;
  handle: string;
}): Promise<{ share: ShareView; alreadyShared: boolean }> {
  const recipient = await findRecipient(input.handle);
  if (!recipient) {
    throw new PackageError(`No VTS user called “${input.handle.trim()}”. Check the spelling with them.`);
  }
  if (recipient.id === input.ownerUserId) {
    throw new PackageError('That is you — a package you own is already yours.');
  }

  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, input.packageId)).limit(1))[0];
  if (!pkg) throw new PackageError('That study package no longer exists.');
  if (pkg.archivedAt) throw new PackageError('This package is archived. Restore it before sharing it.');

  const existing = (
    await db
      .select()
      .from(studyPackageShares)
      .where(
        and(eq(studyPackageShares.packageId, input.packageId), eq(studyPackageShares.recipientUserId, recipient.id)),
      )
      .limit(1)
  )[0];

  const now = new Date();
  if (existing) {
    if (existing.status === 'declined') {
      await db
        .update(studyPackageShares)
        .set({ status: 'pending', sharedByUserId: input.ownerUserId, createdAt: now, respondedAt: null })
        .where(eq(studyPackageShares.id, existing.id));
      return { share: view(existing.id, pkg, recipient, 'pending', now, null), alreadyShared: false };
    }
    // Pending or accepted: this is the same offer. Say so rather than pretending
    // something new happened.
    return {
      share: view(existing.id, pkg, recipient, existing.status, existing.createdAt, existing.respondedAt),
      alreadyShared: true,
    };
  }

  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(studyPackageShares)
    .where(eq(studyPackageShares.packageId, input.packageId));
  if ((count[0]?.n ?? 0) >= MAX_SHARES_PER_PACKAGE) {
    throw new PackageError(`A package can be shared with up to ${MAX_SHARES_PER_PACKAGE} people.`);
  }

  const id = randomUUID();
  await db.insert(studyPackageShares).values({
    id,
    packageId: input.packageId,
    recipientUserId: recipient.id,
    sharedByUserId: input.ownerUserId,
    status: 'pending',
    createdAt: now,
    respondedAt: null,
  });
  await refreshShareVisibility(input.packageId);
  return { share: view(id, pkg, recipient, 'pending', now, null), alreadyShared: false };
}

function view(
  id: string,
  pkg: { id: string; name: string; subject: string | null },
  person: { displayName: string; username: string },
  status: ShareStatus,
  createdAt: Date,
  respondedAt: Date | null,
): ShareView {
  return {
    id,
    packageId: pkg.id,
    packageName: pkg.name,
    packageSubject: pkg.subject,
    status,
    personName: person.displayName,
    personUsername: person.username,
    createdAt: createdAt.getTime(),
    respondedAt: respondedAt?.getTime() ?? null,
  };
}

/** Who a package is currently shared with, for the owner's own list. */
export async function listSharesFor(packageId: string): Promise<ShareView[]> {
  const rows = await db
    .select({
      share: studyPackageShares,
      name: users.displayName,
      username: users.username,
      pkgName: studyPackages.name,
      pkgSubject: studyPackages.subject,
    })
    .from(studyPackageShares)
    .innerJoin(users, eq(users.id, studyPackageShares.recipientUserId))
    .innerJoin(studyPackages, eq(studyPackages.id, studyPackageShares.packageId))
    .where(eq(studyPackageShares.packageId, packageId));
  return rows
    .map((r) =>
      view(
        r.share.id,
        { id: packageId, name: r.pkgName, subject: r.pkgSubject },
        { displayName: r.name, username: r.username },
        r.share.status,
        r.share.createdAt,
        r.share.respondedAt,
      ),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * What has been shared WITH this person.
 *
 * Archived packages are left out: an owner who put a package away should not go
 * on occupying somebody else's library with it. The share row survives, so
 * restoring the package brings it back exactly as it was.
 */
export async function listSharedWithMe(userId: string): Promise<{ pending: ShareView[]; accepted: ShareView[] }> {
  const rows = await db
    .select({
      share: studyPackageShares,
      pkg: studyPackages,
      ownerName: users.displayName,
      ownerUsername: users.username,
    })
    .from(studyPackageShares)
    .innerJoin(studyPackages, eq(studyPackages.id, studyPackageShares.packageId))
    .innerJoin(users, eq(users.id, studyPackages.ownerUserId))
    .where(and(eq(studyPackageShares.recipientUserId, userId), ne(studyPackageShares.status, 'declined')));

  const pending: ShareView[] = [];
  const accepted: ShareView[] = [];
  for (const r of rows) {
    if (r.pkg.archivedAt) continue;
    const v = view(
      r.share.id,
      r.pkg,
      { displayName: r.ownerName, username: r.ownerUsername },
      r.share.status,
      r.share.createdAt,
      r.share.respondedAt,
    );
    (r.share.status === 'accepted' ? accepted : pending).push(v);
  }
  const newest = (a: ShareView, b: ShareView) => b.createdAt - a.createdAt;
  return { pending: pending.sort(newest), accepted: accepted.sort(newest) };
}

/** The recipient's answer. Only they can give it. */
export async function respondToShare(
  shareId: string,
  userId: string,
  accept: boolean,
): Promise<boolean> {
  const row = (await db.select().from(studyPackageShares).where(eq(studyPackageShares.id, shareId)).limit(1))[0];
  // Matched on the recipient as well as the id, so a share id somebody guessed
  // cannot be answered on another person's behalf.
  if (!row || row.recipientUserId !== userId) return false;
  await db
    .update(studyPackageShares)
    .set({ status: accept ? 'accepted' : 'declined', respondedAt: new Date() })
    .where(eq(studyPackageShares.id, shareId));
  await refreshShareVisibility(row.packageId);
  return true;
}

/**
 * The owner taking access back.
 *
 * The share row is deleted, so the offer is gone rather than sitting there
 * declined. What is NOT touched is the recipient's progress: their per-user rows
 * are keyed by (user, deck) and are their own record of work they actually did.
 * Deleting somebody's history because access ended would be destroying data to
 * enforce a permission that is already enforced.
 */
export async function revokeShare(shareId: string, packageId: string): Promise<boolean> {
  const row = (await db.select().from(studyPackageShares).where(eq(studyPackageShares.id, shareId)).limit(1))[0];
  if (!row || row.packageId !== packageId) return false;
  await db.delete(studyPackageShares).where(eq(studyPackageShares.id, shareId));
  await refreshShareVisibility(packageId);
  return true;
}

/** Everyone who currently has study access through an accepted share. */
export async function acceptedRecipientIds(packageId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: studyPackageShares.recipientUserId })
    .from(studyPackageShares)
    .where(and(eq(studyPackageShares.packageId, packageId), eq(studyPackageShares.status, 'accepted')));
  return rows.map((r) => r.userId);
}

/** How many people a set of packages is shared with, for the owner's list. */
export async function shareCounts(packageIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!packageIds.length) return out;
  const rows = await db
    .select({ packageId: studyPackageShares.packageId, status: studyPackageShares.status })
    .from(studyPackageShares)
    .where(inArray(studyPackageShares.packageId, packageIds));
  for (const r of rows) {
    if (r.status === 'declined') continue;
    out.set(r.packageId, (out.get(r.packageId) ?? 0) + 1);
  }
  return out;
}

/**
 * Keep `visibility` honest about whether a package is shared with anybody.
 *
 * The four states have to stay clearly separated, and `shared` is the one that
 * can change without anybody deciding it — the last recipient declining should
 * put a package back to private on its own. Deliberately never touches
 * `submitted` or `public`: those are set by the review workflow, and a share
 * arriving on a published package must not quietly unpublish it.
 */
export async function refreshShareVisibility(packageId: string): Promise<void> {
  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, packageId)).limit(1))[0];
  if (!pkg) return;
  if (pkg.visibility === 'submitted' || pkg.visibility === 'public') return;
  const live = await db
    .select({ n: sql<number>`count(*)` })
    .from(studyPackageShares)
    .where(and(eq(studyPackageShares.packageId, packageId), ne(studyPackageShares.status, 'declined')));
  const next = (live[0]?.n ?? 0) > 0 ? 'shared' : 'private';
  if (pkg.visibility !== next) {
    await db.update(studyPackages).set({ visibility: next }).where(eq(studyPackages.id, packageId));
  }
}
