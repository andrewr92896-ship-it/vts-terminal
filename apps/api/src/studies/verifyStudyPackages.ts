import { validateDocuments } from './packageValidate.js';
import { PACKAGE_FORMAT, PACKAGE_PART_FORMAT, PACKAGE_SCHEMA_VERSION, type ImportBlueprint } from './packageFormat.js';

// Offline check of the Study Package import contract.
//
//     npm run verify:study-packages
//
// Everything the importer promises is deterministic — no AI, no network, no
// database — so it can be checked against hand-built fixtures. What this is
// really guarding is the failure direction: an invalid package must produce a
// SPECIFIC, addressable error rather than a partial import or a shrug. A
// validator that quietly accepts a package missing option D is worse than no
// validator, because the questions land in somebody's study game broken.
//
// Exits non-zero on any problem.

let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const BID = 'bp_test_1';

function blueprint(over: Partial<ImportBlueprint> = {}): ImportBlueprint {
  return {
    blueprintId: BID,
    categoriesLocked: true,
    categories: [
      { id: 'cat_01', name: 'Economics', weight: 40 },
      { id: 'cat_02', name: 'Regulations', weight: 60 },
    ],
    questionTargets: null,
    totalQuestions: null,
    explanationsRequired: false,
    wantQuestions: true,
    wantFlashcards: false,
    wantPresentation: false,
    wantLessons: false,
    ...over,
  };
}

function q(n: number, categoryId: string | null = 'cat_01', over: Record<string, unknown> = {}) {
  return {
    id: `q_${n}`,
    categoryId,
    stem: `Question number ${n} about the subject?`,
    options: [
      { label: 'A', text: `Option A ${n}` },
      { label: 'B', text: `Option B ${n}` },
      { label: 'C', text: `Option C ${n}` },
      { label: 'D', text: `Option D ${n}` },
    ],
    answer: 'B',
    explanation: `Because of reason ${n}.`,
    ...over,
  };
}

function pkg(over: Record<string, unknown> = {}) {
  return {
    format: PACKAGE_FORMAT,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    blueprintId: BID,
    package: { name: 'Test Package', subject: 'Testing', settings: {} },
    categories: [
      { id: 'cat_01', name: 'Economics', weight: 40 },
      { id: 'cat_02', name: 'Regulations', weight: 60 },
    ],
    questions: [q(1, 'cat_01'), q(2, 'cat_02')],
    flashcards: [],
    presentation: null,
    lessons: [],
    ...over,
  };
}

const J = (v: unknown) => JSON.stringify(v);
const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

console.log('\n[valid packages]');
{
  const r = validateDocuments([J(pkg())], blueprint());
  check('a valid full package passes', r.ok, codes(r).join(','));
  check('preview counts the questions', r.preview?.questionCount === 2);
  check('preview lists both categories', r.preview?.categories.length === 2);
  check('preview reports what each category actually got', r.preview?.categories[0].found === 1);
  check('the questions come back for review', r.questions.length === 2);
  check('it reports what passed', r.passed.length >= 4, r.passed.join(' | '));
}
{
  // Question-only: no categories anywhere, nothing optional requested.
  const r = validateDocuments(
    [J(pkg({ categories: [], questions: [q(1, null), q(2, null)] }))],
    blueprint({ categoriesLocked: false, categories: [] }),
  );
  check('a question-only package passes', r.ok, codes(r).join(','));
}
{
  const r = validateDocuments([J(pkg({ questions: [q(1, 'cat_01')] }))], blueprint());
  check('a package with no optional components passes', r.ok, codes(r).join(','));
  check('and reports no flashcards, slides or lessons', r.preview?.flashcardCount === 0 && r.preview?.slideCount === 0 && r.preview?.lessonCount === 0);
}
{
  // A markdown code fence is the normal way a chat hands back JSON.
  const r = validateDocuments(['```json\n' + J(pkg()) + '\n```'], blueprint());
  check('a fenced code block is accepted', r.ok, codes(r).join(','));
}

