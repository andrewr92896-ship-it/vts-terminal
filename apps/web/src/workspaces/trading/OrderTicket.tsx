import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { fmtMoney, fmtUnits } from './TradeCard';
import { forexPair } from './pips';
import type { DeskAccount, DeskInstrument, DeskOrderType, DeskQuote, TradeSide } from '../../api/types';

// The order ticket — the one component in the terminal that sends a real order to
// a real broker. Everything on it is built around not placing a trade the trader
// did not mean to place:
//
//   • the size, stop and target are shown in money *before* the order goes in,
//     priced from the live quote rather than assumed to be dollars per pip;
//   • nothing is sent on the first click — the ticket goes to a review panel
//     that states the order in one sentence, and a live account says so in red;
//   • the price it quotes is the side of the book the order will actually pay
//     (buy at the ask, sell at the bid), so the risk figure is the real one.
//
// The server re-validates all of it (trading/orderDesk.ts) — this is the layer
// that explains, not the layer that enforces.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = 'rgba(3,12,32,.6)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';
const MONO = "'IBM Plex Mono', monospace";

// The quote drives the money figures on the ticket, so it is polled tightly —
// but only ever for the one instrument the ticket is showing.
const QUOTE_MS = 2000;

const TYPES: { key: DeskOrderType; label: string; hint: string }[] = [
  { key: 'market', label: 'Market', hint: 'Fill now at the best available price' },
  { key: 'limit', label: 'Limit', hint: 'Rest on the book until price comes to you' },
  { key: 'stop', label: 'Stop', hint: 'Trigger once price trades through your level' },
];

// Quick-size shortcuts. Which ladder applies depends on how the instrument is
// actually sized: FX and the whole-unit CFDs trade in thousands (a micro lot is
// 1,000 units), while anything the broker allows a fractional size on — crypto,
// most notably — trades in fractions of one. A "1k" chip beside a bitcoin
// ticket is not a shortcut, it is a trap.
const WHOLE_UNIT_CHIPS = [1000, 5000, 10_000, 25_000, 100_000];
const FRACTIONAL_CHIPS = [0.01, 0.05, 0.1, 0.5, 1];

// On a spot account the chips are amounts of money instead, because that is how
// a coin is actually bought: "$500 of bitcoin", never "0.005 of it". The size
// they set is worked out from the live price at the moment they are pressed.
const SPOT_COST_CHIPS = [100, 250, 500, 1000, 5000];

// The ladder for one instrument, bounded by what the broker will actually
// accept. A chip the broker would reject is worse than no chip.
function sizeChipsFor(spec: DeskInstrument | null): number[] {
  if (!spec) return WHOLE_UNIT_CHIPS;
  const ladder = spec.tradeUnitsPrecision > 0 ? FRACTIONAL_CHIPS : WHOLE_UNIT_CHIPS;
  const usable = ladder.filter(
    (n) => n >= spec.minimumTradeSize && (spec.maximumOrderUnits == null || n <= spec.maximumOrderUnits),
  );
  // An instrument whose limits exclude the whole ladder still gets one useful
  // shortcut: the smallest size it will take.
  return usable.length > 0 ? usable : [spec.minimumTradeSize];
}

// The cost chips worth offering: one that cannot clear the venue's minimum
// order value, or that buys less than its minimum size, would only ever be
// refused.
function costChipsFor(spec: DeskInstrument | null, price: number | null): number[] {
  if (!spec || price == null || price <= 0) return [];
  return SPOT_COST_CHIPS.filter(
    (cost) => cost / price >= spec.minimumTradeSize && (spec.minimumOrderCost == null || cost >= spec.minimumOrderCost),
  );
}

// A sale loaded in from the Holdings panel. `token` changes on every press, so
// picking the same holding twice re-fills the ticket instead of doing nothing.
export interface TicketPrefill {
  side: TradeSide;
  units: number;
  token: number;
}

interface Props {
  account: DeskAccount;
  instruments: DeskInstrument[];
  instrument: string; // display form, e.g. "EUR/USD" — controlled by the screen
  onInstrument: (instrument: string) => void;
  readOnly: boolean;
  onPlaced: () => void; // refresh the wall / working orders / journal
  prefill?: TicketPrefill | null;
}

