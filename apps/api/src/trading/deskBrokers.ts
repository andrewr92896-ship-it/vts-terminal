import type { BrokerConnectionKind } from '../db/schema.js';
import type { OandaConfig, KrakenConfig } from './config.js';
import type { DecryptedConnection, KrakenCreds, OandaCreds } from './connections.js';
import { fetchOandaAccountSummary } from './brokers/oanda.js';
import {
  cancelOandaOrder,
  closeOandaTrade,
  fetchOandaInstrumentSpecs,
  fetchOandaPendingOrders,
  fetchOandaQuotes,
  modifyOandaTradeOrders,
  OandaOrderError,
  placeOandaOrder,
  toOandaSymbol,
} from './brokers/oandaOrders.js';
import { KrakenError, KRAKEN_FIAT } from './brokers/krakenClient.js';
import {
  cancelKrakenOrder,
  fetchKrakenBalances,
  fetchKrakenOpenOrders,
  fetchKrakenPairs,
  fetchKrakenQuotes,
  fetchKrakenTradeBalance,
  krakenUsdFactor,
  placeKrakenOrder,
  type KrakenPairSpec,
} from './brokers/krakenOrders.js';

// One desk, two venues.
//
// The Trade Desk was built around OANDA, whose model is a *trade*: an object with
// an id, a stop and a target attached to it, closed by that id. Kraken spot has
// no such object — you buy a coin and hold a balance, and a protective order is
// a separate order the exchange places for you when the entry fills. Rather than
// pretend one is the other, this file states what each venue can actually do and
// normalizes the rest, so trading/orderDesk.ts holds the *policy* (who may trade,
// what gets journalled, what is refused) in one place for both.
//
// The differences that matter, declared per adapter rather than sniffed at each
// call site:
//
//   • `spot` — Kraken commits the full cash cost of a buy and a sell is a sale of
//     coins already held; OANDA posts margin and can be short without owning it.
//   • `maxProtectiveOrders` — OANDA attaches a stop *and* a target to a fill.
//     Kraken spot REST attaches exactly one conditional close and has no bracket,
//     so a ticket carrying both is refused rather than half-honoured.
//   • `canAmendProtection` — an OANDA trade's stop/target can be moved after the
//     fact. A Kraken holding has no attached orders to move; its protective order
//     is an ordinary resting order, cancelled and replaced from Working orders.
//
// **Kraken is spot-only, deliberately.** No code path here sends `leverage`, so
// the desk cannot open a margin position on Kraken. Existing Kraken margin
// positions still appear on the Live Wall (the read connector reports them) but
// stay watch-only here — `close`/`amend` refuse them by name.

export class DeskError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status = 400, code: string | null = null) {
    super(message);
    this.name = 'DeskError';
    this.status = status;
    this.code = code;
  }
}

// The broker's own refusal code, whichever venue raised it, so the ticket can
// show what the exchange actually said.
export function brokerErrorCode(e: unknown): string | null {
  if (e instanceof OandaOrderError || e instanceof KrakenError) return e.code;
  return null;
}

// ---- the normalized shapes the desk works in ----

export interface DeskInstrumentSpec {
  symbol: string; // the venue's own symbol: "EUR_USD", "XBTUSD"
  instrument: string; // display form: "EUR/USD", "BTC/USD"
  displayName: string;
  type: string; // CURRENCY / CFD / METAL / CRYPTO
  pipSize: number;
  displayPrecision: number; // decimals a price may carry
  tradeUnitsPrecision: number; // decimals a size may carry
  minimumTradeSize: number;
  maximumOrderUnits: number | null;
  marginRate: number | null;
  // Kraken enforces a minimum order *value* as well as a minimum size — a
  // 0.0001 BTC order can clear the size floor and still be refused for being
  // worth less than the pair's costmin. Null where the venue has no such rule.
  minimumOrderCost: number | null;
  // False when the venue has restricted the instrument (Kraken's cancel_only /
  // post_only / reduce_only states). A closed *market* is a property of the
  // quote, not of this list.
  tradeable: boolean;
}

export interface DeskQuoteRow {
  instrument: string;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  tradeable: boolean;
  time: number | null;
  // Quote currency → account currency, so risk is priced in real money on any
  // instrument. Null when it cannot be resolved.
  quoteHomeFactor: number | null;
}

