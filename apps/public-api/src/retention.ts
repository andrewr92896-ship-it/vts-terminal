import type { PublicStore, RetentionSweep } from './types.js';

// THE RETENTION SWEEP — deleting what is past its keep-by date.
//
// This exists because the Privacy Policy makes a promise in the present tense.
// A sentence saying beta-access requests are removed after six months is a
// FEATURE, not a wording choice: until something deletes them, the document is
// aspirational, which is the one failure mode a privacy policy must not have.
// So the rules live here, in one readable place, and the store executes them.
//
// Two different kinds of rule, kept apart on purpose:
//
//   - THE BETA-ACCESS CUTOFF is a commitment to a person who is not a customer.
//     They typed an email address into a form and got nothing back but a
//     promise; the address is the only thing VTS holds about them, and holding
//     it forever because nobody wrote a delete is exactly the thing the form's
//     own notice says does not happen.
//
//   - THE SPENT-AUTHENTICATION CUTOFF is hygiene. An expired session, a used
//     sign-in code, a rotated trusted device and a spent deletion link are all
//     rows that can no longer do anything: every one of those is already
//     refused by `auth.ts` on its expiry or its consumed stamp, so removing
//     them changes no answer the terminal gives. What it changes is how much
//     dead material a database copy contains.
//
// A row is swept when it is EXPIRED or SPENT, and never merely because it is
// old — a trusted device is deliberately valid for thirty days and a session
// for twelve hours, and the sweep must not be a second, shorter opinion about
// either. There is no grace period, because there is nothing to be gentle
// about: a request that already read a row is unaffected by the row going, and
// one that reads it afterwards gets the same refusal it would have got anyway.
export const RETENTION = {
  // Six months from the most recent submission. A repeat submission upserts and
  // restamps `created_at`, so somebody who asks again in month five is asking
  // again rather than running out.
  betaAccessMs: 180 * 24 * 60 * 60_000,

  // A rate-limit window is at most an hour anywhere in the service, and the
  // next request through that bucket resets a stale one regardless — so a row
  // untouched for a day is doing nothing but describing somebody's address as
  // a keyed hash. Deliberately far longer than the longest window rather than
  // exactly it, so this cutoff can never shorten a limit somebody is inside.
  rateLimitMs: 24 * 60 * 60_000,
} as const;

// Six hours. The cutoffs here are measured in days, so nothing is gained by
// sweeping often, and a job that deletes rows is one to run rarely and log
// loudly rather than constantly and quietly.
export const SWEEP_INTERVAL_MS = 6 * 60 * 60_000;

export type SweepHandle = { stop():void };

// STARTED WHENEVER THE SERVER IS, NOT ONLY IN PRODUCTION.
//
// The private API gates its watches on production because they send
// notifications and spend money at a provider. This one deletes rows, which is
// exactly the kind of code that must not have its first ever execution be
// against real customer data. Gating it would mean the delete path is proved
// nowhere and then runs, unattended, on the one database that matters.
//
// It runs once on start and then on the interval, and the timer is unref'd so
// it can never be the reason a process refuses to exit.
export function startRetentionSweep(
  store: Pick<PublicStore, 'sweepExpired'>,
  options: { intervalMs?: number; now?: () => number; log?: (line: string) => void } = {},
): SweepHandle {
  const intervalMs = options.intervalMs ?? SWEEP_INTERVAL_MS;
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? ((line: string) => console.log(line));

  const pass = async () => {
    try {
      const swept = await store.sweepExpired(now());
      log(JSON.stringify({ event: 'public_api.retention_swept', ...swept }));
    } catch (error) {
      // A failed sweep must never take the service down with it: the terminal
      // works perfectly well with a day of dead rows in it, and the next pass
      // clears them. It is logged rather than swallowed so a sweep that has
      // been failing for a month is findable.
      log(JSON.stringify({ event: 'public_api.retention_failed', message: error instanceof Error ? error.message : 'unknown' }));
    }
  };

  void pass();
  const timer = setInterval(() => { void pass(); }, intervalMs);
  timer.unref?.();
  return { stop() { clearInterval(timer); } };
}
