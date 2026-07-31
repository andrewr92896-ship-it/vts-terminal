import { useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { fmtMoney, fmtPrice } from './TradeCard';
import { TradeTimesCell, etSince } from './tradeTime';
import type { DeskOrderRecord, DeskWorkingOrder, LiveTrade } from '../../api/types';

// The three panels that sit beside the Trade Desk's ticket:
//
//   • Desk right now — every open position on the trader's TEAM, theirs and
//     their teammates', so an order is placed knowing what the desk already
//     holds. Teammates' rows are watch-only; the trader's own carry Close and
//     Stop/Target controls.
//   • Working orders — the resting limit/stop orders on the trader's own
//     accounts, with cancel.
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
          {long ? 'LONG' : 'SHORT'} {trade.units.toLocaleString('en-US')}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12 }}>
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
          {trade.stopLoss != null && (
            <>
              <span style={{ color: FAINT }}>{" · sl "}</span>
              {fmtPrice(trade.stopLoss)}
            </>
          )}
          {trade.takeProfit != null && (
            <>
              <span style={{ color: FAINT }}>{" · tp "}</span>
              {fmtPrice(trade.takeProfit)}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, fontSize: 10.5 }}>
          <TradeTimesCell openedAt={trade.openedAt} />
          <span style={{ color: FAINT, whiteSpace: 'nowrap' }}>{etSince(trade.openedAt)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, color: FAINT }}>
          {own ? trade.brokerName : `${trade.owner} · ${trade.brokerName}`}
        </span>
        <span style={{ flex: 1 }} />
        {actionable && !editing && !confirmClose && (
          <>
            <button onClick={() => setEditing(true)} style={miniBtn}>{"Stop / target"}</button>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={miniField}>
            <span style={miniLabel}>{"Stop"}</span>
            <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="none" style={miniInput} />
          </label>
          <label style={miniField}>
            <span style={miniLabel}>{"Target"}</span>
            <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="none" style={miniInput} />
          </label>
          <button onClick={() => setEditing(false)} style={miniBtn} disabled={busy}>{"Cancel"}</button>
          <button onClick={() => void saveProtection()} disabled={busy} style={{ ...miniBtn, color: '#0c2768', background: GOLD, borderColor: GOLD, fontWeight: 700 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <div style={{ fontSize: 10, color: FAINT, width: '100%' }}>
            {"Leave a box empty to remove that order."}
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: RED, marginTop: 6 }}>{error}</div>}
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
      <PanelHead title="Working orders" hint={orders.length ? `${orders.length} resting` : undefined} />
      {orders.length === 0 && <Empty>{"No resting orders on your accounts."}</Empty>}
      {orders.map((o) => {
        const long = o.units >= 0;
        return (
          <div key={o.id} style={{ ...row, borderLeft: `2px solid ${long ? GREEN : RED}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5 }}>{o.instrument}</span>
              <span style={{ ...sidePill, color: long ? GREEN : RED, borderColor: long ? 'rgba(53,196,123,.4)' : 'rgba(239,84,104,.4)' }}>
                {o.type} {Math.abs(o.units).toLocaleString('en-US')}
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
                  ? `${o.side === 'long' ? 'Buy' : 'Sell'} ${o.units?.toLocaleString('en-US') ?? ''} · ${o.orderType}`
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
const miniLabel: CSSProperties = { fontSize: 9.5, color: FAINT, letterSpacing: '.4px', textTransform: 'uppercase' };
const miniInput: CSSProperties = { background: 'rgba(3,12,32,.8)', border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT, fontSize: 13, padding: '6px 8px', outline: 'none', fontFamily: MONO, width: 104 };
