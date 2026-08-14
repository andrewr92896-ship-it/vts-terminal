import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  studyDeckQuestions,
  studyDecks,
  studyFlashcardCards,
  studyFlashcardSets,
  studyGuides,
  studyPackageCategories,
  studyPackageLessons,
  studyPackages,
  type CategoryWeightMode,
  type ExplanationMode,
  type PackageDepth,
} from '../db/schema.js';
import { packageScopeKey } from './packageAccess.js';
import {
  MAX_PACKAGES_PER_USER,
  PackageError,
  getPackage,
  syncPackageCategories,
  type PackageDetail,
} from './packageStore.js';

// Creating a Study Package and everything inside it, in ONE transaction.
//
// Two callers, one path: an imported package from the creator's own AI, and a
// package whose questions were typed in by hand. Both arrive here as the same
// normalized input, so a manual package is package-backed by construction
// rather than by a second code path remembering to set `package_id`.
//
// The inserts are written out here rather than delegating to createDeck /
// createFlashcardSet / createGuide, because each of those opens its own
// transaction and they cannot compose into one. The requirement is that a
// failure part-way leaves NOTHING behind — a package with a game but no
// flashcards, created silently, is worse than a refusal — so the whole commit
// is one transaction and the stores' rules are mirrored here deliberately.
//
// The server assigns every stored id and sequence number. The ids in the
// transported file are import identity only, used to resolve references while
// building, and never written to the database.

export interface CommitCategory {
  /** The id used inside the file/blueprint. Never stored. */
  importId: string;
  name: string;
  weight: number | null;
}

export interface CommitQuestion {
  categoryImportId: string | null;
  stem: string;
  options: { label: string; text: string }[];
  answer: string;
  explanation: string | null;
}

export interface CommitFlashcard {
  categoryImportId: string | null;
  term: string;
  definition: string;
}

export interface CommitLesson {
  title: string;
  objective: string | null;
  body: string | null;
  /**
   * The slides this lesson covers, named by their IMPORT ids — the ones from
   * the transported file. They are translated to the stored slide ids minted
   * below, here rather than in the caller, because this is the only place that
   * knows what those stored ids are.
   */
  slideImportIds: string[];
}

export interface PackageCommitInput {
  ownerUserId: string;
  createdBy: string | null;
  name: string;
  subject: string | null;
  description: string | null;
  audience: string | null;
  depth: PackageDepth | null;
  explanationMode: ExplanationMode | null;
  categoryWeightMode: CategoryWeightMode | null;
  categories: CommitCategory[];
  questions: CommitQuestion[];
  flashcards: CommitFlashcard[];
  presentation: {
    title: string;
    /** `importId` is the file's own id for the slide. Never stored as-is. */
    slides: { importId?: string | null; title: string; body: string }[];
  } | null;
  lessons: CommitLesson[];
  /** How the content got here, for the deck's `source` column. */
  source: 'package_import' | 'package_manual';
}

