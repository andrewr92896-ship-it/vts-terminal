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
      if (pattern.test(text)) fail(`${file} contains forbidden public-build identifier ${pattern}`);
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
if (failures) process.exit(1);
console.log('Public/private build boundary checks passed.');
