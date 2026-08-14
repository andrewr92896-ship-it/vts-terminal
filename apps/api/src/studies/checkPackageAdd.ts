// Finishing a package — adding a part it was created without — checked through
// the real service against a real database.
//
//   DATABASE_URL="file:/tmp/x.db" npm run db:migrate
//   DATABASE_URL="file:/tmp/x.db" npm run db:check-package-add
//
// Like db:check-sharing this one WRITES, so it refuses any database that
// already holds a user. An empty one is a scratch one; a real deployment always
// has accounts in it. Do not weaken that guard.
//
// The invariant worth protecting here is the CATEGORY IDS. A category the
// package already has must keep its row and its id when content is added
// against it, because that id is what every learner's per-category history
// hangs off and what the stored weights — the exam blueprint — are attached to.
// Matching incoming categories by name and reusing the row is the whole
// difference between finishing a package and quietly resetting it.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyDeckQuestions, studyDecks, studyFlashcardCards, studyPackageCategories, users } from '../db/schema.js';
import { addToPackage, commitPackage } from './packageImport.js';
import { getPackage } from './packageStore.js';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name: string) {
  console.log(`\n[${name}]`);
}

function q(n: number, categoryImportId: string | null) {
  return {
    categoryImportId,
    stem: `Question ${n}?`,
    options: [
      { label: 'A', text: 'One' },
      { label: 'B', text: 'Two' },
      { label: 'C', text: 'Three' },
      { label: 'D', text: 'Four' },
    ],
    answer: 'A',
    explanation: null,
  };
}