type Placed = { kind: 'ok'; message: string } | { kind: 'error'; message: string };

export function OrderTicket({ account, instruments, instrument, onInstrument, readOnly, onPlaced, prefill }: Props) {
  const [side, setSide] = useState<TradeSide>('long');
  const [type, setType] = useState<DeskOrderType>('market');
  const [unitsText, setUnitsText] = useState('1000');
  const [priceText, setPriceText] = useState('');
  const [slText, setSlText] = useState('');
  const [tpText, setTpText] = useState('');
  const [riskText, setRiskText] = useState('');
  const [quote, setQuote] = useState<DeskQuote | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Placed | null>(null);

  const spec = useMemo(
    () => instruments.find((i) => i.instrument === instrument) ?? null,
    [instruments, instrument],
  );

  // Every price on the ticket is rendered at the instrument's own precision, so
  // the two sides of a quote line up digit for digit. The generic price
  // formatter trims trailing zeros, which is right on a card but reads as
  // broken on a bid/ask pair — 1.153 sitting beside 1.15335 looks like two
  // different instruments.
  const px = (v: number | null | undefined): string =>
    v == null ? '—' : v.toFixed(spec?.displayPrecision ?? 5);

  // Poll the live quote for the selected instrument only.
  const loadQuote = useCallback(async () => {
    if (!spec) return;
    try {
      const { quotes } = await api.deskQuotes(account.connectionId, [spec.symbol]);
      setQuote(quotes[0] ?? null);
      setQuoteError(false);
    } catch {
      setQuoteError(true);
    }
  }, [account.connectionId, spec]);

  useEffect(() => {
    setQuote(null);
    void loadQuote();
    const id = window.setInterval(() => void loadQuote(), QUOTE_MS);
    return () => window.clearInterval(id);
  }, [loadQuote]);

  // Changing the instrument or the side invalidates prices typed against the old
  // one — a stop that was below the market on EUR/USD is nonsense on USD/JPY.
  const resetPrices = useCallback(() => {
    setPriceText('');
    setSlText('');
    setTpText('');
    setConfirming(false);
  }, []);
  useEffect(resetPrices, [instrument, resetPrices]);

  // A holding picked in the Holdings panel arrives here as a filled-in ticket,
  // not as a placed order — the review step is exactly what makes selling from
  // a list safe.
  useEffect(() => {
    if (!prefill) return;
    setSide(prefill.side);
    setType('market');
    setUnitsText(String(prefill.units));
    setResult(null);
    setConfirming(false);
  }, [prefill]);

  const units = Number(unitsText.replace(/[, ]/g, ''));
  const limitPrice = priceText.trim() === '' ? null : Number(priceText);
  const stopLoss = slText.trim() === '' ? null : Number(slText);
  const takeProfit = tpText.trim() === '' ? null : Number(tpText);

  // The price this order actually transacts at: a buy pays the ask, a sell hits
  // the bid, and a resting order works off its own trigger level.
  const reference =
    type === 'market' ? (side === 'long' ? quote?.ask ?? null : quote?.bid ?? null) : limitPrice;

  const factor = quote?.quoteHomeFactor ?? null;
  const pipSize = spec?.pipSize ?? 0.0001;

  // Is this a genuine currency pair? A pip is an FX convention — gold, indices,
  // crypto and (later) shares have no pip, and labelling their price moves in
  // pips would be inventing a unit. `forexPair` is the terminal's single test for
  // this (mirrored server-side in trading/forex.ts), so the ticket agrees with
  // how the Live Wall and the Trade Log already score a trade.
  const isForex = forexPair(instrument) != null;

  // The unit of price movement this instrument is read in. For a currency pair
  // that is a pip, sized by the broker's own pipLocation rather than a
  // JPY-or-not guess. For everything else it is one whole point of price — an
  // index going 5,000 → 5,001, a share moving a dollar — which is what "points"
  // means everywhere it is used, and deliberately NOT the instrument's
  // pipLocation: OANDA reports 0.01 for gold, so reading that as a "point"
  // would quote the figure in cents.
  const step = isForex ? pipSize : 1;
  const stepName = isForex ? 'pip' : 'point'; // "$1.00 / pip"
  const stepPlural = isForex ? 'pips' : 'pts'; // "43.5 pips", "1,355 pts"

  // What one of those units is worth at this size, in the account's currency —
  // the figure a trader sizes by. Needs the quote for the currency conversion,
  // so it reads "—" for the second or two before the first quote lands.
  const perStep =
    factor != null && Number.isFinite(units) && units > 0 ? units * step * factor : null;

  // Money at risk / on offer, priced through the quote → account-currency factor
  // rather than assumed. Null whenever a piece is missing, so the ticket shows
  // "—" instead of a confidently wrong number.
  const money = (distance: number | null): number | null =>
    distance == null || factor == null || !Number.isFinite(units) || units <= 0
      ? null
      : Math.abs(distance) * units * factor;
  const riskDistance = reference != null && stopLoss != null ? reference - stopLoss : null;
  const rewardDistance = reference != null && takeProfit != null ? takeProfit - reference : null;
  const riskMoney = money(riskDistance);
  const rewardMoney = money(rewardDistance);
  const rr = riskMoney != null && rewardMoney != null && riskMoney > 0 ? rewardMoney / riskMoney : null;
  const notional = reference != null && factor != null && Number.isFinite(units) ? units * reference * factor : null;
  const marginEstimate = notional != null && spec?.marginRate != null ? notional * spec.marginRate : null;

  // A spot account buys the asset outright: the whole cost leaves the balance,
  // there is no margin, and a sell disposes of coins already held. A margin
  // account posts a fraction and can be short without owning anything. The two
  // read differently on the ticket because they *are* different.
  const spot = account.spot;
  const baseAsset = instrument.split('/')[0] ?? '';
  // Some venues attach one protective order to a fill rather than two (crypto
  // spot has no bracket). Setting both would silently lose one, so the ticket
  // asks for one and says why.
  const oneProtectiveOrder = account.maxProtectiveOrders < 2;
  const costChips = spot ? costChipsFor(spec, quote?.ask ?? quote?.bid ?? null) : [];

  // Size from cost, for a spot account: "$500 of bitcoin" is the sizing a crypto
  // trader actually does. Priced off the side of the book the order will pay,
  // and never allowed below the venue's minimum size.
  const setUnitsFromCost = (cost: number) => {
    const price = side === 'long' ? quote?.ask ?? quote?.bid : quote?.bid ?? quote?.ask;
    if (!spec || price == null || price <= 0) return;
    const step = Math.pow(10, spec.tradeUnitsPrecision);
    const sized = Math.max(spec.minimumTradeSize, Math.floor((cost / price) * step) / step);
    setUnitsText(String(Number(sized.toFixed(spec.tradeUnitsPrecision))));
  };

  // Size from risk: given a stop and an amount to risk, how many units is that.
  // Rounded to the instrument's own size precision — whole units for FX, but a
  // fractional size for the CFDs that allow one, where rounding to an integer
  // would quietly multiply the position.
  const sizeFromRisk = () => {
    const risk = Number(riskText);
    if (!spec || !Number.isFinite(risk) || risk <= 0 || riskDistance == null || factor == null) return;
    const per = Math.abs(riskDistance) * factor;
    if (per <= 0) return;
    const step = Math.pow(10, spec.tradeUnitsPrecision);
    const sized = Math.max(spec.minimumTradeSize, Math.round((risk / per) * step) / step);
    setUnitsText(String(Number(sized.toFixed(spec.tradeUnitsPrecision))));
  };

  // Local mirror of the server's protection check, so a wrong stop is caught in
  // the ticket rather than as a broker rejection.
  const problem = ((): string | null => {
    if (!spec) return 'Pick an instrument';
    if (!Number.isFinite(units) || units <= 0) return 'Enter a size';
    if (units < spec.minimumTradeSize) {
      return `Minimum size is ${fmtUnits(spec.minimumTradeSize)}${spot ? ` ${baseAsset}` : ' units'}`;
    }
    if (spec.maximumOrderUnits != null && units > spec.maximumOrderUnits) {
      return `Maximum size is ${spec.maximumOrderUnits.toLocaleString('en-US')} units`;
    }
    if (oneProtectiveOrder && stopLoss != null && takeProfit != null) {
      return 'This account takes one protective order — a stop or a target';
    }
    if (type !== 'market' && (limitPrice == null || !Number.isFinite(limitPrice) || limitPrice <= 0)) {
      return 'Enter a trigger price';
    }
    if (quote && !quote.tradeable) return `${instrument} is closed right now`;
    // A minimum order *value*, where the venue has one: a size above the size
    // floor can still be worth too little to accept.
    if (spec.minimumOrderCost != null && reference != null && units * reference < spec.minimumOrderCost) {
      // Stated in the pair's own quote currency, which is what the venue's rule
      // is denominated in — not necessarily the account's.
      return `Orders here have to be worth at least ${spec.minimumOrderCost} ${instrument.split('/')[1] ?? ''}`.trim();
    }
    if (reference != null) {
      const long = side === 'long';
      if (stopLoss != null) {
        if (!Number.isFinite(stopLoss)) return 'Stop loss is not a number';
        if (long && stopLoss >= reference) return 'A long’s stop has to sit below the entry';
        if (!long && stopLoss <= reference) return 'A short’s stop has to sit above the entry';
      }
      if (takeProfit != null) {
        if (!Number.isFinite(takeProfit)) return 'Take profit is not a number';
        if (long && takeProfit <= reference) return 'A long’s target has to sit above the entry';
        if (!long && takeProfit >= reference) return 'A short’s target has to sit below the entry';
      }
    }
    return null;
  })();

  const place = async () => {
    if (!spec || problem) return;
    setSending(true);
    try {
      const res = await api.placeDeskOrder({
        connectionId: account.connectionId,
        instrument: spec.instrument,
        side,
        units,
        type,
        price: type === 'market' ? null : limitPrice,
        stopLoss,
        takeProfit,
      });
      const verb = side === 'long' ? 'Bought' : 'Sold';
      setResult({
        kind: 'ok',
        message:
          res.status === 'filled'
            ? `${verb} ${fmtUnits(res.units ?? units)} ${res.instrument}${res.fillPrice == null ? '' : ` at ${px(res.fillPrice)}`}`
            : `${type === 'market' ? 'Market' : type === 'limit' ? 'Limit' : 'Stop'} order working: ${side === 'long' ? 'buy' : 'sell'} ${fmtUnits(units)} ${res.instrument}${type === 'market' ? '' : ` at ${px(limitPrice)}`}`,
      });
      setConfirming(false);
      onPlaced();
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof ApiError ? e.message : 'The order could not be placed' });
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const live = account.env === 'live';
  const sideColor = side === 'long' ? GREEN : RED;

  return (
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{"Order ticket"}</div>
        <span style={live ? livePill : practicePill}>{live ? 'LIVE MONEY' : 'PRACTICE'}</span>
      </div>

      <InstrumentPicker
        instruments={instruments}
        value={instrument}
        onChange={onInstrument}
        disabled={readOnly}
      />

      {/* One two-sided price control rather than a quote row above a Buy/Sell
          row: at a desk, reading a side's price and choosing that side are the
          same act, and two controls that do the same thing is what made this
          look duplicated. The selected side is filled; the spread sits between
          them where it is being compared. */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
        <SideButton
          label="Sell"
          price={px(quote?.bid)}
          active={side === 'short'}
          color={RED}
          disabled={readOnly}
          onClick={() => setSide('short')}
        />
        <div style={spreadCell}>
          <div style={{ fontSize: 8.5, color: FAINT, letterSpacing: '.6px' }}>{"SPREAD"}</div>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: quote?.tradeable === false ? RED : MUTED }}>
            {/* Pips on a currency pair, points on everything else. */}
            {quote?.spread == null ? (quoteError ? '—' : '·') : fmtSteps(quote.spread / step)}
          </div>
          <div style={{ fontSize: 8.5, color: quote?.tradeable === false ? RED : FAINT, letterSpacing: '.4px' }}>
            {quote?.tradeable === false ? 'CLOSED' : stepPlural.toUpperCase()}
          </div>
        </div>
        <SideButton
          label="Buy"
          price={px(quote?.ask)}
          active={side === 'long'}
          color={GREEN}
          disabled={readOnly}
          onClick={() => setSide('long')}
        />
      </div>

      {/* Order type */}
      <div>
        <Label>{"Order type"}</Label>
        <div style={seg}>
          {TYPES.map((t) => (
            <button key={t.key} onClick={() => setType(t.key)} title={t.hint} style={{ ...segBtn, ...(type === t.key ? segActive : {}) }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {type !== 'market' && (
        <Field label={type === 'limit' ? 'Limit price' : 'Stop trigger price'}>
          <input
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            inputMode="decimal"
            placeholder={quote?.ask != null ? px(quote.ask) : '0.00000'}
            style={{ ...input, width: '100%', boxSizing: 'border-box' }}
          />
        </Field>
      )}

      {/* Size, and the risk that sizes it, on one row — the second is only ever
          used to fill the first. */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={spot ? `Size (${baseAsset})` : 'Size (units)'}>
            <input
              value={unitsText}
              onChange={(e) => setUnitsText(e.target.value)}
              inputMode="decimal"
              style={{ ...input, width: '100%', boxSizing: 'border-box' }}
            />
            {/* What this size is worth per unit of price movement: per pip on a
                currency pair, per point on an index, share, metal or coin. */}
            <div
              style={{ fontSize: 10.5, color: MUTED, marginTop: 4, fontFamily: MONO }}
              title={`What one ${stepName} of price movement is worth at this size`}
            >
              {perStep == null ? '—' : `${perUnitMoney(perStep, account.currency)} / ${stepName}`}
            </div>
          </Field>
          <Field label={`Risk (${account.currency})`}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={riskText}
                onChange={(e) => setRiskText(e.target.value)}
                inputMode="decimal"
                placeholder={riskDistance == null ? 'stop first' : '100'}
                disabled={riskDistance == null}
                title={riskDistance == null ? 'Set a stop loss and this will size the trade for you' : 'Size the trade from this risk'}
                style={{ ...input, flex: 1, minWidth: 0, opacity: riskDistance == null ? 0.5 : 1 }}
              />
              <button
                onClick={sizeFromRisk}
                disabled={riskDistance == null}
                title="Work the size out from the stop distance"
                style={{ ...chip, padding: '0 11px', opacity: riskDistance == null ? 0.4 : 1 }}
              >
                {"Size"}
              </button>
            </div>
          </Field>
        </div>
        {/* On a spot account the shortcuts are amounts of money, because that is
            how a coin is bought — "$500 of bitcoin", not "0.0047 of it". The
            size is worked out from the live price when the chip is pressed. */}
        <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
          {costChips.length > 0
            ? costChips.map((cost) => (
                <button key={cost} onClick={() => setUnitsFromCost(cost)} style={chip} title={`Buy about ${fmtMoney(cost, account.currency)} of ${baseAsset}`}>
                  {`$${cost.toLocaleString('en-US')}`}
                </button>
              ))
            : sizeChipsFor(spec).map((n) => (
                <button key={n} onClick={() => setUnitsText(String(n))} style={chip}>
                  {n >= 1000 ? `${n / 1000}k` : n}
                </button>
              ))}
        </div>
      </div>

      {/* Stop / target. A venue that attaches only one of them to a fill says so
          here rather than silently dropping the other at the exchange. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Stop loss">
          <input value={slText} onChange={(e) => setSlText(e.target.value)} inputMode="decimal" placeholder="—" style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
          <SubReading
            money={riskMoney}
            steps={riskDistance == null ? null : Math.abs(riskDistance) / step}
            unit={stepPlural}
            ccy={account.currency}
            color={RED}
          />
        </Field>
        <Field label="Take profit">
          <input value={tpText} onChange={(e) => setTpText(e.target.value)} inputMode="decimal" placeholder="—" style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
          <SubReading
            money={rewardMoney}
            steps={rewardDistance == null ? null : Math.abs(rewardDistance) / step}
            unit={stepPlural}
            ccy={account.currency}
            color={GREEN}
          />
        </Field>
      </div>

      {oneProtectiveOrder && (
        <div style={{ fontSize: 10.5, color: FAINT, lineHeight: 1.5, marginTop: -4 }}>
          {"This venue attaches one protective order to an entry, not two. Set a stop or a target here; the other goes on as its own order once the trade is running."}
        </div>
      )}

      {/* What this order actually is, in money */}
      <div style={summaryBox}>
        <SummaryCell label="Entry" value={reference == null ? '—' : px(reference)} />
        <SummaryCell label={spot ? 'Order value' : 'Position value'} value={notional == null ? '—' : fmtMoney(notional, account.currency)} />
        <SummaryCell
          // Spot commits the whole cost rather than posting a fraction of it, so
          // calling that figure "margin" would be wrong in both directions.
          label={spot ? 'Cost (est.)' : 'Margin (est.)'}
          value={marginEstimate == null ? '—' : fmtMoney(marginEstimate, account.currency)}
          hint={
            account.marginAvailable != null
              ? `of ${fmtMoney(account.marginAvailable, account.currency)} ${spot ? 'cash' : 'free'}`
              : undefined
          }
        />
        <SummaryCell
          label="Risk / reward"
          value={rr == null ? '—' : `${rr.toFixed(2)}R`}
          color={rr == null ? undefined : rr >= 1 ? GREEN : GOLD}
        />
      </div>

      {result && (
        <div style={{ ...banner, borderColor: result.kind === 'ok' ? 'rgba(53,196,123,.5)' : 'rgba(239,84,104,.5)', color: result.kind === 'ok' ? GREEN : RED }}>
          <span style={{ flex: 1 }}>{result.message}</span>
          <button onClick={() => setResult(null)} style={dismissBtn} aria-label="Dismiss">{"×"}</button>
        </div>
      )}

      {readOnly ? (
        <div style={{ fontSize: 11.5, color: FAINT }}>
          {"Your account has read-only trading access, so the desk shows prices and positions but cannot place orders."}
        </div>
      ) : confirming ? (
        <div style={{ ...confirmBox, borderColor: live ? 'rgba(239,84,104,.55)' : BORDER2 }}>
          <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.5 }}>
            {type === 'market' ? (
              <>
                {side === 'long' ? 'Buy' : 'Sell'} <b style={{ color: sideColor }}>{fmtUnits(units)}</b> {instrument} at
                market{reference != null ? ` (~${px(reference)})` : ''}
              </>
            ) : (
              <>
                {type === 'limit' ? 'Limit' : 'Stop'} {side === 'long' ? 'buy' : 'sell'}{' '}
                <b style={{ color: sideColor }}>{fmtUnits(units)}</b> {instrument} at {px(limitPrice)}
              </>
            )}
            {stopLoss != null && <> · stop {px(stopLoss)}</>}
            {takeProfit != null && <> · target {px(takeProfit)}</>}
          </div>
          {/* Spot has no short: a sell disposes of coins the account already
              holds, and one that does not hold them is simply refused. Saying so
              here is the difference between an obvious no-op and a confusing
              "insufficient funds" a second later. */}
          {spot && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
              {side === 'long'
                ? `Buying ${baseAsset} outright${notional != null ? ` — about ${fmtMoney(notional, account.currency)} leaves the account` : ''}.`
                : `Selling ${baseAsset} you already hold. There is no short here — a sell of coins you do not hold is refused.`}
            </div>
          )}
          <div style={{ fontSize: 11, color: live ? RED : FAINT, marginTop: 6 }}>
            {live
              ? `This is a live account (${account.label} ••${account.accountTail}). Real money moves.`
              : `Practice account (${account.label} ••${account.accountTail}).`}
            {riskMoney != null ? ` Risking about ${fmtMoney(riskMoney, account.currency)}.` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setConfirming(false)} style={ghostBtn} disabled={sending}>{"Cancel"}</button>
            <button
              onClick={() => void place()}
              disabled={sending}
              style={{ ...placeBtn, background: live ? `linear-gradient(180deg,${RED},#c23a4c)` : `linear-gradient(180deg,${GOLD},#C9A24B)`, color: live ? '#fff' : '#0c2768', opacity: sending ? 0.6 : 1 }}
            >
              {sending ? 'Sending…' : live ? 'Confirm — live order' : 'Confirm order'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => { setResult(null); setConfirming(true); }}
            disabled={!!problem}
            style={{ ...placeBtn, width: '100%', background: problem ? 'rgba(255,255,255,.06)' : `linear-gradient(180deg,${sideColor},${side === 'long' ? '#22935a' : '#c23a4c'})`, color: problem ? FAINT : '#fff', cursor: problem ? 'not-allowed' : 'pointer' }}
          >
            {problem ?? `Review ${side === 'long' ? 'buy' : 'sell'} ${Number.isFinite(units) ? fmtUnits(units) : ''} ${instrument}`}
          </button>
          <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8, lineHeight: 1.5 }}>
            {"Orders go straight to your own broker account. Nothing here is investment advice."}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- the instrument picker ----

// A filterable combobox rather than a <select>: an OANDA account carries 60–120
// instruments, which is past the point a native picker is usable on a phone.
function InstrumentPicker({
  instruments,
  value,
  onChange,
  disabled,
}: {
  instruments: DeskInstrument[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    const list = q
      ? instruments.filter((i) => i.instrument.includes(q) || i.displayName.toUpperCase().includes(q))
      : instruments;
    return list.slice(0, 60);
  }, [instruments, query]);

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <Label>{"Instrument"}</Label>
      <button
        onClick={() => { if (!disabled) { setOpen((o) => !o); setQuery(''); } }}
        style={{ ...input, width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: disabled ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ fontWeight: 700 }}>{value || 'Pick an instrument'}</span>
        <span aria-hidden style={{ color: FAINT, fontSize: 11 }}>{"▾"}</span>
      </button>
      {open && (
        <div style={dropdown}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            style={{ ...input, width: '100%', boxSizing: 'border-box', borderRadius: 0, border: 'none', borderBottom: `1px solid ${BORDER}` }}
          />
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {matches.length === 0 && (
              <div style={{ padding: '12px 11px', fontSize: 12, color: FAINT }}>{"Nothing matches"}</div>
            )}
            {matches.map((i) => (
              <button
                key={i.symbol}
                onClick={() => { onChange(i.instrument); setOpen(false); }}
                style={{ ...dropRow, color: i.instrument === value ? GOLD : TEXT }}
              >
                <span style={{ fontFamily: MONO, fontWeight: 600 }}>{i.instrument}</span>
                <span style={{ color: FAINT, fontSize: 11 }}>{i.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- small pieces ----

function Label({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
      {children}
    </div>
  );
}

// `minWidth: 0` matters: a grid/flex child defaults to min-width:auto, so a
// field holding an input plus a button refuses to shrink and steals the width
// from the field beside it — which squeezed the size box down to three digits
// on a phone.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</div>
    </div>
  );
}

// A count of pips or points. Thousands are separated (a 1,355-point stop on
// bitcoin is unreadable as "1355") and the decimal is dropped when it is zero,
// so a round number does not read as falsely precise.
function fmtSteps(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

// Money per unit of price movement, which spans a much wider range than the
// desk's other figures: a standard FX lot is $10.00 a pip while a 1-unit
// connection test is $0.0001, and the shared two-decimal formatter renders that
// second one as "$0.00". Small values keep four decimals so a tiny size reads as
// tiny rather than as free. Currency handling matches fmtMoney: USD gets "$",
// anything else its code.
function perUnitMoney(v: number, ccy: string): string {
  const digits = Math.abs(v) < 0.01 ? 4 : 2;
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return ccy === 'USD' ? `$${abs}` : `${abs} ${ccy}`;
}

// One side of the book: its price, and the act of choosing it. Selected reads
// as a filled block in the side's colour so which way the ticket points is
// legible from across the room; unselected still shows its price, because the
// other side is what you are deciding against.
function SideButton({
  label,
  price,
  active,
  color,
  disabled,
  onClick,
}: {
  label: string;
  price: string;
  active: boolean;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        flex: 1,
        minWidth: 0,
        background: active ? `${color}24` : INPUT_BG,
        border: `1px solid ${active ? color : BORDER}`,
        borderRadius: 9,
        padding: '8px 10px 9px',
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.7px', textTransform: 'uppercase', color: active ? color : MUTED }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, letterSpacing: '-.3px', color: active ? color : TEXT }}>
        {price}
      </div>
    </button>
  );
}

// The money a stop or target is worth, and how far away it is in the
// instrument's own unit of movement — pips for a currency pair, points for an
// index, share, metal or coin.
function SubReading({
  money,
  steps,
  unit,
  ccy,
  color,
}: {
  money: number | null;
  steps: number | null;
  unit: string;
  ccy: string;
  color: string;
}) {
  if (money == null && steps == null) return <div style={{ height: 15 }} />;
  return (
    <div style={{ fontSize: 10.5, color, marginTop: 4, fontFamily: MONO }}>
      {money != null ? fmtMoney(money, ccy) : ''}
      {money != null && steps != null ? ' · ' : ''}
      {steps != null ? `${fmtSteps(steps)} ${unit}` : ''}
    </div>
  );
}

// One reading in the summary block. Stacked label-over-value in a 2×2 grid
// rather than four label/value rows: the same four facts in half the height,
// which is what keeps the Review button above the fold on a laptop.
function SummaryCell({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: MUTED, letterSpacing: '.4px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: color ?? TEXT, marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 9.5, color: FAINT, marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 15 };
const spreadCell: CSSProperties = { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flex: '0 0 auto', minWidth: 58, padding: '0 2px' };
const seg: CSSProperties = { display: 'flex', background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, overflow: 'hidden' };
const segBtn: CSSProperties = { flex: 1, background: 'none', border: 'none', color: MUTED, fontSize: 12, fontWeight: 600, padding: '8px 6px', cursor: 'pointer' };
const segActive: CSSProperties = { background: 'rgba(235,203,116,.14)', color: GOLD };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 15, padding: '9px 11px', outline: 'none', fontFamily: MONO };
const chip: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, color: '#dfe7fa', fontSize: 11.5, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer' };
const summaryBox: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px', background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '11px 12px' };
const confirmBox: CSSProperties = { background: 'rgba(3,12,32,.75)', border: `1px solid ${BORDER2}`, borderRadius: 10, padding: 14 };
const placeBtn: CSSProperties = { border: 'none', fontWeight: 700, fontSize: 13, padding: '12px 18px', borderRadius: 8, cursor: 'pointer', flex: 1 };
const ghostBtn: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, color: '#dfe7fa', fontSize: 12.5, fontWeight: 600, padding: '12px 18px', borderRadius: 8, cursor: 'pointer' };
const banner: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, background: 'rgba(3,12,32,.6)', border: '1px solid', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 };
const dismissBtn: CSSProperties = { background: 'none', border: 'none', color: 'inherit', fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0 };
const dropdown: CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, background: '#08152f', border: `1px solid ${BORDER2}`, borderRadius: 9, overflow: 'hidden', boxShadow: '0 18px 40px rgba(0,0,0,.5)' };
const dropRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, padding: '9px 11px', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' };
const livePill: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.6px', color: RED, background: 'rgba(239,84,104,.14)', border: '1px solid rgba(239,84,104,.45)', padding: '3px 8px', borderRadius: 999 };
const practicePill: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.6px', color: '#6C9EFF', background: 'rgba(108,158,255,.12)', border: '1px solid rgba(108,158,255,.4)', padding: '3px 8px', borderRadius: 999 };
