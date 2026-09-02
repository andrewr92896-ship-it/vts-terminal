// The Site Editor — a public site's words, edited from the private portal.
//
// The marketing landing page at vitalistradingsystems.com was one hand-written
// HTML file. It still renders exactly as that file did (verify:marketing-render
// pins it), but the words live in a DOCUMENT now, and this is where that
// document is kept. The site reads what is PUBLISHED off a public route and
// renders it; the editor on the portal writes the DRAFT.
//
// THE SHAPE IS THE PORTFOLIO ADMIN'S, ON PURPOSE. The owner's portfolio editor
// (andrewramey-admin) settled these rules first, and this keeps them so the two
// tools behave as one: a draft that is never served; publish COPIES the draft
// rather than moving it; every save records a version and the last twenty are
// kept; export takes what is on screen and is validated before it is written;
// import validates and hands the model back without saving.
//
// KEYED BY SITE. `SITES` names each site the editor can hold, its seed (what a
// fresh install serves, and what the site falls back to), and its validator —
// the renderer's own, imported from the site's code, so the one function that
// decides whether a document can be drawn is the one that decides whether it
// can be saved. A second site is an entry here and a renderer of its own.

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { siteDocuments, siteFiles, siteVersions } from '../db/schema.js';
import { referencedFiles, validateMarketing } from '../../../marketing/render/render.mjs';
import { MARKETING_SEED } from '../../../marketing/render/seed.mjs';

export class SiteEditorError extends Error {}

type SiteDef = {
  label: string;
  url: string;
  seed: unknown;
  validate: (model: unknown) => string | null;
};

export const SITES: Record<string, SiteDef> = {
  marketing: {
    label: 'vitalistradingsystems.com',
    url: 'https://vitalistradingsystems.com',
    seed: MARKETING_SEED,
    validate: validateMarketing,
  },
};

export function siteDef(site: string): SiteDef {
  const def = SITES[site];
  if (!def) throw new SiteEditorError('No such site.');
  return def;
}

/** Owner's number: twenty saves is a few days of real editing. */
export const KEEP_VERSIONS = 20;
const MAX_MODEL_BYTES = 2 * 1024 * 1024;

