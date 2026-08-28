import { hashPassword, randomTemporaryPassword, validateNewPassword } from './security.js';
import type { PublicStore } from './types.js';

// Admitting somebody to the public terminal.
//
// There is no public sign-up: a visitor asks through the early-access form and
// an operator lets them in. Until this existed nothing could DO that — the
// runbook said to insert a row by hand, and three separate things make a
// hand-written row an account that can never sign in:
//
//   - `password_hash` is `scrypt$<salt>$<digest>`, not a password. A typed one
//     fails `verifyPassword` and the answer is the generic 401, which reads as
//     a wrong password rather than a broken row.
//   - `force_password_change` without an unexpired `temporary_password_expires_at`
//     is refused OUTRIGHT by `login`. So the setting that sounds like the safe
//     one locks the account instead, with the same generic 401.
//   - a password below the terminal's own rule signs in and can then never be
//     CHANGED, because `changePassword` validates the new one against a rule
//     the old one never had to meet.
//
// Each of those is silent, and all three present identically. So this is the one
// way in, and the postgres suite drives an admitted account through the real
// login to prove it is one.

export type Admitted = { id:string; email:string; displayName:string; password:string };

export class AdmitError extends Error {}

// Deliberately NOT forced. A forced change needs a temporary window, and that
// window is fifteen minutes — which is right for a password the terminal itself
// just emailed, and wrong for an invitation somebody reads the next morning.
// Admitting therefore hands over a real password; the person changes it from
// the terminal whenever they like.
export async function admitAccount(store:PublicStore, input:{ email:string; displayName:string; password?:string }):Promise<Admitted> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AdmitError(`"${input.email}" is not an email address.`);
  if (displayName.length === 0) throw new AdmitError('A display name is required.');

  // Named, rather than left to the unique index — a raised constraint error
  // says nothing an operator can act on, and re-running an admit is the most
  // likely thing to happen.
  if (await store.findAccountByEmail(email)) throw new AdmitError(`${email} already has an account.`);

  const password = input.password ?? randomTemporaryPassword();
  if (!validateNewPassword(password)) {
    throw new AdmitError('Use at least 12 characters with upper, lower, and numeric characters — the same rule the terminal enforces when the password is changed.');
  }

  const id = await store.createAccount({ email, displayName, passwordHash: await hashPassword(password) });
  return { id, email, displayName, password };
}
