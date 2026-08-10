import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { studyGuides, users } from '../db/schema.js';
import { keepSlideId, withSlideIds } from './slideIdentity.js';

// Team-authored study guides: a presentation of titled slides, each with a body
// and an optional screenshot. Built through a back-and-forth chat with Claude
// (which drafts the slide text) plus screenshots the author attaches. Every
// read/write is scoped by teamId so one team can never see or touch another's
// guides.

// A single presentation slide. `image` is an optional base64 data URL of a
// screenshot the author attached; it is stored verbatim inside the slides blob.
//
// `id` is the slide's own stable identity, assigned by the server the first time
// the slide is written and carried unchanged through every edit and reorder
// afterwards. A lesson refers to slides by these ids, which is what stops
// dragging a slide up the deck silently changing which slides a lesson covers.
//
// It is OPTIONAL because legacy presentations were written before it existed and
// are not rewritten to add one. Those keep working exactly as they did; a slide
// gains an id the next time its guide is saved, and nothing depends on one until
// a lesson does.
export interface GuideSlide {
  id?: string | null;
  title: string;
  body: string;
  image?: string | null;
}

export interface GuideSummary {
  id: string;
  name: string;
  description: string | null;
  slideCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GuideDetail extends GuideSummary {
  slides: GuideSlide[];
}

const MAX_SLIDES = 40;
const MAX_TITLE = 200;
const MAX_BODY = 4000;
// A generous ceiling for a single embedded screenshot (base64 data URL). The
// client downscales before upload, so real images land well under this.
const MAX_IMAGE = 4_000_000;

// Clean and cap the slides a client sends before we persist them. Drops slides
// with neither text nor an image, and caps the set to MAX_SLIDES.
export function sanitizeSlides(raw: unknown): GuideSlide[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: GuideSlide[] = [];
  for (const item of list) {
    const o = (item ?? {}) as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, MAX_TITLE) : '';
    const body = typeof o.body === 'string' ? o.body.trim().slice(0, MAX_BODY) : '';
    let image: string | null = null;
    if (typeof o.image === 'string' && o.image.startsWith('data:image/') && o.image.length <= MAX_IMAGE) {
      image = o.image;
    }
    if (!title && !body && !image) continue;
    // An id already on the slide is PRESERVED and never regenerated — see
    // slideIdentity.ts, which is where that rule and its reasoning live.
    out.push({ id: keepSlideId(o), title, body, image });
    if (out.length >= MAX_SLIDES) break;
  }
  return out;
}



function parseSlides(raw: string): GuideSlide[] {
  try {
    return sanitizeSlides(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Every guide a team owns, newest first, WITHOUT the slide blob (so the list
// never pulls the embedded screenshots).
// `packageIds` widens the list with package-backed presentations the viewer can
// reach — see the note on deckStore.listDecks. Omitting it changes nothing.
export async function listGuides(teamId: string, packageIds: string[] = []): Promise<GuideSummary[]> {
  const rows = await db
    .select({
      id: studyGuides.id,
      name: studyGuides.name,
      description: studyGuides.description,
      slideCount: studyGuides.slideCount,
      createdBy: studyGuides.createdBy,
      createdByName: users.displayName,
      createdAt: studyGuides.createdAt,
      updatedAt: studyGuides.updatedAt,
    })
    .from(studyGuides)
    .leftJoin(users, eq(users.id, studyGuides.createdBy))
    .where(
      // Disjoint by construction — see the note on deckStore.listDecks.
      or(
        and(eq(studyGuides.teamId, teamId), isNull(studyGuides.packageId)),
        packageIds.length ? inArray(studyGuides.packageId, packageIds) : undefined,
      ),
    );

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      slideCount: r.slideCount,
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// One guide with its slides, scoped to the team (null if not this team's).
export async function getGuide(guideId: string, teamId: string): Promise<GuideDetail | null> {
  const row = (
    await db
      .select({
        id: studyGuides.id,
        name: studyGuides.name,
        description: studyGuides.description,
        slides: studyGuides.slides,
        slideCount: studyGuides.slideCount,
        createdBy: studyGuides.createdBy,
        createdByName: users.displayName,
        createdAt: studyGuides.createdAt,
        updatedAt: studyGuides.updatedAt,
      })
      .from(studyGuides)
      .leftJoin(users, eq(users.id, studyGuides.createdBy))
      .where(and(eq(studyGuides.id, guideId), eq(studyGuides.teamId, teamId)))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    slides: parseSlides(row.slides),
    slideCount: row.slideCount,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

// Create a guide from the author's finished slides.
export async function createGuide(input: {
  teamId: string;
  name: string;
  description?: string | null;
  createdBy: string | null;
  // The Study Package this presentation belongs to, when it is created into one.
  packageId?: string | null;
  slides: GuideSlide[];
}): Promise<GuideDetail> {
  const now = new Date();
  const id = randomUUID();
  const slides = withSlideIds(sanitizeSlides(input.slides));
  await db.insert(studyGuides).values({
    id,
    teamId: input.teamId,
    name: input.name.trim().slice(0, 120),
    description: input.description?.trim().slice(0, 500) || null,
    createdBy: input.createdBy,
    slides: JSON.stringify(slides),
    slideCount: slides.length,
    packageId: input.packageId ?? null,
    createdAt: now,
    updatedAt: now,
  });
  const detail = await getGuide(id, input.teamId);
  return detail!;
}

// Update a guide's name/description/slides (creator or a team admin), scoped to
// the team. Returns the updated detail, or null if not this team's / not allowed.
export async function updateGuide(
  guideId: string,
  teamId: string,
  userId: string,
  isAdmin: boolean,
  patch: { name?: string; description?: string | null; slides?: GuideSlide[] },
): Promise<GuideDetail | null> {
  const existing = (
    await db
      .select({ createdBy: studyGuides.createdBy })
      .from(studyGuides)
      .where(and(eq(studyGuides.id, guideId), eq(studyGuides.teamId, teamId)))
      .limit(1)
  )[0];
  if (!existing) return null;
  if (!isAdmin && existing.createdBy !== userId) return null;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.name === 'string' && patch.name.trim()) set.name = patch.name.trim().slice(0, 120);
  if (patch.description !== undefined) set.description = patch.description?.trim().slice(0, 500) || null;
  if (patch.slides) {
    // Ids the editor sent back are kept; only genuinely new slides get one. A
    // reorder therefore changes the ORDER of the ids and nothing else, so every
    // lesson still covers the slides it always did.
    const slides = withSlideIds(sanitizeSlides(patch.slides));
    set.slides = JSON.stringify(slides);
    set.slideCount = slides.length;
  }
  await db
    .update(studyGuides)
    .set(set)
    .where(and(eq(studyGuides.id, guideId), eq(studyGuides.teamId, teamId)));
  return getGuide(guideId, teamId);
}

// Delete a guide (creator or a team admin), scoped to the team. Returns false if
// the guide isn't this team's or the caller may not delete it.
export async function deleteGuide(
  guideId: string,
  teamId: string,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  const row = (
    await db
      .select({ createdBy: studyGuides.createdBy })
      .from(studyGuides)
      .where(and(eq(studyGuides.id, guideId), eq(studyGuides.teamId, teamId)))
      .limit(1)
  )[0];
  if (!row) return false;
  if (!isAdmin && row.createdBy !== userId) return false;
  await db.delete(studyGuides).where(and(eq(studyGuides.id, guideId), eq(studyGuides.teamId, teamId)));
  return true;
}
