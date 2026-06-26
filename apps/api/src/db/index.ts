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

// Boot-time readiness probe: confirm the database actually answers a query
// before migrations/serving begin. Tolerates a brief volume-mount delay by
// retrying with a short backoff, and logs clearly so a persistent failure is
// easy to spot in the Railway logs. Throws if the database never becomes ready.
export async function waitForDatabase(retries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.execute('select 1');
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
