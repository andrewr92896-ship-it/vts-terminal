import crypto from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wallTemplates } from '../db/schema.js';
import { BOARD_TILE_KINDS } from './boardTiles.js';

// Live Wall templates — the built-in layouts a free account chooses between.
//
// They moved out of the web bundle and into the database (owner decision,
// 2026-08) so the owner can adjust the default boards without a deploy. The code
// presets are still the SEED: `seedWallTemplates()` fills in anything missing on
// boot and is not consulted again, the same pattern the built-in study games
// follow. A template deleted from the screen stays deleted; the seed only adds
// what is absent.
//
// DRAFT THEN PUBLISH. Every edit writes `draftTiles`; only Publish copies it to
// `publishedTiles`. Without that split, a half-moved tile is what every unpaid
// account opens on for as long as somebody is still arranging the board — and
// the whole reason these are editable live is that arranging takes a few passes.

export class WallTemplateError extends Error {}

export interface TemplateTile {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WallTemplateView {
  id: string;
  key: string;
  label: string;
  blurb: string;
  published: TemplateTile[];
  draft: TemplateTile[];
  hasDraft: boolean;
  hidden: boolean;
  sortOrder: number;
  updatedAt: number;
}

/**
 * Parse and validate a stored or submitted tile list.
 *
 * Every field is clamped rather than rejected where clamping is meaningful — a
 * template is authored by dragging, and refusing the whole layout because one
 * tile ended up a pixel off the grid would be hostile. An unknown KIND is
 * dropped, though: that is not a near-miss, it is a tile the terminal cannot
 * render, and keeping it would put a hole in every free account's board.
 */
export function parseTiles(raw: unknown): TemplateTile[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const kinds = new Set<string>(BOARD_TILE_KINDS as readonly string[]);
  const out: TemplateTile[] = [];
  for (const t of arr) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const kind = String(o.kind ?? '');
    if (!kinds.has(kind)) continue;
    const num = (v: unknown, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : def;
    };
    // 12 columns, matching the client's COLS. Height is bounded generously —
    // a tall tile is a legitimate choice, an absurd one is a mistake.
    const w = Math.max(1, Math.min(12, num(o.w, 4)));
    out.push({
      kind,
      x: Math.max(0, Math.min(12 - w, num(o.x, 0))),
      y: Math.max(0, Math.min(400, num(o.y, 0))),
      w,
      h: Math.max(1, Math.min(60, num(o.h, 10))),
    });
  }
  return out.slice(0, 40);
}

function toView(row: typeof wallTemplates.$inferSelect): WallTemplateView {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    blurb: row.blurb,
    published: parseTiles(row.publishedTiles),
    draft: parseTiles(row.draftTiles),
    hasDraft: row.hasDraft,
    hidden: row.hidden,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.getTime(),
  };
}

/**
 * What a member's Live Wall offers: published layouts only, hidden ones removed.
 *
 * Drafts never reach here. That is the whole point of the split, and it is worth
 * keeping in one function so no future caller can reach for `draftTiles` by
 * mistake.
 */
export async function listPublishedTemplates(): Promise<
  { key: string; label: string; blurb: string; tiles: TemplateTile[] }[]
> {
  const rows = await db
    .select()
    .from(wallTemplates)
    .orderBy(asc(wallTemplates.sortOrder), asc(wallTemplates.label));
  return rows
    .filter((r) => !r.hidden)
    .map((r) => ({
      key: r.key,
      label: r.label,
      blurb: r.blurb,
      tiles: parseTiles(r.publishedTiles),
    }));
}

/** Everything, drafts included — the Developer Terminal's view. */
export async function listAllTemplates(): Promise<WallTemplateView[]> {
  const rows = await db
    .select()
    .from(wallTemplates)
    .orderBy(asc(wallTemplates.sortOrder), asc(wallTemplates.label));
  return rows.map(toView);
}

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,38}$/;

