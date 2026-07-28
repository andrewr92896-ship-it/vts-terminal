import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingPositions, users, brokerConnections } from '../db/schema.js';
import { oandaTradeId } from './backfill.js';

// Read-only health check for the desk's broker positions, run with
// `npm run db:verify-positions` against whatever DATABASE_URL points at.
//
// It exists because `trading_positions` has two writers — the Live Wall
// reconcile and the closed-trade backfill — and for a while they disagreed
// about how to key a position, so every trade seen live was stored twice (see
// migration 0077). Nothing in the schema stops that from recurring: there is no
// unique constraint on (user_id, key). This is how you check.
//
// It reports, and never writes. A non-zero exit means a structural problem.

const ET = 'America/New_York';

// How far the ET wall clock sits from UTC at a given instant.
function etOffsetMs(atMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - atMs;
}

// Midnight of an ET calendar date as a UTC timestamp. The desk works in ET, so a
// month window bounded on UTC would misfile trades that closed late on the last
// evening of the month. Corrected twice so a date on a DST switch still settles.
function etMidnight(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d);
  return guess - etOffsetMs(guess - etOffsetMs(guess));
}

function etYearMonth(atMs: number): { y: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { y: get('year'), m: get('month') };
}

// `--from=YYYY-MM-DD` / `--to=YYYY-MM-DD` (ET, `to` exclusive). Defaults to the
// current ET month, which is what you want when checking a fresh deploy.
function parseWindow(argv: string[]): { fromMs: number; toMs: number; label: string } {
  const arg = (name: string): string | null => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const parse = (v: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m ? etMidnight(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  };
  const rawFrom = arg('from');
  const rawTo = arg('to');
  if (rawFrom || rawTo) {
    const fromMs = rawFrom ? parse(rawFrom) : null;
    const toMs = rawTo ? parse(rawTo) : null;
    if ((rawFrom && fromMs == null) || (rawTo && toMs == null)) {
      throw new Error('Dates must look like --from=2026-07-01 --to=2026-08-01');
    }
    const f = fromMs ?? 0;
    const t = toMs ?? Date.now();
    return { fromMs: f, toMs: t, label: `${rawFrom ?? 'the beginning'} → ${rawTo ?? 'now'} (ET)` };
  }
  const { y, m } = etYearMonth(Date.now());
  return {
    fromMs: etMidnight(y, m, 1),
    toMs: m === 12 ? etMidnight(y + 1, 1, 1) : etMidnight(y, m + 1, 1),
    label: `${String(m).padStart(2, '0')}/${y} (ET)`,
  };
}

function money(n: number): string {
  return `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(2)}`;
}

// Returns the number of structural problems found (0 = clean).
export async function verifyPositions(fromMs: number, toMs: number, label: string): Promise<number> {
  const joined = await db
    .select({ pos: tradingPositions, username: users.username })
    .from(tradingPositions)
    .innerJoin(users, eq(users.id, tradingPositions.userId));
  const oanda = joined.filter((r) => r.pos.broker === 'oanda');
  const live = oanda.filter((r) => r.pos.deletedAt == null);
  let problems = 0;
  const report = (ok: boolean, line: string) => {
    if (!ok) problems += 1;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${line}`);
  };

  console.log(`Broker positions: ${oanda.length} OANDA rows (${live.length} live)\n`);
  console.log('Structure');

  // Every row should carry the connection-namespaced key. A bare `oanda:<id>` is
  // the pre-0077 shape, which is what let the two writers miss each other.
  const legacy = oanda.filter((r) => r.pos.key.startsWith('oanda:'));
  report(legacy.length === 0, `rows on the legacy 'oanda:<id>' key: ${legacy.length} (want 0)`);
  for (const r of legacy.slice(0, 10)) console.log(`         ${r.username} · ${r.pos.key}`);

  // The duplicate itself: one broker trade held twice on one connection.
  const byTrade = new Map<string, typeof live>();
  for (const r of live) {
    const tradeId = oandaTradeId(r.pos.key);
    if (!tradeId) continue;
    const k = `${r.pos.connectionId ?? '—'}|${tradeId}`;
    const group = byTrade.get(k) ?? [];
    group.push(r);
    byTrade.set(k, group);
  }
  const dupes = [...byTrade.entries()].filter(([, g]) => g.length > 1);
  report(dupes.length === 0, `broker trades stored more than once: ${dupes.length} (want 0)`);
  for (const [k, g] of dupes.slice(0, 10)) {
    const exits = g.map((r) => r.pos.exitPrice ?? '—').join(', ');
    console.log(`         ${g[0].username} · ${k} · ${g.length} legs · exits ${exits}`);
  }

  // A closed row with no exit never came from a broker fill.
  const noExit = live.filter((r) => r.pos.status === 'closed' && r.pos.exitPrice == null);
  report(noExit.length === 0, `closed rows with no exit price: ${noExit.length} (want 0)`);

  // What the desk will report for the window, to diff against the broker's own
  // export. Counts and P/L only — this cannot see the broker, so it cannot tell
  // you the numbers are RIGHT, only what they currently are.
  console.log(`\nClosed trades · ${label}`);
  const window = live.filter(
    (r) =>
      r.pos.status === 'closed' &&
      r.pos.closedAt != null &&
      r.pos.closedAt.getTime() >= fromMs &&
      r.pos.closedAt.getTime() < toMs,
  );
  const totals = new Map<string, { n: number; pl: number; unknown: number }>();
  for (const r of window) {
    const t = totals.get(r.username) ?? { n: 0, pl: 0, unknown: 0 };
    t.n += 1;
    if (r.pos.realizedPl == null) t.unknown += 1;
    else t.pl += r.pos.realizedPl;
    totals.set(r.username, t);
  }
  if (totals.size === 0) console.log('  (no closed trades in this window)');
  for (const [name, t] of [...totals].sort((a, b) => a[0].localeCompare(b[0]))) {
    const gap = t.unknown > 0 ? ` · ${t.unknown} with no P/L recorded` : '';
    console.log(`  ${name}: ${t.n} trades, ${money(t.pl)}${gap}`);
  }

  // Context for why a trade might be missing entirely: a connection cutoff hides
  // everything that opened before it, from the desk and from the backfill alike.
  console.log('\nConnections');
  const conns = await db
    .select({ conn: brokerConnections, username: users.username })
    .from(brokerConnections)
    .innerJoin(users, eq(users.id, brokerConnections.userId));
  const oandaConns = conns.filter((r) => r.conn.broker === 'oanda');
  if (oandaConns.length === 0) console.log('  (no OANDA connections)');
  for (const r of oandaConns.sort((a, b) => a.username.localeCompare(b.username))) {
    const since = r.conn.historyStartAt
      ? r.conn.historyStartAt.toISOString().slice(0, 10)
      : 'no cutoff';
    const state = r.conn.active ? 'active' : 'inactive';
    console.log(`  ${r.username} · ${r.conn.label} · ${state} · counting trades since: ${since}`);
  }

  console.log(problems === 0 ? '\nRESULT: clean' : `\nRESULT: ${problems} problem(s) above`);
  return problems;
}

// Run directly (npm run db:verify-positions) — but not when imported.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { fromMs, toMs, label } = parseWindow(process.argv.slice(2));
    verifyPositions(fromMs, toMs, label)
      .then((problems) => process.exit(problems === 0 ? 0 : 1))
      .catch((err) => {
        console.error('Verify failed:', err);
        process.exit(1);
      });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
