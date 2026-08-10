import { randomUUID } from 'node:crypto';
import { alias } from 'drizzle-orm/sqlite-core';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  studyPackageAdds,
  studyPackageSubmissions,
  studyPackages,
  users,
  type SubmissionStatus,
} from '../db/schema.js';
import { PackageError } from './packageStore.js';
import { refreshShareVisibility } from './packageSharing.js';

// The VTS Study Library — packages a creator has asked VTS to publish, and an
// administrator has read and approved.
//
// SUBMITTING IS NOT PUBLISHING. That separation is the whole feature: user
// content becomes public because a person at VTS decided it should, never
// because the creator pressed a button, and never as a side effect of having
// shared it privately with somebody.

/**
 * The wording a submitter agrees to, versioned.
 *
 * Stored per submission as a version string rather than a bare "they ticked the
 * box", because the wording will change and a boolean would not say which
 * version was actually put in front of them. Bump this whenever the text below
 * changes in substance.
 */
export const ATTESTATION_VERSION = '2026-08-10.1';

export const ATTESTATIONS = [
  'This is my own work, or I have the right to submit and share it.',
  'It does not deliberately reproduce question banks, books, courses or other material I am not allowed to distribute.',
  'It is educational content.',
  'Any finance material in it is educational, and is not personal investment advice.',
] as const;

// The submitter and the person who withdrew it are two different people on two
// different rows of `users`, so the second needs its own alias.
const withdrawer = alias(users, 'withdrawer');

export interface SubmissionView {
  id: string;
  packageId: string;
  packageName: string;
  packageSubject: string | null;
  status: SubmissionStatus;
  submittedAt: number;
  reviewedAt: number | null;
  adminNote: string | null;
  attestationVersion: string;
  /** Who made it — shown to reviewers, not to other learners. */
  submitterName: string | null;
  /**
   * When this publication ENDED, if it has. `status` stays 'approved': the
   * decision and the attestation behind it are the record, and rewriting them
   * would destroy what an audit is for.
   */
  withdrawnAt: number | null;
  withdrawnByName: string | null;
  /** Whether the creator withdrew it, as opposed to an administrator. */
  withdrawnByOwner: boolean;
}

export interface LibraryEntry {
  packageId: string;
  name: string;
  subject: string | null;
  description: string | null;
  depth: string | null;
  ownerName: string | null;
  questionCount: number;
  /** Whether the viewer has already taken this into their own library. */
  added: boolean;
  publishedAt: number;
}

// ---- Submitting ----

/**
 * Ask VTS to publish a package.
 *
 * The attestation is recorded with the submission, not stored as a flag on the
 * package: it is a statement about THIS submission of THIS version, and a later
 * submission gets its own.
 */
export async function submitPackage(input: {
  packageId: string;
  userId: string;
  attested: boolean;
}): Promise<SubmissionView> {
  if (!input.attested) throw new PackageError('Confirm the four statements before submitting.');

  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, input.packageId)).limit(1))[0];
  if (!pkg) throw new PackageError('That study package no longer exists.');
  if (pkg.archivedAt) throw new PackageError('This package is archived. Restore it before submitting it.');
  if (pkg.visibility === 'public') throw new PackageError('This package is already in the VTS Study Library.');

  const open = await pendingFor(input.packageId);
  if (open) throw new PackageError('This package is already waiting to be reviewed.');

  const now = new Date();
  const id = randomUUID();
  await db.insert(studyPackageSubmissions).values({
    id,
    packageId: input.packageId,
    submittedByUserId: input.userId,
    status: 'pending',
    submittedAt: now,
    attestationVersion: ATTESTATION_VERSION,
    attestedAt: now,
  });
  // `submitted` is its own state, distinct from private, shared and public.
  await db.update(studyPackages).set({ visibility: 'submitted' }).where(eq(studyPackages.id, input.packageId));
  return (await getSubmission(id))!;
}

