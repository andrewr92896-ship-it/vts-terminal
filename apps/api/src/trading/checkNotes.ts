// Trading Notes — checked through the real services against a real database.
//
//   DATABASE_URL="file:/tmp/x.db" npm run db:migrate
//   DATABASE_URL="file:/tmp/x.db" npm run db:check-notes
//
// Like db:check-sharing this one WRITES — it creates accounts and notes — so it
// refuses any database that already holds a user. An empty one is a scratch one;
// a real deployment always has accounts in it. Do not weaken that guard.
//
// FOUR THINGS ARE WORTH PROTECTING HERE, and a typecheck sees none of them:
//
//   • A PUBLISHED CALL IS FROZEN. Sharing locks it, an opened window locks it,
//     and un-sharing does not unlock it. Without this the feature is a diary.
//   • NOBODY SEES A CALL BEFORE ITS WINDOW OPENS. The blind-reveal clause is one
//     `or(...)` in a query and is exactly the kind of thing a refactor drops.
//   • A CALL THAT COULD NOT BE SETTLED IS NEVER SCORED. `unsettleable` and
//     `partial` stay out of the hit rate, and the hit rate is null rather than 0
//     when nothing has settled.
//   • THE WEEK IS AN EASTERN WEEK, and its key round-trips.
//
// Nothing here touches the network: gradeCall is pure, and no note created below
// is ever handed to the settle watch.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingNotes, userFeatures, users } from '../db/schema.js';
import {
  NoteError,
  createNote,
  etWeekKey,
  getQueue,
  getStats,
  getWeek,
  reflectOnNote,
  settleNote,
  setVisibility,
  shiftWeekKey,
  updateNote,
  weekRange,
} from './notes.js';
import { gradeCall } from './noteSettle.js';

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

