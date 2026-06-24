import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyLearned } from '../db/schema.js';

// Per-user set of vocabulary terms the learner has marked as known, so their
// flashcard progress follows them across devices. Terms are stored verbatim.

export async function listLearned(userId: string): Promise<string[]> {
  const rows = await db
    .select({ term: studyLearned.term })
    .from(studyLearned)
    .where(eq(studyLearned.userId, userId));
  return rows.map((r) => r.term);
}

export async function addLearned(userId: string, term: string): Promise<string[]> {
  const t = term.trim().slice(0, 200);
  if (t) {
    const existing = await db
      .select({ id: studyLearned.id })
      .from(studyLearned)
      .where(and(eq(studyLearned.userId, userId), eq(studyLearned.term, t)))
      .limit(1);
    if (!existing[0]) {
      await db.insert(studyLearned).values({ id: crypto.randomUUID(), userId, term: t, createdAt: new Date() });
    }
  }
  return listLearned(userId);
}

export async function removeLearned(userId: string, term: string): Promise<string[]> {
  await db
    .delete(studyLearned)
    .where(and(eq(studyLearned.userId, userId), eq(studyLearned.term, term)));
  return listLearned(userId);
}
