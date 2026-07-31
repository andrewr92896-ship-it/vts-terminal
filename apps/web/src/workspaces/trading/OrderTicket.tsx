import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { fmtMoney, fmtPrice } from './TradeCard';
import type { DeskAccount, DeskInstrument, DeskOrderType, DeskQuote, TradeSide } from '../../api/types';

// The order ticket — the one component in the portal that sends a real order to
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

const SIZE_CHIPS = [1000, 5000, 10_000, 25_000, 100_000];

interface Props {
  account: DeskAccount;
  instruments: DeskInstrument[];
  instrument: string; // display form, e.g. "EUR/USD" — controlled by the screen
  onInstrument: (instrument: string) => void;
  readOnly: boolean;
  onPlaced: () => void; // refresh the wall / working orders / journal
}

type Placed = { kind: 'ok'; message: string } | { kind: 'error'; message: string };

export function OrderTicket({ account, instruments, instrument, onInstrument, readOnly, onPlaced }: Props) {
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
    if (units < spec.minimumTradeSize) return `Minimum size is ${spec.minimumTradeSize.toLocaleString('en-US')} units`;
    if (spec.maximumOrderUnits != null && units > spec.maximumOrderUnits) {
      return `Maximum size is ${spec.maximumOrderUnits.toLocaleString('en-US')} units`;
    }
    if (type !== 'market' && (limitPrice == null || !Number.isFinite(limitPrice) || limitPrice <= 0)) {
      return 'Enter a trigger price';
    }
    if (quote && !quote.tradeable) return `${instrument} is closed right now`;
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
            ? `${verb} ${(res.units ?? units).toLocaleString('en-US')} ${res.instrument} at ${fmtPrice(res.fillPrice)}`
            : `${type === 'limit' ? 'Limit' : 'Stop'} order working: ${side === 'long' ? 'buy' : 'sell'} ${units.toLocaleString('en-US')} ${res.instrument} at ${fmtPrice(limitPrice)}`,
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
    <div style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 14 }}>
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

      {/* Live two-sided price. The side you'd pay is highlighted. */}
      <div style={quoteRow}>
        <PriceCell
          label="Sell / bid"
          value={quote?.bid ?? null}
          active={side === 'short'}
          color={RED}
          onClick={() => setSide('short')}
        />
        <div style={{ textAlign: 'center', minWidth: 74 }}>
          <div style={{ fontSize: 9.5, color: FAINT, letterSpacing: '.5px' }}>{"SPREAD"}</div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: quote?.tradeable === false ? RED : MUTED }}>
            {quote?.spread != null ? (quote.spread / pipSize).toFixed(1) : quoteError ? '—' : '·'}
          </div>
          {quote?.tradeable === false && <div style={{ fontSize: 9.5, color: RED }}>{"Closed"}</div>}
        </div>
        <PriceCell
          label="Buy / ask"
          value={quote?.ask ?? null}
          active={side === 'long'}
          color={GREEN}
          onClick={() => setSide('long')}
        />
      </div>

      {/* Buy / Sell */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setSide('short')} style={sideBtn(side === 'short', RED)} disabled={readOnly}>
          {"Sell"}
        </button>
        <button onClick={() => setSide('long')} style={sideBtn(side === 'long', GREEN)} disabled={readOnly}>
          {"Buy"}
        </button>
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
            placeholder={quote?.ask != null ? String(quote.ask) : '0.00000'}
            style={input}
          />
        </Field>
      )}

      {/* Size */}
      <div>
        <Label>{"Size (units)"}</Label>
        <input
          value={unitsText}
          onChange={(e) => setUnitsText(e.target.value)}
          inputMode="numeric"
          style={{ ...input, width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
          {SIZE_CHIPS.map((n) => (
            <button key={n} onClick={() => setUnitsText(String(n))} style={chip}>
              {n >= 1000 ? `${n / 1000}k` : n}
            </button>
          ))}
        </div>
      </div>

      {/* Stop / target */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Stop loss">
          <input value={slText} onChange={(e) => setSlText(e.target.value)} inputMode="decimal" placeholder="—" style={input} />
          <SubReading
            money={riskMoney}
            pips={riskDistance == null ? null : Math.abs(riskDistance) / pipSize}
            ccy={account.currency}
            color={RED}
          />
        </Field>
        <Field label="Take profit">
          <input value={tpText} onChange={(e) => setTpText(e.target.value)} inputMode="decimal" placeholder="—" style={input} />
          <SubReading
            money={rewardMoney}
            pips={rewardDistance == null ? null : Math.abs(rewardDistance) / pipSize}
            ccy={account.currency}
            color={GREEN}
          />
        </Field>
      </div>

      {/* Size-from-risk. Only useful once a stop exists, so it says so. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Label>{`Size from risk (${account.currency})`}</Label>
          <input
            value={riskText}
            onChange={(e) => setRiskText(e.target.value)}
            inputMode="decimal"
            placeholder={riskDistance == null ? 'Set a stop first' : '100'}
            disabled={riskDistance == null}
            style={{ ...input, width: '100%', boxSizing: 'border-box', opacity: riskDistance == null ? 0.55 : 1 }}
          />
        </div>
        <button onClick={sizeFromRisk} disabled={riskDistance == null} style={{ ...chip, padding: '10px 14px', opacity: riskDistance == null ? 0.5 : 1 }}>
          {"Size it"}
        </button>
      </div>

      {/* What this order actually is, in money */}
      <div style={summaryBox}>
        <SummaryRow label="Reference price" value={reference == null ? '—' : fmtPrice(reference)} />
        <SummaryRow
          label="Position value"
          value={notional == null ? '—' : fmtMoney(notional, account.currency)}
        />
        <SummaryRow
          label="Margin (est.)"
          value={marginEstimate == null ? '—' : fmtMoney(marginEstimate, account.currency)}
          hint={account.marginAvailable != null ? `${fmtMoney(account.marginAvailable, account.currency)} available` : undefined}
        />
        <SummaryRow
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
                {side === 'long' ? 'Buy' : 'Sell'} <b style={{ color: sideColor }}>{units.toLocaleString('en-US')}</b> {instrument} at
                market{reference != null ? ` (~${fmtPrice(reference)})` : ''}
              </>
            ) : (
              <>
                {type === 'limit' ? 'Limit' : 'Stop'} {side === 'long' ? 'buy' : 'sell'}{' '}
                <b style={{ color: sideColor }}>{units.toLocaleString('en-US')}</b> {instrument} at {fmtPrice(limitPrice)}
              </>
            )}
            {stopLoss != null && <> · stop {fmtPrice(stopLoss)}</>}
            {takeProfit != null && <> · target {fmtPrice(takeProfit)}</>}
          </div>
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
            {problem ?? `Review ${side === 'long' ? 'buy' : 'sell'} ${Number.isFinite(units) ? units.toLocaleString('en-US') : ''} ${instrument}`}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

function PriceCell({
  label,
  value,
  active,
  color,
  onClick,
}: {
  label: string;
  value: number | null;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: active ? `${color}1f` : INPUT_BG,
        border: `1px solid ${active ? color : BORDER}`,
        borderRadius: 8,
        padding: '9px 10px',
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 9.5, color: FAINT, letterSpacing: '.5px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: active ? color : TEXT }}>
        {value == null ? '·' : fmtPrice(value)}
      </div>
    </button>
  );
}

function SubReading({
  money,
  pips,
  ccy,
  color,
}: {
  money: number | null;
  pips: number | null;
  ccy: string;
  color: string;
}) {
  if (money == null && pips == null) return <div style={{ height: 15 }} />;
  return (
    <div style={{ fontSize: 10.5, color, marginTop: 4, fontFamily: MONO }}>
      {money != null ? fmtMoney(money, ccy) : ''}
      {money != null && pips != null ? ' · ' : ''}
      {pips != null ? `${pips.toFixed(1)} pips` : ''}
    </div>
  );
}

function SummaryRow({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '3px 0' }}>
      <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: MONO, fontSize: 12.5, color: color ?? TEXT }}>{value}</span>
        {hint && <span style={{ fontSize: 10, color: FAINT, marginLeft: 6 }}>{hint}</span>}
      </span>
    </div>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const quoteRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const seg: CSSProperties = { display: 'flex', background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, overflow: 'hidden' };