async function makeUser(username: string, teamId: string | null): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    username,
    createdUsername: username,
    displayName: username,
    email: `${username}@example.test`,
    passwordHash: 'x',
    role: 'Viewer',
    roles: JSON.stringify(['member']),
    teamId,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  // The group half of visibility is behind the Trading Teams grant, so a check
  // of group reads has to hold it — otherwise visibleTraderIds resolves every
  // account to itself and the blind-reveal assertions below pass vacuously.
  if (teamId) {
    await db.insert(userFeatures).values({
      id: randomUUID(),
      userId: id,
      advancedTrading: true,
      funded: false,
      tradingTeams: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return id;
}

async function main() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) {
    console.error(
      'Refusing to run: this database already has accounts in it.\n' +
        'This check creates users, so it only runs against an empty scratch database:\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:migrate\n' +
        '  DATABASE_URL="file:/tmp/x.db" npm run db:check-notes',
    );
    process.exit(1);
  }

  const TEAM = 'team-check';
  const andrew = await makeUser('andrew', TEAM);
  const dale = await makeUser('dale', TEAM);
  const stranger = await makeUser('stranger', null);
  const A = { id: andrew, teamId: TEAM };
  const D = { id: dale, teamId: TEAM };
  const S = { id: stranger, teamId: null };

  // ---- The Eastern week -------------------------------------------------
  section('the week is an Eastern week and its key round-trips');
  const wk = etWeekKey(new Date('2026-08-19T15:00:00Z')); // a Wednesday
  ok('an ISO week key', /^\d{4}-W\d{2}$/.test(wk), wk);
  ok('stepping back and forward returns to it', shiftWeekKey(shiftWeekKey(wk, -1), 1) === wk);
  const range = weekRange(wk);
  ok('the week starts on a Monday', new Date(`${range.startsOn}T12:00:00Z`).getUTCDay() === 1, range.startsOn);
  ok('and ends on the Friday', new Date(`${range.endsOn}T12:00:00Z`).getUTCDay() === 5, range.endsOn);
  // The boundary case a UTC week key gets wrong: 00:30 UTC Monday is still
  // Sunday evening in New York, so it belongs to the PREVIOUS trading week.
  const sundayEt = etWeekKey(new Date('2026-08-17T00:30:00Z'));
  const mondayEt = etWeekKey(new Date('2026-08-17T16:00:00Z'));
  ok('Sunday evening ET is the previous week', sundayEt === shiftWeekKey(mondayEt, -1), `${sundayEt} vs ${mondayEt}`);

  // ---- Locking ----------------------------------------------------------
  section('a published call is frozen');
  const open = await createNote(andrew, {
    kind: 'prediction',
    title: 'Dollar bid into Friday',
    instrument: 'EUR/USD',
    direction: 'down',
    confidence: 4,
    // A window well in the future, so the call is genuinely still open.
    windowOpensAt: Date.now() + 86_400_000,
    deadlineAt: Date.now() + 5 * 86_400_000,
  });
  ok('an unshared, unopened call is editable', !open.locked);
  const edited = await updateNote(andrew, open.id, { title: 'Dollar bid all week' });
  ok('and the edit lands', edited.title === 'Dollar bid all week');

  const shared = await setVisibility(andrew, open.id, 'group');
  ok('sharing locks it', shared.locked);
  let refused = false;
  try {
    await updateNote(andrew, open.id, { title: 'Actually the other way' });
  } catch (e) {
    refused = e instanceof NoteError;
  }
  ok('and the call can no longer be edited', refused);

  const unshared = await setVisibility(andrew, open.id, 'private');
  ok('un-sharing does NOT unlock it', unshared.locked);

  const opened = await createNote(andrew, {
    kind: 'prediction',
    title: 'Already running',
    windowOpensAt: Date.now() - 3_600_000,
    deadlineAt: Date.now() + 86_400_000,
  });
  ok('a call whose window has opened is locked without being shared', opened.locked);

  section('a reflection is the one thing that stays writable');
  const reflected = await reflectOnNote(andrew, open.id, 'Read the dollar wrong.');
  ok('it saves on a locked call', reflected.reflection === 'Read the dollar wrong.');
  const rewritten = await reflectOnNote(andrew, open.id, 'Read the dollar wrong, twice.');
  ok('and it can be rewritten', rewritten.reflection === 'Read the dollar wrong, twice.');

  // ---- Blind reveal ------------------------------------------------------
  section('nobody sees a call before its window opens');
  const week = etWeekKey();
  const sealed = await createNote(dale, {
    kind: 'prediction',
    title: 'Gold breaks out',
    visibility: 'group',
    weekKey: week,
    windowOpensAt: Date.now() + 86_400_000,
    deadlineAt: Date.now() + 4 * 86_400_000,
  });
  const andrewSees = await getWeek(A, week);
  ok('a teammate does not see a sealed call', !andrewSees.notes.some((n) => n.id === sealed.id));
  const daleSees = await getWeek(D, week);
  ok('but its author always does', daleSees.notes.some((n) => n.id === sealed.id));
  ok('and it reads as not yet revealed', daleSees.notes.find((n) => n.id === sealed.id)?.revealed === false);

  const live = await createNote(dale, {
    kind: 'prediction',
    title: 'Yen carry unwinds',
    visibility: 'group',
    weekKey: week,
    windowOpensAt: Date.now() - 3_600_000,
    deadlineAt: Date.now() + 3 * 86_400_000,
  });
  const andrewSeesLive = await getWeek(A, week);
  ok('an opened call reaches the group', andrewSeesLive.notes.some((n) => n.id === live.id));
  ok('and is marked as somebody else’s', andrewSeesLive.notes.find((n) => n.id === live.id)?.isMine === false);

  const privateOne = await createNote(dale, {
    kind: 'prediction',
    title: 'Kept to myself',
    weekKey: week,
    windowOpensAt: Date.now() - 3_600_000,
    deadlineAt: Date.now() + 3 * 86_400_000,
  });
  const afterPrivate = await getWeek(A, week);
  ok('a private call never reaches the group', !afterPrivate.notes.some((n) => n.id === privateOne.id));

  section('somebody on no group is alone by construction');
  const strangerSees = await getWeek(S, week);
  ok('they see none of the group’s calls', strangerSees.notes.length === 0);

  // ---- Scoring -----------------------------------------------------------
  section('a call that could not be settled is never scored');
  const scorer = await makeUser('scorer', null);
  const past = { windowOpensAt: Date.now() - 5 * 86_400_000, deadlineAt: Date.now() - 86_400_000 };
  const mk = async (title: string, confidence: number) =>
    (await createNote(scorer, { kind: 'prediction', title, confidence, ...past })).id;

  const emptyStats = await getStats({ id: scorer, teamId: null });
  ok('the hit rate is null before anything settles, not 0', emptyStats.hitRate === null);

  await settleNote(scorer, await mk('one', 4), 'hit');
  await settleNote(scorer, await mk('two', 4), 'hit');
  await settleNote(scorer, await mk('three', 4), 'miss');
  await settleNote(scorer, await mk('four', 2), 'partial');
  await settleNote(scorer, await mk('five', 2), 'unsettleable');
  await mk('six', 3); // still open

  const stats = await getStats({ id: scorer, teamId: null });
  ok('only hits and misses are scored', stats.scored === 3, `scored=${stats.scored}`);
  ok('the hit rate is over that set alone', Math.round(stats.hitRate ?? -1) === 67, String(stats.hitRate));
  ok('a partial is reported apart', stats.partial === 1);
  ok('an unsettleable one is reported apart', stats.unsettleable === 1);
  ok('and an unfinished call counts as open', stats.open === 1);

  const level4 = stats.calibration.find((c) => c.level === 4);
  ok('calibration buckets by confidence', level4?.calls === 3 && level4?.hits === 2, JSON.stringify(level4));
  ok('and states what that level asserts', level4?.stated === 85);
  ok(
    'a partial or unsettleable call never enters a bucket',
    !stats.calibration.some((c) => c.level === 2),
    JSON.stringify(stats.calibration),
  );

  section('a verdict cannot be revised');
  const settled = await mk('seven', 3);
  await settleNote(scorer, settled, 'hit');
  let reSettle = false;
  try {
    await settleNote(scorer, settled, 'miss');
  } catch (e) {
    reSettle = e instanceof NoteError;
  }
  ok('settling twice is refused', reSettle);

  // ---- The queue ---------------------------------------------------------
  section('what is still waiting on you');
  const queue = await getQueue({ id: scorer, teamId: null });
  ok('a settled call with no reflection is waiting', queue.some((n) => n.awaiting === 'reflect'));
  ok('an unsettled call past its deadline is waiting', queue.some((n) => n.awaiting === 'settle'));
  ok('and the queue is the caller’s own only', queue.every((n) => n.ownerId === scorer));
  const daleQueue = await getQueue(D);
  ok('a teammate’s open items are not in it', !daleQueue.some((n) => n.ownerId === scorer));

  // ---- Grading (pure) ----------------------------------------------------
  section('grading a call against a mark');
  ok(
    'a named target is absolute — up',
    gradeCall({ direction: 'up', targetPrice: 1.09, openPrice: 1.05 }, 1.0901).outcome === 'hit',
  );
  ok(
    'and a miss below it',
    gradeCall({ direction: 'up', targetPrice: 1.09, openPrice: 1.05 }, 1.0899).outcome === 'miss',
  );
  ok(
    'a named target is absolute — down',
    gradeCall({ direction: 'down', targetPrice: 1.02, openPrice: 1.05 }, 1.0199).outcome === 'hit',
  );
  ok(
    'without a target it is measured from the open',
    gradeCall({ direction: 'up', targetPrice: null, openPrice: 1.05 }, 1.06).outcome === 'hit',
  );
  ok(
    'an unchanged price is a MISS on an "up" call, not a hit',
    gradeCall({ direction: 'up', targetPrice: null, openPrice: 1.05 }, 1.05).outcome === 'miss',
  );
  ok(
    'no open price means unsettleable, never a miss',
    gradeCall({ direction: 'up', targetPrice: null, openPrice: null }, 1.06).outcome === 'unsettleable',
  );
  ok(
    'no direction means unsettleable, never a miss',
    gradeCall({ direction: null, targetPrice: null, openPrice: 1.05 }, 1.06).outcome === 'unsettleable',
  );
  ok(
    'and an unsettleable verdict says why',
    (gradeCall({ direction: 'up', targetPrice: null, openPrice: null }, 1.06).note ?? '').length > 0,
  );

  // ---- Ownership ---------------------------------------------------------
  section('a note can only be reached by its owner');
  let notFound = false;
  try {
    await updateNote(dale, open.id, { title: 'not mine' });
  } catch (e) {
    notFound = e instanceof NoteError;
  }
  ok('somebody else cannot edit it', notFound);
  const stillThere = await db.select().from(tradingNotes).where(eq(tradingNotes.id, open.id));
  ok('and it is untouched', stillThere[0]?.title === 'Dollar bid all week');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
