import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  studyDecks,
  studyFlashcardSets,
  studyGuides,
  studyPackageAdds,
  studyPackageShares,
  studyPackages,
  type StudyPackageRow,
} from '../db/schema.js';
import { isAdmin, parseRoles } from '../auth/rbac.js';
import { contentScopeId } from '../teams/contentScope.js';

// WHO MAY REACH PACKAGE-BACKED STUDY CONTENT.
//
// Studies has two ownership models running side by side, and this module is the
// one place that decides which applies.
//
//   • LEGACY content (`package_id = null`) is scoped by `contentScopeId(viewer)`
//     — it belongs to a group, and you reach it by being in that group. That is
//     every game, set and guide that exists today, and nothing about it changes.
//
//   • PACKAGE-BACKED content belongs to a PERSON. You reach it by being its
//     owner, by having been shared with it, or by it being published — never by
//     being in the owner's trading/private group. That is what makes Study
//     sharing usable by the public product: somebody who signs up tomorrow is in
//     no group, and no group can be invented for them.
//
// The rule the handoff sets is that this decision is centralized. Route handlers
// must not carry `if (packageId)` exceptions — they ask `resolveContentScope`
// and get back either a scope key to read under or null, which is the same
// shape they already dealt with. That is deliberate: a guard exception copied
// into eleven handlers is a guard exception that will be wrong in one of them.

// Three rights, and keeping them apart is what makes the public library safe.
//
//   read   — study it: play the game, take tests, read the slides.
//   edit   — change its content. LOCKED on a published package (see below).
//   manage — the owner's own controls: share, revoke, submit, archive. Not
//            locked by publication, because withdrawing is how you get out of it.
export type PackageRight = 'read' | 'edit' | 'manage';

/** The three content types a package can hold. */
export type ContentKind = 'deck' | 'flashcards' | 'guide';

export interface PackageViewer {
  id: string;
  teamId: string | null;
  roles: string | null;
}

/**
 * The scope key package-backed content is stored under: always the owner's
 * PERSONAL key, never their team's.
 *
 * The child tables still carry a NOT NULL `team_id` and this is what goes in it.
 * Using `contentScopeId(owner)` there would look more natural and would be
 * wrong: for an owner who happens to be on a team it would hand every teammate
 * access through the legacy path, quietly making a user-owned package
 * group-owned — the one thing the package layer exists to stop. With the
 * personal key, the legacy path can only ever resolve to the owner themselves,
 * and everybody else's access is decided here.
 */
export function packageScopeKey(ownerUserId: string): string {
  return `user:${ownerUserId}`;
}

/**
 * Whether a direct share grants this viewer access.
 *
 * Only an ACCEPTED share does. A pending one is an offer the recipient has not
 * answered, and a declined one is an offer they refused — neither is access, and
 * treating a pending share as access would mean an offer nobody accepted quietly
 * handed out somebody's content.
 *
 * An ARCHIVED package grants nothing through a share either. Archiving is how an
 * owner puts a package away, and content that has been put away must not go on
 * appearing in other people's libraries as though it were live.
 */
async function sharedWithViewer(viewer: PackageViewer, pkg: StudyPackageRow): Promise<boolean> {
  if (pkg.archivedAt) return false;
  const row = (
    await db
      .select({ id: studyPackageShares.id })
      .from(studyPackageShares)
      .where(
        and(
          eq(studyPackageShares.packageId, pkg.id),
          eq(studyPackageShares.recipientUserId, viewer.id),
          eq(studyPackageShares.status, 'accepted'),
        ),
      )
      .limit(1)
  )[0];
  return !!row;
}

/**
 * Whether this viewer has TAKEN THE PACKAGE UP from the public library.
 *
 * The add row is a record of acquisition, and it outlives the publication: a
 * creator withdrawing their package stops new people getting it, and does not
 * take it off the shelf of somebody who already has it. An ARCHIVED package
 * still grants nothing, the same rule shares follow — archiving is the owner
 * putting the whole thing away.
 */