console.log('\n[envelope]');
{
  const r = validateDocuments([J(pkg({ schemaVersion: 2 }))], blueprint());
  check('a future schema version is refused', !r.ok && codes(r).includes('wrong_version'));
  check('and says which version it reads', r.errors[0].message.includes(String(PACKAGE_SCHEMA_VERSION)));
}
{
  const r = validateDocuments([J({ hello: 'world' })], blueprint());
  check('a file that is not a package is refused', !r.ok && codes(r).includes('wrong_format'));
}
{
  const r = validateDocuments(['not json at all'], blueprint());
  check('unparseable text is refused', !r.ok && codes(r).includes('not_json'));
  check('and does not just say "invalid JSON"', r.errors[0].message.length > 30, r.errors[0].message);
}
{
  const r = validateDocuments([J(pkg({ blueprintId: 'someone_elses_plan' }))], blueprint());
  check('a package built from another plan is refused', !r.ok && codes(r).includes('wrong_blueprint'));
}

console.log('\n[questions]');
{
  const bad = q(1);
  bad.options = bad.options.filter((o) => o.label !== 'D');
  const r = validateDocuments([J(pkg({ questions: [bad, q(2, 'cat_02')] }))], blueprint());
  check('a missing option D is refused', !r.ok && codes(r).includes('question_missing_option'));
  check('and names the question', r.errors.some((e) => e.message.includes('Question 1')), r.errors[0]?.message);
}
{
  const r = validateDocuments([J(pkg({ questions: [q(1, 'cat_01', { answer: 'E' }), q(2, 'cat_02')] }))], blueprint());
  check('an answer outside A-D is refused', !r.ok && codes(r).includes('question_no_answer'));
}
{
  const r = validateDocuments([J(pkg({ questions: [q(1, 'cat_01', { answer: 'C', options: q(1).options.filter((o) => o.label !== 'C') })] }))], blueprint());
  check('an answer pointing at a missing option is refused', !r.ok && codes(r).some((c) => c.startsWith('question_')));
}
{
  const r = validateDocuments([J(pkg({ questions: [q(1, 'cat_09'), q(2, 'cat_02')] }))], blueprint());
  check('a question in an undefined category is refused', !r.ok && codes(r).includes('question_unknown_category'));
  check('and names the category', r.errors.some((e) => e.message.includes('cat_09')));
}
{
  const dup = q(2, 'cat_02');
  dup.stem = q(1).stem;
  const r = validateDocuments([J(pkg({ questions: [q(1, 'cat_01'), dup] }))], blueprint());
  check('two questions asking the same thing are refused', !r.ok && codes(r).includes('question_duplicate'));
}
{
  const dup = q(2, 'cat_02');
  dup.stem = '  QUESTION   number 1 about the subject!!  ';
  const r = validateDocuments([J(pkg({ questions: [q(1, 'cat_01'), dup] }))], blueprint());
  check('near-duplicates differing only in case/spacing/punctuation are caught', !r.ok && codes(r).includes('question_duplicate'));
}
{
  const r = validateDocuments(
    [J(pkg({ questions: [q(1, 'cat_01', { explanation: '' }), q(2, 'cat_02')] }))],
    blueprint({ explanationsRequired: true }),
  );
  check('a missing explanation is refused when the plan requires one', !r.ok && codes(r).includes('question_no_explanation'));
}
{
  const r = validateDocuments(
    [J(pkg({ questions: [q(1, 'cat_01', { explanation: '' }), q(2, 'cat_02')] }))],
    blueprint({ explanationsRequired: false }),
  );
  check('and is fine when the plan does not', r.ok, codes(r).join(','));
}
{
  const r = validateDocuments([J(pkg({ questions: [q(1, 'cat_01', { stem: 'x'.repeat(700) })] }))], blueprint());
  check('a stem longer than the deck can store is refused', !r.ok && codes(r).includes('question_stem_long'));
}

