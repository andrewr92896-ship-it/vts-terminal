#!/usr/bin/env node
// THE CLICKWRAP'S HASHES ARE THE HASHES OF THE DEPLOYED DOCUMENTS.
//
// `apps/public-api/src/legalDocuments.ts` holds, per document, a version and a
// SHA-256. The document TEXT lives in the public terminal's bundle
// (`apps/public-terminal/src/adapters/publicLegal.ts`) — a different deployment,
// which the API may not import from. Nothing in either build would notice the
// two drifting: each typechecks and renders perfectly well against its own copy.
//
// What drift would mean is the one thing this feature must never do. A stored
// acceptance row says "this account agreed to terms v2026-08-28.1, whose text
// hashes to 8fae…". If a word of the document changes and the hash does not,
// that row now points at text nobody was ever shown, and the record — the only
// reason to have a clickwrap at all — is worthless.
//
// SO A CHANGED DOCUMENT FAILS HERE, and the fix is deliberately not "update the
// hash". It is: bump the version AND update the hash, which re-prompts every
// account, because people who agreed to the old wording have not agreed to the
// new one.
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const SOURCE = 'apps/public-terminal/src/adapters/publicLegal.ts';
const REGISTRY = 'apps/public-api/src/legalDocuments.ts';

// Both files are TypeScript carrying type annotations only, so stripping the
// types is enough to import them. Loaded from data: URLs rather than written to
// disk, so this leaves nothing behind and needs no scratch directory — and,
// more usefully, needs nothing BUILT, so it can run early and fail fast rather
// than after a full build.
const load = async (file) => import(`data:text/javascript;base64,${Buffer.from(
  transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm' }).code,
).toString('base64')}`);

const { REQUIRED_DOCUMENTS, canonicalLegalText, sha256Hex } = await load(REGISTRY);
const documents = await load(SOURCE);

const failures = [];
for (const [id, doc] of [['terms', documents.TERMS], ['privacy', documents.PRIVACY]]) {
  const entry = REQUIRED_DOCUMENTS.find((d) => d.id === id);
  if (!entry) { failures.push(`  ${id} is rendered by the terminal but is not in the required set in ${REGISTRY}.`); continue; }
  const actual = sha256Hex(canonicalLegalText(doc));
  if (actual !== entry.sha256) {
    failures.push(
      `  ${id} has changed since it was pinned.\n` +
      `    ${REGISTRY} holds version ${entry.version}, sha256 ${entry.sha256}\n` +
      `    ${SOURCE} now hashes to             ${actual}\n` +
      '    Fix: bump that document\'s version AND set this hash. Updating only the\n' +
      '    hash would leave every stored acceptance pointing at text nobody saw.',
    );
  }
  // The version and the effective date are shown to the person ticking the box,
  // and the document header shows them too. Two answers to "which version is
  // this" is how a record comes to name a version the reader never saw.
  if (documents.LEGAL_VERSION !== entry.version) {
    failures.push(`  ${id}: the terminal shows v${documents.LEGAL_VERSION} and the record would store v${entry.version}.`);
  }
  if (documents.LEGAL_EFFECTIVE_DATE !== entry.effectiveDate) {
    failures.push(`  ${id}: the terminal shows "${documents.LEGAL_EFFECTIVE_DATE}" and the record holds "${entry.effectiveDate}".`);
  }
}

// A required document with no text behind it would gate every account forever
// with nothing to read.
for (const entry of REQUIRED_DOCUMENTS) {
  if (entry.id !== 'acknowledgement' && !documents[entry.id.toUpperCase()]) {
    failures.push(`  ${entry.id} is required but ${SOURCE} exports no document for it.`);
  }
}

if (failures.length) {
  console.error(`FAIL the clickwrap's pinned hashes do not match the deployed documents:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Legal document hashes match (${REQUIRED_DOCUMENTS.length} required, ${REQUIRED_DOCUMENTS.length - 1} pinned against the terminal's text).`);
