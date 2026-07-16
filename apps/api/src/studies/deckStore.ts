import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyDecks, studyDeckQuestions, users } from '../db/schema.js';

// Team-authored study decks: create, list, read, and delete quizzes a team
// builds for itself. Every read/write is scoped by teamId so one team can never
// see or touch another's decks (the licensed Series 65 track is separate and
// lives in code, not here).

export type Letter = 'A' | 'B' | 'C' | 'D';

export interface DeckQuestionInput {
  topic: string;
  stem: string;
  options: { label: Letter; text: string }[];
  answer: Letter;
  explanation?: string | null;
}

export interface DeckQuestion {
  seq: number;
  topic: string;
  stem: string;
  options: { label: Letter; text: string }[];
  answer: Letter;
  explanation: string | null;
}

export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  source: string; // 'ai_topic' | 'upload' | 'sample'
  isSample: boolean;
  categories: string[];
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
      questionCount: counts.get(r.id) ?? 0,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      createdAt: r.createdAt.getTime(),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
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
  questions: DeckQuestionInput[];
}): Promise<DeckDetail> {
  const now = new Date();
  const deckId = randomUUID();
  const categories = [...new Set(input.questions.map((q) => q.topic).filter((t) => !!t))];

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
      createdAt: now,
      updatedAt: now,
    });
    if (input.questions.length) {
      await tx.insert(studyDeckQuestions).values(
        input.questions.map((q, i) => ({
          id: randomUUID(),
          deckId,
          teamId: input.teamId,
          seq: i + 1,
          topic: q.topic,
          stem: q.stem,
          options: JSON.stringify(q.options),
          answer: q.answer,
          explanation: q.explanation?.trim() || null,
          createdAt: now,
        })),
      );
    }
  });

  const detail = await getDeck(deckId, input.teamId);
  // Just created it in this team, so it always resolves.
  return detail!;
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
    }))
    .sort((a, b) => a.seq - b.seq);

  return {
    id: deckRow.id,
    name: deckRow.name,
    description: deckRow.description,
    source: deckRow.source,
    isSample: deckRow.isSample,
    categories: parseCategories(deckRow.categories),
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
