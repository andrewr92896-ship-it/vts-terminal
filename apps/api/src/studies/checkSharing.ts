// Sharing, the public library, and package leaderboards — checked through the
// real services against a real database.
//
//   DATABASE_URL="file:/tmp/x.db" npm run db:migrate
//   DATABASE_URL="file:/tmp/x.db" npm run db:check-sharing
//
// Unlike `verify:study-packages`, which is offline and safe anywhere, this one
// WRITES: it creates four accounts and a package. So it refuses to run against
// any database that already holds a user — an empty one is a scratch one, and
// a real deployment always has accounts in it. Do not weaken that guard; the
// most expensive mistake available in this repo is a script that turns out to
// have been pointed at the live database.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  studyDeckGame,
  studyDecks,
  studyPackageAdds,
  studyPackages,
  users,
} from '../db/schema.js';
import { commitPackage } from './packageImport.js';
import {
  canEditPackage,
  canReadPackage,
  packageAudience,
  packageRights,
  readablePackageIds,
  type PackageViewer,
} from './packageAccess.js';
import {
  findRecipient,
  listSharedWithMe,
  listSharesFor,
  respondToShare,
  revokeShare,
  sharePackage,
} from './packageSharing.js';
import {
  addToLibrary,
  listPublished,
  listSubmissions,
  reviewSubmission,
  submitPackage,
  unpublishPackage,
} from './packageLibrary.js';
import { archivePackage, createPackage, unarchivePackage } from './packageStore.js';
import { listDecks } from './deckStore.js';
import { getPackageLeaderboard } from './deckGame.js';
import { contentScopeId } from '../teams/contentScope.js';

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

async function mkUser(username: string, displayName: string, roles: string[] = ['member'], teamId: string | null = null) {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    username,
    createdUsername: username,
    displayName,
    email: `${username}@example.test`,
    passwordHash: 'x',
    role: 'Viewer',
    roles: JSON.stringify(roles),
    teamId,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id, teamId, roles: JSON.stringify(roles) } satisfies PackageViewer;
}

