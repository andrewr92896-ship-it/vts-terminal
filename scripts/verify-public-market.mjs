#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  CATALOG, GROUPS, buildPayload, changesFor, derive, fmtDelta, fmtPct, fmtValue,
  freshnessFor, rowFor, subtractSeries,
} from '../apps/public-terminal/server/marketFeed.mjs';
import { parseFredCsv, parseKrakenOhlc } from '../apps/public-terminal/server/fredSource.mjs';
import { mapCalendar, windowAndSort } from '../apps/public-terminal/server/calendarFeed.mjs';

// Offline check of the demo board's live market feed.
//
// WHAT THIS EXISTS FOR, in one sentence: the demo board used to be frozen
// literals wearing the live styling — a Fed target policy had moved past and
// review dates a month gone, marked `source:'live'` and `sample:false` — on the
// first screen a prospective customer is shown. The feed that replaced them is
// arithmetic nobody can check by looking at the running board: a change column
// is right or wrong in ways a screenshot cannot tell you, and the failure mode
// is a plausible number rather than an error.
//
// Reads no network, no database and no config.
//
//     npm run verify:public-market
//
// Exits non-zero on the first failure.

let failures = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(64)} ${a}${ok ? '' : ` (expected ${e})`}`);
};

// A catalog row by id. Named rather than inlined so a row that has been renamed
// reports as a failed check instead of crashing the script three checks later
// with an undefined — which is what happened, and the stack said nothing about
// the rename.
const def = (id) => {
  const found = CATALOG.find((d) => d.id === id);
  if (!found) {
    failures += 1;
    console.log(`FAIL ${`the catalog still carries a row called '${id}'`.padEnd(64)} false`);
  }
  return found ?? { id, transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'delta' };
};

const day = (iso, value) => ({ date: iso, timeMs: Date.parse(`${iso}T00:00:00Z`), value });
const NOW = Date.parse('2026-09-29T12:00:00Z');

// A monthly index: 12 readings of the previous year, then this year's, so a
// year-over-year rate and a year-to-date both have a real base.
const monthly = (year, values) =>
  values.map((v, i) => day(`${year}-${String(i + 1).padStart(2, '0')}-01`, v));

// ---- transforms ----

{
  // 300.0 a year ago, 309.0 now: +3.0%. Hand-computed, not read off a screen.
  const obs = [...monthly(2025, Array.from({ length: 12 }, (_, i) => 300 + i * 0.5)), day('2026-01-01', 309)];
  const points = derive(obs, { transform: 'yoy', decimals: 1 });
  check('yoy is computed against twelve months earlier', fmtValue(points[points.length - 1].v, { decimals: 1 }), '3.0');
}

{
  // A GAP where the year-earlier reading should be. Pairing with the nearest
  // older reading instead would quietly report a TWO-year move as a one-year
  // rate, which is the failure the 45-day tolerance exists to prevent.
  const obs = [day('2024-01-01', 200), day('2026-01-01', 309)];
  check('a missing year-earlier reading yields no y/y rather than a wrong one', derive(obs, { transform: 'yoy', decimals: 1 }).length, 0);
}

{
  // Year-to-date is measured against the LAST reading of the previous calendar
  // year, not against twelve months earlier.
  const obs = [day('2025-11-01', 300), day('2025-12-01', 310), day('2026-01-01', 313.1)];
  const points = derive(obs, { transform: 'ytdIndex', decimals: 1 });
  check('ytd is measured from last December, not from twelve months back', fmtValue(points[points.length - 1].v, { decimals: 1 }), '1.0');
}

{
  // `scale` moves the published unit into the board's. Claims arrive in persons.
  const points = derive([day('2026-09-19', 223_000)], { transform: 'level', decimals: 0, scale: 1 / 1000 });
  check('scale converts the published unit', fmtValue(points[0].v, { decimals: 0 }), '223');
}

// ---- change columns ----

{
  // A RATE moves by subtraction. 4.05 -> 4.02 is "−0.03", never "−0.74%".
  const def = { transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'delta' };
  const points = derive([day('2026-09-25', 4.05), day('2026-09-28', 4.02)], def);
  check('a rate row measures its move by subtraction', changesFor(points, def, NOW)[0], '−0.03');
}

{
  // A PRICE moves by percent. Getting these two the wrong way round is the most
  // plausible mistake in this file, so one of each is pinned.
  const def = { transform: 'level', cadence: 'daily', decimals: 2, changeMode: 'pct' };
  const points = derive([day('2026-09-25', 6000), day('2026-09-28', 6060)], def);
  check('a price row measures its move by percent', changesFor(points, def, NOW)[0], '+1.00%');
}

{
  // THE CADENCE GATE. A monthly series has no one-day move to report, and a
  // naive date look-back lands on the PREVIOUS MONTH's reading and prints that
  // monthly move in the daily column.
  const def = { transform: 'level', cadence: 'monthly', decimals: 1, changeMode: 'delta' };
  const points = derive([day('2026-07-01', 4.1), day('2026-08-01', 4.4)], def);
  const changes = changesFor(points, def, NOW);
  check('a monthly series reports a flat day and week, not last month’s move', [changes[0], changes[1]], ['0.0', '0.0']);
  check('...and its own month is still a real move', changes[2], '+0.3');
}

{
  // Year-to-date is UNGATED, or a monthly series would report a flat year-to-
  // date in every month — the previous year's final reading is a real base.
  const def = { transform: 'level', cadence: 'monthly', decimals: 1, changeMode: 'delta' };
  const points = derive([day('2025-12-01', 4.0), day('2026-08-01', 4.4)], def);
  check('year-to-date is not gated by cadence', changesFor(points, def, NOW)[3], '+0.4');
}

{
  // ANCHORED ON THE LATEST READING, not on the wall clock. A July print is
  // still the current reading in late September, and its 1-month column means
  // against June. Anchored on `now` it would compare July with July and report
  // a flat month.
  const def = { transform: 'level', cadence: 'monthly', decimals: 1, changeMode: 'delta' };
  const points = derive([day('2026-06-01', 4.0), day('2026-07-01', 4.3)], def);
  check('look-backs anchor on the latest reading, not on today', changesFor(points, def, NOW)[2], '+0.3');
}

// ---- formatting ----

check('a zero move is unsigned, so no move reads neutral', fmtDelta(0, { decimals: 2 }), '0.00');
check('a negative move uses a real minus sign', fmtDelta(-0.03, { decimals: 2 }), '−0.03');
check('a large percent gives up a decimal to fit its column', fmtPct(-17.238, 2), '−17.2%');
check('a small percent keeps its precision', fmtPct(-1.238, 2), '−1.24%');
check('a signed value carries its plus', fmtValue(56, { decimals: 0, signed: true }), '+56');

// ---- parsers ----

check(
  'the FRED csv skips its header whatever the date column is called',
  parseFredCsv('observation_date,DGS10\n2026-09-25,4.05\n2026-09-26,.\n2026-09-28,4.02').map((o) => o.value),
  [4.05, 4.02],
);
check(
  'KRAKEN ANSWERS 200 TO A REFUSAL, and the error array is read first',
  parseKrakenOhlc('{"error":["EGeneral:Invalid arguments"],"result":{"XXBTZUSD":[[1759104000,"1","1","1","99999","1","1",1]]}}').length,
  0,
);
check(
  'a good kraken reply yields its daily closes',
  parseKrakenOhlc('{"error":[],"result":{"XXBTZUSD":[[1759104000,"1","1","1","112420.5","1","1",1]],"last":1}}').map((o) => o.value),
  [112420.5],
);

// ---- rows ----

{
  // A SPREAD RECONCILES WITH THE ROWS IT IS DERIVED FROM, because it is the
  // same two series subtracted on a date join. Read from FRED's ready-made
  // spread instead it refreshes on its own clock and can print a figure the
  // board's own two yield rows contradict.
  const ten = [day('2026-09-25', 4.10), day('2026-09-28', 4.14)];
  const two = [day('2026-09-25', 3.55), day('2026-09-28', 3.58)];
  const obs = new Map([['DGS10', ten], ['DGS2', two]]);
  check('the curve spread is the two yield rows subtracted', rowFor(def('s2s10'), obs, NOW)?.value ?? null, '+56');
  check('a date only one leg has is dropped rather than half-counted', subtractSeries(ten, [day('2026-09-28', 3.58)]).length, 1);
  check('without its second leg the spread refuses rather than printing one leg', rowFor(def('s2s10'), new Map([['DGS10', ten]]), NOW), null);
}

{
  // A RANGE ROW REFUSES WITHOUT ITS LOWER BOUND. Printing the upper alone would
  // state policy as a point target — a different claim from the one the Fed
  // publishes.
  const upper = [day('2026-09-18', 4.0)];
  const lower = [day('2026-09-18', 3.75)];
  check('a range row prints both bounds', rowFor(def('ffr'), new Map([['DFEDTARU', upper], ['DFEDTARL', lower]]), NOW)?.value ?? null, '3.75–4.00');
  check('without the lower bound it refuses rather than stating a point target', rowFor(def('ffr'), new Map([['DFEDTARU', upper]]), NOW), null);
}

// ---- freshness ----
//
// THE AUDIT FINDING THIS FILE EXISTS TO STOP COMING BACK. Every row used to be
// stamped `source: 'live'` outright, so a Treasury close four days old wore the
// green Live feed dot, and the FX rows presented a once-a-day noon rate as a
// quote. `MarketFreshness` carried a `stale` value the whole time that nothing
// in the repository ever set.

{
  const now = Date.parse('2026-09-29T13:00:00Z');
  const ago = (ms) => now - ms;
  const DAY = 86400_000;
  check('a daily close from yesterday is live', freshnessFor(ago(DAY), 'daily', now), 'live');
  // A Friday close read on Monday is the current reading, not a stale one.
  check('...and one from Friday read on Monday still is', freshnessFor(ago(3 * DAY), 'daily', now), 'live');
  // Four days is the case the audit caught, and it is not live.
  check('a daily close four days old is STALE', freshnessFor(ago(4 * DAY), 'daily', now), 'stale');
  check('a monthly print from last month is live', freshnessFor(ago(28 * DAY), 'monthly', now), 'live');
  check('a monthly print from two months ago is stale', freshnessFor(ago(60 * DAY), 'monthly', now), 'stale');
  check('a weekly print from last week is live', freshnessFor(ago(8 * DAY), 'weekly', now), 'live');
  // A coin trades every second, so a two-day-old reading of one is not a close
  // — it is a figure nobody refreshed.
  check('a coin read minutes ago is live', freshnessFor(ago(10 * 60_000), 'continuous', now), 'live');
  check('a coin read hours ago is stale', freshnessFor(ago(6 * 3600_000), 'continuous', now), 'stale');
}

{
  // End to end: the same observations, read on two different days.
  const obs = new Map([['DGS10', [day('2026-09-24', 5.13), day('2026-09-25', 5.17)]]]);
  const d = def('y10');
  check('a yield read the next day says live', rowFor(d, obs, Date.parse('2026-09-26T13:00:00Z'))?.source, 'live');
  check('...and the same figure four days on says stale', rowFor(d, obs, Date.parse('2026-09-29T13:00:00Z'))?.source, 'stale');
  // The DATE never moves — only the claim about it does. A stale row still
  // states what it is and when it was read, which is the whole point.
  check('...while still stating the reading it actually has', rowFor(d, obs, Date.parse('2026-09-29T13:00:00Z'))?.asOf, 'Sep 25');
}

{
  // A continuous row is stamped with the moment it was read, carrying a TIME:
  // a bare date over a coin price reads as a daily close.
  const candles = [day('2026-09-28', 84_000), day('2026-09-29', 84_341)];
  const row = rowFor(def('btc'), new Map([['XBTUSD', candles]]), Date.parse('2026-09-29T18:14:00Z'));
  check('a coin is stamped with the time it was read', row?.asOf, 'Sep 29 2:14 PM ET');
  check('...and reads live because that is when it was read', row?.source, 'live');
}

// ---- the payload ----

{
  // EVERY PROVIDER DOWN. Not one fabricated figure may survive that, and the
  // payload has to say so — this is the rule the old board broke.
  const payload = buildPayload(new Map(), NOW);
  const live = payload.series.filter((row) => !row.sample).map((row) => row.id);
  check('with no data every row is marked sample but the session', live, ['ny']);
  check('...and the payload says part of the board is sample', payload.sampleValues, true);
  check('...and no row is dropped, so no group is left with a hole', payload.series.length, CATALOG.length + 1);
}

{
  const ids = CATALOG.map((d) => d.id);
  check('catalog ids are unique', ids.length, new Set(ids).size);
  const known = new Set(GROUPS.map((g) => g.key));
  check('every catalog row sits in a known group', CATALOG.filter((d) => !known.has(d.group)).map((d) => d.id), []);
  check('every catalog row names a provider', CATALOG.filter((d) => !d.fred && !d.kraken).map((d) => d.id), []);
  check('every catalog row declares how its move is measured', CATALOG.filter((d) => d.changeMode !== 'delta' && d.changeMode !== 'pct').map((d) => d.id), []);
}

{
  // EVERY CATALOG ROW, END TO END, from an observation map to a rendered row.
  // On the live board a broken row does not raise anything — it quietly becomes
  // a Sample row — so this is where a row that cannot render is caught: a
  // transform that yields nothing, a range or spread missing its second leg, a
  // blank value, a change array that is not five columns, a default pin naming
  // a row that is not there.
  //
  // WHAT IT CANNOT CATCH, stated so nobody trusts it further than it goes: the
  // observations are built from the catalog's OWN series ids, so a id that FRED
  // does not publish passes here and comes back empty in production. Only the
  // deployed board can establish that a provider knows a name.
  const obs = new Map();
  const series = new Set();
  for (const def of CATALOG) {
    if (def.fred) series.add(def.fred);
    if (def.fredLower) series.add(def.fredLower);
    if (def.fredMinus) series.add(def.fredMinus);
    if (def.kraken) series.add(def.kraken);
  }
  // Four years of month starts plus a recent daily run, so a y/y, a year-to-
  // date and a one-day move all have a real base whatever the row's cadence is.
  for (const id of series) {
    const points = [];
    for (let y = 2022; y <= 2026; y += 1) {
      for (let m = 1; m <= 12; m += 1) {
        if (y === 2026 && m > 9) break;
        points.push(day(`${y}-${String(m).padStart(2, '0')}-01`, 100 + (y - 2022) * 5 + m * 0.1));
      }
    }
    for (const d of ['2026-09-25', '2026-09-26', '2026-09-28']) points.push(day(d, 126.4));
    obs.set(id, points);
  }
  const payload = buildPayload(obs, NOW);
  check('with data behind it, every catalog row renders', payload.series.filter((row) => row.sample).map((row) => row.id), []);
  // Nothing is a permanent placeholder any more: gold was the last one and it
  // was removed rather than left showing a dash for ever.
  check('...and nothing on the board is sample', payload.sampleValues, false);
  check('no live row renders an empty value', payload.series.filter((row) => !row.sample && row.id !== 'ny' && (!row.value || row.value === '\u2014')).map((row) => row.id), []);
  check('every row carries five change columns', payload.series.filter((row) => !Array.isArray(row.changes) || row.changes.length !== 5).map((row) => row.id), []);
  check('the default pins all exist on the board', payload.defaultPins.filter((id) => !payload.series.some((row) => row.id === id)), []);
}

{
  // THE ROW IDS MATCH THE PRIVATE CATALOG, and that is load-bearing in one
  // place already: the Fed bar reads its target range off the row with id
  // `ffr`, so a demo board naming that row anything else draws the bar with no
  // range on it. Beyond that it is simply one naming for one figure across two
  // deployments.
  //
  // `broad-usd` is the deliberate exception and is named in the list below: the
  // private `dxy` row is ICE's dollar index and this is the Fed's own broad
  // trade-weighted basket. They are different numbers, so sharing an id would
  // make two boards disagree about one row.
  const privateCatalog = readFileSync(new URL('../apps/api/src/trading/marketData.ts', import.meta.url), 'utf8');
  const privateIds = new Set([...privateCatalog.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]));
  const ownNames = new Set(['broad-usd']);
  const strays = [...CATALOG.map((d) => d.id), 'ny'].filter((id) => !privateIds.has(id) && !ownNames.has(id));
  check('every row id is the private board\u2019s, bar the documented exception', strays, []);
  check('the Fed bar\u2019s row is present under the id it reads', CATALOG.some((d) => d.id === 'ffr'), true);
}

// ---- the economic calendar ----
//
// It shares a screen with the board, so a made-up calendar beside live rows
// would be the only panel there with invented dates on it.

{
  const feed = [
    { title: 'Initial Jobless Claims', country: 'USD', date: '2026-09-30T12:30:00-04:00', impact: 'High', forecast: '229K', previous: '228K', actual: '' },
    { title: 'Pending Home Sales m/m', country: 'USD', date: '2026-09-30T14:00:00-04:00', impact: 'Moderate', forecast: '0.4%', previous: '0.1%' },
    { title: 'Something Unrated', country: 'EUR', date: '2026-09-30T09:00:00-04:00', impact: 'Holiday' },
    { title: '', country: 'USD', date: '2026-09-30T09:00:00-04:00', impact: 'High' },
    { title: 'Undated Release', country: 'USD', date: 'not a date', impact: 'High' },
  ];
  const mapped = mapCalendar(feed);
  check('a release with no title or no parseable time is dropped', mapped.map((e) => e.title), ['Initial Jobless Claims', 'Pending Home Sales m/m', 'Something Unrated']);
  check('impact words map to the board\u2019s three levels', mapped.map((e) => e.impact), ['high', 'medium', 'low']);
  // An unrecognised impact word must LOWER a row, never remove it: a release
  // missing from the schedule is a worse error than one rated too gently.
  check('...and an unrecognised word lowers the row rather than dropping it', mapped.some((e) => e.title === 'Something Unrated'), true);
  check('a missing forecast is null, never an empty string', [mapped[1].actual, mapped[1].forecast], [null, '0.4%']);
  // AI fails closed everywhere on the public terminal, so the plain-language
  // note the private board carries must be absent rather than invented.
  check('no release carries an explainer nothing wrote', mapped.filter((e) => e.explainer !== null).map((e) => e.title), []);
  check('every release names its source', new Set(mapped.map((e) => e.source)).size === 1 && mapped[0].source, 'Forex Factory');
  // The feed carries no id of its own, so the id is keyed on content: the same
  // currency and title at the same minute is the same release across polls, and
  // the screen uses it as a key.
  check('the same release read twice is one row', windowAndSort([...mapped, ...mapCalendar(feed)], Date.parse('2026-09-30T08:00:00Z')).length, 3);
}

{
  const now = Date.parse('2026-09-30T12:00:00Z');
  const at = (hours) => ({ title: `T${hours}`, country: 'USD', date: new Date(now + hours * 3600_000).toISOString(), impact: 'High' });
  const events = mapCalendar([at(-48), at(-2), at(5), at(1), at(24 * 30)]);
  const shown = windowAndSort(events, now);
  check('the window keeps a release that just landed and drops last week', shown.map((e) => e.title), ['T-2', 'T1', 'T5']);
  check('...and a month out is beyond the window', shown.some((e) => e.title === 'T720'), false);
}

// ---- the route ----
//
// The feed reaches the demo through one route on the static server, mounted by
// one flag in one start command. Losing the flag is silent: the route 404s, the
// bundle falls back to its Sample board, and the demonstration shows a board of
// grey dots with nothing anywhere saying why. Checked as TEXT rather than by
// booting the server, so this check stays offline — the route's own behaviour
// is exercised by running it, not here.

{
  const server = readFileSync(new URL('./serve-static-app.mjs', import.meta.url), 'utf8');
  const railway = readFileSync(new URL('../deploy/railway/public-terminal.json', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../apps/public-terminal/src/adapters/publicApi.ts', import.meta.url), 'utf8');
  const route = server.match(/const MARKET_PATH = '([^']+)'/)?.[1] ?? '';
  check('the static server mounts a market route', route, '/demo/market-data');
  check('the bundle fetches that exact path', client.includes(`fetch('${route}'`), true);
  check('the deployed start command passes --market', /serve-static-app\.mjs[^"]*--market/.test(railway), true);
  check('the route is behind the flag, not always on', server.includes('marketEnabled && urlPath === MARKET_PATH'), true);
  const calendarRoute = server.match(/const CALENDAR_PATH = '([^']+)'/)?.[1] ?? '';
  check('the static server mounts a calendar route', calendarRoute, '/demo/market-news');
  check('the bundle fetches that exact path too', client.includes(`fetch('${calendarRoute}'`), true);
}

// ---- the bundled fallback ----
//
// THE CHECK THAT STOPS THE ORIGINAL BUG COMING BACK. The fallback board in the
// public bundle is what a demonstration sees when the feed is unreachable, and
// every row on it is a literal somebody typed. Exactly one of them may claim to
// be live: the session window, which is the clock rather than a reading.

{
  const text = readFileSync(new URL('../apps/public-terminal/src/adapters/publicApi.ts', import.meta.url), 'utf8');
  const block = text.slice(text.indexOf('const fallbackSeries'), text.indexOf('const FALLBACK_MEETING_DATES'));
  const rows = [...block.matchAll(/\{id:'([^']+)'[^\n]*?sample:(true|false)\}/g)].map((m) => [m[1], m[2]]);
  check('the fallback board was read', rows.length > 0, true);
  check('only the session row claims to be live', rows.filter(([, s]) => s === 'false').map(([id]) => id), ['ny']);
  check('no fallback row wears the live source', block.includes("source:'live'") ? block.split("source:'live'").length - 1 : 0, 1);
  const fallbackIds = rows.map(([id]) => id);
  const catalogIds = new Set([...CATALOG.map((d) => d.id), 'ny']);
  check('every fallback row is one the live catalog also serves', fallbackIds.filter((id) => !catalogIds.has(id)), []);
}

console.log();
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
