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
import { MAX_PACKAGES_PER_USER, PackageError, getPackage, type PackageDetail } from './packageStore.js';

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
  /** Positions in the slide list below. Already resolved and checked. */
  slideIndexes: number[];
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
  presentation: { title: string; slides: { title: string; body: string }[] } | null;
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
    if (input.presentation && input.presentation.slides.length) {
      const slides = input.presentation.slides.map((s) => ({
        title: s.title.trim().slice(0, 200),
        body: s.body.trim().slice(0, 4000),
        image: null as string | null,
      }));
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
          slideIndexes: l.slideIndexes.length ? JSON.stringify(l.slideIndexes) : null,
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