console.log('\n[exact counts]');
{
  const questions = [q(1, 'cat_01'), q(2, 'cat_01'), q(3, 'cat_02')];
  const r = validateDocuments(
    [J(pkg({ questions }))],
    blueprint({ questionTargets: { cat_01: 2, cat_02: 1 }, totalQuestions: 3 }),
  );
  check('exact per-category targets pass when met', r.ok, codes(r).join(','));
}
{
  const questions = [q(1, 'cat_01'), q(2, 'cat_02'), q(3, 'cat_02')];
  const r = validateDocuments(
    [J(pkg({ questions }))],
    blueprint({ questionTargets: { cat_01: 2, cat_02: 1 }, totalQuestions: 3 }),
  );
  check('a wrong per-category count is refused', !r.ok && codes(r).includes('category_count_mismatch'));
  const msg = r.errors.find((e) => e.code === 'category_count_mismatch')!.message;
  check('and states expected vs found by name', msg.includes('Economics') && msg.includes('2') && msg.includes('1'), msg);
}
{
  const r = validateDocuments([J(pkg())], blueprint({ totalQuestions: 10 }));
  check('a wrong total is refused', !r.ok && codes(r).includes('question_total_mismatch'));
}

console.log('\n[categories]');
{
  const r = validateDocuments(
    [J(pkg({ categories: [{ id: 'cat_01', name: 'Economics', weight: 40 }, { id: 'cat_02', name: ' economics ', weight: 60 }] }))],
    blueprint({ categoriesLocked: false }),
  );
  check('two categories with the same name are refused', !r.ok && codes(r).includes('category_name_duplicate'));
}
{
  const r = validateDocuments(
    [J(pkg({ categories: [{ id: 'cat_01', name: 'Economics', weight: 40 }, { id: 'cat_01', name: 'Regulations', weight: 60 }] }))],
    blueprint({ categoriesLocked: false }),
  );
  check('two categories with the same id are refused', !r.ok && codes(r).includes('category_id_duplicate'));
}
{
  const r = validateDocuments([J(pkg({ categories: [{ id: 'cat_01', name: 'Economics', weight: 40 }], questions: [q(1, 'cat_01')] }))], blueprint());
  check('a locked category the AI dropped is refused', !r.ok && codes(r).includes('category_missing'));
}
{
  const cats = [
    { id: 'cat_01', name: 'Economics', weight: 40 },
    { id: 'cat_02', name: 'Regulations', weight: 60 },
    { id: 'cat_03', name: 'Invented', weight: 10 },
  ];
  const r = validateDocuments([J(pkg({ categories: cats }))], blueprint());
  check('a category the AI invented is refused when they are locked', !r.ok && codes(r).includes('category_unexpected'));
}
{
  const cats = [
    { id: 'cat_01', name: 'Alpha', weight: 50 },
    { id: 'cat_02', name: 'Beta', weight: 50 },
  ];
  const r = validateDocuments([J(pkg({ categories: cats }))], blueprint({ categoriesLocked: false, categories: [] }));
  check('AI-chosen categories are accepted when the plan allowed it', r.ok, codes(r).join(','));
}

console.log('\n[optional components]');
{
  const r = validateDocuments([J(pkg())], blueprint({ wantFlashcards: true }));
  check('missing flashcards are refused when requested', !r.ok && codes(r).includes('no_flashcards'));
}
{
  const cards = [{ id: 'f_1', categoryId: 'cat_01', term: 'Term', definition: 'Definition' }];
  const r = validateDocuments([J(pkg({ flashcards: cards }))], blueprint({ wantFlashcards: true }));
  check('valid flashcards pass', r.ok, codes(r).join(','));
  check('and are counted', r.preview?.flashcardCount === 1);
}
{
  const cards = [{ id: 'f_1', categoryId: 'cat_01', term: 'Term', definition: 'Definition' }];
  const r = validateDocuments([J(pkg({ flashcards: cards }))], blueprint());
  check('unrequested flashcards warn rather than fail', r.ok && r.warnings.some((w) => w.code === 'flashcards_unrequested'));
  check('and are not counted into the preview', r.preview?.flashcardCount === 0);
}
{
  const pres = { title: 'Deck', slides: [{ id: 's_1', title: 'One', body: 'Body' }, { id: 's_1', title: 'Two', body: 'Body' }] };
  const r = validateDocuments([J(pkg({ presentation: pres }))], blueprint({ wantPresentation: true }));
  check('duplicate slide ids are refused', !r.ok && codes(r).includes('slide_id_duplicate'));
}
{
  const pres = { title: 'Deck', slides: [{ id: 's_1', title: 'One', body: 'Body' }] };
  const lessons = [{ id: 'l_1', title: 'Lesson', objective: 'o', body: 'b', slideIds: ['s_9'] }];
  const r = validateDocuments([J(pkg({ presentation: pres, lessons }))], blueprint({ wantPresentation: true, wantLessons: true }));
  check('a lesson pointing at a slide that is not there is refused', !r.ok && codes(r).includes('lesson_unknown_slide'));
}
{
  const pres = { title: 'Deck', slides: [{ id: 's_1', title: 'One', body: 'Body' }] };
  const lessons = [{ id: 'l_1', title: 'Lesson', objective: 'o', body: 'b', slideIds: ['s_1'] }];
  const r = validateDocuments([J(pkg({ presentation: pres, lessons }))], blueprint({ wantPresentation: true, wantLessons: true }));
  check('a lesson mapped to a real slide passes', r.ok, codes(r).join(','));
  check('slides and lessons are counted', r.preview?.slideCount === 1 && r.preview?.lessonCount === 1);
}

