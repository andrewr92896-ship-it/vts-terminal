import type { ImportBlueprint } from '../studies/packageFormat.js';
import { PACKAGE_FORMAT, PACKAGE_PART_FORMAT, PACKAGE_SCHEMA_VERSION } from '../studies/packageFormat.js';

// Known-good and known-bad Study Packages, built to order against whatever
// blueprint the developer currently has open.
//
// They are GENERATED from the blueprint rather than checked in as files, and
// that is the point: a fixture written against last month's plan fails for the
// wrong reason, which teaches nothing. Built here, a "good" fixture is good by
// construction against this plan, so anything the validator says about it is a
// statement about the validator.
//
// Every bad fixture breaks exactly ONE thing. A fixture with three faults tells
// you the validator found something; a fixture with one tells you which check
// fired, which is the whole use of it.
//
// Nothing here writes, and nothing here is content anybody would study — the
// stems are obviously synthetic so a fixture that somehow reached a real package
// is recognisable on sight.

export const FIXTURE_KINDS = [
  'good',
  'good_multipart',
  'bad_json',
  'bad_format',
  'bad_version',
  'bad_blueprint',
  'bad_missing_option',
  'bad_answer_not_in_options',
  'bad_category_counts',
  'bad_duplicate_questions',
  'bad_missing_explanation',
  'bad_incomplete_parts',
] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export function isFixtureKind(v: unknown): v is FixtureKind {
  return typeof v === 'string' && (FIXTURE_KINDS as readonly string[]).includes(v);
}

export const FIXTURE_LABELS: Record<FixtureKind, string> = {
  good: 'Valid package',
  good_multipart: 'Valid package, in parts',
  bad_json: 'Not JSON',
  bad_format: 'Wrong format marker',
  bad_version: 'Wrong schema version',
  bad_blueprint: 'Built from a different plan',
  bad_missing_option: 'A question missing option D',
  bad_answer_not_in_options: 'An answer that is not one of the options',
  bad_category_counts: 'Category counts that miss their targets',
  bad_duplicate_questions: 'Two identical questions',
  bad_missing_explanation: 'A question with no explanation',
  bad_incomplete_parts: 'A part set with one part missing',
};

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function question(n: number, categoryId: string | null, explanation: string | null) {
  return {
    id: `q${n}`,
    categoryId,
    stem: `Fixture question ${n} — which option is correct?`,
    options: LETTERS.map((label) => ({ label, text: `Fixture option ${label} for question ${n}` })),
    answer: 'A',
    explanation,
  };
}

/**
 * How many questions each category should get, and how many there are in total.
 *
 * Reuses the blueprint's own targets where it has them, so a "good" fixture
 * satisfies the same allocation the handoff asked the creator's AI for.
 */
function plan(bp: ImportBlueprint): { categoryId: string | null; count: number }[] {
  if (!bp.categories.length) {
    return [{ categoryId: null, count: bp.totalQuestions ?? 4 }];
  }
  return bp.categories.map((c) => ({
    categoryId: c.id,
    count: bp.questionTargets?.[c.id] ?? Math.max(1, Math.round((bp.totalQuestions ?? 8) / bp.categories.length)),
  }));
}

function buildQuestions(bp: ImportBlueprint): ReturnType<typeof question>[] {
  const wantExplanation = bp.explanationsRequired ? 'Because option A is the correct one.' : null;
  const out: ReturnType<typeof question>[] = [];
  let n = 1;
  for (const slot of plan(bp)) {
    for (let i = 0; i < slot.count; i++) out.push(question(n++, slot.categoryId, wantExplanation));
  }
  return out;
}

// The package's own name and subject are not part of the validator's
// ImportBlueprint — they ride on the wizard payload — so a fixture takes them
// alongside it rather than inventing a name the creator never chose.
export interface FixtureMeta {
  name: string;
  subject: string;
}

function envelope(bp: ImportBlueprint, meta: FixtureMeta, questions: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    format: PACKAGE_FORMAT,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    blueprintId: bp.blueprintId,
    package: {
      name: meta.name,
      subject: meta.subject,
      description: 'A generated fixture. Not study material.',
    },
    categories: bp.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
    questions,
    flashcards: bp.wantFlashcards
      ? [{ id: 'f1', categoryId: bp.categories[0]?.id ?? null, term: 'Fixture term', definition: 'Fixture definition.' }]
      : [],
    presentation: bp.wantPresentation
      ? { title: `${meta.name} — fixture slides`, slides: [{ id: 's1', title: 'Fixture slide', body: 'Fixture slide body.' }] }
      : null,
    lessons: bp.wantLessons
      ? [{ id: 'l1', title: 'Fixture lesson', objective: 'Fixture objective.', body: 'Fixture lesson body.', slideIds: ['s1'] }]
      : [],
    ...overrides,
  };
}