/** The creator taking it back before anyone has reviewed it. */
export async function withdrawSubmission(packageId: string): Promise<boolean> {
  const open = await pendingFor(packageId);
  if (!open) return false;
  await db
    .update(studyPackageSubmissions)
    .set({ status: 'withdrawn', reviewedAt: new Date() })
    .where(eq(studyPackageSubmissions.id, open.id));
  // Back to whatever it was before it was submitted — shared if people hold it,
  // private otherwise. refreshShareVisibility works that out from the shares, so
  // there is no need to have remembered the previous state.
  await db.update(studyPackages).set({ visibility: 'private' }).where(eq(studyPackages.id, packageId));
  await refreshShareVisibility(packageId);
  return true;
}

async function pendingFor(packageId: string) {
  return (
    await db
      .select()
      .from(studyPackageSubmissions)
      .where(and(eq(studyPackageSubmissions.packageId, packageId), eq(studyPackageSubmissions.status, 'pending')))
      .limit(1)
  )[0];
}

export async function getSubmission(id: string): Promise<SubmissionView | null> {
  const row = (
    await db
      .select({
        s: studyPackageSubmissions,
        pkg: studyPackages,
        name: users.displayName,
        withdrawnByName: withdrawer.displayName,
      })
      .from(studyPackageSubmissions)
      .innerJoin(studyPackages, eq(studyPackages.id, studyPackageSubmissions.packageId))
      .leftJoin(users, eq(users.id, studyPackageSubmissions.submittedByUserId))
      .leftJoin(withdrawer, eq(withdrawer.id, studyPackageSubmissions.withdrawnByUserId))
      .where(eq(studyPackageSubmissions.id, id))
      .limit(1)
  )[0];
  return row ? toView(row) : null;
}

function toView(row: {
  s: typeof studyPackageSubmissions.$inferSelect;
  pkg: typeof studyPackages.$inferSelect;
  name: string | null;
  withdrawnByName?: string | null;
}): SubmissionView {
  return {
    id: row.s.id,
    packageId: row.s.packageId,
    packageName: row.pkg.name,
    packageSubject: row.pkg.subject,
    status: row.s.status,
    submittedAt: row.s.submittedAt.getTime(),
    reviewedAt: row.s.reviewedAt?.getTime() ?? null,
    adminNote: row.s.adminNote,
    attestationVersion: row.s.attestationVersion,
    submitterName: row.name,
    withdrawnAt: row.s.withdrawnAt?.getTime() ?? null,
    withdrawnByName: row.withdrawnByName ?? null,
    withdrawnByOwner: row.s.withdrawnByUserId != null && row.s.withdrawnByUserId === row.pkg.ownerUserId,
  };
}

/** This package's submission history, newest first — for its owner. */
export async function submissionsForPackage(packageId: string): Promise<SubmissionView[]> {
  const rows = await db
    .select({
      s: studyPackageSubmissions,
      pkg: studyPackages,
      name: users.displayName,
      withdrawnByName: withdrawer.displayName,
    })
    .from(studyPackageSubmissions)
    .innerJoin(studyPackages, eq(studyPackages.id, studyPackageSubmissions.packageId))
    .leftJoin(users, eq(users.id, studyPackageSubmissions.submittedByUserId))
    .leftJoin(withdrawer, eq(withdrawer.id, studyPackageSubmissions.withdrawnByUserId))
    .where(eq(studyPackageSubmissions.packageId, packageId))
    .orderBy(desc(studyPackageSubmissions.submittedAt));
  return rows.map(toView);
}

// ---- Reviewing ----

/** The moderation queue. Pending first, because that is what needs somebody. */
export async function listSubmissions(status?: SubmissionStatus): Promise<SubmissionView[]> {
  const rows = await db
    .select({
      s: studyPackageSubmissions,
      pkg: studyPackages,
      name: users.displayName,
      withdrawnByName: withdrawer.displayName,
    })
    .from(studyPackageSubmissions)
    .innerJoin(studyPackages, eq(studyPackages.id, studyPackageSubmissions.packageId))
    .leftJoin(users, eq(users.id, studyPackageSubmissions.submittedByUserId))
    .leftJoin(withdrawer, eq(withdrawer.id, studyPackageSubmissions.withdrawnByUserId))
    .where(status ? eq(studyPackageSubmissions.status, status) : undefined)
    .orderBy(desc(studyPackageSubmissions.submittedAt));
  const views = rows.map(toView);
  const rank = (s: SubmissionStatus) => (s === 'pending' ? 0 : 1);
  return views.sort((a, b) => rank(a.status) - rank(b.status) || b.submittedAt - a.submittedAt);
}

