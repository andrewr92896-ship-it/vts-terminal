import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { config } from '../config.js';
import * as schema from './schema.js';

// Single shared libsql client (local SQLite file). No native build step —
// @libsql/client ships prebuilt binaries.
const client = createClient({ url: config.databaseUrl });

export const db = drizzle(client, { schema });
export { schema, client };
