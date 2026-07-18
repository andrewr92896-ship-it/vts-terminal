import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyVocab } from '../db/schema.js';

// Per-user custom flashcard deck: words the learner added themselves, with an
// AI-generated definition and a topic label. Mirrors the learned-terms
// service so a custom deck follows the user across devices.

export interface VocabCard {
  term: string;
  def: string;
  topic: string;
}

export async function listVocab(userId: string): Promise<VocabCard[]> {
  const rows = await db
    .select({ term: studyVocab.term, def: studyVocab.def, topic: studyVocab.topic })
    .from(studyVocab)
    .where(eq(studyVocab.userId, userId));
  return rows.map((r) => ({ term: r.term, def: r.def, topic: r.topic }));
}

// Add (or replace the definition of) a custom card, then return the full deck.
export async function addVocab(
  userId: string,
  term: string,
  def: string,
  topic: string,
): Promise<VocabCard[]> {
  const t = term.trim().slice(0, 200);
  const d = def.trim().slice(0, 1000);
  if (t && d) {
    const existing = await db
      .select({ id: studyVocab.id })
      .from(studyVocab)
      .where(and(eq(studyVocab.userId, userId), eq(studyVocab.term, t)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(studyVocab)
        .set({ def: d, topic })
        .where(eq(studyVocab.id, existing[0].id));
    } else {
      await db
        .insert(studyVocab)
        .values({ id: crypto.randomUUID(), userId, term: t, def: d, topic, createdAt: new Date() });
    }
  }
  return listVocab(userId);
}

export async function removeVocab(userId: string, term: string): Promise<VocabCard[]> {
  await db
    .delete(studyVocab)
    .where(and(eq(studyVocab.userId, userId), eq(studyVocab.term, term)));
  return listVocab(userId);
}
