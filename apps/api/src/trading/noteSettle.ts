import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingNotes, type NoteOutcome, type TradingNoteRow } from '../db/schema.js';
import { config } from '../config.js';
import { sendToUsers } from '../notifications/push.js';
import { sendPushoverToUsers } from '../notifications/pushover.js';
import { fetchLivePrices, hasPriceSource } from './priceSource.js';
import { toPricingInstrument } from './priceAlerts.js';
import { autoSettles } from './notes.js';

// Automatic settlement of Trading Notes predictions, off the same install-owned
// price feed the price alerts read. notes.ts owns the data and the decision
// rules; this file owns the polling and the delivery, the way priceAlertWatch.ts
// sits beside priceAlerts.ts.
//
// It does two jobs on each pass, and the first is what makes the second possible:
//
//   1. STAMP THE OPEN PRICE on a call whose window has just opened. That is the
//      mark the call was made against, and it is the reference an outcome is
//      measured from when no explicit level was named. It has to be read at the
//      time — there is no way to recover last Monday's price later, which is the
//      same reason the Investments performance curve is built forward and never
//      back-filled.
//
//   2. SETTLE a call whose deadline has passed.
//
// **THE RULE THAT MATTERS: A CALL THAT COULD NOT BE PRICED IS NEVER SCORED AS
// WRONG.** It settles as `unsettleable` with the reason written on it, and the
// hit rate excludes it. Marking an unreadable instrument a miss would quietly
// build somebody a worse record than they earned, out of the terminal's own
// inability to read a price — the exact failure the Live Wall's `unavailable`
// state and Market Data's `sample: true` exist to prevent.

// A settled verdict, and the sentence shown beside it.
export interface Verdict {
  outcome: NoteOutcome;
  note: string | null;
}

// Grade one call against a mark. Pure, and exported so the decision can be read
// in one place rather than inferred from the polling around it.
//
// A named TARGET is absolute: "EUR/USD above 1.0900" is a hit at or beyond that
// level, whichever way the market went to get there. Without one the call is
// directional against the mark it was made at, and an exactly unchanged price is
// a MISS rather than a hit — "up" that did not go up is not "up".
export function gradeCall(
  row: Pick<TradingNoteRow, 'direction' | 'targetPrice' | 'openPrice'>,
  price: number,
): Verdict {
  const { direction, targetPrice, openPrice } = row;
  if (direction == null) return { outcome: 'unsettleable', note: 'No direction was set on this call.' };

  if (targetPrice != null) {
    const hit = direction === 'up' ? price >= targetPrice : price <= targetPrice;
    return {
      outcome: hit ? 'hit' : 'miss',
      note: `Settled at ${fmtPrice(price)} against a target of ${fmtPrice(targetPrice)}.`,
    };
  }

  if (openPrice == null) {
    return {
      outcome: 'unsettleable',
      note: 'The price when this call was made was never readable, so there is nothing to measure it against.',
    };
  }

  const hit = direction === 'up' ? price > openPrice : price < openPrice;
  return {
    outcome: hit ? 'hit' : 'miss',
    note: `Settled at ${fmtPrice(price)}, against ${fmtPrice(openPrice)} when the window opened.`,
  };
}

function fmtPrice(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}

// Why an instrument could not be marked, in the words the trader reads. The
// distinction is worth drawing: a forex call on an install with no pricing
// account configured is a setup problem the owner can fix, while an instrument
// the feed simply does not carry is not.
function unreadableNote(instrument: string): string {
  return hasPriceSource()
    ? `${instrument} could not be priced at the deadline, so this call was not scored either way.`
    : `${instrument} needs a market price source, which this terminal has not been given, so this call was not scored either way.`;
}

// ---- One pass ----

export async function tickNoteSettle(now: Date = new Date()): Promise<void> {
  await stampOpenPrices(now);
  await settleDueCalls(now);
}

// Job 1: stamp the mark on calls whose window has opened and that have no open
// price yet. Only calls with an instrument and a direction are worth pricing —
// a freeform call is settled by its author and needs no reference.
async function stampOpenPrices(now: Date): Promise<void> {
  const rows = await db
    .select()
    .from(tradingNotes)
    .where(
      and(
        eq(tradingNotes.kind, 'prediction'),
        isNull(tradingNotes.openPrice),
        isNull(tradingNotes.outcome),
        isNotNull(tradingNotes.instrument),
        isNotNull(tradingNotes.direction),
        lte(tradingNotes.windowOpensAt, now),
      ),
    )
    .limit(200);
  if (rows.length === 0) return;

  const marks = await priceAll(rows);
  for (const r of rows) {
    const price = marks.get(toPricingInstrument(r.instrument!));
    if (price == null) continue; // try again next pass; the deadline check owns the giving-up
    await db
      .update(tradingNotes)
      .set({ openPrice: price, updatedAt: now })
      .where(eq(tradingNotes.id, r.id))
      .catch(() => {});
  }
}

