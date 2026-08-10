import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  studyDeckGame,
  studyDeckQuestions,
  studyDeckRuns,
  studyDecks,
  studyFlashcardCards,
  studyFlashcardSets,
  studyGuides,
  studyPackageCategories,
  studyPackageLessons,
  studyPackageAdds,
  studyPackageShares,
  studyPackageSubmissions,
  studyPackages,
  users,
  type CategoryWeightMode,
  type PackageDepth,
  type PackageVisibility,
  type StudyPackageRow,
} from '../db/schema.js';

// Study Packages: create, read, update and delete the container, its stable
// category blueprint, and its lesson plans.
//
// Who may do any of it is decided in packageAccess.ts, never here. This module
// is the storage half, and takes the access decision as already made — the same
// split memberships/tiers.ts and memberships/service.ts use, for the same
// reason.

// Runaway-input guards, not licensing questions.
export const MAX_PACKAGES_PER_USER = 60;
export const MAX_CATEGORIES = 60;
export const MAX_LESSONS = 100;

export class PackageError extends Error {}

export interface PackageCategory {
  id: string;
  seq: number;
  name: string;
  weight: number | null;
}

export interface PackageLesson {
  id: string;
  seq: number;
  title: string;
  objective: string | null;
  body: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PackageSummary {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  audience: string | null;
  depth: PackageDepth | null;
  formatVersion: number;
  visibility: PackageVisibility;
  // Archived packages keep everything and are simply hidden from the ordinary
  // Study Library and creation views.
  archived: boolean;
  archivedAt: number | null;
  ownerUserId: string;
  ownerName: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  // Which of the three component types this package actually holds.
  hasDeck: boolean;
  hasFlashcards: boolean;
  hasGuide: boolean;
  lessonCount: number;
  /**
   * Whether the person asking owns it.
   *
   * A library holds a person's own packages beside ones handed to them and ones
   * taken from the VTS Study Library, and they behave differently — only the
   * owner can share, submit or archive. The screen needs to tell them apart
   * without comparing user ids client-side.
   */
  mine: boolean;
  /** How many people currently hold it or have been offered it. Owner's view. */
  sharedWith: number;
}

export interface PackageDetail extends PackageSummary {
  categories: PackageCategory[];
  lessons: PackageLesson[];
  // The ids of the components, for the existing players to open.
  deckId: string | null;
  flashcardSetId: string | null;
  guideId: string | null;
}

function toSummaryBase(row: StudyPackageRow, ownerName: string | null) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subject: row.subject,
    audience: row.audience,
    depth: row.depth,
    formatVersion: row.formatVersion,
    visibility: row.visibility,
    archived: row.archivedAt != null,
    archivedAt: row.archivedAt?.getTime() ?? null,
    ownerUserId: row.ownerUserId,
    ownerName,
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

// ---- Components ----

/** The component ids a package holds (at most one of each kind). */
export async function componentIds(packageId: string): Promise<{
  deckId: string | null;
  flashcardSetId: string | null;
  guideId: string | null;
}> {
  const [decks, sets, guides] = await Promise.all([
    db.select({ id: studyDecks.id }).from(studyDecks).where(eq(studyDecks.packageId, packageId)).limit(1),
    db
      .select({ id: studyFlashcardSets.id })
      .from(studyFlashcardSets)
      .where(eq(studyFlashcardSets.packageId, packageId))
      .limit(1),
    db.select({ id: studyGuides.id }).from(studyGuides).where(eq(studyGuides.packageId, packageId)).limit(1),
  ]);
  return {
    deckId: decks[0]?.id ?? null,
    flashcardSetId: sets[0]?.id ?? null,
    guideId: guides[0]?.id ?? null,
  };
}

// ---- Read ----

export async function getPackage(packageId: string, viewerId?: string): Promise<PackageDetail | null> {
  const row = (
    await db
      .select({ pkg: studyPackages, ownerName: users.displayName })
      .from(studyPackages)
      .leftJoin(users, eq(users.id, studyPackages.ownerUserId))
      .where(eq(studyPackages.id, packageId))
      .limit(1)
  )[0];
  if (!row) return null;

  const [categories, lessons, ids, shares] = await Promise.all([
    listCategories(packageId),
    listLessons(packageId),
    componentIds(packageId),
    db
      .select({ status: studyPackageShares.status })
      .from(studyPackageShares)
      .where(eq(studyPackageShares.packageId, packageId)),
  ]);

  return {
    ...toSummaryBase(row.pkg, row.ownerName),
    hasDeck: ids.deckId != null,
    hasFlashcards: ids.flashcardSetId != null,
    hasGuide: ids.guideId != null,
    lessonCount: lessons.length,
    mine: viewerId ? row.pkg.ownerUserId === viewerId : true,
    sharedWith: shares.filter((s) => s.status !== 'declined').length,
    categories,
    lessons,
    ...ids,
  };
}

/** Summaries for a set of packages already resolved as readable. */
export async function summarize(rows: StudyPackageRow[], viewerId?: string): Promise<PackageSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [owners, decks, sets, guides, lessons, shares] = await Promise.all([
    db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...new Set(rows.map((r) => r.ownerUserId))])),
    db.select({ packageId: studyDecks.packageId }).from(studyDecks).where(inArray(studyDecks.packageId, ids)),
    db
      .select({ packageId: studyFlashcardSets.packageId })
      .from(studyFlashcardSets)
      .where(inArray(studyFlashcardSets.packageId, ids)),
    db.select({ packageId: studyGuides.packageId }).from(studyGuides).where(inArray(studyGuides.packageId, ids)),
    db
      .select({ packageId: studyPackageLessons.packageId })
      .from(studyPackageLessons)
      .where(inArray(studyPackageLessons.packageId, ids)),
    // Read straight off the table rather than through packageSharing, which
    // imports PackageError from here — the cycle is not worth one count.
    db
      .select({ packageId: studyPackageShares.packageId, status: studyPackageShares.status })
      .from(studyPackageShares)
      .where(inArray(studyPackageShares.packageId, ids)),
  ]);
  const nameById = new Map(owners.map((o) => [o.id, o.displayName]));
  const has = (list: { packageId: string | null }[]) => new Set(list.map((r) => r.packageId));
  const deckSet = has(decks);
  const cardSet = has(sets);
  const guideSet = has(guides);
  const lessonCounts = new Map<string, number>();
  for (const l of lessons) {
    if (l.packageId) lessonCounts.set(l.packageId, (lessonCounts.get(l.packageId) ?? 0) + 1);
  }
  const shareCounts = new Map<string, number>();
  for (const s of shares) {
    // A declined offer is not somebody holding it.
    if (s.status === 'declined') continue;
    shareCounts.set(s.packageId, (shareCounts.get(s.packageId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    ...toSummaryBase(r, nameById.get(r.ownerUserId) ?? null),
    hasDeck: deckSet.has(r.id),
    hasFlashcards: cardSet.has(r.id),
    hasGuide: guideSet.has(r.id),
    lessonCount: lessonCounts.get(r.id) ?? 0,
    mine: viewerId ? r.ownerUserId === viewerId : true,
    sharedWith: shareCounts.get(r.id) ?? 0,
  }));
}

