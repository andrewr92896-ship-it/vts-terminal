import type { Model } from './types';

/**
 * The Site Editor's client — the marketing site's document, its saved
 * versions and its uploaded files, all under /api/site-editor/<site>.
 *
 * Its own small client rather than methods on the portal's `api`, because the
 * shape is the PORTFOLIO ADMIN'S: the editor code was brought across from there
 * and reads `api.content()`, `api.saveContent()`, `api.upload()` and so on.
 * Keeping the names is what lets a fix made in one editor be made in the other
 * by the same diff.
 */

export const SITE = 'marketing';
const BASE = `/api/site-editor/${SITE}`;
/** Where an uploaded file is served on THIS origin — for thumbnails and previews. */
export const FILES_BASE = `/api/public/site/${SITE}/files/`;
export const fileUrl = (slug: string) => FILES_BASE + encodeURIComponent(slug);

export type ContentStatus = {
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

export type ContentPayload = ContentStatus & { model: Model | null };

export type SavedVersion = {
  id: string;
  at: string | null;
  note: string;
  deployed: boolean;
  sections: number;
};

export type StoredFile = {
  slug: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string | null;
};

export type FilesPayload = {
  files: StoredFile[];
  allowed: string[];
  maxBytes: number;
};

export type SiteSettings = {
  site: string;
  label: string;
  url: string;
  maintenance: boolean;
  updatedAt: string | null;
  /** Milliseconds since the live site last asked for this, or null if never. */
  sincePoll: number | null;
};

export type ExportDoc = {
  format: string;
  site: string;
  version: number;
  exportedAt: string;
  files: string[];
  missingAtExport: string[];
  model: Model;
};

export type ImportRead = {
  model: Model;
  exportedAt: string | null;
  sections: number;
  files: string[];
  missing: string[];
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // The content type is set only when there is a body to describe. Fastify
  // refuses a JSON content-type with nothing behind it, so a body-less POST —
  // publish, revert, delete — would answer "Bad Request" and the editor would
  // report a deploy that never happened.
  const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) ?? {}) };
  if (init?.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { credentials: 'include', ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      /* the status is all there is to go on */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });

export const api = {
  content: () => request<ContentPayload>(BASE),
  versions: () => request<{ versions: SavedVersion[] }>(`${BASE}/versions`),
  version: (id: string) => request<SavedVersion & { model: Model }>(`${BASE}/versions/${encodeURIComponent(id)}`),
  saveContent: (model: Model) => request<ContentStatus>(BASE, { method: 'PUT', body: JSON.stringify({ model }) }),
  publishContent: () => request<ContentStatus>(`${BASE}/publish`, { method: 'POST' }),
  revertContent: () => request<ContentStatus>(`${BASE}/revert`, { method: 'POST' }),
  exportContent: (model: Model) =>
    request<ExportDoc>(`${BASE}/export`, { method: 'POST', body: JSON.stringify({ model }) }),
  importContent: (doc: unknown) =>
    request<ImportRead>(`${BASE}/import`, { method: 'POST', body: JSON.stringify({ doc }) }),

  settings: () => request<SiteSettings>(`${BASE}/settings`),
  setMaintenance: (maintenance: boolean) =>
    request<SiteSettings>(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify({ maintenance }) }),

  files: () => request<FilesPayload>(`${BASE}/files`),
  /**
   * The file goes up as a data URL in a JSON body — the portal's house pattern
   * for avatars and screenshots, and one route limit rather than multipart.
   */
  upload: async (file: File) =>
    request<{ file: StoredFile; replaced: boolean; files: StoredFile[] }>(`${BASE}/files`, {
      method: 'POST',
      body: JSON.stringify({ name: file.name, data: await readAsDataUrl(file) }),
    }),
  renameFile: (slug: string, name: string) =>
    request<{ file: StoredFile; files: StoredFile[] }>(`${BASE}/files/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteFile: (slug: string) =>
    request<{ files: StoredFile[] }>(`${BASE}/files/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
};
