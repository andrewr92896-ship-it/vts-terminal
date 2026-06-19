import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './index.js';
import { config } from '../config.js';

// Apply all generated SQL migrations in ./migrations to the database.
// Called on boot in production and by the db:migrate script in development.
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(config.apiRoot, 'migrations');
  await migrate(db, { migrationsFolder });
}

// Run directly (npm run db:migrate) — but not when imported by the server.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