async function main() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) {
    console.error(
      'Refusing to run: this database already has accounts in it.\n' +
        'This check creates users, so it only runs against an empty scratch database:\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:migrate\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:check-package-add',
    );
    process.exit(1);
  }

  const ownerId = randomUUID();
  await db.insert(users).values({
    id: ownerId,
    username: 'owner',
    createdUsername: 'owner',
    displayName: 'Package Owner',
    email: 'owner@example.test',
    passwordHash: 'x',
    role: 'Viewer',
    roles: JSON.stringify(['member']),
    teamId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // The case the owner actually hit: a package created with flashcards, a
  // presentation and lessons, and NO study game — which the wizard allows,
  // because commitPackage only builds a deck when questions came with it.
  section('a package created without its study game');
  const created = await commitPackage({
    ownerUserId: ownerId,
    createdBy: ownerId,
    name: 'Series 65 Private Study',
    subject: 'Series 65',
    description: null,
    audience: null,
    depth: null,
    explanationMode: null,
    categoryWeightMode: null,
    categories: [
      { importId: 'a', name: 'Regulations', weight: 30 },
      { importId: 'b', name: 'Economics', weight: 15 },
    ],
    questions: [],
    flashcards: [{ categoryImportId: 'a', term: 'Prospectus', definition: 'A disclosure document.' }],
    presentation: { title: 'Overview', slides: [{ importId: 's1', title: 'Slide', body: 'Body' }] },
    lessons: [{ title: 'Lesson one', objective: null, body: null, slideImportIds: ['s1'] }],
    source: 'package_import',
  });
  ok('it exists', !!created);
  ok('with no study game', created.deckId === null);
  ok('but with flashcards', created.flashcardSetId !== null);
  ok('a presentation', created.guideId !== null);
  ok('and its lessons', created.lessons.length === 1);
  ok('and two categories', created.categories.length === 2);

  const idsBefore = new Map(created.categories.map((c) => [c.name, c.id]));
  const weightsBefore = new Map(created.categories.map((c) => [c.name, c.weight]));

  section('adding the study game it was missing');
  const finished = await addToPackage({
    packageId: created.id,
    createdBy: ownerId,
    categoryWeightMode: 'draw_and_score',
    // The same category NAMES the package already carries — which is what the
    // handoff asks the creator's AI for, and what it will send back.
    categories: [
      { importId: 'x', name: 'Regulations', weight: 30 },
      { importId: 'y', name: 'Economics', weight: 15 },
    ],
    questions: [q(1, 'x'), q(2, 'y'), q(3, 'x')],
    flashcards: [],
    presentation: null,
    lessons: [],
    source: 'package_import',
  });
  ok('the package now has a study game', finished.deckId !== null);
  ok('and still has exactly two categories', finished.categories.length === 2, `${finished.categories.length}`);

  // THE INVARIANT.
  const idsAfter = new Map(finished.categories.map((c) => [c.name, c.id]));
  ok('Regulations kept its id', idsAfter.get('Regulations') === idsBefore.get('Regulations'));
  ok('Economics kept its id', idsAfter.get('Economics') === idsBefore.get('Economics'));
  ok(
    'and both kept their weights',
    finished.categories.every((c) => c.weight === weightsBefore.get(c.name)),
  );

  const rows = await db
    .select({ id: studyPackageCategories.id })
    .from(studyPackageCategories)
    .where(eq(studyPackageCategories.packageId, created.id));
  ok('no duplicate category rows were written', rows.length === 2, `${rows.length}`);

  const questions = await db
    .select({ id: studyDeckQuestions.id, topic: studyDeckQuestions.topic, categoryId: studyDeckQuestions.categoryId })
    .from(studyDeckQuestions)
    .where(eq(studyDeckQuestions.deckId, finished.deckId!));
  ok('all three questions landed', questions.length === 3, `${questions.length}`);
  ok(
    'each linked to the category row that already existed',
    questions.every((x) => x.categoryId === idsBefore.get('Regulations') || x.categoryId === idsBefore.get('Economics')),
  );
  ok(
    'and their topic text matches the stored names',
    questions.every((x) => x.topic === 'Regulations' || x.topic === 'Economics'),
  );

  const [deck] = await db
    .select({ categories: studyDecks.categories, weights: studyDecks.categoryWeights })
    .from(studyDecks)
    .where(eq(studyDecks.id, finished.deckId!));
  ok(
    'the deck carries both category names',
    JSON.parse(deck.categories ?? '[]').includes('Regulations') && JSON.parse(deck.categories ?? '[]').includes('Economics'),
  );
  ok(
    'and the weights the package already stored',
    JSON.parse(deck.weights ?? '{}').Regulations === 30 && JSON.parse(deck.weights ?? '{}').Economics === 15,
  );

  section('the parts it already had are untouched');
  ok('the flashcard set is the same one', finished.flashcardSetId === created.flashcardSetId);
  ok('the presentation is the same one', finished.guideId === created.guideId);
  ok('the lessons are the same', finished.lessons.length === 1 && finished.lessons[0].id === created.lessons[0].id);
  const cards = await db
    .select({ id: studyFlashcardCards.id })
    .from(studyFlashcardCards)
    .where(eq(studyFlashcardCards.setId, finished.flashcardSetId!));
  ok('and the one card was not duplicated', cards.length === 1, `${cards.length}`);

  section('a part that is already there is refused, not replaced');
  let refused: string | null = null;
  try {
    await addToPackage({
      packageId: created.id,
      createdBy: ownerId,
      categoryWeightMode: null,
      categories: [{ importId: 'x', name: 'Regulations', weight: 30 }],
      questions: [q(9, 'x')],
      flashcards: [],
      presentation: null,
      lessons: [],
      source: 'package_import',
    });
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  ok('it throws', refused !== null);
  ok('naming the part', !!refused && refused.toLowerCase().includes('study game'), refused ?? '');
  const after = await db
    .select({ id: studyDecks.id })
    .from(studyDecks)
    .where(eq(studyDecks.packageId, created.id));
  ok('and no second deck was written', after.length === 1, `${after.length}`);
  const stillThree = await db
    .select({ id: studyDeckQuestions.id })
    .from(studyDeckQuestions)
    .where(eq(studyDeckQuestions.deckId, finished.deckId!));
  ok('with the original questions intact', stillThree.length === 3, `${stillThree.length}`);

  section('a genuinely new category is appended, not merged');
  const pkg2 = await commitPackage({
    ownerUserId: ownerId,
    createdBy: ownerId,
    name: 'Second package',
    subject: null,
    description: null,
    audience: null,
    depth: null,
    explanationMode: null,
    categoryWeightMode: null,
    categories: [{ importId: 'a', name: 'Alpha', weight: 50 }],
    questions: [],
    flashcards: [{ categoryImportId: 'a', term: 'T', definition: 'D' }],
    presentation: null,
    lessons: [],
    source: 'package_import',
  });
  const grown = await addToPackage({
    packageId: pkg2.id,
    createdBy: ownerId,
    categoryWeightMode: null,
    categories: [
      { importId: 'a2', name: 'Alpha', weight: 50 },
      { importId: 'b2', name: 'Beta', weight: 50 },
    ],
    questions: [q(1, 'a2'), q(2, 'b2')],
    flashcards: [],
    presentation: null,
    lessons: [],
    source: 'package_import',
  });
  ok('the package now has two categories', grown.categories.length === 2, `${grown.categories.length}`);
  ok('the existing one kept its id', grown.categories.find((c) => c.name === 'Alpha')?.id === pkg2.categories[0].id);
  ok('and the new one was given the next seq', grown.categories.find((c) => c.name === 'Beta')?.seq === 2);

  // The owner's real shape: a package carrying one unrelated category, given a
  // file their AI wrote against its own four. The file's structure has to
  // survive intact — this is what the permissive blueprint on the web exists to
  // let through, and it would be pointless if the service then merged them.
  section('a file that brings its own categories');
  const pkg3 = await commitPackage({
    ownerUserId: ownerId,
    createdBy: ownerId,
    name: 'Series 65 again',
    subject: 'Series 65',
    description: null,
    audience: null,
    depth: null,
    explanationMode: null,
    categoryWeightMode: null,
    categories: [{ importId: 'g', name: 'General', weight: 100 }],
    questions: [],
    flashcards: [{ categoryImportId: 'g', term: 'T', definition: 'D' }],
    presentation: null,
    lessons: [],
    source: 'package_import',
  });
  const generalId = pkg3.categories[0].id;
  const withOwn = await addToPackage({
    packageId: pkg3.id,
    createdBy: ownerId,
    categoryWeightMode: 'draw_and_score',
    categories: [
      { importId: 'e', name: 'Ethics and Fiduciary Obligations', weight: 30 },
      { importId: 'r', name: 'Laws, Regulations and Guidelines', weight: 30 },
      { importId: 'i', name: 'Investment Vehicle Characteristics', weight: 25 },
      { importId: 'c', name: 'Economic Factors', weight: 15 },
    ],
    questions: [q(1, 'e'), q(2, 'r'), q(3, 'i'), q(4, 'c')],
    flashcards: [],
    presentation: null,
    lessons: [],
    source: 'package_import',
  });
  ok('all four are appended alongside the one already there', withOwn.categories.length === 5, `${withOwn.categories.length}`);
  ok('the existing category kept its id', withOwn.categories.find((c) => c.name === 'General')?.id === generalId);
  ok(
    'the new ones were given sequential seqs after it',
    withOwn.categories
      .filter((c) => c.name !== 'General')
      .every((c) => c.seq >= 2 && c.seq <= 5),
  );
  ok('and their weights came through', withOwn.categories.find((c) => c.name === 'Ethics and Fiduciary Obligations')?.weight === 30);
  const linked = await db
    .select({ categoryId: studyDeckQuestions.categoryId })
    .from(studyDeckQuestions)
    .where(eq(studyDeckQuestions.deckId, withOwn.deckId!));
  ok('every question is linked to one of the new rows', linked.length === 4 && linked.every((x) => !!x.categoryId));
  ok(
    'and none of them to the unrelated category the package had',
    linked.every((x) => x.categoryId !== generalId),
  );

  section('a package that does not exist');
  let missing: string | null = null;
  try {
    await addToPackage({
      packageId: randomUUID(),
      createdBy: ownerId,
      categoryWeightMode: null,
      categories: [],
      questions: [q(1, null)],
      flashcards: [],
      presentation: null,
      lessons: [],
      source: 'package_import',
    });
  } catch (e) {
    missing = e instanceof Error ? e.message : String(e);
  }
  ok('is refused rather than creating one', missing !== null);

  console.log(`\n${fail === 0 ? 'All package-add checks passed.' : `${fail} check(s) FAILED.`} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