const parse = (json: string | null): unknown => {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

async function row(site: string) {
  const rows = await db.select().from(siteDocuments).where(eq(siteDocuments.site, site)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------- documents

export type SiteStatus = {
  site: string;
  label: string;
  url: string;
  hasDraft: boolean;
  published: boolean;
  publishedAt: string | null;
  /** Whether the draft differs from what visitors are being served. */
  dirty: boolean;
  /** True when nothing has ever been saved and this is the model from code. */
  seeded: boolean;
};

/** What the editor opens on: the draft, else what is live, else the seed. */
export async function getDraft(site: string): Promise<unknown> {
  const def = siteDef(site);
  const r = await row(site);
  const draft = r ? parse(r.draft) : null;
  const live = r ? parse(r.published) : null;
  const pick = [draft, live].find((m) => m && def.validate(m) === null);
  return pick ?? def.seed;
}

/** What the public site is served. Null until something is published. */
export async function getPublished(site: string): Promise<{ model: unknown; publishedAt: string | null } | null> {
  siteDef(site);
  const r = await row(site);
  const live = r ? parse(r.published) : null;
  if (!live) return null;
  return { model: live, publishedAt: r!.publishedAt ? r!.publishedAt.toISOString() : null };
}

export async function getStatus(site: string): Promise<SiteStatus> {
  const def = siteDef(site);
  const r = await row(site);
  const draft = r ? parse(r.draft) : null;
  const live = r ? parse(r.published) : null;
  const shown = draft ?? live ?? def.seed;
  return {
    site,
    label: def.label,
    url: def.url,
    hasDraft: draft !== null,
    published: live !== null,
    publishedAt: r?.publishedAt ? r.publishedAt.toISOString() : null,
    // Serialized comparison: the only question is "is what I am looking at what
    // visitors get", and one string comparison answers it.
    dirty: JSON.stringify(shown) !== JSON.stringify(live),
    seeded: draft === null && live === null,
  };
}

function checked(site: string, model: unknown): string {
  const problem = siteDef(site).validate(model);
  if (problem) throw new SiteEditorError(problem);
  const json = JSON.stringify(model);
  if (Buffer.byteLength(json) > MAX_MODEL_BYTES) throw new SiteEditorError('That content is too large to store.');
  return json;
}

export async function saveDraft(site: string, model: unknown): Promise<SiteStatus> {
  const json = checked(site, model);
  const now = new Date();
  await db
    .insert(siteDocuments)
    .values({ site, draft: json, updatedAt: now })
    .onConflictDoUpdate({ target: siteDocuments.site, set: { draft: json, updatedAt: now } });
  // After the draft is written, never before: a version is a record of a save
  // that happened.
  await recordVersion(site, json);
  return getStatus(site);
}

/**
 * Publish: copy the draft over the live document. Re-validated even though
 * saving validated it — this is the step that puts something in front of the
 * public, and it is the one place worth being paranoid.
 */
export async function publish(site: string): Promise<SiteStatus> {
  const model = await getDraft(site);
  const json = checked(site, model);
  const now = new Date();
  await db
    .insert(siteDocuments)
    .values({ site, published: json, publishedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: siteDocuments.site,
      set: { published: json, publishedAt: now, updatedAt: now },
    });
  // Deploying publishes what was last SAVED, so the newest version already is
  // what went live — marking it is enough.
  const newest = await newestVersionId(site);
  if (newest) await db.update(siteVersions).set({ deployed: true }).where(eq(siteVersions.id, newest));
  else await recordVersion(site, json, { deployed: true });
  return getStatus(site);
}

/** Throw the draft away and start again from what is live. */
export async function revertDraft(site: string): Promise<SiteStatus> {
  const r = await row(site);
  if (!r?.published) {
    throw new SiteEditorError('Nothing has been published yet, so there is nothing to revert to.');
  }
  await db
    .update(siteDocuments)
    .set({ draft: r.published, updatedAt: new Date() })
    .where(eq(siteDocuments.site, site));
  return getStatus(site);
}

// ---------------------------------------------------------------- versions

const idFor = (ms: number) => String(ms).padStart(14, '0');
const VALID_ID = /^\d{14}$/;

export type SiteVersion = {
  id: string;
  at: string;
  note: string;
  deployed: boolean;
  sections: number;
};

async function recordVersion(site: string, json: string, { deployed = false } = {}): Promise<string> {
  let ms = Date.now();
  let id = idFor(ms);
  // A save and a deploy in the same millisecond would collide: walk forward.
  while ((await db.select({ id: siteVersions.id }).from(siteVersions).where(eq(siteVersions.id, id)).limit(1)).length) {
    id = idFor(++ms);
  }
  await db.insert(siteVersions).values({ id, site, at: new Date(ms), note: '', deployed, model: json });
  await prune(site);
  return id;
}

async function prune(site: string): Promise<void> {
  const ids = await db
    .select({ id: siteVersions.id })
    .from(siteVersions)
    .where(eq(siteVersions.site, site))
    .orderBy(desc(siteVersions.id));
  for (const { id } of ids.slice(KEEP_VERSIONS)) {
    await db.delete(siteVersions).where(eq(siteVersions.id, id));
  }
}

async function newestVersionId(site: string): Promise<string | null> {
  const rows = await db
    .select({ id: siteVersions.id })
    .from(siteVersions)
    .where(eq(siteVersions.site, site))
    .orderBy(desc(siteVersions.id))
    .limit(1);
  return rows[0]?.id ?? null;
}

const sectionsOf = (model: unknown): number =>
  model && typeof model === 'object' && Array.isArray((model as { sections?: unknown }).sections)
    ? ((model as { sections: unknown[] }).sections.length)
    : 0;

/** Newest first, without the models — a list, not twenty documents. */
export async function listVersions(site: string): Promise<SiteVersion[]> {
  siteDef(site);
  const rows = await db.select().from(siteVersions).where(eq(siteVersions.site, site)).orderBy(desc(siteVersions.id));
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    note: r.note,
    deployed: r.deployed,
    sections: sectionsOf(parse(r.model)),
  }));
}

