import { useId, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { fmtMoney, fmtPrice, fmtUnits } from './TradeCard';
import { DeskPositionRow } from './DeskPositionRow';
import { deskPositionsLayout } from './deskPositionsLayout';
import { miniBtn } from './positionEdit';
import { etSince } from './tradeTime';
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

// Acting on a position — which ones may be, what each save path does, and the
// editor itself — is shared with the Live Wall, which now offers the same
// controls on the same positions. See `positionEdit.tsx`.
export { brokerTradeId } from './positionEdit';

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
  narrow: boolean;
  onPick: (instrument: string) => void; // load an instrument into the ticket
  onChanged: () => void; // a position was closed or amended
}

export function TeamPositions({ trades, myUserId, currency, hideMoney, readOnly, sample, narrow, onPick, onChanged }: TeamProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const mine = sample ? [] : trades.filter((t) => t.ownerId === myUserId);
  const theirs = sample ? trades : trades.filter((t) => t.ownerId !== myUserId);
  const traders = new Set(trades.map((t) => t.ownerId)).size;
  const layout = deskPositionsLayout(trades.length, narrow, expanded);
  const ordered = [...mine, ...theirs].slice(0, layout.visibleCount);
  const visibleIds = new Set(ordered.map((trade) => trade.id));
  const visibleMine = mine.filter((trade) => visibleIds.has(trade.id));
  const visibleTheirs = theirs.filter((trade) => visibleIds.has(trade.id));

  return (
    <div style={panel}>
      <PanelHead
        title="Desk right now"
        hint={sample ? 'Sample book — connect a broker to see the desk’s real positions' : `${trades.length} open · ${traders} trader${traders === 1 ? '' : 's'}`}
      />
      {trades.length === 0 && <Empty>{"Nobody on the desk has a position open."}</Empty>}

      {layout.canToggle && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={listId}
          style={bookToggle}
        >
          {expanded ? 'Show fewer positions' : `Show all ${trades.length} positions`}
        </button>
      )}

      {trades.length > 0 && (
        <div
          id={listId}
          role={layout.usesInternalScroll ? 'region' : undefined}
          aria-label={layout.usesInternalScroll ? `Open positions, ${trades.length} total` : undefined}
          tabIndex={layout.usesInternalScroll ? 0 : undefined}
          style={layout.usesInternalScroll ? boundedBook : undefined}
        >
          {visibleMine.length > 0 && (
            <>
              <GroupLabel>{"Yours"}</GroupLabel>
              {visibleMine.map((t) => (
                <DeskPositionRow
                  key={t.id}
                  trade={t}
                  own
                  sample={sample}
                  currency={currency}
                  hideMoney={hideMoney}
                  readOnly={readOnly}
                  onPick={onPick}
                  onChanged={onChanged}
                />
              ))}
            </>
          )}

          {visibleTheirs.length > 0 && (
            <>
              <GroupLabel>{sample ? 'Sample positions' : 'Your group'}</GroupLabel>
              {visibleTheirs.map((t) => (
                <DeskPositionRow
                  key={t.id}
                  trade={t}
                  own={false}
                  sample={sample}
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
      )}

      {layout.collapsed && (
        <div style={previewNote} aria-live="polite">
          {`${layout.hiddenCount} more position${layout.hiddenCount === 1 ? '' : 's'} available. Expand the book to review them.`}
        </div>
      )}
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
const boundedBook: CSSProperties = {
  maxHeight: 'min(68vh, 680px)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  paddingRight: 6,
  scrollbarGutter: 'stable',
};
const bookToggle: CSSProperties = {
  width: '100%',
  background: 'rgba(108,158,255,.08)',
  border: `1px solid ${BORDER2}`,
  color: MUTED,
  borderRadius: 7,
  padding: '8px 10px',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  marginBottom: 4,
};
const previewNote: CSSProperties = { color: FAINT, fontSize: 10.5, lineHeight: 1.5, marginTop: 7 };
const row: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px', marginBottom: 8 };
const sidePill: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.4px', border: '1px solid', borderRadius: 999, padding: '2px 8px', fontFamily: MONO };