export async function commitPackage(input: PackageCommitInput): Promise<PackageDetail> {
  const mine = await db
    .select({ id: studyPackages.id })
    .from(studyPackages)
    .where(eq(studyPackages.ownerUserId, input.ownerUserId));
  if (mine.length >= MAX_PACKAGES_PER_USER) {
    throw new PackageError(`You can keep up to ${MAX_PACKAGES_PER_USER} study packages.`);
  }

  const now = new Date();
  const packageId = randomUUID();
  // Package-backed content lives under the owner's PERSONAL scope key, never
  // their group's — see packageAccess.packageScopeKey for why.
  const scope = packageScopeKey(input.ownerUserId);

  // importId → the real category row id. Built before the questions so every
  // question can be linked to a stable category as it is inserted.
  const categoryIdByImportId = new Map<string, string>();
  const categoryNameByImportId = new Map<string, string>();
  // The file's slide id → the stored slide id minted for it. Filled while the
  // presentation is written, read when the lessons are.
  const storedSlideIdByImportId = new Map<string, string>();
  for (const c of input.categories) {
    categoryIdByImportId.set(c.importId, randomUUID());
    categoryNameByImportId.set(c.importId, c.name.trim().slice(0, 60));
  }

  await db.transaction(async (tx) => {
    await tx.insert(studyPackages).values({
      id: packageId,
      ownerUserId: input.ownerUserId,
      createdBy: input.createdBy,
      name: input.name.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 2000) || null,
      subject: input.subject?.trim().slice(0, 120) || null,
      audience: input.audience?.trim().slice(0, 120) || null,
      depth: input.depth,
      explanationMode: input.explanationMode,
      formatVersion: 1,
      visibility: 'private',
      createdAt: now,
      updatedAt: now,
    });

    if (input.categories.length) {
      await tx.insert(studyPackageCategories).values(
        input.categories.map((c, i) => ({
          id: categoryIdByImportId.get(c.importId)!,
          packageId,
          seq: i + 1,
          name: categoryNameByImportId.get(c.importId)!,
          weight: c.weight,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    // ---- The study game ----
    if (input.questions.length) {
      const deckId = randomUUID();
      // The deck's compatibility fields, exactly as syncPackageCategories would
      // leave them: the ordered category names, and the weights keyed by name so
      // the existing scoring path reads them unchanged.
      const names = input.categories.map((c) => categoryNameByImportId.get(c.importId)!);
      const seen = new Set(names.map((n) => n.toLowerCase()));
      for (const q of input.questions) {
        const topic = topicFor(q, categoryNameByImportId);
        if (topic && !seen.has(topic.toLowerCase())) {
          seen.add(topic.toLowerCase());
          names.push(topic);
        }
      }
      const weighted = input.categories.filter((c) => c.weight != null);
      const weights = weighted.length
        ? JSON.stringify(
            Object.fromEntries(weighted.map((c) => [categoryNameByImportId.get(c.importId)!, c.weight as number])),
          )
        : null;

      await tx.insert(studyDecks).values({
        id: deckId,
        teamId: scope,
        packageId,
        name: input.name.trim().slice(0, 120),
        description: input.subject?.trim().slice(0, 500) || null,
        createdBy: input.createdBy,
        source: input.source,
        isSample: false,
        categories: JSON.stringify(names),
        categoryWeights: weights,
        categoryWeightMode: input.categoryWeightMode,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(studyDeckQuestions).values(
        input.questions.map((q, i) => ({
          id: randomUUID(),
          deckId,
          teamId: scope,
          // Sequence is assigned here and never taken from the file.
          seq: i + 1,
          topic: topicFor(q, categoryNameByImportId) || 'General',
          categoryId: q.categoryImportId ? (categoryIdByImportId.get(q.categoryImportId) ?? null) : null,
          stem: q.stem.trim().slice(0, 600),
          options: JSON.stringify(q.options.map((o) => ({ label: o.label, text: o.text.trim().slice(0, 400) }))),
          answer: q.answer,
          explanation: q.explanation?.trim().slice(0, 400) || null,
          sourceName: null,
          createdAt: now,
        })),
      );
    }

    // ---- Flashcards ----
    if (input.flashcards.length) {
      const setId = randomUUID();
      const topics = [
        ...new Set(
          input.flashcards
            .map((f) => (f.categoryImportId ? (categoryNameByImportId.get(f.categoryImportId) ?? '') : ''))
            .filter(Boolean),
        ),
      ];
      await tx.insert(studyFlashcardSets).values({
        id: setId,
        teamId: scope,
        packageId,
        name: input.name.trim().slice(0, 120),
        description: input.subject?.trim().slice(0, 500) || null,
        createdBy: input.createdBy,
        source: input.source,
        topics: JSON.stringify(topics),
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(studyFlashcardCards).values(
        input.flashcards.map((f, i) => ({
          id: randomUUID(),
          setId,
          teamId: scope,
          seq: i + 1,
          term: f.term.trim().slice(0, 300),
          def: f.definition.trim().slice(0, 2000),
          topic: f.categoryImportId ? (categoryNameByImportId.get(f.categoryImportId) ?? null) : null,
          createdAt: now,
        })),
      );
    }

    // ---- Presentation ----
    //
    // Every slide gets a stored id of its own, minted here. The file's ids are
    // untrusted external identity and are only used to work out which stored
    // slide each lesson meant.
    if (input.presentation && input.presentation.slides.length) {
      const slides = input.presentation.slides.map((s) => {
        const id = randomUUID();
        if (s.importId) storedSlideIdByImportId.set(s.importId, id);
        return {
          id,
          title: s.title.trim().slice(0, 200),
          body: s.body.trim().slice(0, 4000),
          image: null as string | null,
        };
      });
      await tx.insert(studyGuides).values({
        id: randomUUID(),
        teamId: scope,
        packageId,
        name: (input.presentation.title.trim() || input.name.trim()).slice(0, 120),
        description: input.subject?.trim().slice(0, 500) || null,
        createdBy: input.createdBy,
        slides: JSON.stringify(slides),
        slideCount: slides.length,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ---- Lessons ----
    if (input.lessons.length) {
      await tx.insert(studyPackageLessons).values(
        input.lessons.map((l, i) => ({
          id: randomUUID(),
          packageId,
          seq: i + 1,
          title: l.title.trim().slice(0, 200),
          objective: l.objective?.trim().slice(0, 1000) || null,
          body: l.body?.trim().slice(0, 20_000) || null,
          // Stored ids, resolved from the file's ids. A reference that did not
          // resolve is dropped rather than guessed at — the validator has
          // already refused any package where one pointed at a slide that is
          // not in the presentation.
          slideIds: (() => {
            const ids = l.slideImportIds
              .map((importId) => storedSlideIdByImportId.get(importId))
              .filter((id): id is string => !!id);
            return ids.length ? JSON.stringify(ids) : null;
          })(),
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  });

  return (await getPackage(packageId))!;
}

function topicFor(q: CommitQuestion, names: Map<string, string>): string {
  return q.categoryImportId ? (names.get(q.categoryImportId) ?? '') : '';
}

// ---- Finishing a package that was created without all of its parts ----
//
// A package is committed with whatever the creator had at the time, and a
// blueprint that asked for no questions produces no study game (`if
// (input.questions.length)` above). Until this existed there was NO route back:
// nothing could attach a component to a package that already existed, so a
// package created without its game could never get one, and a creator who had
// already had their AI write the questions had nowhere to put them. Reported by
// the owner three times before it was understood.
//
// It ADDS what is missing and never replaces what is there. Replacing is a
// different act with a different risk — people may already have studied the
// component being thrown away — so a part that already exists is refused by
// name rather than silently overwritten.

export interface PackageAddInput {
  packageId: string;
  createdBy: string | null;
  categoryWeightMode: CategoryWeightMode | null;
  categories: CommitCategory[];
  questions: CommitQuestion[];
  flashcards: CommitFlashcard[];
  presentation: {
    title: string;
    slides: { importId?: string | null; title: string; body: string }[];
  } | null;
  lessons: CommitLesson[];
  source: 'package_import' | 'package_manual';
}

export async function addToPackage(input: PackageAddInput): Promise<PackageDetail> {
  const pkg = await getPackage(input.packageId);
  if (!pkg) throw new PackageError('That study package no longer exists.');

  // Refused by name, so the creator is told which part is already there rather
  // than watching a second copy appear or their work vanish into a no-op.
  if (input.questions.length && pkg.deckId) throw new PackageError('This package already has a study game.');
  if (input.flashcards.length && pkg.flashcardSetId) throw new PackageError('This package already has flashcards.');
  if (input.presentation?.slides.length && pkg.guideId) {
    throw new PackageError('This package already has a presentation.');
  }
  if (input.lessons.length && pkg.lessons.length) throw new PackageError('This package already has lessons.');

  const now = new Date();
  const packageId = pkg.id;
  // The package's OWNER, never the caller: an admin editing somebody else's
  // package must not file its content under their own scope key.
  const scope = packageScopeKey(pkg.ownerUserId);

  // A category the package already has KEEPS ITS ROW AND ITS ID. That is the
  // whole reason this is not a delete-and-recreate: the stable id is what every
  // learner's per-category history hangs off, and what the stored weights — the
  // exam blueprint — are attached to. Matching is on the trimmed, lowercased
  // name, the same comparison syncPackageCategories makes.
  const existingByName = new Map(pkg.categories.map((c) => [c.name.trim().toLowerCase(), c]));
  let nextSeq = pkg.categories.reduce((m, c) => Math.max(m, c.seq), 0) + 1;
  const categoryIdByImportId = new Map<string, string>();
  const categoryNameByImportId = new Map<string, string>();
  const freshCategories: { id: string; seq: number; name: string; weight: number | null }[] = [];
  for (const c of input.categories) {
    const name = c.name.trim().slice(0, 60);
    const existing = existingByName.get(name.toLowerCase());
    if (existing) {
      categoryIdByImportId.set(c.importId, existing.id);
      // The stored row is the authority on its own name and weight — an import
      // must not quietly restyle a category people are already scored against.
      categoryNameByImportId.set(c.importId, existing.name);
      continue;
    }
    const id = randomUUID();
    categoryIdByImportId.set(c.importId, id);
    categoryNameByImportId.set(c.importId, name);
    freshCategories.push({ id, seq: nextSeq++, name, weight: c.weight });
  }

  // Every category the package will hold once this lands, in order — what the
  // deck's name-keyed compatibility fields are built from.
  const allCategories = [
    ...pkg.categories.map((c) => ({ name: c.name, weight: c.weight })),
    ...freshCategories.map((c) => ({ name: c.name, weight: c.weight })),
  ];

  const storedSlideIdByImportId = new Map<string, string>();

  await db.transaction(async (tx) => {
    if (freshCategories.length) {
      await tx.insert(studyPackageCategories).values(
        freshCategories.map((c) => ({
          id: c.id,
          packageId,
          seq: c.seq,
          name: c.name,
          weight: c.weight,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    if (input.questions.length) {
      const deckId = randomUUID();
      const names = allCategories.map((c) => c.name);
      const seen = new Set(names.map((n) => n.toLowerCase()));
      for (const q of input.questions) {
        const topic = topicFor(q, categoryNameByImportId);
        if (topic && !seen.has(topic.toLowerCase())) {
          seen.add(topic.toLowerCase());
          names.push(topic);
        }
      }
      const weighted = allCategories.filter((c) => c.weight != null);
      const weights = weighted.length
        ? JSON.stringify(Object.fromEntries(weighted.map((c) => [c.name, c.weight as number])))
        : null;

      await tx.insert(studyDecks).values({
        id: deckId,
        teamId: scope,
        packageId,
        name: pkg.name.slice(0, 120),
        description: pkg.subject?.slice(0, 500) || null,
        createdBy: input.createdBy,
        source: input.source,
        isSample: false,
        categories: JSON.stringify(names),
        categoryWeights: weights,
        categoryWeightMode: input.categoryWeightMode,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(studyDeckQuestions).values(
        input.questions.map((q, i) => ({
          id: randomUUID(),
          deckId,
          teamId: scope,
          seq: i + 1,
          topic: topicFor(q, categoryNameByImportId) || 'General',
          categoryId: q.categoryImportId ? (categoryIdByImportId.get(q.categoryImportId) ?? null) : null,
          stem: q.stem.trim().slice(0, 600),
          options: JSON.stringify(q.options.map((o) => ({ label: o.label, text: o.text.trim().slice(0, 400) }))),
          answer: q.answer,
          explanation: q.explanation?.trim().slice(0, 400) || null,
          sourceName: null,
          createdAt: now,
        })),
      );
    }

    if (input.flashcards.length) {
      const setId = randomUUID();
      const topics = [
        ...new Set(
          input.flashcards
            .map((f) => (f.categoryImportId ? (categoryNameByImportId.get(f.categoryImportId) ?? '') : ''))
            .filter(Boolean),
        ),
      ];
      await tx.insert(studyFlashcardSets).values({
        id: setId,
        teamId: scope,
        packageId,
        name: pkg.name.slice(0, 120),
        description: pkg.subject?.slice(0, 500) || null,
        createdBy: input.createdBy,
        source: input.source,
        topics: JSON.stringify(topics),
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(studyFlashcardCards).values(
        input.flashcards.map((f, i) => ({
          id: randomUUID(),
          setId,
          teamId: scope,
          seq: i + 1,
          term: f.term.trim().slice(0, 300),
          def: f.definition.trim().slice(0, 2000),
          topic: f.categoryImportId ? (categoryNameByImportId.get(f.categoryImportId) ?? null) : null,
          createdAt: now,
        })),
      );
    }

    if (input.presentation && input.presentation.slides.length) {
      const slides = input.presentation.slides.map((s) => {
        const id = randomUUID();
        if (s.importId) storedSlideIdByImportId.set(s.importId, id);
        return { id, title: s.title.trim().slice(0, 200), body: s.body.trim().slice(0, 4000), image: null as string | null };
      });
      await tx.insert(studyGuides).values({
        id: randomUUID(),
        teamId: scope,
        packageId,
        name: (input.presentation.title.trim() || pkg.name).slice(0, 120),
        description: pkg.subject?.slice(0, 500) || null,
        createdBy: input.createdBy,
        slides: JSON.stringify(slides),
        slideCount: slides.length,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (input.lessons.length) {
      await tx.insert(studyPackageLessons).values(
        input.lessons.map((l, i) => ({
          id: randomUUID(),
          packageId,
          seq: i + 1,
          title: l.title.trim().slice(0, 200),
          objective: l.objective?.trim().slice(0, 1000) || null,
          body: l.body?.trim().slice(0, 20_000) || null,
          slideIds: (() => {
            const ids = l.slideImportIds
              .map((importId) => storedSlideIdByImportId.get(importId))
              .filter((id): id is string => !!id);
            return ids.length ? JSON.stringify(ids) : null;
          })(),
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    await tx.update(studyPackages).set({ updatedAt: now }).where(eq(studyPackages.id, packageId));
  });

  // The deck's name-keyed projection has to know about any category added
  // alongside it. Idempotent, and a no-op when the package has no deck.
  await syncPackageCategories(packageId);

  return (await getPackage(packageId))!;
}
