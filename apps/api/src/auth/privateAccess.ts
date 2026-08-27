import { config } from '../config.js';

// Who may sign in to the private portal.
//
// An entry may be an account ID, a username, or an email address. That is not a
// convenience — it is what stops the allowlist from being a lockout waiting to
// happen.
//
// It matched on ID alone, and an ID belongs to ONE database. A deployment
// pointed at a different database — a restore, a migration, a service rebuilt
// during the public/private split — then holds the same person under a
// different ID, so the allowlist silently stops admitting them. The service
// starts perfectly well and refuses the only person who should be let in, with
// a message that says "Invalid email or password" because the answer is
// deliberately generic. A working terminal nobody can enter, and the fix is
// invisible from both ends.
//
// A username survives that, because it identifies the person rather than the
// row. The set of admitted people is still explicitly enumerated, so this
// restricts exactly as tightly as before — it is the same gate keyed on
// something that does not change when the storage does.
//
// The tradeoff, stated rather than hidden: an ID is immutable, and a username
// or email can be changed by an admin — so those forms trust whoever can rename
// an account. On this deployment that is the same small set of people who can
// already grant roles, which is why it is an acceptable trade. Prefer an ID when
// the database is settled; use a username while it is not.
const entries = new Set(
  (config.PRIVATE_ACCESS_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

/** The parts of an account an allowlist entry may name. */
export interface AdmissibleUser {
  id: string;
  username: string | null;
  email: string | null;
}

export function isPrivateUserAllowed(user: AdmissibleUser): boolean {
  // A development machine with nothing configured admits everybody, as before.
  if (!config.isProd && entries.size === 0) return true;
  for (const value of [user.id, user.username, user.email]) {
    if (value && entries.has(value.trim().toLowerCase())) return true;
  }
  return false;
}

export function privateAdmissionConfigured(): boolean {
  return entries.size > 0;
}
