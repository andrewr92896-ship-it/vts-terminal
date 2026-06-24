import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { hashPassword } from './auth/passwords.js';
import { seedConnectionsFromEnv } from './trading/connections.js';
import { DEMO_USERNAME, DEMO_DISPLAY_NAME, DEMO_ROLES, DEMO_SEED_VERSION } from './demo/identity.js';
import { seedDemoData, clearDemoData } from './demo/seedData.js';

// Seed the admin's broker connections from the existing global env keys (so the
// pre-multi-user OANDA/Kraken setup keeps working as "Andrew's Trades").
// Idempotent and best-effort — never blocks startup.
async function trySeedConnections(userId: string): Promise<void> {
  try {
    await seedConnectionsFromEnv(userId);
  } catch (err) {
    console.error('Broker connection seed failed:', err);
  }
}

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
    console.log(`Admin user "${username}" already exists.`);
    await trySeedConnections(existing[0].id);
    return;
  }

  const provided = process.env.ADMIN_PASSWORD?.trim();
  const generated = !provided;
  const password = provided || crypto.randomBytes(12).toString('base64url');

  const now = new Date();
  const adminId = crypto.randomUUID();
  await db.insert(users).values({
    id: adminId,
    username,
    createdUsername: username,
    displayName,
    email: null,
    passwordHash: await hashPassword(password),
    role: 'Admin', // legacy column, unused; kept populated for back-compat
    roles: JSON.stringify(['admin']),
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

  await trySeedConnections(adminId);
}

// Creates the public, read-only demo user and fills every workspace with
// simulated data so a reviewer lands in a portal that looks alive. The account
// holds no password worth guessing (entry is the one-click demo button) and the
// demo guard blocks all writes. The applied seed version is stored in the demo
// user's (otherwise unused) email column; when DEMO_SEED_VERSION changes, the
// data is wiped and re-seeded on boot so tweaks ship on the next deploy.
export async function seedDemo(): Promise<void> {
  const marker = `seed-v${DEMO_SEED_VERSION}`;
  const existing = (
    await db.select().from(users).where(eq(users.username, DEMO_USERNAME)).limit(1)
  )[0];

  let demoId: string;
  if (existing) {
    if (existing.email === marker) {
      console.log(`Demo data is current (${marker}).`);
      return;
    }
    demoId = existing.id;
    console.log(`Refreshing demo data (${existing.email ?? 'unversioned'} -> ${marker}).`);
    await clearDemoData(demoId);
  } else {
    const now = new Date();
    demoId = crypto.randomUUID();
    await db.insert(users).values({
      id: demoId,
      username: DEMO_USERNAME,
      createdUsername: DEMO_USERNAME,
      displayName: DEMO_DISPLAY_NAME,
      email: null,
      // A random, unused password: the demo is entered through the one-click button.
      passwordHash: await hashPassword(crypto.randomBytes(18).toString('base64url')),
      role: 'Viewer', // legacy column
      roles: JSON.stringify([...DEMO_ROLES]),
      viewBrokerage: true, // so balances and the forex pip money show in the demo
      active: true,
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
    });
    console.log('Demo user created.');
  }

  try {
    await seedDemoData(demoId);
    // Stamp the applied version only after a successful seed.
    await db.update(users).set({ email: marker, updatedAt: new Date() }).where(eq(users.id, demoId));
    console.log(`Demo data seeded (${marker}).`);
  } catch (err) {
    console.error('Demo data seed failed:', err);
  }
}

// Run directly (npm run db:seed) — but not when imported by the server.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  seedAdmin()
    .then(() => seedDemo())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
