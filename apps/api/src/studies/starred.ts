import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyStarred } from '../db/schema.js';

// Per-user set of Study Game question ids the learner flagged to revisit, so the
// starred set follows them across devices. Mirrors the learned-terms service.

export async function listStarred(userId: string): Promise<number[]> {
  const rows = await db
    .select({ questionId: studyStarred.questionId })
    .from(studyStarred)
    .where(eq(studyStarred.userId, userId));
  return rows.map((r) => r.questionId);
}

export async function addStarred(userId: string, questionId: number): Promise<number[]> {
  if (Number.isInteger(questionId)) {
    const existing = await db
      .select({ id: studyStarred.id })
      .from(studyStarred)
      .where(and(eq(studyStarred.userId, userId), eq(studyStarred.questionId, questionId)))
      .limit(1);
    if (!existing[0]) {
      await db
        .insert(studyStarred)
        .values({ id: crypto.randomUUID(), userId, questionId, createdAt: new Date() });
    }
  }
  return listStarred(userId);
}

export async function removeStarred(userId: string, questionId: number): Promise<number[]> {
  await db
    .delete(studyStarred)
    .where(and(eq(studyStarred.userId, userId), eq(studyStarred.questionId, questionId)));
  return listStarred(userId);
}