// ---- Create / update ----

export async function createPackage(input: {
  ownerUserId: string;
  createdBy: string | null;
  name: string;
  description?: string | null;
  subject?: string | null;
  audience?: string | null;
  depth?: PackageDepth | null;
}): Promise<PackageDetail> {
  const mine = await db
    .select({ id: studyPackages.id })
    .from(studyPackages)
    .where(eq(studyPackages.ownerUserId, input.ownerUserId));
  if (mine.length >= MAX_PACKAGES_PER_USER) {
    throw new PackageError(`You can keep up to ${MAX_PACKAGES_PER_USER} study packages.`);
  }

  const now = new Date();
  const id = randomUUID();
  await db.insert(studyPackages).values({
    id,
    ownerUserId: input.ownerUserId,
    createdBy: input.createdBy,
    name: input.name.trim().slice(0, 120),
    description: input.description?.trim().slice(0, 2000) || null,
    subject: input.subject?.trim().slice(0, 120) || null,
    audience: input.audience?.trim().slice(0, 120) || null,
    depth: input.depth ?? null,
    formatVersion: 1,
    // Everything starts private. Sharing and publication are later handoffs, and
    // nothing here can set another value — see the route's schema.
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
  });
  return (await getPackage(id))!;
}

/** Owner-controlled metadata. Visibility is deliberately not patchable here. */
export async function updatePackage(
  packageId: string,
  patch: {
    name?: string;
    description?: string | null;
    subject?: string | null;
    audience?: string | null;
    depth?: PackageDepth | null;
  },
): Promise<PackageDetail | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 120);
  if (patch.description !== undefined) set.description = patch.description?.trim().slice(0, 2000) || null;
  if (patch.subject !== undefined) set.subject = patch.subject?.trim().slice(0, 120) || null;
  if (patch.audience !== undefined) set.audience = patch.audience?.trim().slice(0, 120) || null;
  if (patch.depth !== undefined) set.depth = patch.depth;
  await db.update(studyPackages).set(set).where(eq(studyPackages.id, packageId));
  return getPackage(packageId);
}

