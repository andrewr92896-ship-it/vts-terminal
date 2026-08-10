import {
  LETTERS,
  LIMITS,
  PACKAGE_FORMAT,
  PACKAGE_PART_FORMAT,
  PACKAGE_SCHEMA_VERSION,
  PART_TYPES,
  isLetter,
  normalizeStem,
  num,
  str,
  stripFence,
  trimmed,
  type ImportBlueprint,
  type ImportedCategory,
  type ImportedFlashcard,
  type ImportedLesson,
  type ImportedPackage,
  type ImportedPresentation,
  type ImportedQuestion,
  type ImportedSlide,
  type Letter,
  type PartType,
  type ValidationIssue,
  type ValidationResult,
} from './packageFormat.js';

// Reading back what the creator's own AI produced.
//
// Deterministic and non-AI, start to finish. Nothing here calls a model, and
// nothing here writes: validation answers "would this import, and if not
// exactly why", and the caller decides whether to commit. A package that fails
// produces a list of specific, addressable problems — "Question 47 is missing
// option D" — because "Invalid JSON" tells somebody nothing they can act on and
// a partial import is worse than a refusal.

interface Ctx {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  passed: string[];
}

function err(ctx: Ctx, code: string, message: string, ids?: string[]) {
  ctx.errors.push({ code, message, ...(ids && ids.length ? { ids } : null) });
}
function warn(ctx: Ctx, code: string, message: string, ids?: string[]) {
  ctx.warnings.push({ code, message, ...(ids && ids.length ? { ids } : null) });
}

function fail(ctx: Ctx): ValidationResult {
  return { ok: false, passed: ctx.passed, errors: ctx.errors, warnings: ctx.warnings, preview: null, questions: [] };
}

/**
 * Validate one or more documents against the plan the wizard produced.
 *
 * A single document is a whole package. Several are multipart parts, assembled
 * here — which is the fallback for an AI that cannot fit the package in one
 * reply. Every part must carry the same blueprint; a set that mixes two is
 * refused rather than combined, because the result would be a package nobody
 * designed.
 */
export function validateDocuments(documents: string[], blueprint: ImportBlueprint): ValidationResult {
  const ctx: Ctx = { errors: [], warnings: [], passed: [] };

  if (!documents.length) {
    err(ctx, 'empty', 'Add the package your AI produced — upload the file or paste the JSON.');
    return fail(ctx);
  }

  // ---- Parse ----
  const parsed: unknown[] = [];
  for (const [i, raw] of documents.entries()) {
    const label = documents.length === 1 ? 'That' : `Part ${i + 1}`;
    const text = stripFence(raw);
    if (!text) {
      err(ctx, 'empty_document', `${label} is empty.`);
      continue;
    }
    try {
      parsed.push(JSON.parse(text));
    } catch {
      err(
        ctx,
        'not_json',
        `${label} is not valid JSON. Copy the whole block your AI produced, from the first { to the last }.`,
      );
    }
  }
  if (ctx.errors.length) return fail(ctx);
  ctx.passed.push(documents.length === 1 ? 'Readable JSON' : `Readable JSON in all ${documents.length} parts`);

  // ---- Envelope / assembly ----
  const assembled = assemble(parsed, blueprint, ctx);
  if (!assembled) return fail(ctx);
  ctx.passed.push('Correct format and version');

  // ---- The package itself ----
  const pkg = readPackage(assembled, blueprint, ctx);
  if (!pkg) return fail(ctx);

  validateCategories(pkg, blueprint, ctx);
  validateQuestions(pkg, blueprint, ctx);
  validateFlashcards(pkg, blueprint, ctx);
  const slideIds = validatePresentation(pkg, blueprint, ctx);
  validateLessons(pkg, slideIds, blueprint, ctx);

  const ok = ctx.errors.length === 0;
  return {
    ok,
    passed: ctx.passed,
    errors: ctx.errors,
    warnings: ctx.warnings,
    preview: ok ? preview(pkg, blueprint) : null,
    questions: ok ? pkg.questions : [],
  };
}

