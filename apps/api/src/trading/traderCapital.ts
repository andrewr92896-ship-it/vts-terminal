import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingDeskSettings } from '../db/schema.js';
import { getAllActiveDecrypted, type KrakenCreds, type OandaCreds } from './connections.js';
import { fetchOandaAccountSummary, fetchOandaFunding } from './brokers/oanda.js';
import { fetchKrakenTradeBalance } from './brokers/krakenOrders.js';
import type { AuditActor } from './credentialAudit.js';

// The trader's own capital, as three figures on the Trade History KPI row: what
// they put in, what they have taken back out, and what they are holding now.
//
// **Everything here is the CALLER'S OWN and never the desk's.** Live Brokers
// (capital.ts) is deliberately team-scoped — a desk sees its own accounts'
// capital — but this answers "what have I put in and what do I hold", which is
// one person's money by definition. So the scope is a single id rather than
// visibleTraderIds, and there is no parameter that could widen it.
//
// Each of the two flow figures is either TYPED or SYNCED from the broker's
// funding history, chosen per figure. The two are stored separately, so turning
// sync off hands the trader back the number they typed rather than leaving the
// broker's in its place.

export type CapitalMode = 'manual' | 'synced';

export interface CapitalFigure {
  // What to show. Null means "not stated" — the trader has typed nothing and
  // nothing has been synced. Deliberately not zero: zero is a real answer.
  value: number | null;
  mode: CapitalMode;
  manual: number | null; // what the trader typed, kept while synced
  synced: number | null; // the last GOOD broker reading
}

export interface TraderCapital {
  deposited: CapitalFigure;
  withdrawn: CapitalFigure;
  // What the trader holds right now: NAV summed across their OWN connected
  // broker accounts. Null when it cannot be totalled — no connection, none of
  // them answered, or they are kept in different currencies (adding those would
  // be a number that is simply wrong, the same rule Net Worth follows).
  total: number | null;
  accounts: number; // connected accounts the total covers
  // Connected accounts that did not answer. Named rather than silently left
  // out: a total missing an account looks complete while understating.
  unreadable: number;
  currency: string | null;
  // Whether syncing is available at all: it needs a connected OANDA account.
  canSync: boolean;
  syncedAt: number | null;
  // Funding events OANDA files as transfers that are not client deposits —
  // between the trader's own accounts, or an entity migration. Reported so the
  // figure can say what it left out rather than quietly disagreeing with the
  // broker's own statement.
  otherTransfers: number;
  // Why a synced figure is missing or stale. Null when there is nothing to say.
  note: string | null;
}

// A synced figure is refreshed on read once it is this old. Deposits move a few
// times a year at most, so this is about keeping the card current without
// turning every screen load into a broker call.
const SYNC_TTL_MS = 15 * 60 * 1000;

// The live NAV is re-read at most this often per trader, so flipping between the
// Trade Log and Live Brokers does not fan out to the broker each time.
const TOTAL_TTL_MS = 60 * 1000;

interface TotalCache {
  at: number;
  total: number | null;
  accounts: number;
  unreadable: number;
  currency: string | null;
  // Whether an OANDA connection exists to sync funding from — carried here so
  // answering `canSync` does not cost a second decrypt pass per read.
  hasOanda: boolean;
}
const totalCache = new Map<string, TotalCache>();

function figure(mode: CapitalMode, manual: number | null, synced: number | null): CapitalFigure {
  return { value: mode === 'synced' ? synced : manual, mode, manual, synced };
}

async function row(userId: string) {
  return (
    await db.select().from(tradingDeskSettings).where(eq(tradingDeskSettings.id, userId)).limit(1)
  )[0];
}

// The trader's own active OANDA connections. Kraken is deliberately absent: its
// ledger records a deposit in whatever asset arrived, so "0.5 BTC in" needs the
// price on the day it landed to become capital in dollars — a figure the
// terminal does not have and would have to invent. A crypto deposit is typed in
// by hand until there is an honest way to price it.
async function ownOandaConnections(userId: string, actor: AuditActor | undefined, purpose: 'capital' | 'funding') {
  const conns = await getAllActiveDecrypted(new Set([userId]), { purpose, actor });
  return conns.filter((c) => c.broker === 'oanda' && c.ownerId === userId);
}