export interface DeskCapital {
  currency: string;
  balance: number | null;
  nav: number | null;
  unrealizedPl: number | null;
  marginUsed: number | null;
  marginAvailable: number | null;
  openTradeCount: number | null;
}

export interface DeskPlaceRequest {
  spec: DeskInstrumentSpec;
  side: 'long' | 'short';
  units: number;
  type: 'market' | 'limit' | 'stop';
  price: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
}

export interface DeskPlaceResponse {
  status: 'filled' | 'accepted';
  orderId: string | null;
  tradeId: string | null;
  fillPrice: number | null;
  units: number | null;
}

export interface DeskCloseResponse {
  closedUnits: number | null;
  price: number | null;
  realizedPl: number | null;
  partial: boolean;
}

export interface DeskWorkingOrderRow {
  id: string;
  type: string;
  instrument: string;
  units: number; // signed: + buy / − sell
  price: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  timeInForce: string | null;
  createdAt: number | null;
  tradeId: string | null;
}

// A coin the account actually holds. Spot has no "position" to close, so this is
// what the desk shows instead — and selling one is an ordinary order, placed
// from the ticket, not a separate write path.
export interface DeskHolding {
  asset: string; // "BTC", or "BTC.S" when staked
  instrument: string | null; // the pair the desk can price and sell it through
  units: number;
  onOrder: number; // already committed to a resting order
  price: number | null; // in the account currency
  value: number | null; // units × price
  staked: boolean; // staked/bonded balances cannot be sold without unstaking
  minimumTradeSize: number | null;
}

export interface DeskBroker {
  readonly broker: BrokerConnectionKind;
  readonly connectionId: string;
  readonly label: string;
  readonly env: 'practice' | 'live';
  readonly accountTail: string;
  readonly spot: boolean;
  readonly maxProtectiveOrders: 1 | 2;
  readonly canAmendProtection: boolean;
  capital(): Promise<DeskCapital>;
  instruments(): Promise<DeskInstrumentSpec[]>;
  quotes(instruments: string[]): Promise<DeskQuoteRow[]>;
  place(input: DeskPlaceRequest): Promise<DeskPlaceResponse>;
  close(input: { tradeId: string; instrument: string; units: number | null }): Promise<DeskCloseResponse>;
  amend(input: { tradeId: string; spec: DeskInstrumentSpec; takeProfit?: number | null; stopLoss?: number | null }): Promise<void>;
  workingOrders(): Promise<DeskWorkingOrderRow[]>;
  cancel(orderId: string): Promise<void>;
  holdings(): Promise<DeskHolding[]>;
}

// ---- the tradeable-set cache ----
//
// A venue's instrument list and its precisions barely move, and every ticket
// keystroke would otherwise re-fetch them. OANDA's list is per account (an
// entity may not offer every instrument), so it is cached per connection;
// Kraken's is public and identical for everybody, so one entry serves the whole
// install rather than one per trader.

const SPEC_TTL_MS = 10 * 60_000;
const specCache = new Map<string, { at: number; specs: DeskInstrumentSpec[] }>();

async function cachedSpecs(key: string, load: () => Promise<DeskInstrumentSpec[]>): Promise<DeskInstrumentSpec[]> {
  const hit = specCache.get(key);
  if (hit && Date.now() - hit.at < SPEC_TTL_MS) return hit.specs;
  const specs = await load();
  specCache.set(key, { at: Date.now(), specs });
  return specs;
}

// ---- OANDA ----

function oandaCfg(creds: OandaCreds): OandaConfig {
  return {
    token: creds.token,
    accountId: creds.accountId,
    base: creds.env === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com',
  };
}

