import { useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { fmtMoney, fmtPrice, fmtUnits } from './TradeCard';
import { fmtPerStep, fmtPips, fmtSteps, movementFor, movementLeg, type Movement, type MovementLeg } from './pips';
import { TradeTimesCell, etSince } from './tradeTime';
import type { DeskHolding, DeskOrderRecord, DeskWorkingOrder, LiveTrade } from '../../api/types';

// The panels that sit beside the Trade Desk's ticket:
//
//   • Desk right now — every open position on the trader's TEAM, theirs and
//     their teammates', so an order is placed knowing what the desk already
//     holds. Teammates' rows are watch-only; the trader's own carry Close and
//     Stop/Target controls.
//   • Holdings — what the trader's crypto accounts actually own. Spot has no
//     position to close: a buy leaves a balance, so this is the crypto
//     equivalent of an open trade, and selling one loads the ticket rather than
//     firing its own order (the review step is the point).
//   • Working orders — the resting limit/stop orders on the trader's own
//     accounts, with cancel. Hidden entirely when there are none, so an empty
//     box never sits on the screen.
//   • Sent orders — the journal, including the rejected attempts, which is the
//     only place a refused order is visible at all.
//
// Team visibility comes from the existing team-scoped Live Wall feed, so the
// boundary stays defined in one place (api/trading/scope.ts). Acting on a
// position is separately restricted server-side to the trader's own account.

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

// A Live Wall position id is `${connectionId}:${broker}:${brokerTradeId}`; the
// broker's own id — what the close/modify endpoints take — is the last segment.
export function brokerTradeId(id: string): string {
  return id.slice(id.lastIndexOf(':') + 1);
}

interface TeamProps {
  trades: LiveTrade[];
  myUserId: string;
  currency: string;
  hideMoney: boolean;
  readOnly: boolean;
  // The Live Wall falls back to a representative sample when no broker is
  // connected anywhere on the desk. Those rows are shown (an empty panel would
  // read as "nobody is trading") but marked, and never actionable — there is no
  // real position behind them to close.
  sample: boolean;
  onPick: (instrument: string) => void; // load an instrument into the ticket
  onChanged: () => void; // a position was closed or amended
}

export function TeamPositions({ trades, myUserId, currency, hideMoney, readOnly, sample, onPick, onChanged }: TeamProps) {
  const mine = sample ? [] : trades.filter((t) => t.ownerId === myUserId);
  const theirs = sample ? trades : trades.filter((t) => t.ownerId !== myUserId);
  const traders = new Set(trades.map((t) => t.ownerId)).size;

  return (
    <div style={panel}>
      <PanelHead
        title="Desk right now"
        hint={sample ? 'Sample book — connect a broker to see the desk’s real positions' : `${trades.length} open · ${traders} trader${traders === 1 ? '' : 's'}`}
      />
      {trades.length === 0 && <Empty>{"Nobody on the desk has a position open."}</Empty>}

      {mine.length > 0 && (
        <>
          <GroupLabel>{"Yours"}</GroupLabel>
          {mine.map((t) => (
            <PositionRow
              key={t.id}
              trade={t}
              own
              currency={currency}
              hideMoney={hideMoney}
              readOnly={readOnly}
              onPick={onPick}
              onChanged={onChanged}
            />
          ))}
        </>
      )}

      {theirs.length > 0 && (
        <>
          <GroupLabel>{sample ? 'Sample positions' : 'Your team'}</GroupLabel>
          {theirs.map((t) => (
            <PositionRow
              key={t.id}
              trade={t}
              own={false}
              currency={currency}
              hideMoney={hideMoney}
              readOnly={readOnly}
              onPick={onPick}
              onChanged={onChanged}
            />
          ))}
        </>
      )}
    </div>
  );
}

function PositionRow({
  trade,
  own,
  currency,
  hideMoney,
  readOnly,
  onPick,
  onChanged,
}: {
  trade: LiveTrade;
  own: boolean;
  currency: string;
  hideMoney: boolean;
  readOnly: boolean;
  onPick: (instrument: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sl, setSl] = useState(trade.stopLoss == null ? '' : String(trade.stopLoss));
  const [tp, setTp] = useState(trade.takeProfit == null ? '' : String(trade.takeProfit));

  const long = trade.side === 'long';
  const pl = trade.unrealizedPl;
  // Only a live OANDA position can be acted on from here — a hand-entered manual
  // or funded row has no broker to send the instruction to.
  const actionable = own && !readOnly && trade.broker === 'oanda';

  // What a unit of price movement is worth on this position — pips on a currency
  // pair, points on anything else — and what the stop and target are therefore
  // worth. The same reading the ticket showed when the trade was placed, so a
  // trader amending a stop sees the risk in money rather than in price alone.
  const move = movementFor(trade, currency);
  const risk = movementLeg(trade.entryPrice, trade.stopLoss, move);
  const reward = movementLeg(trade.entryPrice, trade.takeProfit, move);
  const rr = risk && reward && risk.steps > 0 ? reward.steps / risk.steps : null;

  // Seed the editor from the position as it stands *now*, not as it stood when
  // this row first rendered: the book refreshes underneath, so a stop placed or
  // moved since mount would otherwise open as an empty box — and saving an empty
  // box means "remove that order".
  const openEditor = () => {
    setSl(trade.stopLoss == null ? '' : String(trade.stopLoss));
    setTp(trade.takeProfit == null ? '' : String(trade.takeProfit));
    setError(null);
    setEditing(true);
  };

  // What the levels being typed into the editor are worth, live.
  const draftLeg = (text: string): MovementLeg | null => {
    const value = text.trim() === '' ? null : Number(text);
    if (value == null || !Number.isFinite(value)) return null;
    return movementLeg(trade.entryPrice, value, move);
  };

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.closeDeskPosition({
        connectionId: trade.connectionId,
        tradeId: brokerTradeId(trade.id),
        instrument: trade.instrument,
      });
      setConfirmClose(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not close the position');
    } finally {
      setBusy(false);
    }
  };

  const saveProtection = async () => {
    // A blank field means "remove that order" (null); a field left as it was is
    // omitted entirely, so an untouched level is never cancelled and re-placed
    // at the broker just because the trader opened the editor to change the other.
    const next = (text: string, current: number | null) => {
      const value = text.trim() === '' ? null : Number(text);
      if (value === current) return undefined;
      if (value != null && !Number.isFinite(value)) return undefined;
      return value;
    };
    const stopLoss = next(sl, trade.stopLoss);
    const takeProfit = next(tp, trade.takeProfit);
    if (stopLoss === undefined && takeProfit === undefined) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.modifyDeskPosition({
        connectionId: trade.connectionId,
        tradeId: brokerTradeId(trade.id),
        instrument: trade.instrument,
        ...(stopLoss === undefined ? {} : { stopLoss }),
        ...(takeProfit === undefined ? {} : { takeProfit }),
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change the stop or target');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...row, borderLeft: `2px solid ${long ? GREEN : RED}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => onPick(trade.instrument)} style={instrumentBtn} title="Load into the ticket">
          {trade.instrument}
        </button>
        <span style={{ ...sidePill, color: long ? GREEN : RED, borderColor: long ? 'rgba(53,196,123,.4)' : 'rgba(239,84,104,.4)' }}>
          {long ? 'LONG' : 'SHORT'} {fmtUnits(trade.units)}
        </span>
        <span style={{ flex: 1 }} />
        {/* How far the position has moved, beside what that is worth. Pips only
            — `forex.pipsOpen` is computed server-side for genuine currency pairs
            and is null for crypto, metals and indices, which have no pip size
            and are read in points instead. Not gated on Hide $: a pip is a
            distance in price, not a money figure, which is the same reason the
            stop and target keep their pip readings when the money is hidden. */}
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: MONO, fontSize: 12 }}>
          {trade.forex?.pipsOpen != null && (
            <span
              style={{ fontSize: 11.5, fontWeight: 600, color: trade.forex.pipsOpen > 0 ? GREEN : trade.forex.pipsOpen < 0 ? RED : MUTED }}
              title="Open profit/loss in pips"
            >
              {fmtPips(trade.forex.pipsOpen, true)}
            </span>
          )}
          {hideMoney || pl == null ? (
            <span style={{ color: FAINT }}>{"•••"}</span>
          ) : (
            <span style={{ color: pl > 0 ? GREEN : pl < 0 ? RED : MUTED, fontWeight: 700 }}>
              {pl > 0 ? '+' : ''}
              {fmtMoney(pl, currency)}
            </span>
          )}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>
          <span style={{ color: FAINT }}>{"in "}</span>
          {fmtPrice(trade.entryPrice)}
          <span style={{ color: FAINT }}>{" · now "}</span>
          {fmtPrice(trade.currentPrice)}
          {/* What one pip (or one point) of movement is worth at this size — the
              figure the trade was sized by, kept beside the prices it moves
              between. Money, so the Hide-$ toggle takes it with the P/L. */}
          {!hideMoney && move.perStep != null && (
            <>
              <span style={{ color: FAINT }}>{" · "}</span>
              <span title={`What one ${move.unit} of price movement is worth at this size`}>
                {`${fmtPerStep(move.perStep, move.currency)} / ${move.unit}`}
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, fontSize: 10.5 }}>
          <TradeTimesCell openedAt={trade.openedAt} />
          <span style={{ color: FAINT, whiteSpace: 'nowrap' }}>{etSince(trade.openedAt)}</span>
        </div>
      </div>

      {/* Stop and target, always drawn — including when there are none. A
          position with no protection on it is the single most important thing
          this panel can say, and saying it by omission (the old inline "· sl
          1.14908", absent when unset) meant an unprotected position looked
          exactly like one whose stop had simply scrolled off the line. */}
      {!editing && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <Protection label="Stop loss" price={trade.stopLoss} leg={risk} move={move} hideMoney={hideMoney} color={RED} />
          <Protection label="Take profit" price={trade.takeProfit} leg={reward} move={move} hideMoney={hideMoney} color={GREEN} />
          {trade.trailingStopLoss != null && (
            <Protection label="Trailing stop" price={trade.trailingStopLoss} leg={null} move={move} hideMoney={hideMoney} color={GOLD} />
          )}
          {rr != null && (
            <div style={protectionCell}>
              <div style={miniLabel}>{"Risk / reward"}</div>
              <div style={{ fontFamily: MONO, fontSize: 12.5, color: GOLD }}>{`1:${Number(rr.toFixed(2))}`}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, color: FAINT }}>
          {own ? trade.brokerName : `${trade.owner} · ${trade.brokerName}`}
        </span>
        <span style={{ flex: 1 }} />
        {actionable && !editing && !confirmClose && (
          <>
            <button onClick={openEditor} style={miniBtn}>
              {trade.stopLoss == null && trade.takeProfit == null ? 'Add stop / target' : 'Stop / target'}
            </button>
            <button onClick={() => setConfirmClose(true)} style={{ ...miniBtn, color: RED, borderColor: 'rgba(239,84,104,.45)' }}>
              {"Close"}
            </button>
          </>
        )}
        {confirmClose && (
          <>
            <span style={{ fontSize: 11, color: MUTED }}>{"Close the whole position?"}</span>
            <button onClick={() => setConfirmClose(false)} style={miniBtn} disabled={busy}>{"No"}</button>
            <button onClick={() => void close()} disabled={busy} style={{ ...miniBtn, color: '#fff', background: RED, borderColor: RED }}>
              {busy ? 'Closing…' : 'Yes, close'}
            </button>
          </>
        )}
      </div>

      {editing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Each box opens on the level the broker is holding right now, and
              prices what is typed into it as it is typed — the same money · pips
              reading the order ticket gives, so amending a stop is scored the
              same way as setting one. */}
          <label style={miniField}>
            <span style={miniLabel}>{"Stop loss"}</span>
            <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="none" style={miniInput} />
            <LegReading leg={draftLeg(sl)} move={move} hideMoney={hideMoney} color={RED} />
          </label>
          <label style={miniField}>
            <span style={miniLabel}>{"Take profit"}</span>
            <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="none" style={miniInput} />
            <LegReading leg={draftLeg(tp)} move={move} hideMoney={hideMoney} color={GREEN} />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 16 }}>
            <button onClick={() => setEditing(false)} style={miniBtn} disabled={busy}>{"Cancel"}</button>
            <button onClick={() => void saveProtection()} disabled={busy} style={{ ...miniBtn, color: '#0c2768', background: GOLD, borderColor: GOLD, fontWeight: 700 }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: FAINT, width: '100%' }}>
            {"Leave a box empty to remove that order."}
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: RED, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// One protective level on an open position: the price it sits at, and what it is
// worth from here — money and distance, in the unit that instrument is read in.
// An unset level says "none" rather than disappearing, because a position with
// no stop on it is exactly what a trader needs to notice.
function Protection({
  label,
  price,
  leg,
  move,
  hideMoney,
  color,
}: {
  label: string;
  price: number | null;
  leg: MovementLeg | null;
  move: Movement;
  hideMoney: boolean;
  color: string;
}) {
  return (
    <div style={protectionCell}>
      <div style={miniLabel}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 12.5, color: price == null ? FAINT : color }}>
        {price == null ? 'none' : fmtPrice(price)}
      </div>
      <LegReading leg={leg} move={move} hideMoney={hideMoney} color={MUTED} />
    </div>
  );
}