function oandaCfg(c: { creds: unknown }) {
  const cr = c.creds as OandaCreds;
  return {
    token: cr.token,
    accountId: cr.accountId,
    base: cr.env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com',
  };
}

// What the trader is holding now, across their own connected accounts — OANDA
// NAV plus a Kraken account's USD-valued equity. Cached briefly per trader.
//
// A connection that will not answer is LEFT OUT AND COUNTED, never guessed at:
// `unreadable` puts "1 account not read" on the card, because a total quietly
// missing an account looks complete while understating what the trader holds —
// the same reason Net Worth refuses an incomplete figure outright. Mixed
// currencies refuse the total the same way (Kraken's reading is a USD
// valuation, so it only ever joins a USD desk).
async function liveTotal(userId: string, actor: AuditActor | undefined): Promise<TotalCache> {
  const cached = totalCache.get(userId);
  if (cached && Date.now() - cached.at < TOTAL_TTL_MS) return cached;

  const conns = (await getAllActiveDecrypted(new Set([userId]), { purpose: 'capital', actor })).filter(
    (c) => c.ownerId === userId && (c.broker === 'oanda' || c.broker === 'kraken'),
  );
  const read = await Promise.all(
    conns.map(async (c): Promise<{ value: number; currency: string } | null | 'failed'> => {
      try {
        if (c.broker === 'oanda') {
          const cap = await fetchOandaAccountSummary(oandaCfg(c));
          return cap.nav == null ? 'failed' : { value: cap.nav, currency: cap.currency };
        }
        const cr = c.creds as KrakenCreds;
        const bal = await fetchKrakenTradeBalance({ apiKey: cr.apiKey, apiSecret: cr.apiSecret });
        const value = bal.equity ?? bal.balance;
        return value == null ? 'failed' : { value, currency: 'USD' };
      } catch {
        return 'failed';
      }
    }),
  );
  const ok = read.filter((r): r is { value: number; currency: string } => r !== 'failed' && r != null);
  const unreadable = read.filter((r) => r === 'failed').length;
  const currencies = new Set(ok.map((r) => r.currency));
  const next: TotalCache = {
    at: Date.now(),
    // One currency or no total: adding GBP to USD would be a plausible-looking
    // number that is simply wrong.
    total:
      ok.length > 0 && currencies.size === 1
        ? Number(ok.reduce((s, r) => s + r.value, 0).toFixed(2))
        : null,
    accounts: ok.length,
    unreadable,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    hasOanda: conns.some((c) => c.broker === 'oanda'),
  };
  totalCache.set(userId, next);
  return next;
}

// Pull the funding history and store it as the last good reading. Returns null
// when nothing could be read, leaving whatever was stored in place.
async function refreshSynced(
  userId: string,
  actor: AuditActor | undefined,
): Promise<{ deposits: number; withdrawals: number; otherTransfers: number; truncated: boolean } | null> {
  const conns = await ownOandaConnections(userId, actor, 'funding');
  if (conns.length === 0) return null;
  const results = await Promise.all(
    conns.map(async (c) => {
      try {
        return await fetchOandaFunding(oandaCfg(c));
      } catch {
        return null;
      }
    }),
  );
  const ok = results.filter((r): r is NonNullable<typeof r> => r != null);
  // Nothing readable — keep the last good figures rather than writing zeros over
  // them. A stale deposit total is a far better answer than a wrong one.
  if (ok.length === 0) return null;
  // Accounts in different currencies cannot be added, so the sync refuses rather
  // than totalling them. The trader can still type the figure.
  if (new Set(ok.map((r) => r.currency)).size > 1) return null;
  const totals = {
    deposits: Number(ok.reduce((s, r) => s + r.deposits, 0).toFixed(2)),
    withdrawals: Number(ok.reduce((s, r) => s + r.withdrawals, 0).toFixed(2)),
    otherTransfers: ok.reduce((s, r) => s + r.otherTransfers, 0),
    truncated: ok.some((r) => r.truncated),
  };
  await db
    .insert(tradingDeskSettings)
    .values({
      id: userId,
      syncedDeposited: totals.deposits,
      syncedWithdrawn: totals.withdrawals,
      capitalSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tradingDeskSettings.id,
      set: {
        syncedDeposited: totals.deposits,
        syncedWithdrawn: totals.withdrawals,
        capitalSyncedAt: new Date(),
      },
    });
  return totals;
}