/**
 * ARCHIVE a package — the ordinary way a creator removes one.
 *
 * Changes one column and nothing else. The components, every learner's
 * progress, the stable category ids and every future sharing relationship stay
 * exactly as they are, so unarchiving is instant and lossless. What the flag
 * governs is LISTING: an archived package and its content drop out of the
 * ordinary Study Library and creation views.
 *
 * Deliberately NOT a detach. Clearing `package_id` would turn package-owned
 * content into unrelated standalone content — severing the stable category
 * links, stranding the lessons, and breaking the relationships sharing and
 * versioning need — irreversibly, since nothing would record what the package
 * had held. That is destructive in a way that does not look destructive.
 */
export async function archivePackage(packageId: string): Promise<PackageDetail | null> {
  const now = new Date();
  await db
    .update(studyPackages)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(studyPackages.id, packageId));
  return getPackage(packageId);
}

/** Restore an archived package. Nothing was changed, so nothing is rebuilt. */
export async function unarchivePackage(packageId: string): Promise<PackageDetail | null> {
  await db
    .update(studyPackages)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(studyPackages.id, packageId));
  return getPackage(packageId);
}

/**
 * PERMANENTLY DELETE a package and everything it owns. Destructive, and
 * deliberately kept separate from archiving above.
 *
 * There is no route to this and no user-facing workflow — archiving is what a
 * creator does. Its one caller is account deletion, where a personal package
 * has to go with the person the way their Investments and Net Worth rows do.
 *
 * It deletes the package's CONTENT rather than detaching it, because the
 * alternative leaves games and sets that belonged to a package sitting in a
 * scope keyed to a user who no longer exists — content nobody can reach,
 * carrying a package id that resolves to nothing. Cleaning up coherently means
 * the package's records leave together.
 *
 * Every child write is explicit: this database never turns the foreign key
 * pragma on (see db/index.ts), so a declared ON DELETE action does not fire and
 * anything not named here is what gets left behind.
 */
export async function purgePackage(packageId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deckIds = (
      await tx.select({ id: studyDecks.id }).from(studyDecks).where(eq(studyDecks.packageId, packageId))
    ).map((d) => d.id);
    const setIds = (
      await tx
        .select({ id: studyFlashcardSets.id })
        .from(studyFlashcardSets)
        .where(eq(studyFlashcardSets.packageId, packageId))
    ).map((s) => s.id);

    if (deckIds.length) {
      // The game, its questions, and every learner's state and banked runs on
      // it. Progress is keyed by (userId, deckId), so it is reachable only
      // through these ids and would otherwise outlive the game itself.
      await tx.delete(studyDeckQuestions).where(inArray(studyDeckQuestions.deckId, deckIds));
      await tx.delete(studyDeckGame).where(inArray(studyDeckGame.deckId, deckIds));
      await tx.delete(studyDeckRuns).where(inArray(studyDeckRuns.deckId, deckIds));
      await tx.delete(studyDecks).where(inArray(studyDecks.id, deckIds));
    }
    if (setIds.length) {
      await tx.delete(studyFlashcardCards).where(inArray(studyFlashcardCards.setId, setIds));
      await tx.delete(studyFlashcardSets).where(inArray(studyFlashcardSets.id, setIds));
    }
    await tx.delete(studyGuides).where(eq(studyGuides.packageId, packageId));
    await tx.delete(studyPackageCategories).where(eq(studyPackageCategories.packageId, packageId));
    await tx.delete(studyPackageLessons).where(eq(studyPackageLessons.packageId, packageId));
    // Everyone's relationship to it goes too — the shares handed out, the
    // library submissions, and the rows recording who had taken it up. The
    // foreign key pragma is never on, so an unnamed child table is one left
    // pointing at a package id that no longer resolves.
    await tx.delete(studyPackageShares).where(eq(studyPackageShares.packageId, packageId));
    await tx.delete(studyPackageSubmissions).where(eq(studyPackageSubmissions.packageId, packageId));
    await tx.delete(studyPackageAdds).where(eq(studyPackageAdds.packageId, packageId));
    await tx.delete(studyPackages).where(eq(studyPackages.id, packageId));
  });
}

