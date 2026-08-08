import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyDecks, studyDeckQuestions, users } from '../db/schema.js';

// Team-authored study decks: create, list, read, edit, merge, and delete
// quizzes a team builds for itself. Every read/write is scoped by teamId so one
// team can never see or touch another's decks. Questions live in the DB.

export type Letter = 'A' | 'B' | 'C' | 'D';

export interface DeckQuestionInput {
  topic: string;
  stem: string;
  options: { label: Letter; text: string }[];
  answer: Letter;
  explanation?: string | null;
  sourceName?: string | null;
}

export interface DeckQuestion {
  seq: number;
  topic: string;
  stem: string;
  options: { label: Letter; text: string }[];
  answer: Letter;
  explanation: string | null;
  sourceName: string | null;
}

export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  source: string; // 'ai_topic' | 'upload' | 'sample'
  isSample: boolean;
  categories: string[];
  // What each category is worth when a practice test is scored the way the real
  // exam is. Null = the author never set weights, so the game scores plainly —
  // deliberately not the same as every weight being zero.
  categoryWeights: Record<string, number> | null;
  questionCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
}

export interface DeckDetail extends DeckSummary {
  questions: DeckQuestion[];
}

function parseCategories(raw: string): string[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Stored weights, keyed by category name. Anything unusable — a non-object, a
// negative, a NaN — is dropped rather than defaulted, since a weight nobody can
// account for silently changes what a score means.
function parseWeights(raw: string | null): Record<string, number> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

// The weights to store: only those naming a category the deck actually has, so
// a category the author removed can never leave a weight behind that still
// counts toward the total a score is measured against. Returns null when
// weighting is off (the patch's own null) — null and "all zeroes" mean
// different things and must not collapse into each other.
function resolveWeights(categories: string[], weights: Record<string, number> | null | undefined): string | null {
  if (weights == null) return null;
  const byLower = new Map(categories.map((c) => [c.toLowerCase(), c]));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(weights)) {
    const name = byLower.get(k.trim().toLowerCase());
    const n = Number(v);
    if (name && Number.isFinite(n) && n >= 0) out[name] = n;
  }
  return JSON.stringify(out);
}

function parseOptions(raw: string): { label: Letter; text: string }[] {
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return [];
    return a
      .filter((o): o is { label: Letter; text: string } => !!o && typeof o.text === 'string')
      .map((o) => ({ label: o.label, text: o.text }));
  } catch {
    return [];
  }
}