function oandaBroker(conn: DecryptedConnection): DeskBroker {
  const creds = conn.creds as OandaCreds;
  const cfg = oandaCfg(creds);
  const instruments = () =>
    cachedSpecs(`oanda:${conn.id}`, async () => {
      const specs = await fetchOandaInstrumentSpecs(cfg);
      return specs.map((s) => ({ ...s, minimumOrderCost: null, tradeable: true }));
    });

  return {
    broker: 'oanda',
    connectionId: conn.id,
    label: conn.label,
    env: creds.env,
    // Enough to tell two accounts apart on a screen that gets shared, without
    // printing the whole thing. Eight characters, because an OANDA id ends
    // "…-1234567-001": four would show only the sub-account number.
    accountTail: creds.accountId.slice(-8),
    spot: false,
    maxProtectiveOrders: 2,
    canAmendProtection: true,
    capital: () => fetchOandaAccountSummary(cfg),
    instruments,
    quotes: (list) => fetchOandaQuotes(cfg, list),
    place: async (input) => {
      const res = await placeOandaOrder(cfg, {
        instrument: input.spec.symbol,
        // OANDA encodes direction in the sign of the size.
        units: input.side === 'long' ? input.units : -input.units,
        type: input.type.toUpperCase() as 'MARKET' | 'LIMIT' | 'STOP',
        price: input.price,
        takeProfit: input.takeProfit,
        stopLoss: input.stopLoss,
        displayPrecision: input.spec.displayPrecision,
        tradeUnitsPrecision: input.spec.tradeUnitsPrecision,
      });
      return {
        status: res.status,
        orderId: res.orderId,
        tradeId: res.tradeId,
        fillPrice: res.fillPrice,
        units: res.units == null ? null : Math.abs(res.units),
      };
    },
    close: async ({ tradeId, instrument, units }) => {
      const specs = await instruments().catch((): DeskInstrumentSpec[] => []);
      const spec = specs.find((s) => s.instrument === instrument || s.symbol === toOandaSymbol(instrument));
      const size = units == null || units <= 0 ? ('ALL' as const) : units;
      const res = await closeOandaTrade(cfg, tradeId, size, spec?.tradeUnitsPrecision ?? 0);
      return { closedUnits: res.closedUnits, price: res.price, realizedPl: res.realizedPl, partial: res.partial };
    },
    amend: ({ tradeId, spec, takeProfit, stopLoss }) =>
      modifyOandaTradeOrders(cfg, tradeId, { takeProfit, stopLoss, displayPrecision: spec.displayPrecision }),
    workingOrders: async () => {
      const orders = await fetchOandaPendingOrders(cfg);
      // A TP/SL belonging to an open trade is shown on the position it protects,
      // not as a standalone working order.
      return orders.filter((o) => !o.tradeId);
    },
    cancel: (orderId) => cancelOandaOrder(cfg, orderId),
    // Margin trading has no holdings — the position *is* the exposure.
    holdings: async () => [],
  };
}

// ---- Kraken (spot) ----

function krakenCfg(creds: KrakenCreds): KrakenConfig {
  return { apiKey: creds.apiKey, apiSecret: creds.apiSecret };
}

// Kraken quotes and settles in whatever the pair's quote asset is; the desk
// denominates a Kraken account in USD, which is what TradeBalance is asked for
// and what every money figure on the ticket then means.
const KRAKEN_ACCOUNT_CURRENCY = 'USD';

// Kraken's own pair rows, kept beside the normalized specs because placing an
// order needs the tick size and the canonical key that the desk shape drops.
// Module-level, not per adapter: an adapter is built fresh on every request, so
// a cache living inside one would re-fetch the whole exchange each time. The
// list is public and identical for every account, so one copy serves everybody.
let krakenPairs: { at: number; pairs: KrakenPairSpec[] } | null = null;
let krakenPairsInFlight: Promise<KrakenPairSpec[]> | null = null;

async function loadKrakenPairs(): Promise<KrakenPairSpec[]> {
  if (krakenPairs && Date.now() - krakenPairs.at < SPEC_TTL_MS) return krakenPairs.pairs;
  // A desk opening fires several of these at once; share the one request rather
  // than asking Kraken for the whole exchange four times in a second.
  if (!krakenPairsInFlight) {
    krakenPairsInFlight = fetchKrakenPairs()
      .then((pairs) => {
        krakenPairs = { at: Date.now(), pairs };
        return pairs;
      })
      .finally(() => {
        krakenPairsInFlight = null;
      });
  }
  return krakenPairsInFlight;
}