// ---- Stable categories ----

export async function listCategories(packageId: string): Promise<PackageCategory[]> {
  const rows = await db
    .select()
    .from(studyPackageCategories)
    .where(eq(studyPackageCategories.packageId, packageId));
  return rows
    .map((r) => ({ id: r.id, seq: r.seq, name: r.name, weight: r.weight }))
    .sort((a, b) => a.seq - b.seq);
}

export interface CategoryInput {
  /** Omitted for a new category; supplied to keep an existing one's identity. */
  id?: string | null;
  name: string;
  weight?: number | null;
}

/**
 * Set the package's category blueprint.
 *
 * The ID IS THE IDENTITY, and that is the whole reason this layer exists. An
 * input carrying an `id` UPDATES that row — so renaming a category rewrites its
 * name and leaves every question, weight and learner statistic still pointing at
 * the same row. An input with no id is a genuinely new category. Anything the
 * caller omits entirely is removed.
 *
 * Contrast the legacy model, where a category is only ever its name: renaming
 * one there silently resets everybody's per-category history, because the new
 * name matches nothing and the old name's record is stranded under a label that
 * no longer exists.
 */
export async function setCategories(packageId: string, input: CategoryInput[]): Promise<PackageCategory[]> {
  if (input.length > MAX_CATEGORIES) {
    throw new PackageError(`A study package can have up to ${MAX_CATEGORIES} categories.`);
  }
  const existing = await listCategories(packageId);
  const existingIds = new Set(existing.map((c) => c.id));
  const now = new Date();

  const keep: string[] = [];
  await db.transaction(async (tx) => {
    for (const [i, c] of input.entries()) {
      const name = c.name.trim().slice(0, 60);
      if (!name) continue;
      const weight = c.weight == null || !Number.isFinite(c.weight) || c.weight < 0 ? null : c.weight;
      if (c.id && existingIds.has(c.id)) {
        keep.push(c.id);
        await tx
          .update(studyPackageCategories)
          .set({ seq: i + 1, name, weight, updatedAt: now })
          .where(eq(studyPackageCategories.id, c.id));
      } else {
        const id = randomUUID();
        keep.push(id);
        await tx.insert(studyPackageCategories).values({
          id,
          packageId,
          seq: i + 1,
          name,
          weight,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    const dropped = existing.filter((c) => !keep.includes(c.id)).map((c) => c.id);
    if (dropped.length) {
      // Questions in a removed category keep their `topic` text and simply lose
      // the stable link — they degrade to legacy name-keyed behavior rather than
      // vanishing from the game.
      await tx.update(studyDeckQuestions).set({ categoryId: null }).where(inArray(studyDeckQuestions.categoryId, dropped));
      await tx.delete(studyPackageCategories).where(inArray(studyPackageCategories.id, dropped));
    }
  });

  await syncPackageCategories(packageId);
  return listCategories(packageId);
}

/**
 * Push the package's category blueprint down onto its game's compatibility
 * fields, and pull unlinked questions up onto stable ids.
 *
 * The existing player, editor and test code all read a category as a NAME —
 * `study_decks.categories`, each question's `topic`, and the weights map keyed
 * by name. None of that had to change, because this keeps those fields in step
 * with the category rows. The id is the identity; the names are a projection of
 * it, refreshed here whenever the blueprint moves.
 *
 * Run after every category mutation. It is idempotent, so running it twice
 * costs nothing.
 */
export async function syncPackageCategories(packageId: string): Promise<void> {
  const categories = await listCategories(packageId);
  const decks = await db
    .select({ id: studyDecks.id })
    .from(studyDecks)
    .where(eq(studyDecks.packageId, packageId));
  if (!decks.length) return;

  const byLowerName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const now = new Date();

  for (const deck of decks) {
    const questions = await db
      .select({ id: studyDeckQuestions.id, topic: studyDeckQuestions.topic, categoryId: studyDeckQuestions.categoryId })
      .from(studyDeckQuestions)
      .where(eq(studyDeckQuestions.deckId, deck.id));

    // One transaction per deck: a rename that stopped half way would leave some
    // questions under the old name and some under the new, which reads as two
    // categories where there is one.
    await db.transaction(async (tx) => {
      const topics: string[] = [];
      for (const q of questions) {
        const linked = q.categoryId ? byId.get(q.categoryId) : undefined;
        if (linked) {
          // The category row is the authority on its own name.
          if (q.topic !== linked.name) {
            await tx.update(studyDeckQuestions).set({ topic: linked.name }).where(eq(studyDeckQuestions.id, q.id));
          }
          topics.push(linked.name);
          continue;
        }
        // Not linked yet (a game just created into the package, or a category
        // added after the questions): adopt the category whose name it already
        // uses. Matching by name is right exactly once — at the moment identity
        // is established. Afterwards the id carries it.
        const match = byLowerName.get(q.topic.trim().toLowerCase());
        if (match) {
          await tx
            .update(studyDeckQuestions)
            .set({ categoryId: match.id, topic: match.name })
            .where(eq(studyDeckQuestions.id, q.id));
          topics.push(match.name);
        } else {
          topics.push(q.topic);
        }
      }

      // The deck's own compatibility fields: the ordered category names, plus
      // any question topic the blueprint does not cover, so the invariant
      // deckStore maintains still holds — every question's topic names a valid
      // category.
      const names = categories.map((c) => c.name);
      const seen = new Set(names.map((n) => n.toLowerCase()));
      for (const topic of topics) {
        const t = topic.trim();
        if (t && !seen.has(t.toLowerCase())) {
          seen.add(t.toLowerCase());
          names.push(t);
        }
      }

      // Weights mirrored into the legacy name-keyed map so the existing scoring
      // path reads them unchanged. Null when no category states a weight, which
      // keeps the legacy meaning of null intact: unweighted, and deliberately
      // not the same as every weight being zero.
      const weighted = categories.filter((c) => c.weight != null);
      const weights = weighted.length
        ? JSON.stringify(Object.fromEntries(weighted.map((c) => [c.name, c.weight as number])))
        : null;

      await tx
        .update(studyDecks)
        .set({ categories: JSON.stringify(names), categoryWeights: weights, updatedAt: now })
        .where(eq(studyDecks.id, deck.id));
    });
  }
}

/** Set what a package-backed game's category weights govern. */
export async function setCategoryWeightMode(deckId: string, mode: CategoryWeightMode | null): Promise<void> {
  await db
    .update(studyDecks)
    .set({ categoryWeightMode: mode, updatedAt: new Date() })
    .where(eq(studyDecks.id, deckId));
}

// ---- Lessons ----

export async function listLessons(packageId: string): Promise<PackageLesson[]> {
  const rows = await db
    .select()
    .from(studyPackageLessons)
    .where(eq(studyPackageLessons.packageId, packageId));
  return rows
    .map((r) => ({
      id: r.id,
      seq: r.seq,
      title: r.title,
      objective: r.objective,
      body: r.body,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    }))
    .sort((a, b) => a.seq - b.seq);
}

export interface LessonInput {
  id?: string | null;
  title: string;
  objective?: string | null;
  body?: string | null;
}

/** Replace the package's lesson plans, keeping the ids of the ones supplied. */
export async function setLessons(packageId: string, input: LessonInput[]): Promise<PackageLesson[]> {
  if (input.length > MAX_LESSONS) {
    throw new PackageError(`A study package can have up to ${MAX_LESSONS} lessons.`);
  }
  const existing = await listLessons(packageId);
  const existingIds = new Set(existing.map((l) => l.id));
  const now = new Date();
  const keep: string[] = [];

  await db.transaction(async (tx) => {
    for (const [i, l] of input.entries()) {
      const title = l.title.trim().slice(0, 200);
      if (!title) continue;
      const objective = l.objective?.trim().slice(0, 1000) || null;
      const body = l.body?.trim().slice(0, 20_000) || null;
      if (l.id && existingIds.has(l.id)) {
        keep.push(l.id);
        await tx
          .update(studyPackageLessons)
          .set({ seq: i + 1, title, objective, body, updatedAt: now })
          .where(eq(studyPackageLessons.id, l.id));
      } else {
        const id = randomUUID();
        keep.push(id);
        await tx
          .insert(studyPackageLessons)
          .values({ id, packageId, seq: i + 1, title, objective, body, createdAt: now, updatedAt: now });
      }
    }
    const dropped = existing.filter((l) => !keep.includes(l.id)).map((l) => l.id);
    if (dropped.length) {
      await tx.delete(studyPackageLessons).where(inArray(studyPackageLessons.id, dropped));
    }
  });

  return listLessons(packageId);
}

