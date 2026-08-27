// Check a deployment's environment WITHOUT starting it.
//
//     railway run --service <service> npm run preflight
//
// The point is to find out what a deploy would complain about before the deploy
// replaces a container that is currently serving people. A failed BUILD is
// harmless — the old version stays live — but a build that succeeds and then
// exits at startup swaps a healthy container for a dead one, and the site is
// down until somebody notices.
//
// It runs the identical checks `config.ts` runs at boot (same module, so the two
// cannot drift), and it starts nothing: no server, no database connection, no
// migration, no broker call.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { checkEnvironment, formatEnvReport } from './configChecks.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(apiRoot, '.env') });

const report = checkEnvironment(process.env);
const target = process.env.NODE_ENV === 'production' ? 'production' : (process.env.NODE_ENV ?? 'development');

console.log(`Preflight — checking this environment as ${target}.\n`);
for (const line of formatEnvReport(report)) console.log(line);

if (report.ok) {
  console.log(
    report.warnings.length
      ? '\nThis environment would start. The warnings above are worth reading first.'
      : '\nThis environment would start.',
  );
  process.exit(0);
}

console.log('\nThis environment would NOT start. Fix everything listed above in one pass — the server checks them all at once, so a partial fix is another failed start.');
process.exit(1);
