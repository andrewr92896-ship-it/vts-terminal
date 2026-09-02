// The Site Editor — checked through the real service against a real database.
//
//   DATABASE_URL="file:/tmp/x.db" npm run db:migrate
//   DATABASE_URL="file:/tmp/x.db" npm run db:check-site-editor
//
// Like db:check-sharing this one WRITES, so it refuses any database that
// already holds a user. An empty one is a scratch one.
//
// THE CASE THAT MATTERS MOST IS THE DRAFT NOT LEAKING: editing is half-finished
// by nature, and if the public read served the draft every one of those moments
// would be on vitalistradingsystems.com. The second is that a backup that
// cannot be restored is discovered at the worst possible time, so an export is
// validated on the way out and an import saves nothing. The third is the twenty
// cap: without it the versions table grows forever on a volume of fixed size.
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import {
  KEEP_VERSIONS,
  SiteEditorError,
  buildExport,
  countRows,
  deleteFile,
  getDraft,
  getPublished,
  getSettings,
  getStatus,
  getVersion,
  listFiles,
  listVersions,
  notePoll,
  openFile,
  publicState,
  publish,
  readExport,
  renameFile,
  revertDraft,
  saveDraft,
  saveFile,
  setMaintenance,
  sincePoll,
  slugify,
} from './service.js';
import { MARKETING_SEED } from '../../../marketing/render/seed.mjs';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(name: string) {
  console.log(`\n[${name}]`);
}
async function refused(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof SiteEditorError) return err.message;
    throw err;
  }
}