function toDeskSpec(p: KrakenPairSpec): DeskInstrumentSpec {
  return {
    symbol: p.altname,
    instrument: p.instrument,
    displayName: p.instrument,
    type: 'CRYPTO',
    // Crypto has no pip. The desk's single test for a genuine currency pair
    // (trading/forex.ts, mirrored in workspaces/trading/pips.ts) already refuses
    // a coin, so this value is never read as a pip size for a Kraken pair — one
    // whole unit of price is what a crypto move is quoted in.
    pipSize: 1,
    displayPrecision: p.pricePrecision,
    tradeUnitsPrecision: p.volumePrecision,
    minimumTradeSize: p.minimumVolume,
    // Kraken publishes no per-order maximum; position limits are a margin
    // concept and this connector never touches margin.
    maximumOrderUnits: null,
    // Spot commits the whole cash cost rather than a fraction of it, so the
    // ticket's estimate is the full notional — labelled "Cost", not "Margin".
    marginRate: 1,
    minimumOrderCost: p.minimumCost,
    tradeable: p.online,
  };
}

function krakenBroker(conn: DecryptedConnection): DeskBroker {
  const creds = conn.creds as KrakenCreds;
  const cfg = krakenCfg(creds);

  const instruments = () =>
    cachedSpecs('kraken:pairs', async () => (await loadKrakenPairs()).filter((p) => p.online).map(toDeskSpec));

  const nativeFor = async (instrument: string): Promise<KrakenPairSpec> => {
    const pairs = await loadKrakenPairs();
    const wanted = instrument.trim().toUpperCase();
    const spec = pairs.find(
      (p) => p.instrument.toUpperCase() === wanted || p.altname.toUpperCase() === wanted || p.key.toUpperCase() === wanted,
    );
    if (!spec) throw new DeskError(`${instrument} is not tradeable on Kraken`, 400);
    return spec;
  };

  return {
    broker: 'kraken',
    connectionId: conn.id,
    label: conn.label,
    // Kraken has no practice environment. Saying "live" is not a default here,
    // it is the fact — and the ticket's red LIVE MONEY badge should show.
    env: 'live',
    accountTail: creds.apiKey.slice(-6),
    spot: true,
    maxProtectiveOrders: 1,
    canAmendProtection: false,
    capital: async () => {
      const [bal, holdings] = await Promise.all([
        fetchKrakenTradeBalance(cfg),
        fetchKrakenBalances(cfg).catch(() => []),
      ]);
      // What a spot account can actually spend is its cash, less whatever a
      // resting buy order has already claimed — not a margin figure. The desk
      // reports that in `marginAvailable` because that is the slot the ticket
      // reads for "can I afford this", and labels it "cash" on a spot account.
      const cash = holdings.find((b) => b.asset === KRAKEN_ACCOUNT_CURRENCY);
      return {
        currency: KRAKEN_ACCOUNT_CURRENCY,
        balance: bal.balance,
        nav: bal.equity,
        unrealizedPl: bal.unrealizedPl,
        marginUsed: bal.marginUsed,
        marginAvailable: cash ? Math.max(0, cash.amount - cash.onOrder) : bal.marginFree,
        // Spot has no open trades; what the card counts is coins held.
        openTradeCount: holdings.filter((b) => !KRAKEN_FIAT.has(b.asset.split('.')[0])).length,
      };
    },
    instruments,
    quotes: async (list) => {
      const pairs = await loadKrakenPairs();
      const wanted = new Set(list.map((s) => s.trim().toUpperCase()));
      const picked = pairs.filter(
        (p) => wanted.has(p.instrument.toUpperCase()) || wanted.has(p.altname.toUpperCase()) || wanted.has(p.key.toUpperCase()),
      );
      const quotes = await fetchKrakenQuotes(picked);
      // One conversion lookup per distinct quote asset, not per quote.
      const factors = new Map<string, number | null>();
      await Promise.all(
        [...new Set(picked.map((p) => p.quote))].map(async (q) => {
          factors.set(q, await krakenUsdFactor(q, pairs).catch(() => null));
        }),
      );
      return quotes.map((q) => {
        const spec = picked.find((p) => p.instrument === q.instrument);
        return { ...q, quoteHomeFactor: spec ? factors.get(spec.quote) ?? null : null };
      });
    },
    place: async (input) => {
      const spec = await nativeFor(input.spec.instrument);
      // Exactly one protective order rides an entry here, and orderDesk has
      // already refused a ticket carrying both — so whichever is set is the one.
      const close =
        input.stopLoss != null
          ? ({ kind: 'stop-loss', price: input.stopLoss } as const)
          : input.takeProfit != null
            ? ({ kind: 'take-profit', price: input.takeProfit } as const)
            : null;
      const res = await placeKrakenOrder(cfg, {
        spec,
        side: input.side === 'long' ? 'buy' : 'sell',
        volume: input.units,
        type: input.type === 'stop' ? 'stop-loss' : input.type,
        price: input.price,
        close,
      });
      return {
        status: res.status,
        orderId: res.orderId,
        // Spot has no trade object to hold on to; the order id is the only
        // handle, and it is already in `orderId`.
        tradeId: null,
        fillPrice: res.fillPrice,
        units: res.volume ?? input.units,
      };
    },
    close: async () => {
      throw new DeskError(
        'Kraken positions are not closed from here. A coin you hold is sold like any other order — pick it in Holdings and the ticket is filled in for you.',
        400,
        'SPOT_NO_CLOSE',
      );
    },
    amend: async () => {
      throw new DeskError(
        'Kraken has no stop or target attached to a holding. A protective order is an ordinary resting order — cancel it under Working orders and place a new one.',
        400,
        'SPOT_NO_AMEND',
      );
    },
    workingOrders: async () => {
      const pairs = await loadKrakenPairs();
      const orders = await fetchKrakenOpenOrders(cfg, pairs);
      return orders.map((o) => ({
        ...o,
        takeProfit: null,
        stopLoss: null,
        timeInForce: null,
        tradeId: null,
      }));
    },
    cancel: (orderId) => cancelKrakenOrder(cfg, orderId),
    holdings: async () => {
      const [balances, pairs] = await Promise.all([fetchKrakenBalances(cfg), loadKrakenPairs()]);
      const coins = balances.filter((b) => !KRAKEN_FIAT.has(b.asset.split('.')[0]));
      if (coins.length === 0) return [];

      // Price each coin through its own USD pair. A staked balance still has a
      // value worth showing even though it cannot be sold as it stands.
      const pairFor = (asset: string): KrakenPairSpec | null =>
        pairs.find((p) => p.base === asset && p.quote === KRAKEN_ACCOUNT_CURRENCY) ?? null;
      const priced = coins.map((b) => ({ balance: b, spec: pairFor(b.asset.split('.')[0]) }));
      const quotes = await fetchKrakenQuotes(
        [...new Map(priced.filter((p) => p.spec).map((p) => [p.spec!.key, p.spec!])).values()],
      ).catch(() => []);
      const priceOf = (instrument: string | null): number | null => {
        if (!instrument) return null;
        const q = quotes.find((x) => x.instrument === instrument);
        // A holding is valued at what it could be sold for — the bid.
        return q?.bid ?? q?.ask ?? null;
      };

      return priced
        .map(({ balance, spec }) => {
          const staked = balance.asset.includes('.');
          const price = priceOf(spec?.instrument ?? null);
          return {
            asset: balance.asset,
            // A staked balance is not sellable as it stands, so it carries no
            // instrument — the desk shows its value but offers no Sell.
            instrument: staked ? null : spec?.instrument ?? null,
            units: balance.amount,
            onOrder: balance.onOrder,
            price,
            value: price == null ? null : price * balance.amount,
            staked,
            minimumTradeSize: spec?.minimumVolume ?? null,
          };
        })
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    },
  };
}

// ---- resolution ----

// Whether a connection can be traded from the desk at all. The manual/prop
// connectors are hand-entered records with no venue behind them.
export function isTradeableBroker(broker: BrokerConnectionKind): boolean {
  return broker === 'oanda' || broker === 'kraken';
}

// Build the adapter for one of the caller's own connections. Only ever called
// with a connection already resolved through getActiveDecrypted(userId), which
// is what keeps a trader on their own account.
export function deskBrokerFor(conn: DecryptedConnection): DeskBroker {
  if (conn.broker === 'oanda') return oandaBroker(conn);
  if (conn.broker === 'kraken') return krakenBroker(conn);
  throw new DeskError(`${conn.label} is a manual record, not a venue the desk can send orders to`, 400);
}