async function addedByViewer(viewer: PackageViewer, pkg: StudyPackageRow): Promise<boolean> {
  if (pkg.archivedAt) return false;
  const row = (
    await db
      .select({ userId: studyPackageAdds.userId })
      .from(studyPackageAdds)
      .where(and(eq(studyPackageAdds.packageId, pkg.id), eq(studyPackageAdds.userId, viewer.id)))
      .limit(1)
  )[0];
  return !!row;
}

/** Whether this package is published in the VTS Study Library. */
function isPublished(pkg: StudyPackageRow): boolean {
  return pkg.visibility === 'public' && !pkg.archivedAt;
}

/**
 * What this viewer may do with one package — the single authority, so nothing
 * can answer "may they read it" while missing a way in.
 */
export interface PackageRights {
  read: boolean;
  edit: boolean;
  manage: boolean;
  /** Published, so its content is frozen against in-place edits. */
  locked: boolean;
}

export async function rightsFor(viewer: PackageViewer, pkg: StudyPackageRow): Promise<PackageRights> {
  // PUBLISHED CONTENT IS FROZEN. An approved package is public on the strength
  // of what a reviewer read; letting the owner keep editing it in place would
  // make the review meaningless, because what people study could drift away from
  // what was approved without anybody seeing it happen. To change it, the owner
  // withdraws or an admin unpublishes, and the new version goes back for review.
  const locked = isPublished(pkg);
  const admin = isAdmin(parseRoles(viewer));

  if (pkg.ownerUserId === viewer.id) {
    // The owner keeps MANAGE while published — withdrawing is how they get out
    // of the lock, so taking that away would trap them in it.
    return { read: true, edit: !locked, manage: true, locked };
  }
  if (admin) return { read: true, edit: true, manage: true, locked };

  // Anyone signed in may read a published package: that is what published means,
  // and it is how the library is browsable. `submitted` is NOT public — it is
  // the owner asking, not having been granted.
  if (isPublished(pkg)) return { read: true, edit: false, manage: false, locked };

  // ALREADY TAKEN UP. Somebody who added the package from the library keeps it
  // when the creator withdraws it: their add row is the record that they
  // acquired it, and withdrawal stops PUBLIC DISTRIBUTION rather than reaching
  // back and taking away what people already hold. Without this an add row would
  // go on widening their game list (readablePackages) while every read of the
  // content refused — the deck listed and unopenable, which is the worst of both.
  if (await addedByViewer(viewer, pkg)) return { read: true, edit: false, manage: false, locked };

  // Otherwise it comes down to a direct share, which is read-only in V1.
  return { read: await sharedWithViewer(viewer, pkg), edit: false, manage: false, locked };
}

/** The same decision from an id. */
export async function packageRights(viewer: PackageViewer, packageId: string): Promise<PackageRights> {
  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, packageId)).limit(1))[0];
  if (!pkg) return { read: false, edit: false, manage: false, locked: false };
  return rightsFor(viewer, pkg);
}

/** Whether this viewer may share, revoke, submit or archive this package. */
export async function canManagePackage(viewer: PackageViewer, packageId: string): Promise<boolean> {
  return (await packageRights(viewer, packageId)).manage;
}

/** Whether this viewer may read (and play) a package's content. */
export async function canReadPackage(viewer: PackageViewer, packageId: string): Promise<boolean> {
  return (await packageRights(viewer, packageId)).read;
}

/** Whether this viewer may change a package or its content. */
export async function canEditPackage(viewer: PackageViewer, packageId: string): Promise<boolean> {
  return (await packageRights(viewer, packageId)).edit;
}

/**
 * Every package this viewer can read, newest first.
 *
 * Used both by the package list and to widen the existing content lists, so a
 * package-backed game appears beside the legacy ones rather than being reachable
 * only if you already know its id.
 */