export async function createTemplate(
  actorId: string,
  input: { key: string; label: string; blurb: string },
): Promise<WallTemplateView[]> {
  const key = input.key.trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    throw new WallTemplateError('A key is lowercase letters, numbers and dashes');
  }
  const clash = (
    await db.select({ id: wallTemplates.id }).from(wallTemplates).where(eq(wallTemplates.key, key)).limit(1)
  )[0];
  if (clash) throw new WallTemplateError('A template with that key already exists');

  const label = input.label.trim();
  if (!label) throw new WallTemplateError('Give the template a name');

  const count = (await db.select({ id: wallTemplates.id }).from(wallTemplates)).length;
  const now = new Date();
  await db.insert(wallTemplates).values({
    id: crypto.randomUUID(),
    key,
    label,
    blurb: input.blurb.trim(),
    // A new template starts EMPTY AND PUBLISHED-EMPTY rather than hidden: an
    // empty published board is honest ("this layout has nothing in it yet"),
    // while seeding it with a guess would put tiles on free accounts' screens
    // that nobody chose.
    publishedTiles: '[]',
    draftTiles: '[]',
    hasDraft: false,
    sortOrder: count,
    // Hidden until first published, so an empty template is not offered.
    hidden: true,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  return listAllTemplates();
}

export async function saveDraft(
  actorId: string,
  id: string,
  patch: { label?: string; blurb?: string; tiles?: unknown; hidden?: boolean; sortOrder?: number },
): Promise<WallTemplateView[]> {
  const row = (
    await db.select().from(wallTemplates).where(eq(wallTemplates.id, id)).limit(1)
  )[0];
  if (!row) throw new WallTemplateError('That template no longer exists');

  const set: Partial<typeof wallTemplates.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: actorId,
  };
  if (patch.label != null) {
    const label = patch.label.trim();
    if (!label) throw new WallTemplateError('Give the template a name');
    set.label = label;
  }
  if (patch.blurb != null) set.blurb = patch.blurb.trim();
  if (patch.hidden != null) set.hidden = patch.hidden;
  if (patch.sortOrder != null) set.sortOrder = Math.max(0, Math.round(patch.sortOrder));
  if (patch.tiles !== undefined) {
    const tiles = parseTiles(patch.tiles);
    set.draftTiles = JSON.stringify(tiles);
    // `hasDraft` compares against what is LIVE, not against what was in the
    // draft a moment ago — dragging a tile and dragging it back should leave the
    // template reading as unchanged, because it is.
    set.hasDraft = JSON.stringify(tiles) !== JSON.stringify(parseTiles(row.publishedTiles));
  }
  await db.update(wallTemplates).set(set).where(eq(wallTemplates.id, id));
  return listAllTemplates();
}

/** Copy the draft to what everybody sees. The one write that changes a member's board. */
export async function publishTemplate(actorId: string, id: string): Promise<WallTemplateView[]> {
  const row = (
    await db.select().from(wallTemplates).where(eq(wallTemplates.id, id)).limit(1)
  )[0];
  if (!row) throw new WallTemplateError('That template no longer exists');
  await db
    .update(wallTemplates)
    .set({
      publishedTiles: row.draftTiles,
      hasDraft: false,
      // Publishing an empty layout would offer a blank board, so a template with
      // no tiles stays hidden however many times Publish is pressed.
      hidden: parseTiles(row.draftTiles).length === 0 ? true : row.hidden,
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(wallTemplates.id, id));
  return listAllTemplates();
}

/** Throw the draft away and go back to what is live. */
export async function discardDraft(actorId: string, id: string): Promise<WallTemplateView[]> {
  const row = (
    await db.select().from(wallTemplates).where(eq(wallTemplates.id, id)).limit(1)
  )[0];
  if (!row) throw new WallTemplateError('That template no longer exists');
  await db
    .update(wallTemplates)
    .set({
      draftTiles: row.publishedTiles,
      hasDraft: false,
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(wallTemplates.id, id));
  return listAllTemplates();
}

export async function removeTemplate(id: string): Promise<WallTemplateView[]> {
  await db.delete(wallTemplates).where(eq(wallTemplates.id, id));
  return listAllTemplates();
}

/**
 * Seed the code presets into the table on boot, creating only what is missing.
 *
 * Create-if-absent rather than sync: once a template is in the table it belongs
 * to whoever edits it from the Developer Terminal, and re-applying the code
 * version on every deploy would silently undo their work. A template deleted
 * from the screen therefore stays deleted only until the next boot re-seeds its
 * key — which is why deleting one of the three seeded keys is not really a
 * delete. Hiding is the action that sticks.
 */
export async function seedWallTemplates(
  presets: { key: string; label: string; blurb: string; tiles: TemplateTile[] }[],
): Promise<void> {
  const existing = new Set(
    (await db.select({ key: wallTemplates.key }).from(wallTemplates)).map((r) => r.key),
  );
  const now = new Date();
  let order = existing.size;
  for (const p of presets) {
    if (existing.has(p.key)) continue;
    const json = JSON.stringify(parseTiles(p.tiles));
    await db.insert(wallTemplates).values({
      id: crypto.randomUUID(),
      key: p.key,
      label: p.label,
      blurb: p.blurb,
      publishedTiles: json,
      draftTiles: json,
      hasDraft: false,
      sortOrder: order++,
      hidden: false,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}