async function main() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) {
    console.error(
      'Refusing to run: this database already has accounts in it.\n' +
        'This check creates users, so it only runs against an empty scratch database:\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:migrate\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:check-sharing',
    );
    process.exit(1);
  }

  const alice = await mkUser('alice', 'Alice Owner');
  const bob = await mkUser('bob', 'Bob Recipient');
  const carol = await mkUser('carol', 'Carol Stranger');
  const admin = await mkUser('root', 'Root Admin', ['admin']);

  // A package with a study game in it, created the way the wizard creates one.
  const pkg = await commitPackage({
    ownerUserId: alice.id,
    createdBy: alice.id,
    name: 'Series 65 Prep',
    subject: 'Securities',
    description: 'A package to share.',
    audience: null,
    depth: null,
    explanationMode: null,
    categoryWeightMode: null,
    categories: [{ importId: 'c1', name: 'Regulations', weight: 60 }],
    questions: [
      {
        categoryImportId: 'c1',
        stem: 'What does the Act require?',
        options: [
          { label: 'A', text: 'One' },
          { label: 'B', text: 'Two' },
          { label: 'C', text: 'Three' },
          { label: 'D', text: 'Four' },
        ],
        answer: 'A',
        explanation: null,
      },
    ],
    flashcards: [],
    presentation: null,
    lessons: [],
    source: 'package_import',
  });
  const deckId = (await db.select({ id: studyDecks.id }).from(studyDecks).where(eq(studyDecks.packageId, pkg.id)))[0]!.id;

  // A LEGACY game, group-scoped, to prove nothing here disturbs it.
  const legacyDeckId = randomUUID();
  await db.insert(studyDecks).values({
    id: legacyDeckId,
    teamId: contentScopeId(alice),
    name: 'Legacy game',
    source: 'upload',
    isSample: false,
    categories: '[]',
    createdBy: alice.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  section('resolving a recipient by username');
  ok('a real username resolves', (await findRecipient('bob'))?.id === bob.id);
  ok('the display name resolves too', (await findRecipient('Bob Recipient'))?.id === bob.id);
  ok('case and padding do not matter', (await findRecipient('  BOB '))?.id === bob.id);
  ok('a nonexistent user resolves to nobody', (await findRecipient('nobody-here')) === null);
  const resolved = await findRecipient('bob');
  ok(
    'only the display name and username come back — no email, no roles',
    !!resolved && Object.keys(resolved).sort().join(',') === 'displayName,id,username',
    resolved ? Object.keys(resolved).join(',') : 'null',
  );

  section('sharing with a nonexistent user is refused');
  let refused = false;
  await sharePackage({ packageId: pkg.id, ownerUserId: alice.id, handle: 'ghost' }).catch(() => {
    refused = true;
  });
  ok('a typo creates nothing and says so', refused);
  ok('no share row was written', (await listSharesFor(pkg.id)).length === 0);

  section('sharing with yourself is refused');
  let selfRefused = false;
  await sharePackage({ packageId: pkg.id, ownerUserId: alice.id, handle: 'alice' }).catch(() => {
    selfRefused = true;
  });
  ok('you already own it', selfRefused);

  section('direct sharing by username');
  const first = await sharePackage({ packageId: pkg.id, ownerUserId: alice.id, handle: 'bob' });
  ok('the offer is created', first.share.status === 'pending' && !first.alreadyShared);
  ok('it names the recipient', first.share.personUsername === 'bob');
  ok('the package reads as shared', (await pkgRow(pkg.id)).visibility === 'shared');

  section('duplicate shares are idempotent');
  const again = await sharePackage({ packageId: pkg.id, ownerUserId: alice.id, handle: 'bob' });
  ok('the second share says so rather than stacking', again.alreadyShared);
  ok('there is still exactly one share row', (await listSharesFor(pkg.id)).length === 1);
  ok('and it is the same one', again.share.id === first.share.id);

  section('a pending share is an offer, not access');
  ok('Bob cannot read it yet', !(await canReadPackage(bob, pkg.id)));
  ok('it is not in his library', !(await readablePackageIds(bob)).includes(pkg.id));
  ok('but it is in his Shared with me list', (await listSharedWithMe(bob.id)).pending.length === 1);

  section('an unauthorized user is denied throughout');
  ok('Carol cannot read it', !(await canReadPackage(carol, pkg.id)));
  ok('it is not in her library', !(await readablePackageIds(carol)).includes(pkg.id));
  ok('she sees nothing shared with her', (await listSharedWithMe(carol.id)).pending.length === 0);
  ok(
    'and she cannot answer Bob’s invitation',
    !(await respondToShare(first.share.id, carol.id, true)),
  );
  ok('which left it pending', (await listSharesFor(pkg.id))[0]!.status === 'pending');

  section('accepting a share');
  ok('Bob can answer his own', await respondToShare(first.share.id, bob.id, true));
  ok('now he can read it', await canReadPackage(bob, pkg.id));
  ok('it is in his library', (await readablePackageIds(bob)).includes(pkg.id));
  const bobDecks = await listDecks(contentScopeId(bob), await readablePackageIds(bob));
  ok('and its study game is in his game list', bobDecks.some((d) => d.id === deckId));
  ok('it is the SAME deck, not a copy', bobDecks.filter((d) => d.id === deckId).length === 1);
  ok('the shared list moves it to accepted', (await listSharedWithMe(bob.id)).accepted.length === 1);
  ok('and nothing is left pending', (await listSharedWithMe(bob.id)).pending.length === 0);

  section('progress is the learner’s own');
  await db
    .insert(studyDeckGame)
    .values({ userId: bob.id, deckId, state: JSON.stringify({ totalAttempted: 4, totalCorrect: 3 }), updatedAt: new Date() });
  await db
    .insert(studyDeckGame)
    .values({ userId: alice.id, deckId, state: JSON.stringify({ totalAttempted: 2, totalCorrect: 2 }), updatedAt: new Date() });
  ok('two people study the same deck with separate rows', (await progressRows(deckId)).length === 2);

  section('the leaderboard follows package access');
  let audience = await packageAudience(pkg.id);
  ok('the owner and the accepted recipient are on it', audience.length === 2 && audience.includes(bob.id));
  ok('a stranger is not', !audience.includes(carol.id));
  let board = await getPackageLeaderboard(deckId, alice.id, audience);
  ok('both players are ranked', board.length === 2);
  ok('Alice leads on accuracy', board[0]?.userId === alice.id, board.map((b) => b.userId).join(','));
  // Somebody outside the audience who somehow has a row must not appear.
  await db
    .insert(studyDeckGame)
    .values({ userId: carol.id, deckId, state: JSON.stringify({ totalAttempted: 9, totalCorrect: 9 }), updatedAt: new Date() });
  board = await getPackageLeaderboard(deckId, alice.id, await packageAudience(pkg.id));
  ok('a non-participant is left off even with a perfect score', !board.some((b) => b.userId === carol.id));
  await db.delete(studyDeckGame).where(and(eq(studyDeckGame.userId, carol.id), eq(studyDeckGame.deckId, deckId)));

  section('an archived package disappears from everyone’s active content');
  await archivePackage(pkg.id);
  ok('Bob can no longer read it', !(await canReadPackage(bob, pkg.id)));
  ok('it is out of his library', !(await readablePackageIds(bob)).includes(pkg.id));
  ok('and out of his Shared with me list', (await listSharedWithMe(bob.id)).accepted.length === 0);
  ok(
    'its study game is out of his game list',
    !(await listDecks(contentScopeId(bob), await readablePackageIds(bob))).some((d) => d.id === deckId),
  );
  ok('the share row survives', (await listSharesFor(pkg.id)).length === 1);
  ok('and so does the progress', (await progressRows(deckId)).length === 2);
  let archiveRefused = false;
  await sharePackage({ packageId: pkg.id, ownerUserId: alice.id, handle: 'carol' }).catch(() => {
    archiveRefused = true;
  });
  ok('an archived package cannot be shared', archiveRefused);
  await unarchivePackage(pkg.id);
  ok('restoring puts it straight back', await canReadPackage(bob, pkg.id));
  ok('with the share intact', (await listSharedWithMe(bob.id)).accepted.length === 1);

  section('revoking access');
  ok('the share is removed', await revokeShare(first.share.id, pkg.id));
  ok('Bob cannot read it any more', !(await canReadPackage(bob, pkg.id)));
  ok('it is out of his library', !(await readablePackageIds(bob)).includes(pkg.id));
  ok('and out of his shared list', (await listSharedWithMe(bob.id)).accepted.length === 0);
  ok('HIS PROGRESS IS UNTOUCHED', (await progressRows(deckId)).length === 2);
  ok('the package itself is intact', (await pkgRow(pkg.id)).name === 'Series 65 Prep');
  ok('its study game is intact', (await db.select().from(studyDecks).where(eq(studyDecks.id, deckId))).length === 1);
  ok('and its visibility falls back to private', (await pkgRow(pkg.id)).visibility === 'private');
  ok('he is off the leaderboard', !(await packageAudience(pkg.id)).includes(bob.id));

  section('re-sharing after a decline');
  const second = await sharePackage({ packageId: pkg.id, ownerUserId: alice.id, handle: 'bob' });
  await respondToShare(second.share.id, bob.id, false);
  ok('a declined offer is not access', !(await canReadPackage(bob, pkg.id)));
  ok('and is not listed as waiting', (await listSharedWithMe(bob.id)).pending.length === 0);
  const third = await sharePackage({ packageId: pkg.id, ownerUserId: alice.id, handle: 'bob' });
  ok('the owner can ask again', third.share.status === 'pending' && !third.alreadyShared);
  ok('still one row', (await listSharesFor(pkg.id)).length === 1);
  await respondToShare(third.share.id, bob.id, true);
  ok('and he can accept the second time', await canReadPackage(bob, pkg.id));

  section('submitting is not publishing');
  const sub = await submitPackage({ packageId: pkg.id, userId: alice.id, attested: true });
  ok('the submission is pending', sub.status === 'pending');
  ok('the package reads as submitted', (await pkgRow(pkg.id)).visibility === 'submitted');
  ok('IT IS NOT PUBLIC', (await listPublished(carol.id)).length === 0);
  ok('a stranger still cannot read it', !(await canReadPackage(carol, pkg.id)));
  let doubleSubmit = false;
  await submitPackage({ packageId: pkg.id, userId: alice.id, attested: true }).catch(() => {
    doubleSubmit = true;
  });
  ok('it cannot be submitted twice while waiting', doubleSubmit);
  let unattested = false;
  await submitPackage({ packageId: pkg.id, userId: alice.id, attested: false }).catch(() => {
    unattested = true;
  });
  ok('and not at all without the attestation', unattested);
  ok('the attested version is recorded', !!sub.attestationVersion);
  ok('it is in the admin queue', (await listSubmissions('pending')).some((s) => s.id === sub.id));

  section('an admin asking for changes');
  const changed = await reviewSubmission({
    submissionId: sub.id,
    reviewerId: admin.id,
    decision: 'changes_requested',
    note: 'Add the third category.',
  });
  ok('the decision is recorded', changed?.status === 'changes_requested');
  ok('the note reaches the creator', changed?.adminNote === 'Add the third category.');
  ok('it is NOT public', (await listPublished(carol.id)).length === 0);
  ok('the package is handed back', (await pkgRow(pkg.id)).visibility === 'shared');
  ok('the content is untouched', (await db.select().from(studyDecks).where(eq(studyDecks.id, deckId))).length === 1);
  ok('and the share survived the round trip', await canReadPackage(bob, pkg.id));
  let reReview = false;
  await reviewSubmission({ submissionId: sub.id, reviewerId: admin.id, decision: 'approved' }).catch(() => {
    reReview = true;
  });
  ok('a reviewed submission cannot be reviewed again', reReview);

  section('an admin rejecting');
  const sub2 = await submitPackage({ packageId: pkg.id, userId: alice.id, attested: true });
  const rejected = await reviewSubmission({ submissionId: sub2.id, reviewerId: admin.id, decision: 'rejected' });
  ok('the decision is recorded', rejected?.status === 'rejected');
  ok('it is NOT public', (await listPublished(carol.id)).length === 0);
  ok('the creator keeps their package', (await pkgRow(pkg.id)).name === 'Series 65 Prep');

  section('an admin approving');
  const sub3 = await submitPackage({ packageId: pkg.id, userId: alice.id, attested: true });
  const approved = await reviewSubmission({ submissionId: sub3.id, reviewerId: admin.id, decision: 'approved' });
  ok('the decision is recorded', approved?.status === 'approved');
  ok('the package is public', (await pkgRow(pkg.id)).visibility === 'public');
  ok('it appears in the library', (await listPublished(carol.id)).some((e) => e.packageId === pkg.id));
  ok('a stranger can read it', await canReadPackage(carol, pkg.id));
  ok(
    'the package id is unchanged by publication',
    (await listPublished(carol.id))[0]?.packageId === pkg.id,
  );
  ok(
    'the creator is still named',
    (await listPublished(carol.id))[0]?.ownerName === 'Alice Owner',
  );

  section('published content is frozen, but the owner keeps control');
  const rights = await packageRights(alice, pkg.id);
  ok('the owner cannot edit a published package', !rights.edit && rights.locked);
  ok('but can still manage it', rights.manage);
  const bobRights = await packageRights(bob, pkg.id);
  ok('a reader cannot edit it', bobRights.read && !bobRights.edit);

  section('an approved package cannot be quietly changed afterwards');
  // The frozen-content rule has an obvious way round it if nobody checks:
  // archive the published package (which clears `locked`), edit it, unarchive.
  // Archiving is on the EDIT right, which a published package does not grant, so
  // the first step already refuses and the route is closed. This asserts that
  // rather than trusting it — the whole point of admin review is that what
  // people study is what was read.
  const pubRights = await packageRights(alice, pkg.id);
  ok('a published package is locked', pubRights.locked && !pubRights.edit);
  ok('so the owner cannot archive it either', !(await canEditPackage(alice, pkg.id)));
  ok('and it is still in the library', (await listPublished(carol.id)).some((e) => e.packageId === pkg.id));

  section('leaderboard opt-out reaches the package board too');
  // hide_from_leaderboards predates package boards. It has to keep working on
  // them, and it does because both boards share one ranking body.
  await db.update(users).set({ hideFromLeaderboards: true }).where(eq(users.id, bob.id));
  let hidden = await getPackageLeaderboard(deckId, alice.id, await packageAudience(pkg.id));
  ok('an opted-out player is off somebody else’s board', !hidden.some((e) => e.userId === bob.id));
  hidden = await getPackageLeaderboard(deckId, bob.id, await packageAudience(pkg.id));
  ok('but still sees their own row', hidden.some((e) => e.userId === bob.id && e.isMe));
  await db.update(users).set({ hideFromLeaderboards: false }).where(eq(users.id, bob.id));
  ok('and comes back when the preference is off', (await getPackageLeaderboard(deckId, alice.id, await packageAudience(pkg.id))).some((e) => e.userId === bob.id));

  section('reading the library is not joining it');
  ok('it is not yet in Carol’s own list', !(await readablePackageIds(carol)).includes(pkg.id));
  ok('and she is not on its leaderboard', !(await packageAudience(pkg.id)).includes(carol.id));
  ok('adding it works', await addToLibrary(carol.id, pkg.id));
  ok('now it is in her list', (await readablePackageIds(carol)).includes(pkg.id));
  ok('and she is on the leaderboard', (await packageAudience(pkg.id)).includes(carol.id));
  ok(
    'her game list carries the same deck, not a copy',
    (await listDecks(contentScopeId(carol), await readablePackageIds(carol))).filter((d) => d.id === deckId).length === 1,
  );
  ok('adding twice is idempotent', await addToLibrary(carol.id, pkg.id));
  ok(
    'still one add row',
    (await db.select().from(studyPackageAdds).where(eq(studyPackageAdds.packageId, pkg.id))).length === 1,
  );
  ok('the library marks it as added', (await listPublished(carol.id))[0]?.added === true);

  section('unpublishing');
  ok('an admin can take it back out', await unpublishPackage(pkg.id));
  ok('it leaves the library', (await listPublished(carol.id)).length === 0);
  ok('the package is intact', (await pkgRow(pkg.id)).name === 'Series 65 Prep');
  ok('and the content is unlocked again', (await packageRights(alice, pkg.id)).edit);
  // Carol keeps the package she took up: her add row is her own relationship to
  // it, and the owner can still take it away by leaving it unpublished.
  ok('somebody who had added it keeps their add row', (await readablePackageIds(carol)).includes(pkg.id));

  section('legacy content is unaffected throughout');
  const aliceDecks = await listDecks(contentScopeId(alice), await readablePackageIds(alice));
  ok('the legacy game is still in Alice’s list', aliceDecks.some((d) => d.id === legacyDeckId));
  ok(
    'it never leaked to Bob',
    !(await listDecks(contentScopeId(bob), await readablePackageIds(bob))).some((d) => d.id === legacyDeckId),
  );
  ok(
    'nor to Carol, who holds a public package from Alice',
    !(await listDecks(contentScopeId(carol), await readablePackageIds(carol))).some((d) => d.id === legacyDeckId),
  );
  ok('and it still has no leaderboard', aliceDecks.find((d) => d.id === legacyDeckId)?.hasLeaderboard === false);
  ok(
    'while the package game does',
    aliceDecks.find((d) => d.id === deckId)?.hasLeaderboard === true,
  );

  section('an empty package still behaves');
  const bare = await createPackage({ ownerUserId: alice.id, createdBy: alice.id, name: 'Bare', description: null, subject: null, audience: null, depth: null });
  ok('its audience is just the owner', (await packageAudience(bare.id)).join() === alice.id);
  ok('a leaderboard with nobody on it is empty, not an error', (await getPackageLeaderboard('nope', alice.id, [])).length === 0);

  console.log(`\n${fail === 0 ? 'All' : `${pass} of ${pass + fail}`} sharing checks ${fail === 0 ? 'passed' : `passed, ${fail} FAILED`}.`);
  if (fail) process.exitCode = 1;
}

async function pkgRow(id: string) {
  return (await db.select().from(studyPackages).where(eq(studyPackages.id, id)).limit(1))[0]!;
}
async function progressRows(deckId: string) {
  return db.select().from(studyDeckGame).where(eq(studyDeckGame.deckId, deckId));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
