import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { passwordResetRequests } from '../db/schema.js';

// A forgotten-password request as shown under Admin ▸ User Support. No account
// is created or looked up when one is submitted — an admin reviews these, resets
// the user's password, and emails a temporary one manually.
export interface PasswordResetView {
  id: string;
  email: string;
  note: string | null;
  status: 'pending' | 'resolved';
  createdAt: number;
  resolvedAt: number | null;
}

function toView(r: typeof passwordResetRequests.$inferSelect): PasswordResetView {
  return {
    id: r.id,
    email: r.email,
    note: r.note,
    status: r.status === 'resolved' ? 'resolved' : 'pending',
    createdAt: r.createdAt.getTime(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.getTime() : null,
  };
}

export interface CreatePasswordResetInput {
  email: string;
  note?: string | null;
}

export async function createPasswordResetRequest(
  input: CreatePasswordResetInput,
): Promise<PasswordResetView> {
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    note: input.note?.trim() || null,
    status: 'pending' as const,
    createdAt: now,
    resolvedAt: null,
  };
  await db.insert(passwordResetRequests).values(row);
  return toView(row);
}

// Newest first, so an admin sees the latest requests at the top.
export async function listPasswordResetRequests(): Promise<PasswordResetView[]> {
  const rows = await db
    .select()
    .from(passwordResetRequests)
    .orderBy(desc(passwordResetRequests.createdAt));
  return rows.map(toView);
}

// Mark a request handled (password reset + temp emailed) without deleting it, so
// the admin keeps a record of what was actioned. Idempotent.
export async function resolvePasswordResetRequest(id: string): Promise<void> {
  await db
    .update(passwordResetRequests)
    .set({ status: 'resolved', resolvedAt: new Date() })
    .where(eq(passwordResetRequests.id, id));
}

export async function deletePasswordResetRequest(id: string): Promise<void> {
  await db.delete(passwordResetRequests).where(eq(passwordResetRequests.id, id));
}
