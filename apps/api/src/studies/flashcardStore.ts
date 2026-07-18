import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyFlashcardSets, studyFlashcardCards, users } from '../db/schema.js';

// Team-authored flashcard sets: create, list, read, and delete term/definition
// card sets a team builds for itself. Every read/write is scoped by teamId so
// one team can never see or touch another's sets. Cards are stored in the DB
// (not in code) — this is the generic replacement for the old built-in vocab.

export interface FlashcardInput {
  term: string;
  def: string;
  topic?: string | null;
}

export interface Flashcard {
  seq: number;
  term: string;
  def: string;
  topic: string | null;
}

export interface FlashcardSetSummary {
  id: string;
  name: string;
  description: string | null;
  source: string; // 'manual' | 'ai_topic' | 'upload' | 'sample'
  topics: string[];
  cardCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
}

export interface FlashcardSetDetail extends FlashcardSetSummary {
  cards: Flashcard[];
}

function parseTopics(raw: string): string[] {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Every set a team owns, newest first, with its card count and creator name.
export async function listFlashcardSets(teamId: string): Promise<FlashcardSetSummary[]> {
  const rows = await db
    .select({
      id: studyFlashcardSets.id,
      name: studyFlashcardSets.name,
      description: studyFlashcardSets.description,
      source: studyFlashcardSets.source,
      topics: studyFlashcardSets.topics,
      createdBy: studyFlashcardSets.createdBy,
      createdByName: users.displayName,
      createdAt: studyFlashcardSets.createdAt,
    })
    .from(studyFlashcardSets)
    .leftJoin(users, eq(users.id, studyFlashcardSets.createdBy))
    .where(eq(studyFlashcardSets.teamId, teamId));

  const counts = new Map<string, number>();
  if (rows.length) {
    const cRows = await db
      .select({ setId: studyFlashcardCards.setId })
      .from(studyFlashcardCards)
      .where(
        inArray(
          studyFlashcardCards.setId,
          rows.map((r) => r.id),
        ),
      );
    for (const c of cRows) counts.set(c.setId, (counts.get(c.setId) ?? 0) + 1);
  }

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      source: r.source,
      topics: parseTopics(r.topics),
      cardCount: counts.get(r.id) ?? 0,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      createdAt: r.createdAt.getTime(),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Create a set and its cards in one transaction. Card numbers (`seq`) and ids
// are assigned here — never trusted from the model or client.
export async function createFlashcardSet(input: {
  teamId: string;
  name: string;
  description?: string | null;
  createdBy: string | null;
  source: string;
  cards: FlashcardInput[];
}): Promise<FlashcardSetDetail> {
  const now = new Date();
  const setId = randomUUID();
  const topics = [
    ...new Set(input.cards.map((c) => (c.topic ?? '').trim()).filter((t) => !!t)),
  ];

  await db.transaction(async (tx) => {
    await tx.insert(studyFlashcardSets).values({
      id: setId,
      teamId: input.teamId,
      name: input.name.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 500) || null,
      createdBy: input.createdBy,
      source: input.source,
      topics: JSON.stringify(topics),
      createdAt: now,
      updatedAt: now,
    });
    if (input.cards.length) {
      await tx.insert(studyFlashcardCards).values(
        input.cards.map((c, i) => ({
          id: randomUUID(),
          setId,
          teamId: input.teamId,
          seq: i + 1,
          term: c.term.trim().slice(0, 300),
          def: c.def.trim().slice(0, 2000),
          topic: c.topic?.trim().slice(0, 60) || null,
          createdAt: now,
        })),
      );
    }
  });

  const detail = await getFlashcardSet(setId, input.teamId);
  // Just created it in this team, so it always resolves.
  return detail!;
}

// One set with its cards, scoped to the team (null if not this team's).
export async function getFlashcardSet(setId: string, teamId: string): Promise<FlashcardSetDetail | null> {
  const setRow = (
    await db
      .select({
        id: studyFlashcardSets.id,
        name: studyFlashcardSets.name,
        description: studyFlashcardSets.description,
        source: studyFlashcardSets.source,
        topics: studyFlashcardSets.topics,
        createdBy: studyFlashcardSets.createdBy,
        createdByName: users.displayName,
        createdAt: studyFlashcardSets.createdAt,
      })
      .from(studyFlashcardSets)
      .leftJoin(users, eq(users.id, studyFlashcardSets.createdBy))
      .where(and(eq(studyFlashcardSets.id, setId), eq(studyFlashcardSets.teamId, teamId)))
      .limit(1)
  )[0];
  if (!setRow) return null;

  const cRows = await db
    .select({
      seq: studyFlashcardCards.seq,
      term: studyFlashcardCards.term,
      def: studyFlashcardCards.def,
      topic: studyFlashcardCards.topic,
    })
    .from(studyFlashcardCards)
    .where(eq(studyFlashcardCards.setId, setId));

  const cards: Flashcard[] = cRows
    .map((c) => ({ seq: c.seq, term: c.term, def: c.def, topic: c.topic }))
    .sort((a, b) => a.seq - b.seq);

  return {
    id: setRow.id,
    name: setRow.name,
    description: setRow.description,
    source: setRow.source,
    topics: parseTopics(setRow.topics),
    cardCount: cards.length,
    createdBy: setRow.createdBy,
    createdByName: setRow.createdByName,
    createdAt: setRow.createdAt.getTime(),
    cards,
  };
}

// Delete a set (and, by cascade, its cards). Allowed for the set's creator or a
// team admin; scoped to the team. Returns false if the set isn't this team's or
// the caller may not delete it.
export async function deleteFlashcardSet(
  setId: string,
  teamId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const row = (
    await db
      .select({ createdBy: studyFlashcardSets.createdBy })
      .from(studyFlashcardSets)
      .where(and(eq(studyFlashcardSets.id, setId), eq(studyFlashcardSets.teamId, teamId)))
      .limit(1)
  )[0];
  if (!row) return false;
  if (!isAdmin && row.createdBy !== userId) return false;
  await db
    .delete(studyFlashcardSets)
    .where(and(eq(studyFlashcardSets.id, setId), eq(studyFlashcardSets.teamId, teamId)));
  return true;
}