export async function readablePackages(
  viewer: PackageViewer,
  opts: { archived?: boolean } = {},
): Promise<StudyPackageRow[]> {
  // Filtered in SQL rather than read whole and sifted in memory: this runs on
  // every study game, flashcard and presentation list, so it must not grow with
  // the number of packages on the install.
  //
  // An administrator can reach any package, but the whole install is not a
  // useful list — it would bury their own — so management access stays by id.
  //
  // ARCHIVED packages are excluded by default, which is the whole point of the
  // flag: hiding one hides its game, set and presentation from the ordinary
  // Study Library and creation views, because those lists are widened by
  // exactly this set of ids. `archived: true` asks for them instead, so an
  // owner can find and restore one.
  // What belongs in somebody's LIBRARY: their own packages, the ones accepted
  // from another person, and the published ones they chose to add.
  //
  // Deliberately NOT every published package. Reading one is open to anybody, but
  // the whole public library dropped into everyone's study game list is not a
  // library — it is noise, and it would grow without limit. Browsing the library
  // is its own list (`listPublished`); this is what a person has taken up.
  const [shared, added] = await Promise.all([
    db
      .select({ packageId: studyPackageShares.packageId })
      .from(studyPackageShares)
      .where(and(eq(studyPackageShares.recipientUserId, viewer.id), eq(studyPackageShares.status, 'accepted'))),
    db.select({ packageId: studyPackageAdds.packageId }).from(studyPackageAdds).where(eq(studyPackageAdds.userId, viewer.id)),
  ]);
  const mine = [...new Set([...shared, ...added].map((r) => r.packageId))];
  const reachable = mine.length
    ? or(eq(studyPackages.ownerUserId, viewer.id), inArray(studyPackages.id, mine))
    : eq(studyPackages.ownerUserId, viewer.id);
  const rows = await db
    .select()
    .from(studyPackages)
    .where(and(reachable, opts.archived ? isNotNull(studyPackages.archivedAt) : isNull(studyPackages.archivedAt)));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Just the ids of the ACTIVE ones, for widening a content list query. Archived
 * packages are left out, so their content drops out of the ordinary lists.
 */
export async function readablePackageIds(viewer: PackageViewer): Promise<string[]> {
  return (await readablePackages(viewer)).map((p) => p.id);
}

/**
 * Everybody who studies this package — the owner, whoever accepted a share, and
 * whoever added it from the public library.
 *
 * THIS IS WHAT A PACKAGE LEADERBOARD RANKS. Participation follows package
 * access and nothing else: no trading team, no private group, no follow. It is
 * deliberately narrower than "may read it" — a published package is readable by
 * anyone signed in, but appearing on its board means having chosen to take it
 * up, which is what `study_package_adds` records.
 *
 * Admins are not added. Their reach is for support, and quietly enrolling every
 * administrator on every board would be a strange thing for a leaderboard to do.
 */
export async function packageAudience(packageId: string): Promise<string[]> {
  const pkg = (
    await db.select({ ownerUserId: studyPackages.ownerUserId }).from(studyPackages).where(eq(studyPackages.id, packageId)).limit(1)
  )[0];
  if (!pkg) return [];
  const [shared, added] = await Promise.all([
    db
      .select({ userId: studyPackageShares.recipientUserId })
      .from(studyPackageShares)
      .where(and(eq(studyPackageShares.packageId, packageId), eq(studyPackageShares.status, 'accepted'))),
    db.select({ userId: studyPackageAdds.userId }).from(studyPackageAdds).where(eq(studyPackageAdds.packageId, packageId)),
  ]);
  return [...new Set([pkg.ownerUserId, ...shared.map((r) => r.userId), ...added.map((r) => r.userId)])];
}

/** The package a piece of content belongs to, or null if it is legacy content. */
export async function packageIdOf(kind: ContentKind, contentId: string): Promise<string | null> {
  const t = CONTENT_TABLES[kind];
  const row = (await db.select({ packageId: t.packageId }).from(t.table).where(eq(t.id, contentId)).limit(1))[0];
  return row?.packageId ?? null;
}

const CONTENT_TABLES = {
  deck: { table: studyDecks, id: studyDecks.id, teamId: studyDecks.teamId, packageId: studyDecks.packageId },
  flashcards: {
    table: studyFlashcardSets,
    id: studyFlashcardSets.id,
    teamId: studyFlashcardSets.teamId,
    packageId: studyFlashcardSets.packageId,
  },
  guide: { table: studyGuides, id: studyGuides.id, teamId: studyGuides.teamId, packageId: studyGuides.packageId },
} as const;

/**
 * The scope key to read one piece of content under — or null if this viewer may
 * not reach it at all.
 *
 * This is the seam that let every existing store function stay exactly as it
 * was. They all take a scope key and filter on it; a route used to pass
 * `contentScopeId(me)` and now passes whatever this returns, so:
 *
 *   • LEGACY content resolves to `contentScopeId(viewer)` — byte for byte the
 *     value the route passed before, so the store applies the same filter and
 *     reaches the same rows. Content that does not exist resolves the same way
 *     and the store returns null, which is the 404 the route already handled.
 *
 *   • PACKAGE-BACKED content is decided here, and on success resolves to the
 *     row's OWN stored scope, so the store's filter matches by construction.
 *     A share recipient is therefore not rejected for having a different
 *     `contentScopeId` — the very failure this indirection exists to prevent.
 */
export async function resolveContentScope(
  viewer: PackageViewer,
  kind: ContentKind,
  contentId: string,
  right: PackageRight,
): Promise<string | null> {
  const t = CONTENT_TABLES[kind];
  const row = (
    await db
      .select({ teamId: t.teamId, packageId: t.packageId })
      .from(t.table)
      .where(eq(t.id, contentId))
      .limit(1)
  )[0];

  // Unknown id, or legacy content: the scope rules are unchanged. Returning the
  // viewer's own scope for a row that does not exist is what keeps a missing id
  // and an out-of-scope id indistinguishable, which is how these routes already
  // behave and is what stops an id being probed for.
  if (!row || row.packageId == null) return contentScopeId(viewer);

  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, row.packageId)).limit(1))[0];
  // A package-backed row whose package has gone (an owner's account deleted, say)
  // falls back to its stored scope rather than becoming unreachable. It is still
  // somebody's content; it simply behaves as legacy content again.
  if (!pkg) return row.teamId;

  const rights = await rightsFor(viewer, pkg);
  return (right === 'edit' ? rights.edit : rights.read) ? row.teamId : null;
}

/**
 * Whether this content belongs to a Study Package — i.e. whether the package
 * rules decide it, or the legacy group scope does.
 *
 * Callers use this to pick the right OWNERSHIP question, never to skip an
 * access check: access is already settled by `resolveContentScope` before this
 * is consulted.
 */
export async function isPackageBacked(kind: ContentKind, contentId: string): Promise<boolean> {
  const t = CONTENT_TABLES[kind];
  const row = (await db.select({ packageId: t.packageId }).from(t.table).where(eq(t.id, contentId)).limit(1))[0];
  return row?.packageId != null;
}

/**
 * The scope key one content row is stored under, with NO access check.
 *
 * Only for callers that have already established access some other way — the
 * package components read, where the package itself was just authorized. Doing
 * it this way is what stops that read re-deciding access on the viewer's own
 * content scope and refusing a legitimate share recipient for having a
 * different one. Anything that has not already made the decision wants
 * `resolveContentScope` instead.
 */
export async function scopeOf(kind: ContentKind, contentId: string): Promise<string | null> {
  const t = CONTENT_TABLES[kind];
  const row = (await db.select({ teamId: t.teamId }).from(t.table).where(eq(t.id, contentId)).limit(1))[0];
  return row?.teamId ?? null;
}