// Job 2: settle everything past its deadline that the feed can grade.
//
// A call the feed CANNOT grade — freeform, or one that never got an open price —
// is deliberately left alone rather than closed out as unsettleable: it belongs
// to its author, it is sitting in their reflection queue, and settling it here
// would take away the verdict they are the only one who can give.
async function settleDueCalls(now: Date): Promise<void> {
  const rows = await db
    .select()
    .from(tradingNotes)
    .where(
      and(
        eq(tradingNotes.kind, 'prediction'),
        isNull(tradingNotes.outcome),
        isNotNull(tradingNotes.instrument),
        isNotNull(tradingNotes.direction),
        lte(tradingNotes.deadlineAt, now),
      ),
    )
    .limit(200);

  const due = rows.filter((r) => autoSettles(r));
  if (due.length === 0) return;

  const marks = await priceAll(due);
  for (const r of due) {
    const price = marks.get(toPricingInstrument(r.instrument!));
    const verdict: Verdict =
      price == null
        ? { outcome: 'unsettleable', note: unreadableNote(r.instrument!) }
        : gradeCall(r, price);

    await db
      .update(tradingNotes)
      .set({
        outcome: verdict.outcome,
        settleNote: verdict.note,
        settlePrice: price ?? null,
        settledAt: now,
        settledBy: 'auto',
        updatedAt: now,
      })
      .where(and(eq(tradingNotes.id, r.id), isNull(tradingNotes.outcome)))
      .catch(() => {});

    await notifySettled(r, verdict).catch(() => {});
  }
}

// One batched price read for every distinct instrument in a set of rows.
async function priceAll(rows: TradingNoteRow[]): Promise<Map<string, number>> {
  const instruments = new Set(rows.map((r) => toPricingInstrument(r.instrument!)));
  return fetchLivePrices([...instruments]).catch(() => new Map<string, number>());
}

// Tell the author their call settled, and that it is waiting on a reflection.
//
// Only ever to the author. A notification about somebody else's call landing
// would be the terminal pushing one person's market view at another — a
// different feature with a different set of questions behind it, and not one
// this notification is allowed to become.
async function notifySettled(row: TradingNoteRow, verdict: Verdict): Promise<void> {
  const word =
    verdict.outcome === 'hit' ? 'came true' : verdict.outcome === 'miss' ? 'did not come true' : 'could not be settled';
  const title = `Trading note · ${row.instrument ?? 'call'} ${word}`;
  const body = `${row.title}${verdict.note ? ` — ${verdict.note}` : ''}`;
  await sendToUsers([row.userId], { title, body, url: '/?screen=notes', tag: `note-${row.id}` }).catch(() => {});
  await sendPushoverToUsers([row.userId], {
    title,
    message: body,
    // Deliberately quiet. A settled prediction is something to read when you next
    // sit down, not something to be woken for — the loud priorities belong to a
    // level being hit and a position changing.
    priority: 0,
    url: '/?screen=notes',
    urlTitle: 'Open Trading Notes',
  }).catch(() => {});
}

// ---- The loop ----
//
// Five minutes. A weekly call does not need a tighter cadence than that, and the
// open-price stamp is the only time-sensitive half — a mark five minutes after
// the cash open is the right ballpark for a call measured over a week.
const NOTE_SETTLE_MS = Math.max(60, Number(process.env.NOTE_SETTLE_SECONDS) || 300) * 1000;

// Production-only, like every other watch here. Unlike the price-alert watch it
// does NOT require a delivery channel: settling a call is the work, and the
// notification is a courtesy on top. A terminal with no push configured must
// still settle its predictions.
export function startNoteSettleWatch(): void {
  if (!config.isProd) return;
  const tick = () => {
    void tickNoteSettle().catch((err) => console.error('Trading note settle error:', err));
  };
  setTimeout(tick, 20 * 1000);
  const timer = setInterval(tick, NOTE_SETTLE_MS);
  timer.unref?.();
}