// Every deck a team owns, newest first, with its question count and creator name.
export async function listDecks(teamId: string): Promise<DeckSummary[]> {
  const rows = await db
    .select({
      id: studyDecks.id,
      name: studyDecks.name,
      description: studyDecks.description,
      source: studyDecks.source,
      isSample: studyDecks.isSample,
      categories: studyDecks.categories,
      categoryWeights: studyDecks.categoryWeights,
      createdBy: studyDecks.createdBy,
      createdByName: users.displayName,
      createdAt: studyDecks.createdAt,
    })
    .from(studyDecks)
    .leftJoin(users, eq(users.id, studyDecks.createdBy))
    .where(eq(studyDecks.teamId, teamId));

  const counts = new Map<string, number>();
  if (rows.length) {
    const qRows = await db
      .select({ deckId: studyDeckQuestions.deckId })
      .from(studyDeckQuestions)
      .where(
        inArray(
          studyDeckQuestions.deckId,
          rows.map((r) => r.id),
        ),
      );
    for (const q of qRows) counts.set(q.deckId, (counts.get(q.deckId) ?? 0) + 1);
  }

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      source: r.source,
      isSample: r.isSample,
      categories: parseCategories(r.categories),
      categoryWeights: parseWeights(r.categoryWeights),
      questionCount: counts.get(r.id) ?? 0,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      createdAt: r.createdAt.getTime(),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// The stored category list: the author's explicit categories (when given, order
// preserved) plus any question topic not already in it, so every question's
// topic is a valid category and empty categories the author added still persist.
function resolveCategories(questions: DeckQuestionInput[], explicit?: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of explicit ?? []) {
    const t = c.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  for (const q of questions) {
    const t = (q.topic ?? '').trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

function questionRows(deckId: string, teamId: string, questions: DeckQuestionInput[], now: Date) {
  return questions.map((q, i) => ({
    id: randomUUID(),
    deckId,
    teamId,
    seq: i + 1,
    topic: q.topic,
    stem: q.stem,
    options: JSON.stringify(q.options),
    answer: q.answer,
    explanation: q.explanation?.trim() || null,
    sourceName: q.sourceName?.trim().slice(0, 120) || null,
    createdAt: now,
  }));
}

// Create a deck and its questions in one transaction. Question numbers (`seq`)
// and ids are assigned here — never trusted from the model or client.
export async function createDeck(input: {
  teamId: string;
  name: string;
  description?: string | null;
  createdBy: string | null;
  source: string;
  isSample?: boolean;
  categories?: string[];
  categoryWeights?: Record<string, number> | null;
  questions: DeckQuestionInput[];
}): Promise<DeckDetail> {
  const now = new Date();
  const deckId = randomUUID();
  const categories = resolveCategories(input.questions, input.categories);

  await db.transaction(async (tx) => {
    await tx.insert(studyDecks).values({
      id: deckId,
      teamId: input.teamId,
      name: input.name.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 500) || null,
      createdBy: input.createdBy,
      source: input.source,
      isSample: input.isSample ?? false,
      categories: JSON.stringify(categories),
      categoryWeights: resolveWeights(categories, input.categoryWeights),
      createdAt: now,
      updatedAt: now,
    });
    if (input.questions.length) {
      await tx.insert(studyDeckQuestions).values(questionRows(deckId, input.teamId, input.questions, now));
    }
  });

  const detail = await getDeck(deckId, input.teamId);
  // Just created it in this team, so it always resolves.
  return detail!;
}

// Edit a deck: rename and/or replace its questions and categories. Allowed for
// the deck's creator or a team admin; scoped to the team. When `questions` is
// given the whole question set is replaced (re-sequenced), which also clears any
// per-user progress rows keyed by (userId, deckId)? No — progress is keyed by the
// deck id, which is unchanged, so a light edit keeps players' levels. Returns the
// updated deck, or null if it isn't this team's or the caller may not edit it.
export async function updateDeck(
  deckId: string,
  teamId: string,
  userId: string,
  isAdmin: boolean,
  patch: {
    name?: string;
    description?: string | null;
    categories?: string[];
    // undefined = leave weighting as it is; null = turn it off; an object = set it.
    categoryWeights?: Record<string, number> | null;
    questions?: DeckQuestionInput[];
  },
): Promise<DeckDetail | null> {
  const existing = await getDeck(deckId, teamId);
  if (!existing) return null;
  if (!isAdmin && existing.createdBy !== userId) return null;

  // The question set now in effect (the patch's, or the current one) — used so
  // category resolution always sees every question's topic.
  const effectiveQuestions: DeckQuestionInput[] =
    patch.questions ??
    existing.questions.map((q) => ({
      topic: q.topic,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      sourceName: q.sourceName,
    }));

  const now = new Date();
  await db.transaction(async (tx) => {
    const set: Record<string, unknown> = { updatedAt: now };
    if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 120);
    if (patch.description !== undefined) set.description = patch.description?.trim().slice(0, 500) || null;
    // The category list and the weights are resolved together whenever either
    // moves. Re-filtering the weights against the list on every category change
    // — not only when weights are the thing being patched — is what stops a
    // renamed or removed category leaving a stored weight behind that no longer
    // names anything but still counts toward the total.
    if (patch.questions !== undefined || patch.categories !== undefined || patch.categoryWeights !== undefined) {
      const nextCategories = resolveCategories(effectiveQuestions, patch.categories);
      set.categories = JSON.stringify(nextCategories);
      const nextWeights = patch.categoryWeights !== undefined ? patch.categoryWeights : existing.categoryWeights;
      set.categoryWeights = resolveWeights(nextCategories, nextWeights);
    }
    await tx.update(studyDecks).set(set).where(and(eq(studyDecks.id, deckId), eq(studyDecks.teamId, teamId)));
    if (patch.questions !== undefined) {
      await tx.delete(studyDeckQuestions).where(eq(studyDeckQuestions.deckId, deckId));
      if (patch.questions.length) {
        await tx.insert(studyDeckQuestions).values(questionRows(deckId, teamId, patch.questions, now));
      }
    }
  });

  return getDeck(deckId, teamId);
}

// Combine several of the team's games into one new game holding all their
// questions. When `tagSource` is set, each question remembers the name of the
// game it came from (for the optional "guess the source" play mode). Skips any
// deck id that isn't this team's. Returns the new deck.
//
// The combined game is deliberately UNWEIGHTED however its sources were
// weighted: two games' weights are two different exams' blueprints, and there
// is no arithmetic that merges them into a third that means anything. The
// author sets the combined game's weights themselves.
export async function mergeDecks(input: {
  teamId: string;
  name: string;
  createdBy: string | null;
  deckIds: string[];
  tagSource: boolean;
}): Promise<DeckDetail> {
  const questions: DeckQuestionInput[] = [];
  for (const id of input.deckIds) {
    const d = await getDeck(id, input.teamId);
    if (!d) continue;
    for (const q of d.questions) {
      questions.push({
        topic: q.topic,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        sourceName: input.tagSource ? d.name : null,
      });
    }
  }
  return createDeck({
    teamId: input.teamId,
    name: input.name,
    description: `Combined from ${input.deckIds.length} game${input.deckIds.length === 1 ? '' : 's'}`,
    createdBy: input.createdBy,
    source: 'merged',
    questions,
  });
}

// One deck with its questions, scoped to the team (null if not this team's).
export async function getDeck(deckId: string, teamId: string): Promise<DeckDetail | null> {
  const deckRow = (
    await db
      .select({
        id: studyDecks.id,
        name: studyDecks.name,
        description: studyDecks.description,
        source: studyDecks.source,
        isSample: studyDecks.isSample,
        categories: studyDecks.categories,
        categoryWeights: studyDecks.categoryWeights,
        createdBy: studyDecks.createdBy,
        createdByName: users.displayName,
        createdAt: studyDecks.createdAt,
      })
      .from(studyDecks)
      .leftJoin(users, eq(users.id, studyDecks.createdBy))
      .where(and(eq(studyDecks.id, deckId), eq(studyDecks.teamId, teamId)))
      .limit(1)
  )[0];
  if (!deckRow) return null;

  const qRows = await db
    .select({
      seq: studyDeckQuestions.seq,
      topic: studyDeckQuestions.topic,
      stem: studyDeckQuestions.stem,
      options: studyDeckQuestions.options,
      answer: studyDeckQuestions.answer,
      explanation: studyDeckQuestions.explanation,
      sourceName: studyDeckQuestions.sourceName,
    })
    .from(studyDeckQuestions)
    .where(eq(studyDeckQuestions.deckId, deckId));

  const questions: DeckQuestion[] = qRows
    .map((q) => ({
      seq: q.seq,
      topic: q.topic,
      stem: q.stem,
      options: parseOptions(q.options),
      answer: q.answer as Letter,
      explanation: q.explanation,
      sourceName: q.sourceName,
    }))
    .sort((a, b) => a.seq - b.seq);

  return {
    id: deckRow.id,
    name: deckRow.name,
    description: deckRow.description,
    source: deckRow.source,
    isSample: deckRow.isSample,
    categories: parseCategories(deckRow.categories),
    categoryWeights: parseWeights(deckRow.categoryWeights),
    questionCount: questions.length,
    createdBy: deckRow.createdBy,
    createdByName: deckRow.createdByName,
    createdAt: deckRow.createdAt.getTime(),
    questions,
  };
}

// Delete a deck (and, by cascade, its questions, per-user state, and runs).
// Allowed for the deck's creator or a team admin; scoped to the team. Returns
// false if the deck isn't this team's or the caller may not delete it.
export async function deleteDeck(
  deckId: string,
  teamId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const row = (
    await db
      .select({ createdBy: studyDecks.createdBy })
      .from(studyDecks)
      .where(and(eq(studyDecks.id, deckId), eq(studyDecks.teamId, teamId)))
      .limit(1)
  )[0];
  if (!row) return false;
  if (!isAdmin && row.createdBy !== userId) return false;
  await db.delete(studyDecks).where(and(eq(studyDecks.id, deckId), eq(studyDecks.teamId, teamId)));
  return true;
}
