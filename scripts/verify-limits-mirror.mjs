#!/usr/bin/env node
// The IRS contribution limits exist TWICE and must stay identical.
//
// `apps/api/src/investments/limits.ts` is the original; the public API is its
// own service and may not import from the private one, so
// `apps/public-api/src/investmentLimits.ts` carries a copy. Nothing else in
// either build would notice them diverging — each typechecks and renders
// perfectly well against its own figures.
//
// That is the one number in this workspace where being wrong has a real cost:
// somebody can over-contribute on the strength of a stale limit, and it would
// look right on whichever screen they were reading. So the two are compared
// line for line below their headers.
//
// The public file's header additionally declares the account-kind type the
// private one imports from the schema, which is why the comparison starts at a
// marker rather than at line 1.
import { readFileSync } from 'node:fs';

const PRIVATE = 'apps/api/src/investments/limits.ts';
const PUBLIC = 'apps/public-api/src/investmentLimits.ts';
const MARKER = '// ---- mirrored from apps/api/src/investments/limits.ts';

// The private file's first line is the import the public copy replaces.
const original = readFileSync(PRIVATE, 'utf8').split('\n').slice(1);
const copyText = readFileSync(PUBLIC, 'utf8');
const at = copyText.indexOf(MARKER);
if (at === -1) {
  console.error(`FAIL ${PUBLIC} has lost its "mirrored from" marker, so nothing can be compared.`);
  process.exit(1);
}
const copy = copyText.slice(at).split('\n').slice(1);

const differences = [];
for (let line = 0; line < Math.max(original.length, copy.length); line += 1) {
  if (original[line] !== copy[line]) {
    differences.push(`  line ${line + 2} of ${PRIVATE}\n    private: ${original[line] ?? '(missing)'}\n    public:  ${copy[line] ?? '(missing)'}`);
    if (differences.length >= 5) break;
  }
}

if (differences.length > 0) {
  console.error('FAIL the contribution limits have drifted between the two services:\n');
  console.error(differences.join('\n'));
  console.error(`\nEdit ${PRIVATE}, then copy it below the marker in ${PUBLIC}.`);
  process.exit(1);
}
console.log(`Limits mirror: ${original.length} lines identical in both services.`);
