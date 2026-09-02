import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { hasEntitlement, isFounder } from '../../auth/access';
import { fmtMoney } from './tradeFormat';
import { fmtSteps, forexPair, movementFor, movementLeg, type Movement, type MovementLeg } from './pips';
import { protectionStep, triggerProblem } from './protection';
import type { FounderPerson, LiveTrade, PairablePosition } from '../../api/types';

// Acting on an open position — the stop, the target, and closing it — for every
// surface that draws one. Live Trades' desk book was the only place a position
// could be touched; the Live Wall now offers the same controls on the same
// positions, so the rule for WHICH positions may be touched, and WHAT each of
// the three save paths does, lives here once. Two screens deciding that
// separately is how one of them comes to offer a Close on a position the server
// refuses, or send a level to the wrong endpoint.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const BORDER2 = '#1c3a7a';
const MONO = "'IBM Plex Mono', monospace";

// A Live Wall position id is `${connectionId}:${brokerTradeId}` (and
// `funded:${tradeId}` for a prop-firm row); the last segment is the id the
// close/modify endpoints take.
export function brokerTradeId(id: string): string {
  return id.slice(id.lastIndexOf(':') + 1);
}

// What this position's controls actually do, which differs by where it lives —
// and the difference is the point rather than an inconvenience:
//
//   • 'broker'  a live OANDA trade. The stop and target are instructions sent to
//               the broker, and the whole position can be closed from here.
//   • 'note'    a funded (prop-firm) or hand-kept manual position. There is no
//               broker behind it, so its stop and target are a record of what
//               the firm is holding — worth editing, since a stop moved at the
//               prop firm otherwise reaches the desk only by re-importing a
//               screenshot.
//
// A Kraken margin row is neither: the desk refuses to close or amend one by
// name, so it stays watch-only wherever it is drawn.
export type PositionEditKind = 'broker' | 'note';

export function usePositionEditKind(
  trade: LiveTrade,
  opts: {
    own: boolean; // the position is on the viewer's own account
    readOnly: boolean;
    // The wall previews itself with representative trades when no broker has
    // ever been connected. There is no real position behind one, so nothing on
    // a sample row is actionable however it is owned.
    sample?: boolean;
  },
): PositionEditKind | null {
  const { user } = useAuth();
  // Sending an order is what the Trade Desk membership buys. The Live Wall is
  // reachable on any membership, so a broker position's controls are checked
  // here rather than inherited from the screen around them — otherwise a
  // Premium member would meet a button that only ever answers 402. A hand-kept
  // stop is not an order and costs nothing, so 'note' is not gated.
  const canTrade = hasEntitlement(user, 'tradeDesk');
  if (!opts.own || opts.readOnly || opts.sample) return null;
  if (trade.broker === 'oanda') return canTrade ? 'broker' : null;
  if (trade.broker === 'ftp' || trade.broker === 'manual') return 'note';
  return null;
}

// The Live Wall carries no account currency of its own, so a currency pair takes
// the one the server priced it in and everything else is read in dollars — which
// is what every money figure on the wall already assumes.
export function wallMovement(trade: LiveTrade): Movement {
  return movementFor(trade, trade.forex?.accountCurrency ?? 'USD');
}

export interface PositionEditor {
  editing: boolean;
  confirmClose: boolean;
  busy: boolean;
  error: string | null;
  sl: string;
  tp: string;
  setSl: (v: string) => void;
  setTp: (v: string) => void;
  open: () => void;
  cancel: () => void;
  save: () => Promise<void>;
  askClose: () => void;
  dismissClose: () => void;
  close: () => Promise<void>;
  // What the level being typed into a box is worth from the fill, live.
  draftLeg: (text: string, move: Movement) => MovementLeg | null;
}

