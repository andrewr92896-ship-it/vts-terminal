import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { config } from '../config.js';
import * as schema from './schema.js';

// Single shared libsql client (local SQLite file — on the mounted Railway
// volume in production). @libsql/client opens the database eagerly here at
// import, so a missing or unwritable path fails fast. Surface a clear,
// actionable message instead of an opaque libsql stack, then rethrow — the
// server can't run without its database, so the process should still exit
// (Railway restarts it per the service restart policy).
function openClient(): Client {
  try {
    return createClient({ url: config.databaseUrl });
  } catch (err) {
    console.error(
      `[db] Could not open the database at "${config.databaseUrl}". In production ` +
        `this must be a writable path on the mounted Railway volume (e.g. ` +
        `DATABASE_URL=file:/data/vts.db). Check that the volume is attached and ` +
        `mounted, that DATABASE_URL points at it, and that it is not out of disk space.`,
    );
    throw err;
  }
}

const client = openClient();

export const db = drizzle(client, { schema });
export { schema, client };

// Overwrite deleted content instead of leaving it in freed pages.
//
// SQLite's default is to unlink a page from the b-tree and leave its bytes where
// they are until something else claims the space. This database holds encrypted
// broker credentials, and the file goes into every backup — so a deleted
// connection's ciphertext would otherwise ride along in whole-file copies long
// after the row was gone.
//
// This governs FUTURE deletes only. Pages already freed keep their contents
// until a VACUUM rewrites the file, which is deliberately not run here: it needs
// room for a second copy of the database on the Railway volume and holds a write
// lock for the duration, neither of which belongs in a boot path.
//
// Started at import so it is the first statement this process sends, and awaited
// by waitForDatabase() so the boot sequence cannot outrun it.
export const pragmasApplied: Promise<void> = client
  .execute('PRAGMA secure_delete = ON')
  .then(() => undefined)
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[db] Could not enable secure_delete: ${msg}`);
  });

// Boot-time readiness probe: confirm the database actually answers a query
// before migrations/serving begin. Tolerates a brief volume-mount delay by
// retrying with a short backoff, and logs clearly so a persistent failure is
// easy to spot in the Railway logs. Throws if the database never becomes ready.
export async function waitForDatabase(retries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.execute('select 1');
      await pragmasApplied;
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= retries) {
        console.error(`[db] Database not reachable after ${retries} attempts: ${msg}`);
        throw err;
      }
      console.error(`[db] Database not ready (attempt ${attempt}/${retries}); retrying in ${delayMs}ms — ${msg}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