export interface CapitalOptions {
  actor?: AuditActor;
  // Force a refresh now, whatever the age of the stored reading. This is the
  // Sync button; an ordinary read refreshes only once the figure is stale.
  refresh?: boolean;
}

export async function getTraderCapital(userId: string, opts: CapitalOptions = {}): Promise<TraderCapital> {
  let r = await row(userId);
  const wantsSync = !!r?.depositedSync || !!r?.withdrawnSync;
  const stale = !r?.capitalSyncedAt || Date.now() - r.capitalSyncedAt.getTime() > SYNC_TTL_MS;

  let note: string | null = null;
  let otherTransfers = 0;
  let truncated = false;
  if (wantsSync && (opts.refresh || stale)) {
    const fresh = await refreshSynced(userId, opts.actor);
    if (fresh) {
      otherTransfers = fresh.otherTransfers;
      truncated = fresh.truncated;
      r = await row(userId);
    } else {
      // Say so rather than showing a figure that quietly stopped moving.
      note = 'The broker’s funding history could not be read just now, so this is the last figure that came back.';
    }
  }

  const total = await liveTotal(userId, opts.actor);
  const canSync = total.hasOanda;

  if (truncated) {
    note = 'Only part of the funding history could be read, so these totals are understated.';
  }

  return {
    deposited: figure(r?.depositedSync ? 'synced' : 'manual', r?.depositedCapital ?? null, r?.syncedDeposited ?? null),
    withdrawn: figure(r?.withdrawnSync ? 'synced' : 'manual', r?.withdrawnCapital ?? null, r?.syncedWithdrawn ?? null),
    total: total.total,
    accounts: total.accounts,
    unreadable: total.unreadable,
    currency: total.currency,
    canSync,
    syncedAt: r?.capitalSyncedAt ? r.capitalSyncedAt.getTime() : null,
    otherTransfers,
    note,
  };
}

// The Sync button: turn syncing on for one figure and pull it now. Refused
// outright with no OANDA connection — the client hides the button then, so the
// only way to reach this is a hand-rolled request, and turning sync on with
// nothing behind it would leave the card reading "—" in auto mode forever.
export async function syncCapital(
  userId: string,
  which: 'deposited' | 'withdrawn',
  actor?: AuditActor,
): Promise<TraderCapital> {
  const conns = await ownOandaConnections(userId, actor, 'capital');
  if (conns.length === 0) throw new Error('Connect an OANDA account to sync from');
  const patch: CapitalPatch = which === 'deposited' ? { depositedSync: true } : { withdrawnSync: true };
  return updateTraderCapital(userId, patch, { actor, refresh: true });
}

export interface CapitalPatch {
  // A number sets the typed figure AND returns that figure to manual mode —
  // typing over a synced number is how a trader takes it back. Null clears it.
  deposited?: number | null;
  withdrawn?: number | null;
  // Turn syncing on or off for one figure. Turning it on does not refresh by
  // itself; the route asks for that, so the Sync button is one action.
  depositedSync?: boolean;
  withdrawnSync?: boolean;
}

const money = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : Math.max(0, v);

export async function updateTraderCapital(
  userId: string,
  patch: CapitalPatch,
  opts: CapitalOptions = {},
): Promise<TraderCapital> {
  const current = await row(userId);
  const set: Partial<typeof tradingDeskSettings.$inferInsert> = { updatedAt: new Date() };

  if (patch.deposited !== undefined) {
    set.depositedCapital = money(patch.deposited);
    // Typing a figure is a statement that this is the number to use.
    set.depositedSync = false;
  }
  if (patch.withdrawn !== undefined) {
    set.withdrawnCapital = money(patch.withdrawn);
    set.withdrawnSync = false;
  }
  if (patch.depositedSync !== undefined) set.depositedSync = patch.depositedSync;
  if (patch.withdrawnSync !== undefined) set.withdrawnSync = patch.withdrawnSync;

  await db
    .insert(tradingDeskSettings)
    .values({
      id: userId,
      breakEvenMode: current?.breakEvenMode ?? 'percent',
      breakEvenPct: current?.breakEvenPct ?? 0,
      breakEvenAmount: current?.breakEvenAmount ?? 0,
      minTradeUnits: current?.minTradeUnits ?? 0,
      ...set,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({ target: tradingDeskSettings.id, set });

  return getTraderCapital(userId, opts);
}
