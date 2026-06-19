import { defineConfig } from 'drizzle-kit';

// Drizzle Kit only needs a path here (it reads the file directly to
// generate migrations). The running server uses the full libsql URL
// from config.ts. Keep them pointing at the same data/vts.db file.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: 'file:./data/vts.db',
  },
});
