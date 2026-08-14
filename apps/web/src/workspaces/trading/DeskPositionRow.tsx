import type { CSSProperties } from 'react';
import { OFF_BOOK_GRAY, fmtMoney, fmtPrice, tileTint } from './TradeCard';
import { fmtPerStep, fmtPips, fmtSize, movementFor, movementLeg, sizeTitle, type Movement, type MovementLeg } from './pips';
import { LegReading, PositionActions, ProtectionEditor, miniLabel, usePositionEditKind, usePositionEditor } from './positionEdit';
import { TradeTimesCell, etSince } from './tradeTime';
import type { LiveTrade } from '../../api/types';

// ONE open-position row, rendered by both surfaces that list open positions in a
// dense book: Live Trades' "Desk right now" panel, and the Live Wall's Open
// Positions tile in its list layout.
//
// It lived in `DeskPositions.tsx` and moved here when the wall's tile was asked
// to carry the same information (owner request, 2026-08). The wall's list had
// grown its own, thinner row — instrument, P/L, pips, a stamp — so the same
// position read as two different amounts of information depending on which
// screen it was being watched on, and the half a trader actually acts on (what
// one pip is worth, where the stop sits, what that stop costs) was on the screen
// they were not looking at. Reusing the component rather than copying its
// markup is what stops the two drifting again — the same rule the Order Ticket
// tile follows by rendering Live Trades' own ticket.
//
// Everything about who may act is unchanged and still comes from
// `positionEdit.tsx`: the viewer's own positions only, a Kraken margin row
// watch-only, a sample row carrying no controls at all.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const INPUT_BG = 'rgba(3,12,32,.6)';
const BORDER = '#16294f';
const MONO = "'IBM Plex Mono', monospace";

export function DeskPositionRow({
  trade,
  own,
  sample,
  currency,
  hideMoney,
  readOnly,
  onPick,
  onChanged,
}: {
  trade: LiveTrade;
  own: boolean;
  sample: boolean;
  // The account currency the desk reports. The Live Wall has no desk-wide
  // currency to hand down, so it is optional and falls back to the position's
  // own — which is what `wallMovement` already resolved to there.
  currency?: string;
  hideMoney: boolean;
  readOnly: boolean;
  // Load this instrument into the order ticket. Only Live Trades has a ticket to
  // load, so without it the instrument is plain text rather than a button that
  // would do nothing.
  onPick?: (instrument: string) => void;
  onChanged: () => void; // a position was closed or amended
}) {
  const long = trade.side === 'long';
  const pl = trade.unrealizedPl;
  const ccy = currency ?? trade.forex?.accountCurrency ?? 'USD';

  // Which of this row's controls are offered, and what saving one does.
  const editKind = usePositionEditKind(trade, { own, readOnly, sample });
  const editor = usePositionEditor(trade, editKind, onChanged);

  // What a unit of price movement is worth on this position — pips on a currency
  // pair, points on anything else — and what the stop and target are therefore
  // worth. The same reading the ticket showed when the trade was placed, so a
  // trader amending a stop sees the risk in money rather than in price alone.
  const move = movementFor(trade, ccy);
  const risk = movementLeg(trade.entryPrice, trade.stopLoss, move);
  const reward = movementLeg(trade.entryPrice, trade.takeProfit, move);
  const rr = risk && reward && risk.steps > 0 ? reward.steps / risk.steps : null;

  // Whose position this is, in the group's colour. This row's left border is
  // already spoken for by the side (green long / red short), so the colour is
  // carried by the wash and the owner line rather than fighting it.
  const accent = trade.tileColor ?? (trade.broker === 'ftp' ? OFF_BOOK_GRAY : null);

  return (
    <div
      style={{
        ...row,
        borderLeft: `2px solid ${long ? GREEN : RED}`,
        ...(accent ? { background: tileTint(accent, 'transparent', 30) } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        {onPick ? (
          <button onClick={() => onPick(trade.instrument)} style={instrumentBtn} title="Load into the ticket">
            {trade.instrument}
          </button>
        ) : (
          <span style={{ ...instrumentBtn, cursor: 'default' }}>{trade.instrument}</span>
        )}
        {/* The size, in the unit the instrument is sized in — lots on a currency
            pair (with the raw units on the hover), units on anything else. See
            `fmtSize`: it splits on the same `forexPair` test the pip/point
            reading below does, so a size in lots is never quoted beside a
            per-point figure. */}
        <span
          style={{ ...sidePill, color: long ? GREEN : RED, borderColor: long ? 'rgba(53,196,123,.4)' : 'rgba(239,84,104,.4)' }}
          title={sizeTitle(trade.instrument, trade.units)}
        >
          {long ? 'LONG' : 'SHORT'} {fmtSize(trade.instrument, trade.units)}
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
              {fmtMoney(pl, ccy)}
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
      {!editor.editing && (
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
        {/* The owner line takes the colour, which on a dense book is what the
            eye actually reads — the wash says two rows differ, the name says
            whose. */}
        <span style={{ fontSize: 10.5, color: accent ?? FAINT, fontWeight: accent ? 700 : 400 }}>
          {own ? trade.brokerName : `${trade.owner} · ${trade.brokerName}`}
        </span>
        <span style={{ flex: 1 }} />
        {editKind && <PositionActions trade={trade} kind={editKind} editor={editor} />}
      </div>

      {editKind && editor.editing && <ProtectionEditor kind={editKind} editor={editor} move={move} hideMoney={hideMoney} />}

      {editor.error && <div style={{ fontSize: 11, color: RED, marginTop: 6 }}>{editor.error}</div>}
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

const row: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '10px 12px', marginBottom: 8 };
const instrumentBtn: CSSProperties = { background: 'none', border: 'none', color: GOLD, fontFamily: MONO, fontWeight: 700, fontSize: 13, padding: 0, cursor: 'pointer' };
const sidePill: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.4px', border: '1px solid', borderRadius: 999, padding: '2px 8px', fontFamily: MONO };
// Wide enough for the level, its money reading, and the editor's own input box,
// so the stop and target line up as columns from row to row and stay put when a
// row is opened for editing.
const protectionCell: CSSProperties = { minWidth: 126 };
