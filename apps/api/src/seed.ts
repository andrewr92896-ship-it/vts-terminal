import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { tradingTeams, users } from './db/schema.js';
import { hashPassword } from './auth/passwords.js';
import { parseRoles } from './auth/rbac.js';
import { seedConnectionsFromEnv } from './trading/connections.js';
import { seedBadges } from './badges/service.js';
import {
  DEMO_USERNAME,
  DEMO_DISPLAY_NAME,
  DEMO_ROLES,
  DEMO_SEED_VERSION,
  DEMO_TEAM_ID,
  DEMO_TEAM_NAME,
} from './demo/identity.js';
import { seedDemoData, clearDemoData } from './demo/seedData.js';

// Ensure the demo's own team exists so its sample study game and leaderboard
// stay isolated from the owner's team. Idempotent.
async function ensureDemoTeam(): Promise<void> {
  const existing = (
    await db.select({ id: tradingTeams.id }).from(tradingTeams).where(eq(tradingTeams.id, DEMO_TEAM_ID)).limit(1)
  )[0];
  if (!existing) {
    const now = new Date();
    await db.insert(tradingTeams).values({ id: DEMO_TEAM_ID, name: DEMO_TEAM_NAME, createdAt: now, updatedAt: now });
  }
}

// Default email domain used to backfill sign-in emails for accounts that
// predate email login. Override with APP_EMAIL_DOMAIN. Sign-in is by email, so
// every real account needs one; admins can edit these to real addresses later.
const EMAIL_DOMAIN = (process.env.APP_EMAIL_DOMAIN || 'vitalistradingsystems.com')
  .trim()
  .toLowerCase();

function defaultEmailFor(username: string): string {
  return `${username}@${EMAIL_DOMAIN}`;
}

// Backfill a sign-in email for every real account that lacks one, so nobody is
// locked out when login switches from username to email. The demo account is
// skipped — its email column stores an internal seed-version marker, not a real
// address. Idempotent: accounts that already have an email are left untouched.
export async function backfillEmails(): Promise<void> {
  const rows = await db.select().from(users);
  let filled = 0;
  for (const u of rows) {
    if (u.username === DEMO_USERNAME) continue;
    if (u.email && u.email.trim()) continue;
    await db
      .update(users)
      .set({ email: defaultEmailFor(u.username), updatedAt: new Date() })
      .where(eq(users.id, u.id));
    filled += 1;
  }
  if (filled > 0) console.log(`Backfilled sign-in email for ${filled} account(s).`);
}

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
  const email = (process.env.ADMIN_EMAIL || defaultEmailFor(username)).trim().toLowerCase();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing[0]) {
    console.log(`Admin user "${username}" already exists.`);
    // Promote the owner to founder if they aren't already founder-level. This
    // covers the migration from the old admin-only model: the seeded owner
    // account becomes the portal's founder on the next boot, idempotently.
    const roles = parseRoles(existing[0]);
    if (!roles.includes('founder') && !roles.includes('software_developer')) {
      const nextRoles = [...new Set([...roles.filter((r) => r !== 'admin'), 'founder'])];
      await db
        .update(users)
        .set({ roles: JSON.stringify(nextRoles), updatedAt: new Date() })
        .where(eq(users.id, existing[0].id));
      console.log(`Promoted owner "${username}" to Founder.`);
    }
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
    email,
    passwordHash: await hashPassword(password),
    role: 'Admin', // legacy column, unused; kept populated for back-compat
    // The seeded owner is the portal's founder (top of the role ladder).
    roles: JSON.stringify(['founder']),
    viewBrokerage: true,
    active: true,
    mustChangePassword: generated,
    createdAt: now,
    updatedAt: now,
  });

  console.log('');
  console.log('  Admin user created.');
  console.log('  ---------------------------------------------');
  console.log(`  Sign in with email: ${email}`);
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
// Make sure the public demo *account* exists and is usable: present, active,
// no forced password change, and able to see brokerage figures. Cheap and
// idempotent — safe to call on boot and lazily from the demo-login route, so
// the demo never goes dark just because the row was deactivated or never got
// seeded. Returns the demo user's id and whether it was just created. Demo
// *data* (alerts, portfolios, etc.) is handled separately by seedDemo().
export async function ensureDemoAccount(): Promise<{ id: string; created: boolean }> {
  await ensureDemoTeam();
  const existing = (
    await db.select().from(users).where(eq(users.username, DEMO_USERNAME)).limit(1)
  )[0];

  if (existing) {
    // Repair anything that would make the one-click demo unreachable, but only
    // write when something is actually off so a healthy demo is left untouched.
    // The demo's team is pinned to its own team so the default-team seeding never
    // adopts it into the owner's Vitalis team.
    if (
      !existing.active ||
      existing.mustChangePassword ||
      !existing.viewBrokerage ||
      existing.teamId !== DEMO_TEAM_ID
    ) {
      await db
        .update(users)
        .set({ active: true, mustChangePassword: false, viewBrokerage: true, teamId: DEMO_TEAM_ID, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      console.log('Demo account repaired (reactivated / unlocked / team pinned).');
    }
    return { id: existing.id, created: false };
  }

  const now = new Date();
  const demoId = crypto.randomUUID();
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
    teamId: DEMO_TEAM_ID, // its own team, isolated from the owner's Vitalis team
    viewBrokerage: true, // so balances and the forex pip money show in the demo
    active: true,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
  });
  console.log('Demo user created.');
  return { id: demoId, created: true };
}

export async function seedDemo(): Promise<void> {
  const marker = `seed-v${DEMO_SEED_VERSION}`;
  // Always make sure the account itself is present and active first, even when
  // the data is already current — an inactive demo must never be left as-is.
  const { id: demoId, created } = await ensureDemoAccount();

  if (!created) {
    const current = (await db.select().from(users).where(eq(users.id, demoId)).limit(1))[0];
    if (current?.email === marker) {
      console.log(`Demo data is current (${marker}).`);
      return;
    }
    console.log(`Refreshing demo data (${current?.email ?? 'unversioned'} -> ${marker}).`);
    await clearDemoData(demoId);
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
    .then(() => backfillEmails())
    .then(() => seedDemo())
    .then(() => seedBadges())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