console.log('\n[multipart]');
function part(partType: string, partIndex: number, partCount: number, payload: unknown, blueprintId = BID) {
  return J({ format: PACKAGE_PART_FORMAT, schemaVersion: PACKAGE_SCHEMA_VERSION, blueprintId, partType, partIndex, partCount, payload });
}
{
  const manifest = part('manifest', 1, 3, {
    package: { name: 'Split Package', subject: 'Testing', settings: {} },
    categories: [
      { id: 'cat_01', name: 'Economics', weight: 40 },
      { id: 'cat_02', name: 'Regulations', weight: 60 },
    ],
  });
  const p2 = part('questions', 2, 3, [q(1, 'cat_01')]);
  const p3 = part('questions', 3, 3, [q(2, 'cat_02')]);
  const r = validateDocuments([manifest, p2, p3], blueprint());
  check('three parts merge into one package', r.ok, codes(r).join(','));
  check('the merged package has both questions', r.preview?.questionCount === 2);
  check('and is named from the manifest', r.preview?.name === 'Split Package');
}
{
  const manifest = part('manifest', 1, 3, { package: { name: 'Split', subject: 'x', settings: {} }, categories: [] });
  const p2 = part('questions', 2, 3, [q(1, null)]);
  const r = validateDocuments([manifest, p2], blueprint({ categoriesLocked: false, categories: [] }));
  check('a missing part is reported rather than half-imported', !r.ok && codes(r).includes('missing_parts'));
  check('and says how many are still needed', r.errors[0].message.includes('1'), r.errors[0].message);
}
{
  const manifest = part('manifest', 1, 2, { package: { name: 'Split', subject: 'x', settings: {} }, categories: [] });
  const p2 = part('questions', 2, 2, [q(1, null)], 'a_different_plan');
  const r = validateDocuments([manifest, p2], blueprint({ categoriesLocked: false, categories: [] }));
  check('parts from two different plans are refused', !r.ok && codes(r).includes('mixed_blueprints'));
}
{
  const manifest = part('manifest', 1, 2, { package: { name: 'Split', subject: 'x', settings: {} }, categories: [] });
  const r = validateDocuments([manifest, J(pkg())], blueprint());
  check('a whole package mixed with parts is refused', !r.ok && codes(r).includes('mixed_kinds'));
}
{
  const p1 = part('questions', 1, 2, [q(1, null)]);
  const p2 = part('questions', 2, 2, [q(2, null)]);
  const r = validateDocuments([p1, p2], blueprint({ categoriesLocked: false, categories: [] }));
  check('parts with no manifest are refused', !r.ok && codes(r).includes('no_manifest'));
}

console.log('\n[nothing is written]');
check('the validator imports no database module', !Object.keys(globalThis).includes('__vts_db_touched'));

console.log(failures === 0 ? '\nAll study package checks passed.\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