const S = 'marketing';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function main() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (Number(n) > 0) {
    console.error('Refusing to run: this database already holds users. Point DATABASE_URL at an empty scratch file.');
    process.exit(2);
  }

  section('a fresh install');
  const draft0 = await getDraft(S);
  ok('the editor opens on the seed', JSON.stringify(draft0) === JSON.stringify(MARKETING_SEED));
  const st0 = await getStatus(S);
  ok('and says nothing has been saved or published', st0.seeded && !st0.published && !st0.hasDraft);
  ok('the public read has nothing — not the seed, not an empty page', (await getPublished(S)) === null);
  ok('a site that does not exist is refused', (await refused(() => getDraft('nope'))) !== null);

  section('the draft is not the live site');
  const edited = clone(MARKETING_SEED);
  edited.sections[0].h1 = 'A HALF-FINISHED HEADLINE';
  const st1 = await saveDraft(S, edited);
  ok('a draft saves and reports unpublished changes', st1.hasDraft && st1.dirty && !st1.published);
  ok('and the public read STILL has nothing — the draft never leaks', (await getPublished(S)) === null);
  ok('the editor reopens on the draft', ((await getDraft(S)) as typeof edited).sections[0].h1 === 'A HALF-FINISHED HEADLINE');

  section('validation is the renderer\'s own');
  const broken = clone(MARKETING_SEED) as { sections: unknown[] };
  delete (broken.sections[1] as { items?: unknown }).items;
  ok('a document the page could not draw is refused', (await refused(() => saveDraft(S, broken))) !== null);
  const dup = clone(MARKETING_SEED);
  dup.sections[1].id = 'hero';
  ok('and a repeated section id is refused by name', /repeats/.test((await refused(() => saveDraft(S, dup))) ?? ''));
  ok('nothing about the draft changed by being refused', ((await getDraft(S)) as typeof edited).sections[0].h1 === 'A HALF-FINISHED HEADLINE');

  section('publish');
  ok('revert with nothing published is refused', (await refused(() => revertDraft(S))) !== null);
  const st2 = await publish(S);
  ok('publishing makes it live', st2.published && !st2.dirty);
  const live = await getPublished(S);
  ok('and the public read serves it', (live?.model as typeof edited).sections[0].h1 === 'A HALF-FINISHED HEADLINE');
  ok('with a publish stamp', typeof live?.publishedAt === 'string');
  const again = clone(edited);
  again.sections[0].h1 = 'EDITED AFTER PUBLISHING';
  await saveDraft(S, again);
  ok('editing on continues after publishing', (await getStatus(S)).dirty);
  ok('and the public keeps the published one', ((await getPublished(S))?.model as typeof edited).sections[0].h1 === 'A HALF-FINISHED HEADLINE');
  await revertDraft(S);
  ok('revert brings the draft back to what is live', ((await getDraft(S)) as typeof edited).sections[0].h1 === 'A HALF-FINISHED HEADLINE');

  section('the last twenty saves');
  let versions = await listVersions(S);
  ok('saving records a version', versions.length >= 2, `${versions.length}`);
  ok('the one that was deployed is marked', versions.some((v) => v.deployed));
  ok('newest first', versions.map((v) => v.id).join() === [...versions.map((v) => v.id)].sort().reverse().join());
  const whole = await getVersion(S, versions[0].id);
  ok('a version reads back whole', whole !== null && (whole!.model as { sections: unknown[] }).sections.length > 0);
  ok('an id that is not an id gets nothing', (await getVersion(S, '../../etc/passwd')) === null);
  for (let i = 0; i < 24; i++) {
    const m = clone(MARKETING_SEED);
    m.sections[0].h1 = `version ${i}`;
    await saveDraft(S, m);
  }
  versions = await listVersions(S);
  ok(`never more than ${KEEP_VERSIONS} are kept`, versions.length === KEEP_VERSIONS, `${versions.length}`);
  ok('and the table agrees', (await countRows(S)).versions === KEEP_VERSIONS);

  section('files');
  const saved = await saveFile(S, 'Head Shot.PNG', PNG);
  ok('an upload lands under a slug', saved.file.slug === 'head-shot.png' && !saved.replaced, saved.file.slug);
  ok('keeping its typed name', saved.file.name === 'Head Shot.PNG');
  const opened = await openFile(S, 'head-shot.png');
  ok('and reads back as the same bytes', opened !== null && opened!.data.length === saved.file.size && opened!.type === 'image/png');
  ok('a second upload with the same name replaces, not duplicates', (await saveFile(S, 'head-shot.png', PNG)).replaced && (await listFiles(S)).length === 1);
  ok('a type the site must not host is refused', /not accepted/.test((await refused(() => saveFile(S, 'page.html', PNG))) ?? ''));
  ok('and so is an empty upload', (await refused(() => saveFile(S, 'x.png', 'data:image/png;base64,'))) !== null);
  ok('a slug cannot be a path', slugify('../../etc/passwd') === 'passwd' && (await openFile(S, '../head-shot.png')) === null);
  ok('accents fold, spaces become dashes', slugify('Résumé 2026.pdf') === 'resume-2026.pdf', slugify('Résumé 2026.pdf'));
  const renamed = await renameFile(S, 'head-shot.png', 'Andrew, 2026');
  ok('renaming changes the name and never the slug', renamed.slug === 'head-shot.png' && renamed.name === 'Andrew, 2026');
  ok('renaming a file that is not there is refused', (await refused(() => renameFile(S, 'nope.png', 'x'))) !== null);

  section('export and import');
  const withFiles = clone(MARKETING_SEED);
  withFiles.sections[1].items.push({ kind: 'image', imgSrc: '/files/head-shot.png' }, { kind: 'image', imgSrc: '/files/nowhere.png' });
  const doc = await buildExport(S, withFiles);
  ok('an export is stamped with its format and site', doc.format === 'vts-site' && doc.site === S);
  ok('it names every file the model points at', doc.files.join() === 'head-shot.png,nowhere.png', doc.files.join());
  ok('and which were already missing', doc.missingAtExport.join() === 'nowhere.png');
  ok('a model that would not render is refused rather than written', (await refused(() => buildExport(S, broken))) !== null);
  const before = JSON.stringify(await getDraft(S));
  const read = await readExport(S, doc);
  ok('an export reads back as the same model', JSON.stringify(read.model) === JSON.stringify(withFiles));
  ok('and names the uploads this server does not have', read.missing.join() === 'nowhere.png');
  ok('reading a file changes nothing that was saved', JSON.stringify(await getDraft(S)) === before);
  ok('a file from something else is refused by name', /not a site export/.test((await refused(() => readExport(S, { format: 'other', model: withFiles }))) ?? ''));
  ok('a bare model with no envelope is accepted', (await readExport(S, MARKETING_SEED)).sections === MARKETING_SEED.sections.length);
  ok('anything that is not a document is not', (await refused(() => readExport(S, 'nope'))) !== null);

  section('down for maintenance');
  const st0m = await getSettings(S);
  ok('starts off, with the site never having asked', !st0m.maintenance && st0m.sincePoll === null);
  ok('the public state reads off', (await publicState(S))?.maintenance === false);
  ok('and an unknown site reads nothing', (await publicState('nope')) === null);
  const on = await setMaintenance(S, true);
  ok('turning it on is recorded with a time', on.maintenance && typeof on.updatedAt === 'string');
  ok('and the public state reads on', (await publicState(S))?.maintenance === true);
  ok('the documents are untouched by it', JSON.stringify(await getDraft(S)) === before && (await getPublished(S)) !== null);
  notePoll(S);
  ok('a poll stamps the check-in', (sincePoll(S) ?? 1e9) < 1000);
  const off = await setMaintenance(S, false);
  ok('turning it off puts it back', !off.maintenance && (await publicState(S))?.maintenance === false);

  await deleteFile(S, 'head-shot.png');
  ok('a deleted file is gone', (await listFiles(S)).length === 0 && (await openFile(S, 'head-shot.png')) === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
