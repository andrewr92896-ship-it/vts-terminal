import { eq, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyDecks, studyFlashcardSets, studyGuides, studyPackages, type StudyPackageRow } from '../db/schema.js';
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

export type PackageRight = 'read' | 'edit';

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
 * Direct user-to-user sharing is a later handoff: it needs its own table and an
 * accept step, and neither exists yet, so there is nothing to consult and the
 * answer is no for everyone. It is a named function rather than an inline
 * `false` so that handoff has exactly one place to fill in — and so nothing in
 * this module reads as though sharing already works.
 */
async function sharedWithViewer(_viewer: PackageViewer, _pkg: StudyPackageRow): Promise<boolean> {
  return false;
}

/**
 * What this viewer may do with one package — the single authority, so nothing
 * can answer "may they read it" while missing a way in.
 */
export async function rightsFor(
  viewer: PackageViewer,
  pkg: StudyPackageRow,
): Promise<{ read: boolean; edit: boolean }> {
  // The owner, and administrators for support. Editing stops here: a share
  // recipient is read-only in V1, so there is deliberately no third writer.
  if (pkg.ownerUserId === viewer.id) return { read: true, edit: true };
  if (isAdmin(parseRoles(viewer))) return { read: true, edit: true };
  // A published package is readable by any signed-in account. `submitted` is
  // NOT — it means awaiting admin review, which is the owner asking for
  // publication rather than having been granted it.
  if (pkg.visibility === 'public') return { read: true, edit: false };
  return { read: await sharedWithViewer(viewer, pkg), edit: false };
}

/** The same decision from an id. */
export async function packageRights(
  viewer: PackageViewer,
  packageId: string,
): Promise<{ read: boolean; edit: boolean }> {
  const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, packageId)).limit(1))[0];
  if (!pkg) return { read: false, edit: false };
  return rightsFor(viewer, pkg);
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
export async function readablePackages(viewer: PackageViewer): Promise<StudyPackageRow[]> {
  // Filtered in SQL rather than read whole and sifted in memory: this runs on
  // every study game, flashcard and presentation list, so it must not grow with
  // the number of packages on the install.
  //
  // An administrator can reach any package, but the whole install is not a
  // useful list — it would bury their own — so management access stays by id.
  const rows = await db
    .select()
    .from(studyPackages)
    .where(or(eq(studyPackages.ownerUserId, viewer.id), eq(studyPackages.visibility, 'public')));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Just the ids, for widening a content list query. */
export async function readablePackageIds(viewer: PackageViewer): Promise<string[]> {
  return (await readablePackages(viewer)).map((p) => p.id);
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
