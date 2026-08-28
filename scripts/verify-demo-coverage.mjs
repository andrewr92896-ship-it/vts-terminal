#!/usr/bin/env node
// Every api.* call a PUBLIC screen can reach must be answered by something.
//
// This exists because the failure it catches is silent. An unrecognised method
// name falls through to an empty-but-generic payload, so a screen doing
//
//     const { portfolio } = await api.createInvestmentAccount(...)
//
// destructures `undefined` and renders nothing — no error, no stack trace, just
// a workspace that goes blank the moment a visitor presses the first button they
// see. The whole Investments workspace shipped that way, and neither a typecheck
// nor the screenshot test could see it: a capture asserts a page rendered, not
// that pressing "add" on it did anything.
//
// So: walk the public screen tree, collect every api call it can reach, and
// require each one to be accounted for — served live, served by the demo,
// refused as AI, or NAMED BELOW with a reason. The named list is the point. A
// gap that somebody decided to leave is fine; a gap nobody knows about is not.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

// The public app's own entry points. Everything reachable from these is in play.
const ROOTS = [
  'apps/web/src/public/PublicScreens.tsx',
  'apps/web/src/public/PublicApp.tsx',
  'apps/web/src/public/PublicLiveWall.tsx',
  'apps/web/src/public/PublicTopBar.tsx',
  'apps/web/src/public/PublicSidebar.tsx',
  'apps/web/src/public/PublicAccountPages.tsx',
  'apps/web/src/public/PublicPredictions.tsx',
];

// Modules the public build REPLACES at the seam (vite.public.config.ts). The
// portal's versions are walked by this script but never shipped, so the calls
// inside them are the adapter's business, not the proxy's.
const REPLACED = [/\/auth\/AuthContext\.tsx$/, /\/api\/client\.ts$/];

// Gaps somebody decided to leave, each with the reason. Anything not here and
// not answered fails this check.
const ACCEPTED = {
  // The Study package, sharing and public-library half. Sharing by username and
  // a moderated library both mean one public account's content reaching
  // another's screen, plus an attestation and a review queue with no admin
  // surface on the public side. A product decision, not a port — so these stay
  // unbuilt until it is made.
  packages: [
    'listStudyPackages', 'getStudyPackage', 'updateStudyPackage', 'archiveStudyPackage',
    'unarchiveStudyPackage', 'withdrawStudyPackage', 'createManualStudyPackage',
    'commitStudyPackage', 'validateStudyPackage', 'addToStudyPackage',
    'sharedStudyPackages', 'shareStudyPackage', 'revokeStudyPackageShare',
    'listStudyPackageShares', 'respondToStudyShare', 'browseStudyLibrary',
    'addStudyLibraryPackage', 'removeStudyLibraryPackage', 'submitStudyPackage',
    'studyPackageSubmissions', 'studyLibraryAttestations', 'withdrawStudyPackageFromLibrary',
  ],
  // Broker-backed, and the public terminal has no broker connections at all.
  // These are reachable only from controls that a public account cannot use.
  brokers: ['syncTraderCapital', 'updateTraderCapital', 'liveWall'],
  // Team channels: adding one is a Max feature over a team-scoped list, and the
  // public terminal has no teams. The rail marks them rather than hiding them.
  streams: ['addMarketNewsChannel', 'updateMarketNewsChannel', 'removeMarketNewsChannel', 'saveMarketNewsStreams'],
  // Administration. A public visitor cannot reach the control that calls these.
  admin: ['addAnnouncement', 'removeAnnouncement', 'bugReports', 'replyToBugReport', 'setBugReportStatus'],
  // Editing or restoring a logged trade. The public Trade Log is read-only —
  // there is no broker behind it and no order that could have produced a row.
  trades: ['restoreTrade', 'updateHistoryTrade', 'updateTrade', 'removeTrade', 'restoreDeletedTrade'],
};
const accepted = new Map();
for (const [reason, names] of Object.entries(ACCEPTED)) for (const name of names) accepted.set(name, reason);

const seen = new Set();
const calls = new Map();
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
};
const walk = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  if (REPLACED.some((pattern) => pattern.test(file))) return;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/api\.([a-zA-Z][a-zA-Z0-9]*)\s*\(/g)) {
    if (!calls.has(match[1])) calls.set(match[1], path.relative('apps/web/src', file));
  }
  for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const next = resolve(file, match[1]);
    if (next) walk(next);
  }
};
for (const root of ROOTS) walk(root);

const adapter = readFileSync('apps/public-terminal/src/adapters/publicApi.ts', 'utf8');
const liveStart = adapter.indexOf('const liveRecords');
const live = new Set([...adapter.slice(liveStart).matchAll(/^  ([a-zA-Z]+):/gm)].map((m) => m[1]));
const base = new Set([...adapter.slice(0, liveStart).matchAll(/^  async ([a-zA-Z]+)\(/gm)].map((m) => m[1]));
// The proxy's own AI refusal, read from the file so the two cannot drift.
const aiGuard = adapter.match(/if\(\/\((?<words>[^/]+)\)\/i\.test\(key\)/);
const aiWords = aiGuard ? new RegExp(`(${aiGuard.groups.words})`, 'i') : /$^/;
const aiNamed = new Set([...adapter.matchAll(/key==='([a-zA-Z]+)'/g)].map((m) => m[1]));

// The demo answers a name if it is a key of `reads` or of the write handlers.
// Shorthand entries (`tradeLog,`) count too, which is why this is not a plain
// `name:` match — missing those was how this script first reported false gaps.
const demoText = readFileSync('apps/public-terminal/src/demo/demoStore.ts', 'utf8');
const demoBlock = demoText.slice(demoText.indexOf('const reads'));
const demoNames = new Set([
  ...[...demoText.matchAll(/^  ([a-zA-Z]+)\s*:/gm)].map((m) => m[1]),
  ...[...demoBlock.matchAll(/^  ([a-zA-Z]+),/gm)].map((m) => m[1]),
]);

const gaps = [];
for (const [name, file] of [...calls.entries()].sort()) {
  if (aiWords.test(name) || /^ai/i.test(name) || aiNamed.has(name)) continue;
  if (live.has(name) || base.has(name) || demoNames.has(name) || accepted.has(name)) continue;
  gaps.push([name, file]);
}

if (gaps.length > 0) {
  console.error('FAIL a public screen calls something nothing answers:\n');
  for (const [name, file] of gaps) console.error(`  api.${name}  —  ${file}`);
  console.error('\nAnswer it in publicApi.ts (live) or demoStore.ts (demo), or add it to');
  console.error('ACCEPTED in this file with the reason it is deliberately unbuilt.');
  process.exit(1);
}
console.log(`Demo coverage: ${calls.size} reachable api calls, all accounted for (${accepted.size} deliberately unbuilt).`);