export type ReviewDecision = 'approved' | 'rejected' | 'changes_requested';

/**
 * An administrator's decision.
 *
 * Approval is the ONLY thing that makes a package public. Rejecting or asking
 * for changes puts it back where it was — the creator keeps their package and
 * can work on it, which is why neither of those touches the content.
 */
export async function reviewSubmission(input: {
  submissionId: string;
  reviewerId: string;
  decision: ReviewDecision;
  note?: string | null;
}): Promise<SubmissionView | null> {
  const row = (
    await db.select().from(studyPackageSubmissions).where(eq(studyPackageSubmissions.id, input.submissionId)).limit(1)
  )[0];
  if (!row) return null;
  if (row.status !== 'pending') throw new PackageError('This submission has already been reviewed.');

  const now = new Date();
  await db
    .update(studyPackageSubmissions)
    .set({
      status: input.decision,
      reviewedAt: now,
      reviewedByUserId: input.reviewerId,
      adminNote: input.note?.trim().slice(0, 2000) || null,
    })
    .where(eq(studyPackageSubmissions.id, input.submissionId));

  if (input.decision === 'approved') {
    await db.update(studyPackages).set({ visibility: 'public' }).where(eq(studyPackages.id, row.packageId));
  } else {
    // Not published. Hand it back to the creator in the state it came from.
    await db.update(studyPackages).set({ visibility: 'private' }).where(eq(studyPackages.id, row.packageId));
    await refreshShareVisibility(row.packageId);
  }
  return getSubmission(input.submissionId);
}

/**
 * WITHDRAW A PACKAGE FROM THE PUBLIC LIBRARY.
 *
 * One transition, available to the package's owner and to an administrator, and
 * it is deliberately its OWN thing rather than a side effect of archiving or
 * deleting. A creator has to be able to stop distributing their own work
 * immediately — the day they find they lack the rights to something in it, or
 * simply change their mind — without that meaning they destroy it.
 *
 * WHAT IT DOES: stops public distribution. The package leaves the library
 * listing, and nobody new can take it up.
 *
 * WHAT IT DOES NOT DO, and each of these is the point:
 *   • It deletes NOTHING — not the package, its game, its cards, its slides or
 *     its lessons, and not one learner's progress.
 *   • It does not touch EXPLICIT SHARES. Somebody the creator handed the package
 *     to by username still has it; withdrawal is about the public, and taking a
 *     named person's access back is the separate, deliberate act of revoking.
 *   • It does not touch anybody who had already TAKEN THE PACKAGE UP. Their add
 *     row is the record that they acquired it, and it goes on granting them
 *     access (see packageAccess.ts). Withdrawal stops distribution; it does not
 *     reach back and take away what people already have.
 *   • It changes no identity — the package, its categories, its deck and its
 *     slides keep their ids, so progress, lessons and shares all still resolve.
 *   • It does not convert package-backed content back into legacy content.
 *
 * WHAT IT RECORDS: the approved submission is stamped with when the publication
 * ended and who ended it. `status` stays 'approved' because it WAS approved, and
 * the attestation the creator agreed to stays with it — a withdrawal is the end
 * of that publication, not a retraction of the history of it.
 *
 * AFTERWARDS the content unlocks, because there is no longer an approved public
 * version for it to drift away from. Getting back into the library therefore
 * needs a NEW submission and a NEW review: `submitPackage` writes a fresh row
 * and only `reviewSubmission` can make anything public. There is no path from
 * withdrawn to public that does not pass through an administrator.
 */
