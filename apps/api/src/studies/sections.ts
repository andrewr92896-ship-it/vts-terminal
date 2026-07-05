import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studySections } from '../db/schema.js';

// Per-user custom Study Game subsections. Each is a named focus area (e.g.
// "Bonds") backed by a set of question ids Claude selected from the static
// Series 65 bank at creation time. Stored so a learner's subsections follow
// them across devices; mirrors the vocab / starred services.

export interface StudySection {
  id: string;
  name: string;
  questionIds: number[];
}

function parseIds(raw: string): number[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

export async function listSections(userId: string): Promise<StudySection[]> {
  const rows = await db
    .select({ id: studySections.id, name: studySections.name, questionIds: studySections.questionIds })
    .from(studySections)
    .where(eq(studySections.userId, userId));
  return rows.map((r) => ({ id: r.id, name: r.name, questionIds: parseIds(r.questionIds) }));
}

export async function addSection(
  userId: string,
  name: string,
  questionIds: number[],
): Promise<StudySection> {
  const clean = [...new Set(questionIds.filter((x) => Number.isInteger(x)))];
  const trimmed = name.trim().slice(0, 60);
  const id = crypto.randomUUID();
  await db.insert(studySections).values({
    id,
    userId,
    name: trimmed,
    questionIds: JSON.stringify(clean),
    createdAt: new Date(),
  });
  return { id, name: trimmed, questionIds: clean };
}

export async function removeSection(userId: string, id: string): Promise<void> {
  await db
    .delete(studySections)
    .where(and(eq(studySections.userId, userId), eq(studySections.id, id)));
}
