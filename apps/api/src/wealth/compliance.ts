import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  wealthCompliance,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_STATUSES,
  type ComplianceCategory,
  type ComplianceStatus,
  type WealthComplianceRow,
} from '../db/schema.js';

// RIA recordkeeping register. Each item is a compliance obligation with a
// status and optional due date; "overdue" is derived (not complete and past
// due). Scoped per advisor, mirroring the other wealth modules.

export interface ComplianceItem {
  id: string;
  category: ComplianceCategory;
  title: string;
  status: ComplianceStatus;
  overdue: boolean;
  dueAt: number | null;
  completedAt: number | null;
  clientId: string | null;
  notes: string | null;
  updatedAt: number;
}

export interface ComplianceSummary {
  total: number;
  complete: number;
  open: number;
  overdue: number;
  nextDueAt: number | null; // soonest upcoming/overdue due date among open items
}

export interface ComplianceData {
  items: ComplianceItem[];
  summary: ComplianceSummary;
}

function isCategory(v: unknown): v is ComplianceCategory {
  return typeof v === 'string' && (COMPLIANCE_CATEGORIES as readonly string[]).includes(v);
}
function isStatus(v: unknown): v is ComplianceStatus {
  return typeof v === 'string' && (COMPLIANCE_STATUSES as readonly string[]).includes(v);
}
function clean(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// UTC-midnight of "today" in Eastern Time, matching the to-do due-date scheme.
function etTodayMs(): number {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  return Date.parse(ymd + 'T00:00:00Z');
}

function toItem(row: WealthComplianceRow, todayMs: number): ComplianceItem {
  const status = isStatus(row.status) ? row.status : 'not_started';
  const dueAt = row.dueAt ? row.dueAt.getTime() : null;
  const overdue = status !== 'complete' && dueAt != null && dueAt < todayMs;
  return {
    id: row.id,
    category: isCategory(row.category) ? row.category : 'other',
    title: row.title,
    status,
    overdue,
    dueAt,
    completedAt: row.completedAt ? row.completedAt.getTime() : null,
    clientId: row.clientId,
    notes: row.notes,
    updatedAt: row.updatedAt.getTime(),
  };
}

const STATUS_RANK: Record<ComplianceStatus, number> = { in_progress: 0, not_started: 1, complete: 2 };

export async function getCompliance(userId: string): Promise<ComplianceData> {
  const rows = await db.select().from(wealthCompliance).where(eq(wealthCompliance.userId, userId));
  const todayMs = etTodayMs();
  const items = rows.map((r) => toItem(r, todayMs)).sort((a, b) => {
    // Overdue first, then by status, then soonest due, then title.
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    const ad = a.dueAt ?? Infinity;
    const bd = b.dueAt ?? Infinity;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  let complete = 0;
  let overdue = 0;
  let nextDueAt: number | null = null;
  for (const it of items) {
    if (it.status === 'complete') complete += 1;
    if (it.overdue) overdue += 1;
    if (it.status !== 'complete' && it.dueAt != null) {
      if (nextDueAt == null || it.dueAt < nextDueAt) nextDueAt = it.dueAt;
    }
  }
  return {
    items,
    summary: { total: items.length, complete, open: items.length - complete, overdue, nextDueAt },
  };
}

export interface ComplianceInput {
  category?: ComplianceCategory;
  title?: string;
  status?: ComplianceStatus;
  dueAt?: number | null;
  clientId?: string | null;
  notes?: string | null;
}

export async function addItem(userId: string, input: ComplianceInput): Promise<ComplianceData> {
  const title = (input.title ?? '').trim();
  if (!title) throw new Error('A title is required');
  const now = new Date();
  const status = isStatus(input.status) ? input.status : 'not_started';
  await db.insert(wealthCompliance).values({
    id: crypto.randomUUID(),
    userId,
    category: isCategory(input.category) ? input.category : 'filing',
    title: title.slice(0, 160),
    status,
    dueAt: input.dueAt != null ? new Date(input.dueAt) : null,
    completedAt: status === 'complete' ? now : null,
    clientId: clean(input.clientId, 64),
    notes: clean(input.notes, 2000),
    createdAt: now,
    updatedAt: now,
  });
  return getCompliance(userId);
}

export async function updateItem(userId: string, id: string, input: ComplianceInput): Promise<ComplianceData> {
  const existing = (
    await db.select().from(wealthCompliance).where(and(eq(wealthCompliance.id, id), eq(wealthCompliance.userId, userId))).limit(1)
  )[0];
  if (!existing) throw new Error('Item not found');

  const patch: Partial<typeof wealthCompliance.$inferInsert> = { updatedAt: new Date() };
  if (input.category !== undefined && isCategory(input.category)) patch.category = input.category;
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error('A title is required');
    patch.title = t.slice(0, 160);
  }
  if (input.status !== undefined && isStatus(input.status)) {
    patch.status = input.status;
    // Stamp/clear the completion time as the status crosses to/from complete.
    if (input.status === 'complete' && existing.status !== 'complete') patch.completedAt = new Date();
    if (input.status !== 'complete') patch.completedAt = null;
  }
  if (input.dueAt !== undefined) patch.dueAt = input.dueAt != null ? new Date(input.dueAt) : null;
  if (input.clientId !== undefined) patch.clientId = clean(input.clientId, 64);
  if (input.notes !== undefined) patch.notes = clean(input.notes, 2000);
  await db.update(wealthCompliance).set(patch).where(and(eq(wealthCompliance.id, id), eq(wealthCompliance.userId, userId)));
  return getCompliance(userId);
}

export async function removeItem(userId: string, id: string): Promise<ComplianceData> {
  await db.delete(wealthCompliance).where(and(eq(wealthCompliance.id, id), eq(wealthCompliance.userId, userId)));
  return getCompliance(userId);
}