export function usePositionEditor(
  trade: LiveTrade,
  kind: PositionEditKind | null,
  onChanged: () => void,
): PositionEditor {
  const [editing, setEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sl, setSl] = useState(trade.stopLoss == null ? '' : String(trade.stopLoss));
  const [tp, setTp] = useState(trade.takeProfit == null ? '' : String(trade.takeProfit));

  // Seed the editor from the position as it stands *now*, not as it stood when
  // this row first rendered: the book refreshes underneath, so a stop placed or
  // moved since mount would otherwise open as an empty box — and saving an empty
  // box means "remove that order".
  const open = () => {
    setSl(trade.stopLoss == null ? '' : String(trade.stopLoss));
    setTp(trade.takeProfit == null ? '' : String(trade.takeProfit));
    setError(null);
    setEditing(true);
  };

  const draftLeg = (text: string, move: Movement): MovementLeg | null => {
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

  const save = async () => {
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
    const levels = {
      ...(stopLoss === undefined ? {} : { stopLoss }),
      ...(takeProfit === undefined ? {} : { takeProfit }),
    };

    // WOULD IT FIRE THE MOMENT IT WAS SET?
    //
    // The case this exists for is the one the owner hit: a level typed at the
    // price on the screen, which took a live position out on arrival. A stop is
    // watched against the opposite side of the book from the one the trade was
    // filled at, so "below my entry" was never the same question as "below the
    // price it triggers on" — see `protection.ts`, which is mirrored server-side.
    //
    // **THE MARK IS ALL THIS SCREEN HAS, AND THAT IS THE RIGHT WAY ROUND.** The
    // wall carries one price per position, not two, so this judges against the
    // mark while the server judges against the exact triggering side and refuses
    // with the venue's own numbers. The server is the enforcer either way; this
    // is what stops an obviously-instant level costing a round trip.
    //
    // A 'note' is exempt: a funded or hand-kept level is a RECORD of what the
    // firm is holding, not an order, so there is nothing for it to trigger
    // against and refusing it would stop somebody writing down what is true.
    if (kind === 'broker') {
      const { step, stepLabel } = protectionStep(forexPair(trade.instrument) != null, trade.forex?.pipSize);
      const instant = triggerProblem({
        side: trade.side,
        bid: trade.currentPrice,
        ask: trade.currentPrice,
        step,
        stepLabel,
        ...levels,
      });
      if (instant) {
        setError(instant);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      // The last segment of the position id is what each of these endpoints
      // takes: a broker trade id, a funded trade id, or a manual position id.
      // All three are owner-scoped server-side — a teammate's position is
      // watch-only because no write path can reach it, not because this hides a
      // button.
      const id = brokerTradeId(trade.id);
      if (kind === 'note' && trade.broker === 'ftp') {
        await api.setFundedTradeProtection(id, levels);
      } else if (kind === 'note') {
        await api.updatePosition(id, levels);
      } else {
        await api.modifyDeskPosition({
          connectionId: trade.connectionId,
          tradeId: id,
          instrument: trade.instrument,
          ...levels,
        });
      }
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change the stop or target');
    } finally {
      setBusy(false);
    }
  };

  return {
    editing,
    confirmClose,
    busy,
    error,
    sl,
    tp,
    setSl,
    setTp,
    open,
    cancel: () => setEditing(false),
    save,
    askClose: () => setConfirmClose(true),
    dismissClose: () => setConfirmClose(false),
    close,
    draftLeg,
  };
}

// The buttons a position offers, as a fragment so each surface lays them out in
// its own row. Only a real broker position can be closed from here: a funded
// trade is closed from its own screen (or its card's own Close trade control),
// where the result screenshot is read.
export function PositionActions({
  trade,
  kind,
  editor,
  size = 'normal',
}: {
  trade: LiveTrade;
  kind: PositionEditKind;
  editor: PositionEditor;
  size?: 'normal' | 'small';
}) {
  const btn = size === 'small' ? smallBtn : miniBtn;
  if (editor.editing) return null;
  if (editor.confirmClose) {
    return (
      <>
        <span style={{ fontSize: 11, color: MUTED }}>{"Close the whole position?"}</span>
        <button onClick={editor.dismissClose} style={btn} disabled={editor.busy}>{"No"}</button>
        <button
          onClick={() => void editor.close()}
          disabled={editor.busy}
          style={{ ...btn, color: '#fff', background: RED, borderColor: RED }}
        >
          {editor.busy ? 'Closing…' : 'Yes, close'}
        </button>
      </>
    );
  }
  return (
    <>
      <button onClick={editor.open} style={btn}>
        {trade.stopLoss == null && trade.takeProfit == null ? 'Add stop / target' : 'Stop / target'}
      </button>
      {kind === 'broker' && (
        <button onClick={editor.askClose} style={{ ...btn, color: RED, borderColor: 'rgba(239,84,104,.45)' }}>
          {"Close"}
        </button>
      )}
    </>
  );
}


// ---- linked positions ----
//
// **WHETHER A LEVEL MOVED HERE REACHES ANYBODY.** A pairing between two
// Founders' positions is what turns "I moved my stop" into a one-press decision
// on the other end, and until it is drawn on the position itself there is no way
// to tell a paired trade from an unpaired one — so a trader has no idea whether
// the partner they think they are running a trade with is going to hear about
// the stop they just moved.
//
// Stamped server-side onto the viewer's OWN positions only (`linkedWith`), so
// this draws nothing on a teammate's card: a pairing is between two accounts,
// and there is nothing to do with it on a position you cannot act on.

const LINK_BLUE = '#5AC8FA';

/** The marker itself. Small, and deliberately not coloured like a tier mark or a
 *  win/loss reading — it is a fact about who else is in this trade. */
export function LinkedMark({ trade }: { trade: LiveTrade }) {
  const links = trade.linkedWith ?? [];
  if (links.length === 0) return null;
  const names = links.map((l) => l.displayName).join(', ');
  return (
    <span
      title={`Linked with ${names} — a stop or target moved here is offered to them in one press`}
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '.06em',
        color: LINK_BLUE,
        border: `1px solid rgba(90,200,250,.45)`,
        borderRadius: 4,
        padding: '1px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      {links.length > 1 ? `LINKED ×${links.length}` : 'LINKED'}
    </span>
  );
}

/**
 * Pair this position with another Founder's, by hand.
 *
 * **THE CASE THE OWNER NAMED:** the invitation came, it was not joined, and the
 * trade was placed separately anyway. Without a pairing a later level move falls
 * back to matching on instrument — which is a guess, and resolves to nothing at
 * all the moment either of them holds two positions in the same pair. With one
 * it is exact.
 *
 * Founder-level and the viewer's own broker positions only. It is drawn as an
 * expanding row rather than a dialog because it sits inside a trade card that
 * may itself be inside a board tile, where a modal would be the wrong shape.
 */
export function PositionLinkControl({ trade, onChanged }: { trade: LiveTrade; onChanged: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<FounderPerson[]>([]);
  const [withUserId, setWithUserId] = useState('');
  const [theirs, setTheirs] = useState<PairablePosition[]>([]);
  const [theirTradeId, setTheirTradeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = !!user && !user.isDemo && isFounder(user.roles);
  const myTradeId = brokerTradeId(trade.id);
  const links = trade.linkedWith ?? [];

  useEffect(() => {
    if (!open || people.length > 0) return;
    api
      .founderRecipients()
      .then((r) => {
        setPeople(r.recipients);
        setWithUserId((prev) => prev || r.recipients[0]?.userId || '');
      })
      .catch(() => setError('Could not read who else has Founder access'));
  }, [open, people.length]);

  // Their open positions, narrowed to the ones that could BE this trade. The
  // server checks instrument and direction again when the pairing is made —
  // this is the shortlist, not the rule.
  useEffect(() => {
    if (!open || !withUserId) return;
    setTheirs([]);
    setTheirTradeId('');
    api
      .pairablePositions(withUserId)
      .then((r) => {
        const same = r.theirs.filter(
          (p) =>
            p.instrument.replace(/[/_-]/g, '').toUpperCase() ===
              trade.instrument.replace(/[/_-]/g, '').toUpperCase() && p.side === trade.side,
        );
        setTheirs(same);
        setTheirTradeId(same[0]?.tradeId ?? '');
      })
      .catch(() => setError('Could not read their open positions'));
  }, [open, withUserId, trade.instrument, trade.side]);

  if (!eligible) return null;

  const unlink = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.unlinkPositions(id);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unlink');
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    if (!withUserId || !theirTradeId) return;
    setBusy(true);
    setError(null);
    try {
      await api.linkPositions({ withUserId, myTradeId, theirTradeId });
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not link those positions');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {links.map((l) => (
        <button
          key={l.id}
          onClick={() => void unlink(l.id)}
          disabled={busy}
          title={`Linked with ${l.displayName}${l.source === 'join' ? ' (you joined their trade)' : ''} — press to unlink`}
          style={{ ...miniBtn, color: LINK_BLUE, borderColor: 'rgba(90,200,250,.45)' }}
        >
          {l.displayName} ✕
        </button>
      ))}
      {!open ? (
        <button onClick={() => setOpen(true)} style={miniBtn}>
          {links.length > 0 ? 'Link another' : 'Link to a partner'}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <select
            value={withUserId}
            onChange={(e) => setWithUserId(e.target.value)}
            aria-label="Which Founder"
            style={{ ...miniInput, width: 'auto' }}
          >
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.displayName}
              </option>
            ))}
          </select>
          <select
            value={theirTradeId}
            onChange={(e) => setTheirTradeId(e.target.value)}
            aria-label="Which of their positions"
            style={{ ...miniInput, width: 'auto' }}
          >
            {theirs.length === 0 ? (
              <option value="">No matching open position</option>
            ) : (
              theirs.map((p) => (
                <option key={p.tradeId} value={p.tradeId}>
                  {p.units} @ {p.entryPrice} · {p.connectionLabel}
                </option>
              ))
            )}
          </select>
          <button onClick={() => setOpen(false)} style={miniBtn} disabled={busy}>
            {"Cancel"}
          </button>
          <button
            onClick={() => void link()}
            disabled={busy || !theirTradeId}
            style={{ ...miniBtn, color: '#0c2768', background: GOLD, borderColor: GOLD, fontWeight: 700 }}
          >
            {busy ? 'Linking…' : 'Link'}
          </button>
          {error && <span style={{ fontSize: 10, color: RED, width: '100%' }}>{error}</span>}
        </div>
      )}
      {!open && error && <span style={{ fontSize: 10, color: RED }}>{error}</span>}
    </>
  );
}

