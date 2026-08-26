import { assertNormalServerBoundary } from './runtimeBoundary.js';

// This assertion must remain before the dynamic import. It prevents rehearsal
// mode from importing config, opening a database, registering mail/broker code,
// or constructing the HTTP server.
try {
  assertNormalServerBoundary();
  const { main } = await import('./server.js');
  await main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[startup] ' + message);
  process.exit(2);
}