// The money and distance of one leg, e.g. "$60.00 · 15 pips". The blank line is
// kept when there is nothing to say so a row of these does not jump about as
// levels are typed in and cleared.
function LegReading({
  leg,
  move,
  hideMoney,
  color,
}: {
  leg: MovementLeg | null;
  move: Movement;
  hideMoney: boolean;
  color: string;
}) {
  const money = leg && !hideMoney && leg.money != null ? fmtMoney(leg.money, move.currency) : null;
  if (!leg) return <div style={{ height: 14 }} />;
  return (
    <div style={{ fontSize: 10, color, fontFamily: MONO, marginTop: 2, height: 14 }} title="Distance from your fill">
      {money != null ? `${money} · ` : ''}
      {fmtSteps(leg.steps, move)}
    </div>
  );
}

// ---- holdings (spot / crypto accounts) ----

export function Holdings({
  holdings,
  hideMoney,
  readOnly,
  onSell,
}: {
  holdings: DeskHolding[];
  hideMoney: boolean;
  readOnly: boolean;
  // Load a sale of this holding into the ticket. Deliberately not a one-click
  // sell: it goes through the same review-and-confirm the rest of the desk does.
  onSell: (holding: DeskHolding) => void;
}) {
  if (holdings.length === 0) return null;
  const total = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);
  const currency = holdings[0]?.currency ?? 'USD';

  return (
    <div style={panel}>
      <PanelHead title="Holdings" hint={hideMoney ? `${holdings.length} held` : `${fmtMoney(total, currency)} held`} />
      {holdings.map((h) => (
        <div key={`${h.connectionId}:${h.asset}`} style={{ ...row, borderLeft: `2px solid ${GOLD}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: TEXT }}>{h.asset}</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>{fmtUnits(h.units)}</span>
            {h.staked && (
              <span style={{ ...sidePill, color: MUTED, borderColor: BORDER2 }}>{"STAKED"}</span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: TEXT }}>
              {hideMoney ? '•••' : h.value == null ? '—' : fmtMoney(h.value, h.currency)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: FAINT, fontFamily: MONO }}>
              {h.price == null ? h.connectionLabel : `${h.connectionLabel} · ${fmtPrice(h.price)}`}
              {h.onOrder > 0 && ` · ${fmtUnits(h.onOrder)} on order`}
            </span>
            <span style={{ flex: 1 }} />
            {!readOnly && h.instrument && (
              <button onClick={() => onSell(h)} style={miniBtn} title="Fill the ticket in to sell this holding">
                {"Sell"}
              </button>
            )}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>
        {"Spot coins are held, not positioned — selling one is an ordinary order, so Sell fills the ticket in and waits for you to confirm."}
      </div>
    </div>
  );
}

// ---- working (resting) orders ----

export function WorkingOrders({
  orders,
  readOnly,
  onChanged,
}: {
  orders: DeskWorkingOrder[];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nothing resting means nothing to manage, so the panel is not drawn at all
  // rather than sitting there empty. It reappears the moment a limit or stop
  // order is working — which is the only way to see or cancel one.
  if (orders.length === 0) return null;

  const cancel = async (o: DeskWorkingOrder) => {
    setBusyId(o.id);
    setError(null);
    try {
      await api.cancelDeskOrder(o.connectionId, o.id, o.instrument);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel the order');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={panel}>
      <PanelHead title="Working orders" hint={`${orders.length} resting`} />
      {orders.map((o) => {
        const long = o.units >= 0;
        return (
          <div key={o.id} style={{ ...row, borderLeft: `2px solid ${long ? GREEN : RED}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5 }}>{o.instrument}</span>
              <span style={{ ...sidePill, color: long ? GREEN : RED, borderColor: long ? 'rgba(53,196,123,.4)' : 'rgba(239,84,104,.4)' }}>
                {o.type} {fmtUnits(Math.abs(o.units))}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED }}>@ {fmtPrice(o.price)}</span>
              <span style={{ flex: 1 }} />
              {!readOnly && (
                <button onClick={() => void cancel(o)} disabled={busyId === o.id} style={{ ...miniBtn, color: RED, borderColor: 'rgba(239,84,104,.45)' }}>
                  {busyId === o.id ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 5 }}>
              {o.connectionLabel}
              {o.stopLoss != null && ` · stop ${fmtPrice(o.stopLoss)}`}
              {o.takeProfit != null && ` · target ${fmtPrice(o.takeProfit)}`}
              {o.createdAt != null && ` · placed ${etSince(o.createdAt)}`}
            </div>
          </div>
        );
      })}
      {error && <div style={{ fontSize: 11, color: RED, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// ---- the journal ----

export function OrderJournal({ orders, currency }: { orders: DeskOrderRecord[]; currency: string }) {
  return (
    <div style={panel}>
      <PanelHead title="Sent orders" hint="Everything this desk sent, including refusals" />
      {orders.length === 0 && <Empty>{"You haven’t sent an order from the desk yet."}</Empty>}
      {orders.map((o) => {
        const color = o.status === 'rejected' ? RED : o.status === 'accepted' ? GOLD : GREEN;
        return (
          <div key={o.id} style={{ ...row, borderLeft: `2px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700 }}>{o.instrument}</span>
              <span style={{ fontSize: 11, color: MUTED }}>
                {o.kind === 'entry'
                  ? `${o.side === 'long' ? 'Buy' : 'Sell'} ${o.units == null ? '' : fmtUnits(o.units)} · ${o.orderType}`
                  : o.kind === 'close'
                    ? 'Close'
                    : o.kind === 'modify'
                      ? 'Stop / target'
                      : 'Cancel'}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color, letterSpacing: '.4px', textTransform: 'uppercase' }}>
                {o.status}
              </span>
            </div>
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4, fontFamily: MONO }}>
              {o.fillPrice != null && `at ${fmtPrice(o.fillPrice)} · `}
              {o.realizedPl != null && `${o.realizedPl >= 0 ? '+' : ''}${fmtMoney(o.realizedPl, currency)} · `}
              {etSince(o.createdAt)}
            </div>
            {o.error && <div style={{ fontSize: 11, color: RED, marginTop: 4 }}>{o.error}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---- shared bits ----

function PanelHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{title}</div>
      {hint && <div style={{ fontSize: 10.5, color: FAINT }}>{hint}</div>}
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: FAINT, margin: '10px 0 6px' }}>
      {children}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <div style={{ fontSize: 12, color: FAINT, padding: '6px 0 2px' }}>{children}</div>;
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const row: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px', marginBottom: 8 };
const instrumentBtn: CSSProperties = { background: 'none', border: 'none', color: GOLD, fontFamily: MONO, fontWeight: 700, fontSize: 13, padding: 0, cursor: 'pointer' };
const sidePill: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.4px', border: '1px solid', borderRadius: 999, padding: '2px 8px', fontFamily: MONO };
const miniBtn: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, color: '#dfe7fa', fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' };
const miniField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
// Wide enough for the level, its money reading, and the editor's own input box,
// so the stop and target line up as columns from row to row and stay put when a
// row is opened for editing.
const protectionCell: CSSProperties = { minWidth: 126 };
const miniLabel: CSSProperties = { fontSize: 9.5, color: FAINT, letterSpacing: '.4px', textTransform: 'uppercase' };
const miniInput: CSSProperties = { background: 'rgba(3,12,32,.8)', border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT, fontSize: 13, padding: '6px 8px', outline: 'none', fontFamily: MONO, width: 104 };