const segBtn: CSSProperties = { flex: 1, background: 'none', border: 'none', color: MUTED, fontSize: 12, fontWeight: 600, padding: '8px 6px', cursor: 'pointer' };
const segActive: CSSProperties = { background: 'rgba(235,203,116,.14)', color: GOLD };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 15, padding: '9px 11px', outline: 'none', fontFamily: MONO };
const chip: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, color: '#dfe7fa', fontSize: 11.5, fontWeight: 600, padding: '6px 11px', borderRadius: 6, cursor: 'pointer' };
const summaryBox: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px' };
const confirmBox: CSSProperties = { background: 'rgba(3,12,32,.75)', border: `1px solid ${BORDER2}`, borderRadius: 10, padding: 14 };
const placeBtn: CSSProperties = { border: 'none', fontWeight: 700, fontSize: 13, padding: '12px 18px', borderRadius: 8, cursor: 'pointer', flex: 1 };
const ghostBtn: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, color: '#dfe7fa', fontSize: 12.5, fontWeight: 600, padding: '12px 18px', borderRadius: 8, cursor: 'pointer' };
const banner: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, background: 'rgba(3,12,32,.6)', border: '1px solid', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 };
const dismissBtn: CSSProperties = { background: 'none', border: 'none', color: 'inherit', fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0 };
const dropdown: CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, background: '#08152f', border: `1px solid ${BORDER2}`, borderRadius: 9, overflow: 'hidden', boxShadow: '0 18px 40px rgba(0,0,0,.5)' };
const dropRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, padding: '9px 11px', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' };
const livePill: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.6px', color: RED, background: 'rgba(239,84,104,.14)', border: '1px solid rgba(239,84,104,.45)', padding: '3px 8px', borderRadius: 999 };
const practicePill: CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.6px', color: '#6C9EFF', background: 'rgba(108,158,255,.12)', border: '1px solid rgba(108,158,255,.4)', padding: '3px 8px', borderRadius: 999 };

function sideBtn(active: boolean, color: string): CSSProperties {
  return {
    flex: 1,
    background: active ? `${color}26` : 'rgba(255,255,255,.04)',
    border: `1px solid ${active ? color : BORDER2}`,
    color: active ? color : MUTED,
    fontSize: 13.5,
    fontWeight: 700,
    padding: '10px 0',
    borderRadius: 8,
    cursor: 'pointer',
  };
}
