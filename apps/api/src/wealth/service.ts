import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  wealthClients,
  WEALTH_CLIENT_STATUSES,
  type WealthClientRow,
  type WealthClientStatus,
} from '../db/schema.js';

// The client list mirrors the Kia patterns: every row is keyed by userId so a
// new user's list starts empty (no seed row is needed — the absence of rows is
// the empty state), removals return the full row so the UI can offer undo, and
// restore re-inserts with onConflictDoNothing.

export interface WealthClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  accountValue: number | null;
  status: WealthClientStatus;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

// Headline numbers for the workspace: how many clients, how much money is under
// management, and how many are active relationships.
export interface WealthSummary {
  totalClients: number;
  totalAum: number;
  activeClients: number;
}

export interface WealthClientsData {
  clients: WealthClient[];
  summary: WealthSummary;
}

function isStatus(v: unknown): v is WealthClientStatus {
  return typeof v === 'string' && (WEALTH_CLIENT_STATUSES as readonly string[]).includes(v);
}

// Normalize an optional free-text field: trim it, and treat blank as "unset".
function cleanOptional(v: string | undefined, max: number): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// Account value is whole US dollars; null means "not recorded".
function cleanMoney(v: number | undefined): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.round(v));
}

function toClient(row: WealthClientRow): WealthClient {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    accountValue: row.accountValue,
    status: isStatus(row.status) ? row.status : 'prospect',
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function summarize(rows: WealthClientRow[]): WealthSummary {
  let totalAum = 0;
  let activeClients = 0;
  for (const r of rows) {
    totalAum += r.accountValue ?? 0;
    if (r.status === 'active') activeClients += 1;
  }
  return { totalClients: rows.length, totalAum, activeClients };
}

export async function getClients(userId: string): Promise<WealthClientsData> {
  const rows = await db.select().from(wealthClients).where(eq(wealthClients.userId, userId));
  // Active first, then onboarding/prospect/inactive, and alphabetical within a
  // status — the order an advisor would scan the book in.
  const statusRank: Record<WealthClientStatus, number> = {
    active: 0,
    onboarding: 1,
    prospect: 2,
    inactive: 3,
  };
  const sorted = [...rows].sort((a, b) => {
    const sa = isStatus(a.status) ? statusRank[a.status] : 9;
    const sb = isStatus(b.status) ? statusRank[b.status] : 9;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return { clients: sorted.map(toClient), summary: summarize(rows) };
}

export async function addClient(
  userId: string,
  input: {
    name: string;
    email?: string;
    phone?: string;
    accountValue?: number;
    status?: WealthClientStatus;
    notes?: string;
  },
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error('Name is required');
  const now = new Date();
  await db.insert(wealthClients).values({
    id: crypto.randomUUID(),
    userId,
    name: name.slice(0, 120),
    email: cleanOptional(input.email, 200),
    phone: cleanOptional(input.phone, 60),
    accountValue: cleanMoney(input.accountValue),
    status: isStatus(input.status) ? input.status : 'prospect',
    notes: cleanOptional(input.notes, 2000),
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateClient(
  userId: string,
  id: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    accountValue?: number | null;
    status?: WealthClientStatus;
    notes?: string;
  },
): Promise<void> {
  const existing = (
    await db
      .select()
      .from(wealthClients)
      .where(and(eq(wealthClients.id, id), eq(wealthClients.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Client not found');

  const patch: Partial<typeof wealthClients.$inferInsert> = { updatedAt: new Date() };
  if (input.name != null) {
    const n = input.name.trim();
    if (!n) throw new Error('Name is required');
    patch.name = n.slice(0, 120);
  }
  if (input.email != null) patch.email = cleanOptional(input.email, 200);
  if (input.phone != null) patch.phone = cleanOptional(input.phone, 60);
  // accountValue can be explicitly cleared by passing null.
  if (input.accountValue !== undefined) {
    patch.accountValue = input.accountValue === null ? null : cleanMoney(input.accountValue);
  }
  if (input.status != null && isStatus(input.status)) patch.status = input.status;
  if (input.notes != null) patch.notes = cleanOptional(input.notes, 2000);

  await db
    .update(wealthClients)
    .set(patch)
    .where(and(eq(wealthClients.id, id), eq(wealthClients.userId, userId)));
}

// The raw fields needed to restore a removed client exactly (undo).
export interface RemovedWealthClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  accountValue: number | null;
  status: WealthClientStatus;
  notes: string | null;
  createdAt: number; // ms
}

export async function removeClient(
  userId: string,
  id: string,
): Promise<RemovedWealthClient | null> {
  const row = (
    await db
      .select()
      .from(wealthClients)
      .where(and(eq(wealthClients.id, id), eq(wealthClients.userId, userId)))
      .limit(1)
  )[0];
  if (!row) return null;

  await db
    .delete(wealthClients)
    .where(and(eq(wealthClients.id, id), eq(wealthClients.userId, userId)));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    accountValue: row.accountValue,
    status: isStatus(row.status) ? row.status : 'prospect',
    notes: row.notes,
    createdAt: row.createdAt.getTime(),
  };
}

// Re-insert a previously removed client (undo); ignored if the id already
// exists. createdAt is preserved; updatedAt is refreshed to "now".
export async function restoreClient(
  userId: string,
  client: RemovedWealthClient,
): Promise<void> {
  await db
    .insert(wealthClients)
    .values({
      id: client.id,
      userId,
      name: client.name,
      email: client.email,
      phone: client.phone,
      accountValue: client.accountValue,
      status: isStatus(client.status) ? client.status : 'prospect',
      notes: client.notes,
      createdAt: new Date(client.createdAt),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}
