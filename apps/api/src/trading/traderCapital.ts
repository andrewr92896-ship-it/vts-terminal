import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  brokerConnections,
  tradingCapitalAccounts,
  tradingDeskSettings,
  users,
  type BrokerConnectionKind,
  type TradingCapitalAccountRow,
} from '../db/schema.js';
import { getAllActiveDecrypted, listConnections, type KrakenCreds, type OandaCreds } from './connections.js';
import { fetchOandaAccountSummary, fetchOandaFunding } from './brokers/oanda.js';
import { fetchKrakenTradeBalance } from './brokers/krakenOrders.js';
import { recordCredentialUse, type AuditActor } from './credentialAudit.js';

// A trader's own capital, as three figures on the Trade History KPI row: what
// they put in, what they have taken back out, and what they are holding now.
//
// **CAPITAL IS PER ACCOUNT, NOT PER TRADER** (owner instruction, 2026-08). It
// was one deposited figure and one withdrawn figure per person, each with one
// sync switch — which cannot describe either shape a real desk takes:
//
//   • several broker accounts under ONE login (a partner whose account the desk
//     lead connected). The sync summed every account's funding history into one
//     number, so "my deposit" was really everybody's, and turning sync on for
//     one account turned it on for all of them.
//   • partners who sign in themselves, each holding their own account.
//
// So each (trader, account) pair carries its own deposited and withdrawn
// figures, each independently TYPED or SYNCED from that one account's funding
// history. The card shows the total across a trader's accounts and says how
// that total was arrived at; the breakdown says which account is which.
//
// **Whose capital is a parameter now, and that is a widening.** It used to take
// a single id with nothing that could reach past the caller. A desk lead — a
// group leader holding the Trading Teams grant, or an admin — may now read and
// set a member's capital, gated by the same `canEditDeskSettingsFor` that
// already governs how a teammate's results are scored. Everybody else resolves
// to themselves: the route passes the caller's own id unless it has checked
// that gate. A public signup is unaffected by construction, since the grant is
// handed out by hand.

export type CapitalMode = 'manual' | 'synced';

export interface CapitalFigure {
  // What to show. Null means "not stated" — nothing typed and nothing synced.
  // Deliberately not zero: zero is a real answer.
  value: number | null;
  mode: CapitalMode;
  manual: number | null; // what the trader typed, kept while synced
  synced: number | null; // the last GOOD broker reading
}

// The account-less bucket: capital that is not behind a connected broker
// account. A hand-kept prop book, or a trader with no broker connected at all.
export const OTHER_ACCOUNT = 'other';

export interface CapitalAccount {
  // A broker_connections id, or OTHER_ACCOUNT.
  key: string;
  label: string;
  // Whose account it is. Carried so the desk's breakdown can say who each
  // figure belongs to; a single trader's card has no need to repeat it.
  ownerId: string;
  owner: string;
  broker: BrokerConnectionKind | null;
  summary: string | null;
  // False for a paused/removed connection: its figures still count (the money
  // was paid in) but nothing can be read from it.
  active: boolean;
  // Whether the viewer may set this account's figures. Per account rather than
  // per payload, because the desk's card lists several people's accounts at
  // once and a desk lead may reach some of them and not others.
  canEdit: boolean;
  // Whether this one account can be kept in step with its broker. OANDA only —
  // Kraken's ledger records "0.5 BTC in", which needs the price on the day it
  // landed to become capital in dollars, a figure the terminal does not have.
  canSync: boolean;
  deposited: CapitalFigure;
  withdrawn: CapitalFigure;
  // What the broker said this account is denominated in. Null until something
  // has been synced from it — a typed figure was never asked.
  currency: string | null;
  syncedAt: number | null;
  // Why this account's synced figure is missing, stale or partial.
  note: string | null;
}

// A trader's headline figure: the sum across their accounts, and how it was
// arrived at. `stated`/`unstated` are the same honesty rule the live total
// follows — a figure that leaves an account out must say so rather than reading
// as complete.
export interface CapitalTotal {
  value: number | null;
  mode: 'manual' | 'synced' | 'mixed' | 'none';
  stated: number;
  unstated: number;
  // Set when the accounts stating a figure are kept in different currencies, in
  // which case there is no total: adding GBP to USD is a plausible-looking
  // number that is simply wrong. The breakdown still reads correctly.
  mixedCurrency: boolean;
}

