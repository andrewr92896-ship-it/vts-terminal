import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { patchNotes, type PatchNoteStatus } from '../db/schema.js';

// Admin-authored release notes. An admin drafts an entry, reviews it, then
// releases (publishes) it; only published entries are shown to members in Site
// Help. This replaces the old compiled-in PATCH_NOTES array.

export class PatchNoteError extends Error {}

export interface PatchNoteView {
  id: string;
  version: string;
  dateLabel: string;
  notes: string[];
  status: PatchNoteStatus;
  position: number;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

function toView(r: typeof patchNotes.$inferSelect): PatchNoteView {
  let notes: string[] = [];
  try {
    const raw = JSON.parse(r.notes);
    if (Array.isArray(raw)) notes = raw.filter((n): n is string => typeof n === 'string');
  } catch {
    notes = [];
  }
  return {
    id: r.id,
    version: r.version,
    dateLabel: r.dateLabel,
    notes,
    status: r.status,
    position: r.position,
    publishedAt: r.publishedAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}

// Newest first: by position (higher = newer), then by creation time.
function sortNewestFirst(a: PatchNoteView, b: PatchNoteView): number {
  return b.position - a.position || b.createdAt - a.createdAt;
}

export async function listPublishedNotes(): Promise<PatchNoteView[]> {
  const rows = await db.select().from(patchNotes).where(eq(patchNotes.status, 'published'));
  return rows.map(toView).sort(sortNewestFirst);
}

export async function listAllNotes(): Promise<PatchNoteView[]> {
  const rows = await db.select().from(patchNotes);
  return rows.map(toView).sort(sortNewestFirst);
}

function cleanNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 60);
}

export interface PatchNoteInput {
  version: string;
  dateLabel: string;
  notes: string[];
}

async function nextPosition(): Promise<number> {
  const rows = await db.select({ position: patchNotes.position }).from(patchNotes);
  return rows.reduce((m, r) => Math.max(m, r.position), 0) + 1;
}

export async function createNote(input: PatchNoteInput): Promise<PatchNoteView> {
  const version = input.version.trim();
  if (!version) throw new PatchNoteError('A version label is required');
  const notes = cleanNotes(input.notes);
  if (notes.length === 0) throw new PatchNoteError('Add at least one note');
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    version: version.slice(0, 60),
    dateLabel: (input.dateLabel.trim() || defaultDateLabel(now)).slice(0, 60),
    notes: JSON.stringify(notes),
    status: 'draft' as PatchNoteStatus,
    position: await nextPosition(),
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(patchNotes).values(row);
  return toView(row);
}

export async function updateNote(id: string, input: Partial<PatchNoteInput>): Promise<PatchNoteView> {
  const existing = (await db.select().from(patchNotes).where(eq(patchNotes.id, id)).limit(1))[0];
  if (!existing) throw new PatchNoteError('Patch note not found');
  const patch: Partial<typeof patchNotes.$inferInsert> = { updatedAt: new Date() };
  if (input.version != null) {
    const v = input.version.trim();
    if (!v) throw new PatchNoteError('A version label is required');
    patch.version = v.slice(0, 60);
  }
  if (input.dateLabel != null) patch.dateLabel = input.dateLabel.trim().slice(0, 60);
  if (input.notes != null) {
    const notes = cleanNotes(input.notes);
    if (notes.length === 0) throw new PatchNoteError('Add at least one note');
    patch.notes = JSON.stringify(notes);
  }
  await db.update(patchNotes).set(patch).where(eq(patchNotes.id, id));
  return (await db.select().from(patchNotes).where(eq(patchNotes.id, id)).limit(1)).map(toView)[0];
}

export async function setNoteStatus(id: string, status: PatchNoteStatus): Promise<PatchNoteView> {
  const existing = (await db.select().from(patchNotes).where(eq(patchNotes.id, id)).limit(1))[0];
  if (!existing) throw new PatchNoteError('Patch note not found');
  const now = new Date();
  const patch: Partial<typeof patchNotes.$inferInsert> = { status, updatedAt: now };
  // Stamp the first publish time; leave it once set so re-publishing keeps the
  // original release date.
  if (status === 'published' && !existing.publishedAt) patch.publishedAt = now;
  await db.update(patchNotes).set(patch).where(eq(patchNotes.id, id));
  return (await db.select().from(patchNotes).where(eq(patchNotes.id, id)).limit(1)).map(toView)[0];
}

export async function deleteNote(id: string): Promise<void> {
  const existing = (await db.select({ id: patchNotes.id }).from(patchNotes).where(eq(patchNotes.id, id)).limit(1))[0];
  if (!existing) throw new PatchNoteError('Patch note not found');
  await db.delete(patchNotes).where(eq(patchNotes.id, id));
}

function defaultDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
