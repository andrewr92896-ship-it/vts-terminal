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
  phone: string | null;
  source: string;
  // 'new' until an admin has dealt with the lead, then 'handled'. A handled lead
  // is kept, not deleted — the contact details are the point of collecting it.
  status: string;
  createdAt: number;
}

function toView(r: typeof earlyAccessRequests.$inferSelect): EarlyAccessView {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    source: r.source,
    status: r.status,
    createdAt: r.createdAt.getTime(),
  };
}

export interface CreateEarlyAccessInput {
  firstName: string;
  lastName?: string | null;
  email: string;
  phone?: string | null;
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
    phone: input.phone?.trim() || null,
    source: input.source.trim(),
    status: 'new',
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

// Mark a lead dealt with, or reopen it. Separate from deleting: the Administrator
// Log shows an unhandled request as open, and before this the only way to clear
// one was to throw the person's contact details away.
export async function setEarlyAccessStatus(
  id: string,
  status: 'new' | 'handled',
): Promise<void> {
  await db.update(earlyAccessRequests).set({ status }).where(eq(earlyAccessRequests.id, id));
}