// ---- Envelope and multipart assembly ----

interface RawPackage {
  blueprintId: string;
  package: Record<string, unknown>;
  categories: unknown[];
  questions: unknown[];
  flashcards: unknown[];
  presentation: unknown;
  lessons: unknown[];
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function assemble(docs: unknown[], blueprint: ImportBlueprint, ctx: Ctx): RawPackage | null {
  const kinds = docs.map((d) => str(obj(d)?.format));
  const anyPart = kinds.some((k) => k === PACKAGE_PART_FORMAT);
  const anyWhole = kinds.some((k) => k === PACKAGE_FORMAT);

  for (const [i, k] of kinds.entries()) {
    if (k !== PACKAGE_FORMAT && k !== PACKAGE_PART_FORMAT) {
      err(
        ctx,
        'wrong_format',
        `${docs.length === 1 ? 'That file' : `Part ${i + 1}`} is not a VTS study package — it should start with "format": "${PACKAGE_FORMAT}".`,
      );
    }
  }
  if (ctx.errors.length) return null;

  for (const [i, d] of docs.entries()) {
    const v = num(obj(d)?.schemaVersion);
    if (v !== PACKAGE_SCHEMA_VERSION) {
      err(
        ctx,
        'wrong_version',
        `${docs.length === 1 ? 'That package' : `Part ${i + 1}`} is schema version ${v ?? 'unknown'}; this terminal reads version ${PACKAGE_SCHEMA_VERSION}.`,
      );
    }
  }
  if (ctx.errors.length) return null;

  // Every document must belong to THIS plan. Combining two plans would produce
  // a package with one plan's categories and another's questions.
  const ids = docs.map((d) => trimmed(obj(d)?.blueprintId));
  const distinct = [...new Set(ids)];
  if (distinct.length > 1) {
    err(
      ctx,
      'mixed_blueprints',
      'These parts come from different study package plans, so they cannot be combined. Use the parts your AI made from one handoff.',
    );
    return null;
  }
  if (distinct[0] !== blueprint.blueprintId) {
    err(
      ctx,
      'wrong_blueprint',
      'This package was built from a different handoff than the plan you are importing into. Copy the handoff from this plan and try again.',
    );
    return null;
  }

  if (anyWhole && anyPart) {
    err(ctx, 'mixed_kinds', 'Add either one complete package, or only numbered parts — not both.');
    return null;
  }

  if (anyWhole) {
    if (docs.length > 1) {
      err(ctx, 'many_wholes', 'More than one complete package was added. Add just the one your AI finished with.');
      return null;
    }
    const d = obj(docs[0])!;
    const p = obj(d.package);
    if (!p) {
      err(ctx, 'no_package', 'The package details are missing — there is no "package" section with the name and subject.');
      return null;
    }
    return {
      blueprintId: distinct[0],
      package: p,
      categories: arr(d.categories),
      questions: arr(d.questions),
      flashcards: arr(d.flashcards),
      presentation: d.presentation ?? null,
      lessons: arr(d.lessons),
    };
  }

  // ---- Parts ----
  const out: RawPackage = {
    blueprintId: distinct[0],
    package: {},
    categories: [],
    questions: [],
    flashcards: [],
    presentation: null,
    lessons: [],
  };
  let sawManifest = false;
  const seen = new Set<string>();
  let expectedCount: number | null = null;

  for (const [i, d0] of docs.entries()) {
    const d = obj(d0)!;
    const partType = str(d.partType) as PartType | null;
    if (!partType || !PART_TYPES.includes(partType)) {
      err(ctx, 'bad_part_type', `Part ${i + 1} does not say which kind of part it is.`);
      continue;
    }
    const idx = num(d.partIndex);
    const count = num(d.partCount);
    if (count != null) {
      if (expectedCount == null) expectedCount = count;
      else if (expectedCount !== count) {
        err(ctx, 'part_count_mismatch', 'The parts disagree about how many parts there should be.');
      }
    }
    const key = `${partType}:${idx ?? i}`;
    if (seen.has(key)) {
      err(ctx, 'duplicate_part', `The same part was added twice (${partType} ${idx ?? i + 1}).`);
      continue;
    }
    seen.add(key);

    const payload = d.payload;
    if (partType === 'manifest') {
      sawManifest = true;
      const p = obj(payload) ?? {};
      const pkgSection = obj(p.package) ?? obj(d.package) ?? {};
      out.package = { ...out.package, ...pkgSection };
      out.categories.push(...arr(p.categories));
    } else if (partType === 'questions') {
      out.questions.push(...arr(payload));
    } else if (partType === 'flashcards') {
      out.flashcards.push(...arr(payload));
    } else if (partType === 'presentation') {
      out.presentation = payload ?? null;
    } else if (partType === 'lessons') {
      out.lessons.push(...arr(payload));
    }
  }
  if (ctx.errors.length) return null;

  if (expectedCount != null && docs.length !== expectedCount) {
    err(
      ctx,
      'missing_parts',
      `This is part ${docs.length} of ${expectedCount}. Ask your AI for the remaining ${expectedCount - docs.length} and add them here.`,
    );
    return null;
  }
  if (!sawManifest) {
    err(ctx, 'no_manifest', 'The first part (the one with the package name and categories) is missing.');
    return null;
  }
  ctx.passed.push(`Assembled ${docs.length} parts`);
  return out;
}

// ---- Package metadata ----

function readPackage(raw: RawPackage, blueprint: ImportBlueprint, ctx: Ctx): ImportedPackage | null {
  const name = trimmed(raw.package.name);
  const subject = trimmed(raw.package.subject);
  if (!name) err(ctx, 'no_name', 'The package has no name.');
  if (name.length > LIMITS.packageName) {
    err(ctx, 'name_too_long', `The package name is longer than ${LIMITS.packageName} characters.`);
  }
  const settings = obj(raw.package.settings) ?? {};

  if (ctx.errors.length) return null;
  ctx.passed.push('Package details');

  return {
    blueprintId: raw.blueprintId,
    name,
    subject: subject.slice(0, LIMITS.subject),
    description: trimmed(raw.package.description).slice(0, LIMITS.description) || null,
    audience: trimmed(raw.package.audience) || null,
    depth: trimmed(raw.package.depth) || null,
    explanationMode: trimmed(settings.explanationMode) || null,
    categoryWeightMode: trimmed(settings.categoryWeightMode) || null,
    categories: readCategories(raw.categories),
    questions: readQuestions(raw.questions),
    flashcards: readFlashcards(raw.flashcards),
    presentation: readPresentation(raw.presentation),
    lessons: readLessons(raw.lessons),
  };
}

function readCategories(list: unknown[]): ImportedCategory[] {
  return list.map((c0, i) => {
    const c = obj(c0) ?? {};
    return {
      id: trimmed(c.id) || `cat_${i + 1}`,
      name: trimmed(c.name),
      weight: num(c.weight),
      questionTarget: num(c.questionTarget),
    };
  });
}

function readQuestions(list: unknown[]): ImportedQuestion[] {
  return list.map((q0, i) => {
    const q = obj(q0) ?? {};
    const options = arr(q.options).map((o0) => {
      const o = obj(o0) ?? {};
      return { label: (isLetter(o.label) ? o.label : '') as Letter, text: trimmed(o.text) };
    });
    return {
      id: trimmed(q.id) || `q_${i + 1}`,
      categoryId: trimmed(q.categoryId) || null,
      stem: trimmed(q.stem),
      options,
      answer: (isLetter(q.answer) ? q.answer : '') as Letter,
      explanation: trimmed(q.explanation) || null,
    };
  });
}

function readFlashcards(list: unknown[]): ImportedFlashcard[] {
  return list.map((f0, i) => {
    const f = obj(f0) ?? {};
    return {
      id: trimmed(f.id) || `f_${i + 1}`,
      categoryId: trimmed(f.categoryId) || null,
      term: trimmed(f.term),
      // `definition` is the contract's word; `def` is what the store calls it.
      definition: trimmed(f.definition) || trimmed(f.def),
    };
  });
}

function readPresentation(v: unknown): ImportedPresentation | null {
  const p = obj(v);
  if (!p) return null;
  const slides: ImportedSlide[] = arr(p.slides).map((s0, i) => {
    const s = obj(s0) ?? {};
    return { id: trimmed(s.id) || `s_${i + 1}`, title: trimmed(s.title), body: trimmed(s.body) };
  });
  return { title: trimmed(p.title), slides };
}

function readLessons(list: unknown[]): ImportedLesson[] {
  return list.map((l0, i) => {
    const l = obj(l0) ?? {};
    return {
      id: trimmed(l.id) || `l_${i + 1}`,
      title: trimmed(l.title),
      objective: trimmed(l.objective) || null,
      body: trimmed(l.body) || null,
      slideIds: arr(l.slideIds).map((s) => trimmed(s)).filter(Boolean),
    };
  });
}

// ---- Categories ----

function validateCategories(pkg: ImportedPackage, blueprint: ImportBlueprint, ctx: Ctx) {
  const cats = pkg.categories;
  if (!cats.length) {
    if (blueprint.categories.length || blueprint.questionTargets) {
      err(ctx, 'no_categories', 'The package has no categories, but the plan asked for them.');
    }
    return;
  }
  if (cats.length > LIMITS.categories) {
    err(ctx, 'too_many_categories', `A package can hold up to ${LIMITS.categories} categories; this one has ${cats.length}.`);
  }

  const byId = new Set<string>();
  const byName = new Set<string>();
  for (const c of cats) {
    if (!c.name) {
      err(ctx, 'category_unnamed', `Category "${c.id}" has no name.`, [c.id]);
      continue;
    }
    if (c.name.length > LIMITS.categoryName) {
      err(ctx, 'category_name_long', `Category name "${c.name}" is longer than ${LIMITS.categoryName} characters.`, [c.id]);
    }
    if (byId.has(c.id)) {
      err(ctx, 'category_id_duplicate', `Two categories share the id "${c.id}".`, [c.id]);
    }
    byId.add(c.id);
    const key = c.name.toLowerCase();
    if (byName.has(key)) {
      err(ctx, 'category_name_duplicate', `Two categories are both called "${c.name}".`, [c.id]);
    }
    byName.add(key);
    if (c.weight != null && (c.weight < 0 || c.weight > 100)) {
      err(ctx, 'category_weight_range', `Category "${c.name}" has a weight of ${c.weight}; weights run from 0 to 100.`, [c.id]);
    }
    if (c.questionTarget != null && (!Number.isInteger(c.questionTarget) || c.questionTarget < 0)) {
      err(ctx, 'category_target_invalid', `Category "${c.name}" has an invalid question target.`, [c.id]);
    }
  }

  // When the user fixed the categories, the AI had to use those exact ids.
  if (blueprint.categoriesLocked && blueprint.categories.length) {
    const expected = new Set(blueprint.categories.map((c) => c.id));
    const got = new Set(cats.map((c) => c.id));
    const missing = blueprint.categories.filter((c) => !got.has(c.id));
    const extra = cats.filter((c) => !expected.has(c.id));
    if (missing.length) {
      err(
        ctx,
        'category_missing',
        `The plan locks ${blueprint.categories.length} categories, and ${missing.length} of them are missing: ${missing.map((c) => c.name).join(', ')}.`,
        missing.map((c) => c.id),
      );
    }
    if (extra.length) {
      err(
        ctx,
        'category_unexpected',
        `The package adds categories the plan did not include: ${extra.map((c) => c.name || c.id).join(', ')}.`,
        extra.map((c) => c.id),
      );
    }
  }

  if (!ctx.errors.some((e) => e.code.startsWith('category'))) ctx.passed.push(`${cats.length} categories`);
}

// ---- Questions ----

function validateQuestions(pkg: ImportedPackage, blueprint: ImportBlueprint, ctx: Ctx) {
  const qs = pkg.questions;
  if (!blueprint.wantQuestions) {
    if (qs.length) warn(ctx, 'questions_unrequested', `The plan did not ask for questions, so the ${qs.length} in this package are ignored.`);
    return;
  }
  if (!qs.length) {
    err(ctx, 'no_questions', 'The package has no questions.');
    return;
  }
  if (qs.length > LIMITS.questions) {
    err(ctx, 'too_many_questions', `A study game can hold up to ${LIMITS.questions} questions; this package has ${qs.length}.`);
  }

  const catIds = new Set(pkg.categories.map((c) => c.id));
  const hasCategories = pkg.categories.length > 0;
  const seenStems = new Map<string, string[]>();
  const before = ctx.errors.length;

  for (const [i, q] of qs.entries()) {
    const at = `Question ${i + 1}`;
    if (!q.stem) {
      err(ctx, 'question_no_stem', `${at} has no question text.`, [q.id]);
    } else if (q.stem.length > LIMITS.stem) {
      err(ctx, 'question_stem_long', `${at} is longer than ${LIMITS.stem} characters.`, [q.id]);
    }

    // Exactly four options, one of each label, none of them blank.
    const labels = q.options.map((o) => o.label);
    for (const letter of LETTERS) {
      if (!labels.includes(letter)) err(ctx, 'question_missing_option', `${at} is missing option ${letter}.`, [q.id]);
    }
    if (q.options.length !== 4) {
      err(ctx, 'question_option_count', `${at} has ${q.options.length} answer options; it needs exactly four.`, [q.id]);
    }
    for (const o of q.options) {
      if (o.label && !o.text) err(ctx, 'question_blank_option', `${at} has an empty option ${o.label}.`, [q.id]);
      if (o.text.length > LIMITS.option) {
        err(ctx, 'question_option_long', `${at} option ${o.label} is longer than ${LIMITS.option} characters.`, [q.id]);
      }
    }

    if (!q.answer) {
      err(ctx, 'question_no_answer', `${at} does not say which option is correct.`, [q.id]);
    } else if (!labels.includes(q.answer)) {
      err(ctx, 'question_answer_missing_option', `${at} marks ${q.answer} as correct, but has no option ${q.answer}.`, [q.id]);
    }

    if (hasCategories) {
      if (!q.categoryId) {
        err(ctx, 'question_no_category', `${at} is not in any category.`, [q.id]);
      } else if (!catIds.has(q.categoryId)) {
        err(ctx, 'question_unknown_category', `${at} is in category "${q.categoryId}", which is not defined.`, [q.id]);
      }
    }

    if (blueprint.explanationsRequired && !q.explanation) {
      err(ctx, 'question_no_explanation', `${at} has no explanation, and the plan asks for one on every question.`, [q.id]);
    }
    if (q.explanation && q.explanation.length > LIMITS.explanation) {
      err(ctx, 'question_explanation_long', `${at}'s explanation is longer than ${LIMITS.explanation} characters.`, [q.id]);
    }

    if (q.stem) {
      const key = normalizeStem(q.stem);
      const prior = seenStems.get(key);
      if (prior) prior.push(q.id);
      else seenStems.set(key, [q.id]);
    }
  }

  for (const [, ids] of seenStems) {
    if (ids.length > 1) {
      err(ctx, 'question_duplicate', `${ids.length} questions ask the same thing.`, ids);
    }
  }

  // Exact counts, when the plan fixed them.
  if (blueprint.totalQuestions != null && qs.length !== blueprint.totalQuestions) {
    err(
      ctx,
      'question_total_mismatch',
      `The plan asks for exactly ${blueprint.totalQuestions} questions; this package has ${qs.length}.`,
    );
  }
  if (blueprint.questionTargets) {
    const counts = new Map<string, number>();
    for (const q of qs) if (q.categoryId) counts.set(q.categoryId, (counts.get(q.categoryId) ?? 0) + 1);
    for (const [catId, target] of Object.entries(blueprint.questionTargets)) {
      const found = counts.get(catId) ?? 0;
      if (found !== target) {
        const name = blueprint.categories.find((c) => c.id === catId)?.name ?? catId;
        err(ctx, 'category_count_mismatch', `Expected ${target} questions in ${name}; found ${found}.`, [catId]);
      }
    }
  }

  if (ctx.errors.length === before) ctx.passed.push(`${qs.length} questions`);
}

// ---- Flashcards ----

function validateFlashcards(pkg: ImportedPackage, blueprint: ImportBlueprint, ctx: Ctx) {
  const cards = pkg.flashcards;
  if (!blueprint.wantFlashcards) {
    if (cards.length) warn(ctx, 'flashcards_unrequested', `The plan did not ask for flashcards, so the ${cards.length} in this package are ignored.`);
    return;
  }
  if (!cards.length) {
    err(ctx, 'no_flashcards', 'The plan asks for flashcards, and the package has none.');
    return;
  }
  if (cards.length > LIMITS.flashcards) {
    err(ctx, 'too_many_flashcards', `A set can hold up to ${LIMITS.flashcards} cards; this package has ${cards.length}.`);
  }
  const catIds = new Set(pkg.categories.map((c) => c.id));
  const before = ctx.errors.length;
  for (const [i, f] of cards.entries()) {
    const at = `Flashcard ${i + 1}`;
    if (!f.term) err(ctx, 'flashcard_no_term', `${at} has no term.`, [f.id]);
    if (!f.definition) err(ctx, 'flashcard_no_definition', `${at} has no definition.`, [f.id]);
    if (f.term.length > LIMITS.term) err(ctx, 'flashcard_term_long', `${at}'s term is longer than ${LIMITS.term} characters.`, [f.id]);
    if (f.definition.length > LIMITS.definition) {
      err(ctx, 'flashcard_definition_long', `${at}'s definition is longer than ${LIMITS.definition} characters.`, [f.id]);
    }
    if (f.categoryId && !catIds.has(f.categoryId)) {
      err(ctx, 'flashcard_unknown_category', `${at} is in category "${f.categoryId}", which is not defined.`, [f.id]);
    }
  }
  if (ctx.errors.length === before) ctx.passed.push(`${cards.length} flashcards`);
}

// ---- Presentation ----

function validatePresentation(pkg: ImportedPackage, blueprint: ImportBlueprint, ctx: Ctx): Set<string> {
  const p = pkg.presentation;
  const ids = new Set<string>();
  if (!blueprint.wantPresentation) {
    if (p && p.slides.length) {
      warn(ctx, 'presentation_unrequested', 'The plan did not ask for a presentation, so the one in this package is ignored.');
    }
    return ids;
  }
  if (!p || !p.slides.length) {
    err(ctx, 'no_presentation', 'The plan asks for a presentation, and the package has no slides.');
    return ids;
  }
  if (p.slides.length > LIMITS.slides) {
    err(ctx, 'too_many_slides', `A presentation can hold up to ${LIMITS.slides} slides; this one has ${p.slides.length}.`);
  }
  const before = ctx.errors.length;
  for (const [i, s] of p.slides.entries()) {
    const at = `Slide ${i + 1}`;
    if (ids.has(s.id)) err(ctx, 'slide_id_duplicate', `Two slides share the id "${s.id}".`, [s.id]);
    ids.add(s.id);
    if (!s.title && !s.body) err(ctx, 'slide_empty', `${at} has no title and no text.`, [s.id]);
    if (s.title.length > LIMITS.slideTitle) {
      err(ctx, 'slide_title_long', `${at}'s title is longer than ${LIMITS.slideTitle} characters.`, [s.id]);
    }
    if (s.body.length > LIMITS.slideBody) {
      err(ctx, 'slide_body_long', `${at} has more than ${LIMITS.slideBody} characters of text — too much for one slide.`, [s.id]);
    }
  }
  if (ctx.errors.length === before) ctx.passed.push(`${p.slides.length} slides`);
  return ids;
}

// ---- Lessons ----

function validateLessons(pkg: ImportedPackage, slideIds: Set<string>, blueprint: ImportBlueprint, ctx: Ctx) {
  const lessons = pkg.lessons;
  if (!blueprint.wantLessons) {
    if (lessons.length) warn(ctx, 'lessons_unrequested', `The plan did not ask for lessons, so the ${lessons.length} in this package are ignored.`);
    return;
  }
  if (!lessons.length) {
    err(ctx, 'no_lessons', 'The plan asks for lessons, and the package has none.');
    return;
  }
  if (lessons.length > LIMITS.lessons) {
    err(ctx, 'too_many_lessons', `A package can hold up to ${LIMITS.lessons} lessons; this one has ${lessons.length}.`);
  }
  const seen = new Set<string>();
  const before = ctx.errors.length;
  for (const [i, l] of lessons.entries()) {
    const at = `Lesson ${i + 1}`;
    if (!l.title) err(ctx, 'lesson_no_title', `${at} has no title.`, [l.id]);
    if (l.title.length > LIMITS.lessonTitle) {
      err(ctx, 'lesson_title_long', `${at}'s title is longer than ${LIMITS.lessonTitle} characters.`, [l.id]);
    }
    if (seen.has(l.id)) err(ctx, 'lesson_id_duplicate', `Two lessons share the id "${l.id}".`, [l.id]);
    seen.add(l.id);
    for (const sid of l.slideIds) {
      if (!slideIds.has(sid)) {
        err(ctx, 'lesson_unknown_slide', `${at} refers to slide "${sid}", which is not in the presentation.`, [l.id]);
      }
    }
  }
  if (ctx.errors.length === before) ctx.passed.push(`${lessons.length} lessons`);
}

// ---- Preview ----

function preview(pkg: ImportedPackage, blueprint: ImportBlueprint): import('./packageFormat.js').PackagePreview {
  const counts = new Map<string, number>();
  for (const q of pkg.questions) if (q.categoryId) counts.set(q.categoryId, (counts.get(q.categoryId) ?? 0) + 1);
  return {
    name: pkg.name,
    subject: pkg.subject,
    questionCount: pkg.questions.length,
    categories: pkg.categories.map((c) => ({
      id: c.id,
      name: c.name,
      weight: c.weight,
      target: blueprint.questionTargets?.[c.id] ?? c.questionTarget,
      found: counts.get(c.id) ?? 0,
    })),
    categoryWeightMode: pkg.categoryWeightMode,
    explanationMode: pkg.explanationMode,
    flashcardCount: blueprint.wantFlashcards ? pkg.flashcards.length : 0,
    slideCount: blueprint.wantPresentation ? (pkg.presentation?.slides.length ?? 0) : 0,
    lessonCount: blueprint.wantLessons ? pkg.lessons.length : 0,
  };
}

/** The validated package, for the caller that is about to commit it. */
export function parseForCommit(documents: string[], blueprint: ImportBlueprint): ImportedPackage | null {
  const ctx: Ctx = { errors: [], warnings: [], passed: [] };
  const parsed: unknown[] = [];
  for (const raw of documents) {
    try {
      parsed.push(JSON.parse(stripFence(raw)));
    } catch {
      return null;
    }
  }
  const assembled = assemble(parsed, blueprint, ctx);
  if (!assembled) return null;
  return readPackage(assembled, blueprint, ctx);
}
