import { eq, like } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appSettings } from '../db/schema.js';

// Generic key/value settings store. Backs the admin-editable AI system prompts
// (keys "ai.<id>") and editable site copy (keys "howto.<screen>"). A missing key
// means "use the built-in default", so callers always pass their code default
// and only override it when a row exists.

export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

// Return a setting's value, or `fallback` when it has never been overridden.
export async function getSettingOr(key: string, fallback: string): Promise<string> {
  const v = await getSetting(key);
  return v == null ? fallback : v;
}

// Every setting whose key starts with `prefix` (e.g. "howto."), as a plain map.
export async function getSettingsByPrefix(prefix: string): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(like(appSettings.key, `${prefix}%`));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// Upsert a setting. An empty/blank value deletes the row instead, so "clear the
// override" (reset to the built-in default) and "save an override" share a path.
export async function setSetting(key: string, value: string): Promise<void> {
  if (!value.trim()) {
    await clearSetting(key);
    return;
  }
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

export async function clearSetting(key: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}