/**
 * The documents a fixture puts in the import list — one string per document,
 * exactly as if the creator had pasted them.
 */
export function buildFixture(kind: FixtureKind, bp: ImportBlueprint, meta: FixtureMeta): string[] {
  const qs = buildQuestions(bp);
  const one = (v: unknown) => [JSON.stringify(v, null, 2)];

  switch (kind) {
    case 'good':
      return one(envelope(bp, meta, qs));

    case 'good_multipart':
      return splitIntoParts(bp, meta, qs);

    case 'bad_json':
      return [`${JSON.stringify(envelope(bp, meta, qs), null, 2).slice(0, -12)}\n… truncated by the fixture`];

    case 'bad_format':
      return one({ ...envelope(bp, meta, qs), format: 'some-other-format' });

    case 'bad_version':
      return one({ ...envelope(bp, meta, qs), schemaVersion: PACKAGE_SCHEMA_VERSION + 1 });

    case 'bad_blueprint':
      return one({ ...envelope(bp, meta, qs), blueprintId: 'a-different-plan' });

    case 'bad_missing_option':
      return one(
        envelope(
          bp,
          meta,
          qs.map((q, i) => (i === 0 ? { ...q, options: q.options.slice(0, 3) } : q)),
        ),
      );

    case 'bad_answer_not_in_options':
      return one(envelope(bp, meta, qs.map((q, i) => (i === 0 ? { ...q, answer: 'E' } : q))));

    case 'bad_category_counts':
      // One question short in the first category — the failure a creator hits
      // most often, and the one the repair prompt exists for.
      return one(envelope(bp, meta, qs.slice(1)));

    case 'bad_duplicate_questions':
      return one(envelope(bp, meta, qs.length > 1 ? [...qs.slice(0, -1), { ...qs[0], id: 'q-dup' }] : [...qs, { ...qs[0], id: 'q-dup' }]));

    case 'bad_missing_explanation':
      return one(envelope(bp, meta, qs.map((q, i) => (i === 0 ? { ...q, explanation: null } : q))));

    case 'bad_incomplete_parts': {
      // Every part except the questions — the "how many are still to come"
      // case. `partCount` still claims the full set, which is what makes the
      // gap detectable rather than merely an incomplete package.
      const parts = splitIntoParts(bp, meta, qs);
      return parts.filter((_, i) => i !== 1);
    }
  }
}

// Split a package into the numbered parts the handoff documents: a manifest
// carrying the package details and categories, then one part per component. The
// shape is `{ format, schemaVersion, blueprintId, partType, partIndex,
// partCount, payload }` — exactly what the handoff's multipart schema tells a
// creator's AI to produce, so a fixture exercises the real contract rather than
// a convenient approximation of it.
function allParts(bp: ImportBlueprint, meta: FixtureMeta, qs: unknown[]): { partType: string; payload: unknown }[] {
  const whole = envelope(bp, meta, qs);
  const parts: { partType: string; payload: unknown }[] = [
    { partType: 'manifest', payload: { package: whole.package, categories: whole.categories } },
    { partType: 'questions', payload: qs },
  ];
  if (bp.wantFlashcards) parts.push({ partType: 'flashcards', payload: whole.flashcards });
  if (bp.wantPresentation) parts.push({ partType: 'presentation', payload: whole.presentation });
  if (bp.wantLessons) parts.push({ partType: 'lessons', payload: whole.lessons });
  return parts;
}

function splitIntoParts(bp: ImportBlueprint, meta: FixtureMeta, qs: unknown[]): string[] {
  const parts = allParts(bp, meta, qs);
  return parts.map((p, i) =>
    JSON.stringify(
      {
        format: PACKAGE_PART_FORMAT,
        schemaVersion: PACKAGE_SCHEMA_VERSION,
        blueprintId: bp.blueprintId,
        partType: p.partType,
        partIndex: i + 1,
        partCount: parts.length,
        payload: p.payload,
      },
      null,
      2,
    ),
  );
}