export async function withdrawFromLibrary(input: {
  packageId: string;
  /** Who is doing it. Recorded, and used to tell a creator from an admin. */
  actorId: string;
}): Promise<boolean> {
  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, input.packageId)).limit(1))[0];
  if (!pkg || pkg.visibility !== 'public') return false;

  const now = new Date();
  await db.update(studyPackages).set({ visibility: 'private' }).where(eq(studyPackages.id, input.packageId));
  // Back to `shared` if people hold it privately — the shares are untouched, so
  // the state has to say so.
  await refreshShareVisibility(input.packageId);

  // Stamp the publication that just ended. The newest approved submission is the
  // one that put it in the library; an already-stamped row is left alone so a
  // second withdrawal cannot overwrite the first one's record.
  const approved = (
    await db
      .select()
      .from(studyPackageSubmissions)
      .where(
        and(
          eq(studyPackageSubmissions.packageId, input.packageId),
          eq(studyPackageSubmissions.status, 'approved'),
          isNull(studyPackageSubmissions.withdrawnAt),
        ),
      )
      .orderBy(desc(studyPackageSubmissions.reviewedAt))
      .limit(1)
  )[0];
  if (approved) {
    await db
      .update(studyPackageSubmissions)
      .set({ withdrawnAt: now, withdrawnByUserId: input.actorId })
      .where(eq(studyPackageSubmissions.id, approved.id));
  }
  return true;
}

/**
 * The administrator's name for the same transition, kept so the existing route
 * and its callers read the way they always did. One implementation, so a
 * creator withdrawing and an admin removing leave the same auditable record.
 */
export async function unpublishPackage(packageId: string, actorId: string): Promise<boolean> {
  return withdrawFromLibrary({ packageId, actorId });
}

// ---- Browsing and taking up ----

/** Everything published, for the library screen. */
export async function listPublished(viewerId: string): Promise<LibraryEntry[]> {
  const rows = await db
    .select({ pkg: studyPackages, ownerName: users.displayName })
    .from(studyPackages)
    .leftJoin(users, eq(users.id, studyPackages.ownerUserId))
    .where(and(eq(studyPackages.visibility, 'public'), isNull(studyPackages.archivedAt)));
  if (!rows.length) return [];

  const ids = rows.map((r) => r.pkg.id);
  const [added, counts] = await Promise.all([
    db
      .select({ packageId: studyPackageAdds.packageId })
      .from(studyPackageAdds)
      .where(and(eq(studyPackageAdds.userId, viewerId), inArray(studyPackageAdds.packageId, ids))),
    questionCounts(ids),
  ]);
  const mine = new Set(added.map((a) => a.packageId));

  return rows
    .map((r) => ({
      packageId: r.pkg.id,
      name: r.pkg.name,
      subject: r.pkg.subject,
      description: r.pkg.description,
      depth: r.pkg.depth,
      ownerName: r.ownerName,
      questionCount: counts.get(r.pkg.id) ?? 0,
      added: mine.has(r.pkg.id),
      publishedAt: r.pkg.updatedAt.getTime(),
    }))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

async function questionCounts(packageIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!packageIds.length) return out;
  const rows = await db.all<{ package_id: string; n: number }>(sql`
    select d.package_id as package_id, count(q.id) as n
    from study_decks d
    left join study_deck_questions q on q.deck_id = d.id
    where d.package_id in (${sql.join(packageIds.map((id) => sql`${id}`), sql`, `)})
    group by d.package_id
  `);
  for (const r of rows) out.set(r.package_id, Number(r.n) || 0);
  return out;
}

/**
 * A learner taking a published package into their own library.
 *
 * No copy is made. They study the same package-backed deck everybody else does,
 * and their progress is their own because progress has always been keyed by
 * (user, deck). What this row adds is that the package appears in their library
 * and that they count as a participant on its leaderboard.
 */
export async function addToLibrary(userId: string, packageId: string): Promise<boolean> {
  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, packageId)).limit(1))[0];
  if (!pkg || pkg.visibility !== 'public' || pkg.archivedAt) return false;
  if (pkg.ownerUserId === userId) return true; // already theirs
  await db
    .insert(studyPackageAdds)
    .values({ userId, packageId, createdAt: new Date() })
    .onConflictDoNothing();
  return true;
}

/** Putting it back down. Their progress rows are left alone. */
export async function removeFromLibrary(userId: string, packageId: string): Promise<void> {
  await db
    .delete(studyPackageAdds)
    .where(and(eq(studyPackageAdds.userId, userId), eq(studyPackageAdds.packageId, packageId)));
}

/** Everyone who has taken a published package up. */
export async function libraryMemberIds(packageId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: studyPackageAdds.userId })
    .from(studyPackageAdds)
    .where(eq(studyPackageAdds.packageId, packageId));
  return rows.map((r) => r.userId);
}