export interface TraderCapital {
  // Whose these are: one trader's id, or **null for the whole visible desk**.
  // The cards follow the KPI row's trader filter like every other figure on it,
  // so this says which scope was answered.
  userId: string | null;
  // How many traders the figures cover. One for a person, more for the desk.
  traders: number;
  deposited: CapitalTotal;
  withdrawn: CapitalTotal;
  // One entry per account that can hold capital, plus the 'other' bucket.
  breakdown: CapitalAccount[];
  // What the trader holds right now: NAV summed across their connected broker
  // accounts. Null when it cannot be totalled — no connection, none of them
  // answered, or they are kept in different currencies (adding those would be a
  // number that is simply wrong, the same rule Net Worth follows).
  total: number | null;
  accounts: number; // connected accounts the total covers
  // Connected accounts that did not answer. Named rather than silently left
  // out: a total missing an account looks complete while understating.
  unreadable: number;
  currency: string | null;
  // Whether syncing is available at all: it needs a connected OANDA account.
  canSync: boolean;
  syncedAt: number | null; // the most recent reading across the accounts
  // Funding events OANDA files as transfers that are not client deposits —
  // between the trader's own accounts, or an entity migration. Reported so the
  // figure can say what it left out rather than quietly disagreeing with the
  // broker's own statement.
  otherTransfers: number;
  // Why a synced figure is missing or stale. Null when there is nothing to say.
  note: string | null;
  // Whether the viewer may change these. False when a desk lead is reading a
  // member's capital they may see but not set — which cannot currently happen
  // (the same gate governs both), but the client draws its controls off this
  // rather than re-deriving who it is.
  canEdit: boolean;
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

function figure(row: CapitalRow | undefined, which: 'deposited' | 'withdrawn'): CapitalFigure {
  const manual = (which === 'deposited' ? row?.depositedCapital : row?.withdrawnCapital) ?? null;
  const synced = (which === 'deposited' ? row?.syncedDeposited : row?.syncedWithdrawn) ?? null;
  const on = which === 'deposited' ? !!row?.depositedSync : !!row?.withdrawnSync;
  return { value: on ? synced : manual, mode: on ? 'synced' : 'manual', manual, synced };
}

// The headline figure for one side: the sum of the accounts that state one.
// Accounts stating nothing are counted rather than read as zero — the same rule
// the live total follows for an account that would not answer.
function rollUp(accounts: CapitalAccount[], which: 'deposited' | 'withdrawn'): CapitalTotal {
  const stated = accounts.filter((a) => a[which].value != null);
  const synced = stated.filter((a) => a[which].mode === 'synced').length;
  // Only a currency the broker actually reported counts here. A typed figure was
  // never asked what it is denominated in, so it joins whatever the desk holds
  // rather than blocking a total on a question nobody was asked.
  const currencies = new Set(stated.map((a) => a.currency).filter((c): c is string => !!c));
  const mixedCurrency = currencies.size > 1;
  return {
    value:
      stated.length === 0 || mixedCurrency
        ? null
        : Number(stated.reduce((s, a) => s + (a[which].value as number), 0).toFixed(2)),
    mixedCurrency,
    mode:
      stated.length === 0
        ? 'none'
        : synced === stated.length
          ? 'synced'
          : synced === 0
            ? 'manual'
            : 'mixed',
    stated: stated.length,
    unstated: accounts.length - stated.length,
  };
}

type CapitalRow = TradingCapitalAccountRow;

async function capitalRows(userId: string): Promise<Map<string, CapitalRow>> {
  const rows = await db
    .select()
    .from(tradingCapitalAccounts)
    .where(eq(tradingCapitalAccounts.userId, userId));
  return new Map(rows.map((r) => [r.accountKey, r]));
}

// The accounts a trader's capital can sit behind, in the order the rest of the
// terminal lists their connections. A `manual` connection is excluded — it holds
// no money of its own, it is a hand-kept record of a book somewhere else, and
// that is what the 'other' bucket is for.
interface AccountSlot {
  key: string;
  label: string;
  broker: BrokerConnectionKind | null;
  summary: string | null;
  active: boolean;
  canSync: boolean;
}

async function slotsFor(userId: string, rows: Map<string, CapitalRow>): Promise<AccountSlot[]> {
  const conns = (await listConnections(userId)).filter((c) => c.broker !== 'manual');
  const slots: AccountSlot[] = conns.map((c) => ({
    key: c.id,
    label: c.label,
    broker: c.broker,
    summary: c.summary,
    active: c.active,
    canSync: c.broker === 'oanda' && c.active,
  }));
  // A row whose connection has since been removed keeps its place, named for
  // what it is. Dropping it would take a figure the trader entered off the card
  // with nothing said — the money was still paid in.
  const known = new Set(slots.map((s) => s.key));
  for (const key of rows.keys()) {
    if (key === OTHER_ACCOUNT || known.has(key)) continue;
    slots.push({
      key,
      label: 'Account no longer connected',
      broker: null,
      summary: null,
      active: false,
      canSync: false,
    });
  }
  // The account-less bucket is always offered, and always last.
  slots.push({
    key: OTHER_ACCOUNT,
    label: 'Not from a connected account',
    broker: null,
    summary: null,
    active: true,
    canSync: false,
  });
  return slots;
}

function oandaCfg(creds: unknown) {
  const cr = creds as OandaCreds;
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
async function liveTotal(traderIds: string[], actor: AuditActor | undefined): Promise<TotalCache> {
  // Keyed on the whole scope, so a person's card and the desk's are cached
  // apart rather than one answering for the other.
  const cacheKey = [...traderIds].sort().join(',');
  const cached = totalCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TOTAL_TTL_MS) return cached;

  const scope = new Set(traderIds);
  const conns = (await getAllActiveDecrypted(scope, { purpose: 'capital', actor })).filter(
    (c) => scope.has(c.ownerId) && (c.broker === 'oanda' || c.broker === 'kraken'),
  );
  const read = await Promise.all(
    conns.map(async (c): Promise<{ value: number; currency: string } | null | 'failed'> => {
      try {
        if (c.broker === 'oanda') {
          const cap = await fetchOandaAccountSummary(oandaCfg(c.creds));
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
  totalCache.set(cacheKey, next);
  return next;
}

const STALE_NOTE =
  'The broker’s funding history could not be read just now, so this is the last figure that came back.';
const TRUNCATED_NOTE = 'Only part of the funding history could be read, so these totals are understated.';

// Pull the funding history for the named accounts and store each one's reading
// on its own row. One account at a time, deliberately: summing several accounts
// into one figure is the fault this whole file exists to correct.
async function refreshAccounts(
  userId: string,
  keys: string[],
  actor: AuditActor | undefined,
): Promise<Map<string, { otherTransfers: number; truncated: boolean } | null>> {
  const out = new Map<string, { otherTransfers: number; truncated: boolean } | null>();
  if (keys.length === 0) return out;

  // One decrypt pass for the whole refresh. `deferred` because the audit row is
  // written below, per account, with the outcome the broker actually gave —
  // recording a funding read against a connection this pass never asked about
  // would be false on the one screen whose job is telling somebody their key was
  // used.
  const conns = await getAllActiveDecrypted(new Set([userId]), {
    purpose: 'funding',
    actor,
    deferred: true,
  });
  const byId = new Map(conns.filter((c) => c.ownerId === userId).map((c) => [c.id, c]));

  for (const key of keys) {
    const conn = byId.get(key);
    if (!conn || conn.broker !== 'oanda') {
      out.set(key, null);
      continue;
    }
    try {
      const funding = await fetchOandaFunding(oandaCfg(conn.creds));
      const reading = {
        syncedDeposited: funding.deposits,
        syncedWithdrawn: funding.withdrawals,
        currency: funding.currency,
        capitalSyncedAt: new Date(),
        updatedAt: new Date(),
      };
      await db
        .insert(tradingCapitalAccounts)
        .values({ userId, accountKey: key, ...reading })
        .onConflictDoUpdate({
          target: [tradingCapitalAccounts.userId, tradingCapitalAccounts.accountKey],
          set: reading,
        });
      recordCredentialUse({ connectionId: key, ownerUserId: userId, purpose: 'funding', actor, ok: true });
      out.set(key, { otherTransfers: funding.otherTransfers, truncated: funding.truncated });
    } catch (err) {
      // Nothing readable — keep the last good figure rather than writing a zero
      // over it. A stale deposit total is a far better answer than a wrong one.
      recordCredentialUse({
        connectionId: key,
        ownerUserId: userId,
        purpose: 'funding',
        actor,
        ok: false,
        error: err instanceof Error ? err.message : 'Could not read funding history',
      });
      out.set(key, null);
    }
  }
  return out;
}

export interface CapitalOptions {
  actor?: AuditActor;
  // Whose figures the viewer may SET. The route decides it — only the route
  // knows who is asking — and it is a set rather than a boolean because the
  // desk's card carries several people's accounts at once.
  editableOwners?: Set<string>;
  // Account keys to refresh now, whatever the age of the stored reading. This is
  // the Sync button; an ordinary read refreshes only what has gone stale.
  refresh?: string[];
}

// One trader's accounts, refreshed where a sync has gone stale. The unit both
// scopes are built from — a person's card is one of these, the desk's is
// several concatenated — so the two can never score an account differently.
async function accountsForTrader(
  userId: string,
  owner: string,
  opts: CapitalOptions,
): Promise<{ accounts: CapitalAccount[]; otherTransfers: number }> {
  const canEdit = opts.editableOwners ? opts.editableOwners.has(userId) : true;
  let rows = await capitalRows(userId);
  const slots = await slotsFor(userId, rows);
  const forced = new Set(opts.refresh ?? []);

  // Which accounts want a broker reading: syncing is on for one of their two
  // figures, and there is something to read it from.
  const due = slots
    .filter((s) => s.canSync)
    .filter((s) => {
      const r = rows.get(s.key);
      if (!r || (!r.depositedSync && !r.withdrawnSync)) return false;
      if (forced.has(s.key)) return true;
      return !r.capitalSyncedAt || Date.now() - r.capitalSyncedAt.getTime() > SYNC_TTL_MS;
    })
    .map((s) => s.key);

  const refreshed = await refreshAccounts(userId, due, opts.actor);
  if (due.length > 0) rows = await capitalRows(userId);

  let otherTransfers = 0;
  for (const r of refreshed.values()) if (r) otherTransfers += r.otherTransfers;

  const accounts: CapitalAccount[] = slots.map((s) => {
    const row = rows.get(s.key);
    const result = refreshed.get(s.key);
    const syncing = !!row?.depositedSync || !!row?.withdrawnSync;
    let note: string | null = null;
    if (syncing && refreshed.has(s.key)) {
      // Say so rather than showing a figure that quietly stopped moving.
      if (result == null) note = STALE_NOTE;
      else if (result.truncated) note = TRUNCATED_NOTE;
    }
    return {
      key: s.key,
      label: s.label,
      ownerId: userId,
      owner,
      canEdit,
      broker: s.broker,
      summary: s.summary,
      active: s.active,
      canSync: s.canSync,
      deposited: figure(row, 'deposited'),
      withdrawn: figure(row, 'withdrawn'),
      currency: row?.currency ?? null,
      syncedAt: row?.capitalSyncedAt ? row.capitalSyncedAt.getTime() : null,
      note,
    };
  });

  return { accounts, otherTransfers };
}

async function displayNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// Assemble a card from accounts that are already read.
function assemble(
  userId: string | null,
  traders: number,
  accounts: CapitalAccount[],
  total: TotalCache,
  otherTransfers: number,
): TraderCapital {
  const syncedAt = accounts.reduce<number | null>(
    (latest, a) => (a.syncedAt != null && (latest == null || a.syncedAt > latest) ? a.syncedAt : latest),
    null,
  );
  const stale = accounts.some((a) => a.note === STALE_NOTE);
  const truncated = accounts.some((a) => a.note === TRUNCATED_NOTE);
  return {
    userId,
    traders,
    deposited: rollUp(accounts, 'deposited'),
    withdrawn: rollUp(accounts, 'withdrawn'),
    breakdown: accounts,
    total: total.total,
    accounts: total.accounts,
    unreadable: total.unreadable,
    currency: total.currency,
    canSync: total.hasOanda,
    syncedAt,
    otherTransfers,
    note: stale ? STALE_NOTE : truncated ? TRUNCATED_NOTE : null,
    // The button on the card: whether there is anything here to set at all.
    canEdit: accounts.some((a) => a.canEdit),
  };
}

// What was put into (and taken out of) each of the named broker accounts, for a
// surface that is already listing those accounts — Live Brokers and its Live
// Wall tile, which say what each account is worth right now and had nothing to
// say about what went into it.
//
// It reads the stored rows and nothing else: no broker call, no refresh. The
// figures are kept current by the capital cards, and a NAV panel must not
// become a second thing that triggers a funding sync.
export async function capitalByConnection(
  connectionIds: string[],
): Promise<Map<string, { deposited: number | null; withdrawn: number | null }>> {
  const out = new Map<string, { deposited: number | null; withdrawn: number | null }>();
  if (connectionIds.length === 0) return out;
  const rows = await db
    .select()
    .from(tradingCapitalAccounts)
    .where(inArray(tradingCapitalAccounts.accountKey, connectionIds));
  for (const row of rows) {
    // The same typed-or-synced rule the cards read, so the two surfaces cannot
    // disagree about which figure is the live one.
    out.set(row.accountKey, {
      deposited: figure(row, 'deposited').value,
      withdrawn: figure(row, 'withdrawn').value,
    });
  }
  return out;
}

export async function getTraderCapital(userId: string, opts: CapitalOptions = {}): Promise<TraderCapital> {
  const [{ accounts, otherTransfers }, total] = await Promise.all([
    displayNames([userId]).then((names) => accountsForTrader(userId, names.get(userId) ?? '', opts)),
    liveTotal([userId], opts.actor),
  ]);
  return assemble(userId, 1, accounts, total, otherTransfers);
}

// THE WHOLE VISIBLE DESK — what several traders put in between them.
//
// The KPI row's trader filter governs these cards like every other figure on it,
// so "Whole desk" has to mean the desk here too. Showing one person's deposit
// beside the desk's combined P/L was the fault this replaced: the return it
// computed was the desk's profit over one member's money, which is nobody's
// return.
//
// The TOTAL is read-only, and that is not a UI decision: a figure belonging to
// several people has no single owner to write it back to. The accounts under it
// are not — a desk lead sets each person's on the person's own row, which is
// what "edit my group's capital" means without inventing a second, group-owned
// number for the sum to disagree with.
export async function getDeskCapital(traderIds: string[], opts: CapitalOptions = {}): Promise<TraderCapital> {
  const ids = [...new Set(traderIds)];
  const names = await displayNames(ids);
  const [perTrader, total] = await Promise.all([
    Promise.all(ids.map((id) => accountsForTrader(id, names.get(id) ?? '', opts))),
    liveTotal(ids, opts.actor),
  ]);
  return assemble(
    null,
    ids.length,
    perTrader.flatMap((r) => r.accounts),
    total,
    perTrader.reduce((sum, r) => sum + r.otherTransfers, 0),
  );
}

// The Sync button on one account: turn syncing on for one figure and pull it
// now. Refused outright unless that account is a live OANDA connection — the
// client only draws the button there, so the only way to reach this is a
// hand-rolled request, and turning sync on with nothing behind it would leave
// the row reading "—" in auto mode forever.
export async function syncCapital(
  userId: string,
  account: string,
  which: 'deposited' | 'withdrawn',
  actor?: AuditActor,
): Promise<TraderCapital> {
  const conn = (await listConnections(userId)).find((c) => c.id === account);
  if (!conn || conn.broker !== 'oanda' || !conn.active) {
    throw new Error('That account cannot be synced — connect an active OANDA account to sync from');
  }
  const patch: CapitalPatch =
    which === 'deposited' ? { account, depositedSync: true } : { account, withdrawnSync: true };
  return updateTraderCapital(userId, patch, {
    actor,
    refresh: [account],
    editableOwners: new Set([userId]),
  });
}

export interface CapitalPatch {
  // Which account this is about: a connection id, or OTHER_ACCOUNT.
  account: string;
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
  const rows = await capitalRows(userId);
  const slots = await slotsFor(userId, rows);
  // An account key that is not one of this trader's own is refused rather than
  // stored: a row keyed on somebody else's connection would be a figure with
  // nothing behind it, and nothing later would tell them apart.
  if (!slots.some((s) => s.key === patch.account)) throw new Error('Unknown account');

  const set: Partial<typeof tradingCapitalAccounts.$inferInsert> = { updatedAt: new Date() };

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
    .insert(tradingCapitalAccounts)
    .values({ userId, accountKey: patch.account, ...set, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [tradingCapitalAccounts.userId, tradingCapitalAccounts.accountKey],
      set,
    });

  return getTraderCapital(userId, opts);
}

// ---- Carrying the old per-trader figures across (migration 0127) ------------
//
// Run on boot rather than in the migration, because the split needs to know
// which of a trader's connections exist and which can be synced — that is code,
// not SQL. It is idempotent: a trader who already has per-account rows is left
// alone, so this does nothing from the second boot onwards and never undoes
// somebody's later edit.
//
// The rules, per figure:
//   • sync was ON  → every OANDA connection the trader holds gets that sync
//     switch, so the total comes back to the same number the old summed sync
//     was showing, already split by account. Each row's first read fills in its
//     own reading.
//   • sync was ON with no OANDA connection left → the last synced figure is
//     carried to the 'other' bucket as a typed number, so what was on the card
//     stays on the card rather than blanking.
//   • sync was OFF → the typed figure moves to the 'other' bucket. It is the
//     honest place for it: nothing recorded which account it referred to.
//
// A figure typed while that side was synced is NOT carried: it was not the
// number on screen, and adding it to the 'other' bucket would silently inflate
// the total. It stays in the old column, which is why those are kept.
export async function backfillCapitalAccounts(): Promise<void> {
  const legacy = await db
    .select()
    .from(tradingDeskSettings)
    // The shared 'desk' default row must never answer a capital question: one
    // trader's deposit is not another's.
    .where(ne(tradingDeskSettings.id, 'desk'));
  const carry = legacy.filter(
    (r) =>
      r.depositedCapital != null ||
      r.withdrawnCapital != null ||
      r.depositedSync ||
      r.withdrawnSync ||
      r.syncedDeposited != null ||
      r.syncedWithdrawn != null,
  );
  if (carry.length === 0) return;

  const ids = carry.map((r) => r.id);
  const existing = new Set(
    (
      await db
        .select({ userId: tradingCapitalAccounts.userId })
        .from(tradingCapitalAccounts)
        .where(inArray(tradingCapitalAccounts.userId, ids))
    ).map((r) => r.userId),
  );
  const todo = carry.filter((r) => !existing.has(r.id));
  if (todo.length === 0) return;

  const oanda = await db
    .select({ id: brokerConnections.id, userId: brokerConnections.userId })
    .from(brokerConnections)
    .where(
      and(
        inArray(brokerConnections.userId, todo.map((r) => r.id)),
        eq(brokerConnections.broker, 'oanda'),
        eq(brokerConnections.active, true),
      ),
    );

  let moved = 0;
  for (const row of todo) {
    const conns = oanda.filter((c) => c.userId === row.id).map((c) => c.id);
    const values: (typeof tradingCapitalAccounts.$inferInsert)[] = [];

    const depositedToConns = row.depositedSync && conns.length > 0;
    const withdrawnToConns = row.withdrawnSync && conns.length > 0;
    for (const id of conns) {
      if (!depositedToConns && !withdrawnToConns) break;
      values.push({
        userId: row.id,
        accountKey: id,
        depositedSync: depositedToConns,
        withdrawnSync: withdrawnToConns,
        updatedAt: new Date(),
      });
    }

    const other: typeof tradingCapitalAccounts.$inferInsert = {
      userId: row.id,
      accountKey: OTHER_ACCOUNT,
      depositedCapital: row.depositedSync
        ? depositedToConns
          ? null
          : (row.syncedDeposited ?? null)
        : (row.depositedCapital ?? null),
      withdrawnCapital: row.withdrawnSync
        ? withdrawnToConns
          ? null
          : (row.syncedWithdrawn ?? null)
        : (row.withdrawnCapital ?? null),
      updatedAt: new Date(),
    };
    if (other.depositedCapital != null || other.withdrawnCapital != null) values.push(other);

    if (values.length === 0) continue;
    await db.insert(tradingCapitalAccounts).values(values).onConflictDoNothing();
    moved += 1;
  }
  if (moved > 0) console.log(`[capital] carried ${moved} trader capital record(s) onto per-account rows`);
}