// The stop/target editor itself. Each box opens on the level the position is
// sitting behind right now, and prices what is typed into it as it is typed —
// the same money · pips reading the order ticket gives, so amending a stop is
// scored the same way as setting one.
export function ProtectionEditor({
  kind,
  editor,
  move,
  hideMoney,
}: {
  kind: PositionEditKind;
  editor: PositionEditor;
  move: Movement;
  hideMoney: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <label style={miniField}>
        <span style={miniLabel}>{"Stop loss"}</span>
        <input value={editor.sl} onChange={(e) => editor.setSl(e.target.value)} inputMode="decimal" placeholder="none" style={miniInput} />
        <LegReading leg={editor.draftLeg(editor.sl, move)} move={move} hideMoney={hideMoney} color={RED} />
      </label>
      <label style={miniField}>
        <span style={miniLabel}>{"Take profit"}</span>
        <input value={editor.tp} onChange={(e) => editor.setTp(e.target.value)} inputMode="decimal" placeholder="none" style={miniInput} />
        <LegReading leg={editor.draftLeg(editor.tp, move)} move={move} hideMoney={hideMoney} color={GREEN} />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 16 }}>
        <button onClick={editor.cancel} style={miniBtn} disabled={editor.busy}>{"Cancel"}</button>
        <button
          onClick={() => void editor.save()}
          disabled={editor.busy}
          style={{ ...miniBtn, color: '#0c2768', background: GOLD, borderColor: GOLD, fontWeight: 700 }}
        >
          {editor.busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div style={{ fontSize: 10, color: FAINT, width: '100%' }}>
        {kind === 'note'
          ? 'Leave a box empty to clear that level. This records what your account is holding — nothing is sent to a broker.'
          : 'Leave a box empty to remove that order.'}
      </div>
    </div>
  );
}

// The money and distance of one leg, e.g. "$60.00 · 15 pips". The blank line is
// kept when there is nothing to say so a row of these does not jump about as
// levels are typed in and cleared.
export function LegReading({
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

export const miniBtn: CSSProperties = {
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  color: '#dfe7fa',
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 10px',
  borderRadius: 6,
  cursor: 'pointer',
};
// The compact list inside a board tile can be four columns wide on a real wall,
// so its controls are a size down.
const smallBtn: CSSProperties = { ...miniBtn, fontSize: 10, padding: '3px 7px' };
export const miniField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
export const miniLabel: CSSProperties = { fontSize: 9.5, color: FAINT, letterSpacing: '.4px', textTransform: 'uppercase' };
export const miniInput: CSSProperties = {
  background: 'rgba(3,12,32,.8)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  color: TEXT,
  fontSize: 13,
  padding: '6px 8px',
  outline: 'none',
  fontFamily: MONO,
  width: 104,
};
