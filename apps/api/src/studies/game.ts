import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyGame } from '../db/schema.js';

// Per-user Study Game state, stored as an opaque JSON string. The shape is owned
// by the web client (see series65Game.ts); the server only persists and returns
// it verbatim, so progress follows the learner across devices.

const MAX_STATE_BYTES = 64 * 1024; // generous ceiling for the serialized state

export async function getGame(userId: string): Promise<string | null> {
  const rows = await db
    .select({ state: studyGame.state })
    .from(studyGame)
    .where(eq(studyGame.userId, userId))
    .limit(1);
  return rows[0]?.state ?? null;
}

export async function saveGame(userId: string, state: string): Promise<void> {
  await db
    .insert(studyGame)
    .values({ userId, state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: studyGame.userId,
      set: { state, updatedAt: new Date() },
    });
}

// Validate that the body is a JSON string within our size ceiling. Returns the
// canonical string to store, or null if it is unusable.
export function normalizeState(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_STATE_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}
