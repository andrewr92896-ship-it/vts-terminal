// WHICH credential Pushover refused, read from its own reply.
//
// Its own module, with no imports, because what hangs off this decision is
// DESTRUCTIVE: a refusal classified as the trader's key being bad deletes that
// key from the database. Pushover answers 4xx for a bad application token and a
// bad user key alike, and reading every 4xx as the latter put a correct setup
// into a loop — paste the key, press test, watch the terminal throw it away,
// paste it again — while the screen said to check the key that was never the
// problem. Kept import-free so `verify:pushover` can check it without a config,
// a database or a network, the same way `sizing.ts` and `rolloverMath.ts` are.

export type RefusalStatus = 'invalid-user' | 'invalid-app' | 'error';

export function classifyRefusal(body: unknown): { status: RefusalStatus; detail: string } {
  const json = (body ?? {}) as { user?: unknown; token?: unknown; errors?: unknown };
  const detail = Array.isArray(json.errors) ? json.errors.map(String).join('; ') : '';
  // THE TOKEN IS READ FIRST. A request carrying a bad token never had a chance
  // of being accepted, so it says nothing whatever about the key it carried;
  // reading it the other way round would delete a correct key on the strength
  // of a request that could not have succeeded with any key in it.
  if (json.token === 'invalid') return { status: 'invalid-app', detail };
  if (json.user === 'invalid') return { status: 'invalid-user', detail };
  // Anything else — an unparseable body, a rate limit, a shape we do not know —
  // is an error, deliberately NOT 'invalid-user'. This is the default, and it is
  // what keeps the destructive path unreachable by accident.
  return { status: 'error', detail };
}
