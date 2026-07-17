import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { earlyAccessRequests } from '../db/schema.js';

// A public early-access lead as shown in the Admin workspace.
export interface EarlyAccessView {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  source: string;
  createdAt: number;
}

function toView(r: typeof earlyAccessRequests.$inferSelect): EarlyAccessView {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    source: r.source,
    createdAt: r.createdAt.getTime(),
  };
}

export interface CreateEarlyAccessInput {
  firstName: string;
  lastName?: string | null;
  email: string;
  source: string;
}

export async function createEarlyAccessRequest(
  input: CreateEarlyAccessInput,
): Promise<EarlyAccessView> {
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    firstName: input.firstName.trim(),
    lastName: input.lastName?.trim() || null,
    email: input.email.trim().toLowerCase(),
    source: input.source.trim(),
    createdAt: now,
  };
  await db.insert(earlyAccessRequests).values(row);
  return toView(row);
}

// Newest first, so an admin sees the latest leads at the top.
export async function listEarlyAccessRequests(): Promise<EarlyAccessView[]> {
  const rows = await db
    .select()
    .from(earlyAccessRequests)
    .orderBy(desc(earlyAccessRequests.createdAt));
  return rows.map(toView);
}

export async function deleteEarlyAccessRequest(id: string): Promise<void> {
  await db.delete(earlyAccessRequests).where(eq(earlyAccessRequests.id, id));
}