export async function getVersion(site: string, id: string): Promise<(SiteVersion & { model: unknown }) | null> {
  siteDef(site);
  if (!VALID_ID.test(id)) return null;
  const rows = await db
    .select()
    .from(siteVersions)
    .where(and(eq(siteVersions.site, site), eq(siteVersions.id, id)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const model = parse(r.model);
  if (!model) return null;
  return { id: r.id, at: r.at.toISOString(), note: r.note, deployed: r.deployed, sections: sectionsOf(model), model };
}

// ---------------------------------------------------------------- export / import

export const EXPORT_FORMAT = 'vts-site';
export const EXPORT_VERSION = 1;

/**
 * Wrap a model as an export document — validated first, because a backup is
 * only ever opened at the moment it is needed. The uploaded files are NOT in
 * it (a PDF and a few logos would turn a small readable document into
 * megabytes of base64); it names every one the model points at, and importing
 * says which are missing here.
 */
export async function buildExport(site: string, model: unknown) {
  const def = siteDef(site);
  const problem = def.validate(model);
  if (problem) throw new SiteEditorError(`That cannot be exported: ${problem}`);
  const files = referencedFiles(model);
  const have = new Set((await listFiles(site)).map((f) => f.slug));
  return {
    format: EXPORT_FORMAT,
    site,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    files,
    missingAtExport: files.filter((s) => !have.has(s)),
    model,
  };
}

/** Read an export back: permissive about the envelope, strict about the model. */
export async function readExport(site: string, doc: unknown) {
  const def = siteDef(site);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new SiteEditorError('That file is not a site export.');
  }
  const d = doc as Record<string, unknown>;
  const wrapped = typeof d.format === 'string' || d.model !== undefined;
  if (wrapped && typeof d.format === 'string' && d.format !== EXPORT_FORMAT) {
    throw new SiteEditorError(`That file says it is "${d.format}", not a site export.`);
  }
  if (wrapped && typeof d.site === 'string' && d.site !== site) {
    throw new SiteEditorError(`That file is an export of "${d.site}", not of this site.`);
  }
  const model = wrapped ? d.model : doc;
  const problem = def.validate(model);
  if (problem) throw new SiteEditorError(`That export cannot be used: ${problem}`);
  const files = referencedFiles(model);
  const have = new Set((await listFiles(site)).map((f) => f.slug));
  return {
    model,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : null,
    sections: sectionsOf(model),
    files,
    missing: files.filter((s) => !have.has(s)),
  };
}

// ---------------------------------------------------------------- files

/**
 * What may be uploaded. An allowlist by extension, deliberately without
 * .html, .svg or .js: each is a document a browser will EXECUTE when served
 * from this origin, and a public site must not host one somebody else wrote.
 */
const KINDS: Record<string, { type: string; inline: boolean }> = {
  '.pdf': { type: 'application/pdf', inline: true },
  '.png': { type: 'image/png', inline: true },
  '.jpg': { type: 'image/jpeg', inline: true },
  '.jpeg': { type: 'image/jpeg', inline: true },
  '.webp': { type: 'image/webp', inline: true },
  '.gif': { type: 'image/gif', inline: true },
  '.avif': { type: 'image/avif', inline: true },
  '.txt': { type: 'text/plain; charset=utf-8', inline: false },
  '.csv': { type: 'text/csv; charset=utf-8', inline: false },
  '.md': { type: 'text/plain; charset=utf-8', inline: false },
  '.doc': { type: 'application/msword', inline: false },
  '.docx': { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
  '.zip': { type: 'application/zip', inline: false },
};
export const ALLOWED_EXTENSIONS = Object.keys(KINDS);
/** Stored as a row in SQLite, so bounded well below what a volume would take. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * A filename to a slug: lowercase ASCII letters, digits, dots and dashes.
 * The slug is the address the file is served at and the name people link, so
 * it has to be typeable and must never be a path.
 */
export function slugify(name: string): string {
  const trimmed = name.trim().replace(/\\/g, '/');
  const base = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : '';
  const clean = stem
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return clean ? `${clean}${ext.replace(/[^a-z0-9.]/g, '')}` : '';
}

const extOf = (slug: string) => slug.slice(slug.lastIndexOf('.'));
export const kindFor = (slug: string) => KINDS[extOf(slug)] ?? null;

export type StoredFile = { slug: string; name: string; type: string; size: number; uploadedAt: string };

export async function listFiles(site: string): Promise<StoredFile[]> {
  siteDef(site);
  const rows = await db
    .select({
      slug: siteFiles.slug,
      name: siteFiles.name,
      type: siteFiles.type,
      size: siteFiles.size,
      uploadedAt: siteFiles.uploadedAt,
    })
    .from(siteFiles)
    .where(eq(siteFiles.site, site))
    .orderBy(desc(siteFiles.uploadedAt));
  return rows.map((r) => ({ ...r, uploadedAt: r.uploadedAt.toISOString() }));
}

/** Decode a data: URL as the browser produces one with FileReader. */
function decodeDataUrl(dataUrl: string): Buffer {
  const m = /^data:([\w/+.-]*)?(?:;[\w=-]+)*;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!m) throw new SiteEditorError('That upload is not readable.');
  return Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
}

export async function saveFile(
  site: string,
  originalName: string,
  dataUrl: string,
): Promise<{ file: StoredFile; replaced: boolean }> {
  siteDef(site);
  const slug = slugify(originalName);
  if (!slug) throw new SiteEditorError('That filename has no usable characters. Rename it and try again.');
  const kind = kindFor(slug);
  if (!kind) throw new SiteEditorError(`${extOf(slug) || 'That file type'} is not accepted. Allowed: ${ALLOWED_EXTENSIONS.join(' ')}`);
  const data = decodeDataUrl(dataUrl);
  if (data.length === 0) throw new SiteEditorError('That file is empty.');
  if (data.length > MAX_FILE_BYTES) throw new SiteEditorError('That file is over 8 MB.');
  const existing = await db
    .select({ slug: siteFiles.slug })
    .from(siteFiles)
    .where(and(eq(siteFiles.site, site), eq(siteFiles.slug, slug)))
    .limit(1);
  const now = new Date();
  const name = originalName.trim().slice(0, 160) || slug;
  await db
    .insert(siteFiles)
    .values({ site, slug, name, type: kind.type, size: data.length, data, uploadedAt: now })
    .onConflictDoUpdate({
      target: [siteFiles.site, siteFiles.slug],
      set: { name, type: kind.type, size: data.length, data, uploadedAt: now },
    });
  return {
    file: { slug, name, type: kind.type, size: data.length, uploadedAt: now.toISOString() },
    replaced: existing.length > 0,
  };
}

export async function renameFile(site: string, slug: string, name: string): Promise<StoredFile> {
  siteDef(site);
  const clean = name.trim().slice(0, 160);
  if (!clean) throw new SiteEditorError('A file needs a name.');
  const res = await db
    .update(siteFiles)
    .set({ name: clean })
    .where(and(eq(siteFiles.site, site), eq(siteFiles.slug, slug)))
    .returning({ slug: siteFiles.slug, name: siteFiles.name, type: siteFiles.type, size: siteFiles.size, uploadedAt: siteFiles.uploadedAt });
  if (!res[0]) throw new SiteEditorError('No such file.');
  return { ...res[0], uploadedAt: res[0].uploadedAt.toISOString() };
}

export async function deleteFile(site: string, slug: string): Promise<void> {
  siteDef(site);
  const res = await db
    .delete(siteFiles)
    .where(and(eq(siteFiles.site, site), eq(siteFiles.slug, slug)))
    .returning({ slug: siteFiles.slug });
  if (!res[0]) throw new SiteEditorError('No such file.');
}

/** The bytes and how to serve them, or null. */
export async function openFile(
  site: string,
  slug: string,
): Promise<{ data: Buffer; type: string; inline: boolean; size: number; name: string } | null> {
  if (!SITES[site]) return null;
  if (!slug || slug !== slugify(slug)) return null;
  const kind = kindFor(slug);
  if (!kind) return null;
  const rows = await db
    .select()
    .from(siteFiles)
    .where(and(eq(siteFiles.site, site), eq(siteFiles.slug, slug)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { data: Buffer.from(r.data), type: r.type, inline: kind.inline, size: r.size, name: r.name };
}

/** For the check script: how many rows each table holds for a site. */
export async function countRows(site: string): Promise<{ versions: number; files: number }> {
  const [v] = await db.select({ n: sql<number>`count(*)` }).from(siteVersions).where(eq(siteVersions.site, site));
  const [f] = await db.select({ n: sql<number>`count(*)` }).from(siteFiles).where(eq(siteFiles.site, site));
  return { versions: Number(v?.n ?? 0), files: Number(f?.n ?? 0) };
}
