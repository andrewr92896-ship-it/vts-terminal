import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { hashPassword } from './auth/passwords.js';

// Creates the initial Admin user once. Idempotent: if the username already
// exists, it does nothing. The password comes from ADMIN_PASSWORD; if that is
// blank a strong random one is generated and printed a single time (visible in
// the server logs). Called on boot in production and by db:seed in dev.
export async function seedAdmin(): Promise<void> {
  const username = (process.env.ADMIN_USERNAME || 'andrew').toLowerCase();
  const displayName = process.env.ADMIN_DISPLAY_NAME || 'Andrew Vitalis';

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing[0]) {
    console.log(`Admin user "${username}" already exists. Nothing to do.`);
    return;
  }

  const provided = process.env.ADMIN_PASSWORD?.trim();
  const generated = !provided;
  const password = provided || crypto.randomBytes(12).toString('base64url');

  const now = new Date();
  await db.insert(users).values({
    id: crypto.randomUUID(),
    username,
    displayName,
    email: null,
    passwordHash: await hashPassword(password),
    role: 'Admin',
    viewBrokerage: true,
    active: true,
    mustChangePassword: generated,
    createdAt: now,
    updatedAt: now,
  });

  console.log('');
  console.log('  Admin user created.');
  console.log('  ---------------------------------------------');
  console.log(`  Username: ${username}`);
  if (generated) {
    console.log(`  Password: ${password}`);
    console.log('  (Randomly generated — shown once. Save it, then change it after login.)');
  } else {
    console.log('  Password: (from ADMIN_PASSWORD)');
  }
  console.log('  ---------------------------------------------');
  console.log('');
}

// Run directly (npm run db:seed) — but not when imported by the server.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  seedAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
