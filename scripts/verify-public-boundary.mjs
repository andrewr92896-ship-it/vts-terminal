#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const PUBLIC_ROOTS = ['apps/marketing', 'apps/public-terminal'];
const FORBIDDEN = [
  /portal\.vitalistradingsystems\.com/i,
  /apps\/web/i,
  /apps\/api/i,
  /partner[ -]?feed/i,
  /group[ -]?trading/i,
  /copy[ -]?trad/i,
  /mirror[ -]?trad/i,
  /place[ -]?order/i,
  /close[ -]?position/i,
  /private[ -]?signal/i,
  /PRIVATE_[A-Z0-9_]+/,
  /vts_portal_session/i,
  /CREDENTIALS_KEY/,
  /KRAKEN_API_(KEY|SECRET)/,
  /OANDA_(API_TOKEN|ACCOUNT_ID)/,
  /\/api\//,
];
let failures = 0;
const fail = (message) => { failures += 1; console.error(`FAIL ${message}`); };
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const next = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(next) : [next];
});
const scan = (root) => {
  for (const file of walk(root)) {
    if (!/\.(html|css|js|mjs|ts|tsx|json|txt|svg)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      const hit = text.match(pattern);
      if (hit) fail(`${file} contains forbidden public-build identifier ${pattern} near ${JSON.stringify(text.slice(Math.max(0, (hit.index ?? 0) - 80), (hit.index ?? 0) + hit[0].length + 120))}`);
    }
  }
};

for (const script of ['build:marketing', 'build:public']) {
  const run = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
for (const root of PUBLIC_ROOTS) {
  scan(path.join(root, 'src'));
  scan(path.join(root, 'dist'));
}
const marketing = readFileSync('apps/marketing/src/index.html', 'utf8');
if (!marketing.includes('https://app.vitalistradingsystems.com')) {
  fail('marketing login link does not target the public application');
}
if (!existsSync('apps/web/public/robots.txt') ||
    !readFileSync('apps/web/public/robots.txt', 'utf8').includes('Disallow: /')) {
  fail('private portal robots.txt is not deny-all');
}
const authRoutes = readFileSync('apps/api/src/routes/auth.ts', 'utf8');
if (authRoutes.includes("app.post('/api/auth/demo'")) {
  fail('private portal still registers credential-free demo login');
}
const earlyAccess = readFileSync('apps/api/src/routes/earlyAccess.ts', 'utf8');
if (earlyAccess.includes("app.post('/api/early-access'")) {
  fail('private portal still registers public early-access admission');
}
const sessions = readFileSync('apps/api/src/auth/sessions.ts', 'utf8');
if (!sessions.includes('config.PRIVATE_SESSION_COOKIE')) {
  fail('private sessions do not use the private cookie configuration');
}
const server = readFileSync('apps/api/src/server.ts', 'utf8');
if (!server.includes("X-Robots-Tag', 'noindex, nofollow")) {
  fail('private portal does not set X-Robots-Tag');
}
if (failures) process.exit(1);
console.log('Public/private build boundary checks passed.');
