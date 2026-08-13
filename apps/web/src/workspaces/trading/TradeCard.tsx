import { useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { readClipboardImage } from '../../lib/clipboard';
import { classifyOutcome, type BreakEvenConfig } from './outcome';
import { TradeTimes, etSince } from './tradeTime';
import { fmtMoney, fmtPips, fmtPrice, usd } from './tradeFormat';
import { fmtPerStep, fmtSize, sizeTitle } from './pips';
import {
  PositionActions,
  ProtectionEditor,
  usePositionEditKind,
  usePositionEditor,
  wallMovement,
} from './positionEdit';
import type { ForexMetrics, LiveTrade } from '../../api/types';

// The full "trading card" for one open position — the rich card shown on the
// Live Wall's Positions view (and, optionally, inside the Master board's Open
// Positions tile). Extracted here so both surfaces render an identical card.

// Trading workspace palette — navy/gold "pro-terminal" theme, kept in sync with
// the Live Wall so the card reads the same wherever it's shown.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const AMBER = '#e0a23a';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
// Neutral gray used to mute off-book (funded/FTP) positions — they sit last on
// the wall and read as separate from the desk's on-book book. It is also the
// palette's `slate`, which is what the server falls back to when a group has not
// chosen a funded colour, so a desk that never touches tile colours sees the
// wall it always saw. Exported so the other position surfaces fall back to the
// same gray rather than each carrying the literal.
export const OFF_BOOK_GRAY = '#8892a6';
const GRAY = OFF_BOOK_GRAY;
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';
const MONO = "'IBM Plex Mono', monospace";

// The desk's number formatters live in `tradeFormat.ts` — this card imports the
// shared position editor, and the editor needs them, so keeping them here would
// have the two files importing each other. Re-exported so every existing
// `import { fmtMoney } from './TradeCard'` keeps working.
export { usd, fmtMoney, fmtPips, fmtUnits, fmtPrice } from './tradeFormat';

// Fixed to Eastern, deliberately: its remaining callers are Market Data's Fed
// bar and economic calendar, and a 2:00 PM statement is a fact about the market
// rather than about the reader. Anything that shows when something happened FOR
// THE READER — the Live Wall's "Updated …", a position's stamps, an alert's
// arrival — uses `zoneFmt` from lib/timezone and follows the Preferences setting.
const ET = 'America/New_York';
export function etTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    timeZone: ET,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
// "5h 18m ago" and the open/close stamps beside it now live in `tradeTime.tsx`,
// shared with every other surface that shows a position. Re-exported here so the
// older `import { etSince } from './TradeCard'` call sites keep working.
export { etSince, etStamp } from './tradeTime';

// An owner's display handle: the part of their email/username before the "@"
// domain, so "dale@vitalistradingsystems.com" shows as "dale".
export function ownerHandle(owner: string): string {
  return owner.split('@')[0] || owner;
}

// Slippage is favorable when the fill beat the planned entry: a long filled
// below plan, or a short filled above plan.
export function slippageFavorable(t: LiveTrade): boolean | null {
  if (t.slippage == null) return null;
  if (t.slippage === 0) return true;
  return t.side === 'long' ? t.slippage < 0 : t.slippage > 0;
}

export function TradeCard({
  t,
  config,
  mine,
  readOnly,
  sample,
  showMoney,
  showFxMoney,
  canSeeBalances,
  onChanged,
}: {
  t: LiveTrade;
  config: BreakEvenConfig;
  mine: boolean; // the position is on the viewer's own broker account
  readOnly: boolean;
  // The wall previews itself with representative trades when no broker has ever
  // been connected. Nothing on one is actionable — there is no real position
  // behind it to close or amend.
  sample: boolean;
  showMoney: boolean;
  // Forex pip money is shown to every trader (not balance-gated), but still
  // hidden by the privacy and Hide-$ toggles.
  showFxMoney: boolean;
  canSeeBalances: boolean;
  // Reload the wall — this position was closed, or its stop/target changed.
  onChanged: () => void;
}) {
  const long = t.side === 'long';
  const sideColor = long ? GREEN : RED;
  // The tile's wash: whose position it is, or that it is a funded / manual one.
  // The colour is resolved server-side from the group's palette (the leader sets
  // it in My Terminal ▸ My Group), so this card never maps a person to a colour
  // and cannot disagree with the compact list, the desk book or the funded
  // screen about whose trade is whose.
  //
  // The fallback keeps the long-standing behaviour for anything the server did
  // not paint: an off-book (funded) position reads muted gray, and everything
  // else takes no accent. Off-book positions are also always sorted last on the
  // wall, which is separate from the colour and unchanged.
  const offBook = t.broker === 'ftp';
  const accent = t.tileColor ?? (offBook ? GRAY : null);
  const fav = slippageFavorable(t);
  const slipColor = fav == null ? MUTED : fav ? GREEN : AMBER;
  // While open, a position sitting inside the desk's break-even band (its move
  // from entry to the current mark) is flagged flat rather than a slim win/loss.
  const isBreakeven =
    t.currentPrice != null &&
    classifyOutcome(t.side, t.entryPrice, t.currentPrice, t.unrealizedPl, t.instrument, config) === 'breakeven';

  // Acting on the position: the same stop/target editing and closing the Live
  // Trades desk book offers, on the same positions, through the same shared save
  // paths — so a trade can be managed from the board it is being watched on
  // rather than only from the screen that placed it.
  const editKind = usePositionEditKind(t, { own: mine, readOnly, sample });
  const editor = usePositionEditor(t, editKind, onChanged);
  const move = wallMovement(t);

  // A funded (FTP off-book) position the viewer owns can be closed right here on
  // the wall: its id is `funded:<tradeId>`. Closing reads a trade-result
  // screenshot to stamp the exit/P-L and drop it off the wall.
  const fundedTradeId = t.broker === 'ftp' && t.id.startsWith('funded:') ? t.id.slice('funded:'.length) : null;
  const canClose = mine && !readOnly && !sample && fundedTradeId != null;
  const [closing, setClosing] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const closeFileRef = useRef<HTMLInputElement | null>(null);

  function closeFromShot(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/') || !fundedTradeId) return;
    setCloseErr(null);
    const reader = new FileReader();
    reader.onload = async () => {
      setCloseBusy(true);
      try {
        await api.closeFundedTrade(fundedTradeId, { imageBase64: reader.result as string, mediaType: file.type });
        setClosing(false);
        onChanged(); // reload the wall — the position drops off once it's closed
      } catch (e) {
        setCloseErr(e instanceof ApiError ? e.message : 'Could not read that trade-result screenshot');
      } finally {
        setCloseBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  let plNode: React.ReactNode;
  if (!canSeeBalances) {
    plNode = <span style={{ fontSize: 11, color: FAINT }}>P/L hidden</span>;
  } else if (t.unrealizedPl == null) {
    plNode = <span style={{ fontSize: 13, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>—</span>;
  } else {
    const up = t.unrealizedPl >= 0;
    const plColor = isBreakeven ? GOLD : up ? GREEN : RED;
    plNode = (
      <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: plColor }}>
        {showMoney ? `${isBreakeven ? '' : up ? '+' : ''}${usd(t.unrealizedPl)}` : '•••••'}
      </span>
    );
  }

  return (
    <div
      style={{
        ...card,
        padding: 0,
        overflow: 'hidden',
        borderTop: `2px solid ${sideColor}`,
        // The tile colour: a wash across the whole card and a bar down its left
        // edge. The bar is 5px rather than 3 — at 3 it was invisible against the
        // card's own border on a real wall.
        ...(accent ? { borderLeft: `5px solid ${accent}`, background: tileTint(accent, CARD) } : {}),
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 9px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t.instrument}</span>
          <span style={{ ...sideBadge, color: sideColor, border: `1px solid ${sideColor}` }}>{long ? 'LONG' : 'SHORT'}</span>
          {isBreakeven && <span style={{ ...sideBadge, color: GOLD, border: `1px solid ${GOLD}` }} title="Break-even — inside the desk's break-even band">B/E</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* On the viewer's own card the broker name already identifies it, so
              the owner tag is dropped. On teammates' cards show their handle
              (the part of the email before the domain) so it's clear whose it
              is. */}
          {/* The identity chip carries the tile colour at full strength. On a
              teammate's card that is the @handle; on the viewer's own there is
              no handle (the broker name already identifies it), so the broker
              chip takes it instead — every card gets one coloured chip in its
              header rather than the viewer's own being the one that does not.
              The off-book chip keeps its gold: "off-book" is a fact about the
              account that the colour is not allowed to overwrite. */}
          {!mine && (
            <span style={{ ...ownerTag(false), ...(accent ? tileChip(accent) : {}) }} title={t.owner}>
              @{ownerHandle(t.owner)}
            </span>
          )}
          {t.broker === 'ftp' ? (
            <span style={ftpTag} title="Hand-tracked position — priced off OANDA, and kept off the Trade Log & Live Brokers capital">{t.brokerName} · off-book</span>
          ) : (
            <span style={{ ...brokerTag, ...(accent && mine ? tileChip(accent) : {}) }}>{t.brokerName}</span>
          )}
        </div>
      </div>

      {/* Entry: planned -> fill, with slippage */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Field label="Planned" value={fmtPrice(t.plannedEntry)} />
          <span style={{ color: FAINT, fontSize: 13 }}>→</span>
          <Field label="Fill" value={fmtPrice(t.entryPrice)} strong />
          {t.slippage != null && (
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: slipColor, fontFamily: "'IBM Plex Mono', monospace" }} title="Fill minus planned entry">
              {t.slippage > 0 ? '+' : ''}
              {fmtPrice(t.slippage)} slip
            </span>
          )}
        </div>
      </div>

      {/* TP / SL / current */}
      <div style={{ display: 'flex', gap: 14, padding: '0 14px 10px', flexWrap: 'wrap' }}>
        <Field label="TP" value={fmtPrice(t.takeProfit)} color={GREEN} />
        <Field label="SL" value={fmtPrice(t.stopLoss)} color={RED} />
        {t.trailingStopLoss != null && <Field label="Trail SL" value={fmtPrice(t.trailingStopLoss)} color={AMBER} />}
        {t.currentPrice != null && <Field label="Mark" value={fmtPrice(t.currentPrice)} />}
        {/* How big the position is, and what one unit of movement is worth on
            it — side by side, because neither answers "how much am I risking"
            on its own. A currency pair is sized in lots (with the raw units on
            the hover) and moves in pips; everything else keeps its units and
            moves in points. `wallMovement` is the same reading the stop/target
            editor prices a level with, so the card and the editor cannot
            disagree about what a pip is worth here. */}
        <Field label="Size" value={fmtSize(t.instrument, t.units)} title={sizeTitle(t.instrument, t.units)} />
        {showFxMoney && move.perStep != null && (
          <Field label={`Per ${move.unit}`} value={fmtPerStep(move.perStep, move.currency)} />
        )}
      </div>

      {/* Forex pip math: per-pip value, risk/reward to SL/TP, and R:R */}
      {t.forex && <ForexDetails f={t.forex} showMoney={showFxMoney} />}

      {/* Strategy / timeframe */}
      {(t.strategy || t.timeframe) && (
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', flexWrap: 'wrap' }}>
          {t.timeframe && <span style={metaChip}>{t.timeframe}</span>}
          {t.strategy && <span style={{ ...metaChip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{t.strategy}</span>}
        </div>
      )}

      {/* Footer: P/L + when it opened, and how long ago that was */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>Open P/L</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {plNode}
            {t.forex?.pipsOpen != null && (
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: MONO, color: t.forex.pipsOpen >= 0 ? GREEN : RED }}>
                {fmtPips(t.forex.pipsOpen, true)}
              </span>
            )}
          </div>
        </div>
        {/* The clock time this position opened, sitting to the left of how long
            ago that was. A live position has no close time yet — the closed
            stamp shows on the Trade Log card for the same trade. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <TradeTimes openedAt={t.openedAt} />
          <span style={{ fontSize: 10.5, color: FAINT, fontFamily: MONO, whiteSpace: 'nowrap' }}>{etSince(t.openedAt)}</span>
        </div>
      </div>

      {/* Managing the position — ONE footer, however many things this particular
          position can have done to it. A funded card carries both the
          stop/target note and the screenshot close, and two bordered strips
          stacked under one card read as two cards.

          What appears is the trader's own position, and only where there is
          something a save could reach: an OANDA trade's stop and target are
          instructions to the broker and the whole position can be closed here,
          while a funded or hand-kept one records what the account is holding.
          A teammate's card, a Kraken margin row and the sample book carry
          nothing, which is the same rule the desk book draws. */}
      {(editKind || canClose) && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '9px 14px', background: PANEL }}>
          {/* One flow at a time: opening the stop/target editor puts the
              screenshot close away and vice versa, so the card never asks for
              two different things at once. */}
          {!closing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {editKind && <PositionActions trade={t} kind={editKind} editor={editor} />}
              {canClose && !editor.editing && (
                <button onClick={() => { setCloseErr(null); setClosing(true); }} style={closeTradeBtn}>{"Close trade"}</button>
              )}
            </div>
          )}
          {editKind && editor.editing && (
            <ProtectionEditor kind={editKind} editor={editor} move={move} hideMoney={!showMoney} />
          )}
          {editor.error && <div style={{ fontSize: 11, color: RED, marginTop: 6 }}>{editor.error}</div>}

          {/* Closing a funded trade reads the result off a screenshot: it has no
              broker to ask, so the exit price and P/L come from the picture. */}
          {closing && (
            <div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 9, lineHeight: 1.45 }}>
                Paste or upload a screenshot of the <b>closed</b> trade — VTS AI reads the exit price and P/L to finalize it, and
                it drops off the wall into your funded account’s logged P/L. Or cancel to leave it open.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    const file = await readClipboardImage();
                    if (file) closeFromShot(file);
                    else setCloseErr('No image found on the clipboard — copy a screenshot first, or use Upload photo.');
                  }}
                  disabled={closeBusy}
                  style={{ ...ghostBtnSm, opacity: closeBusy ? 0.6 : 1 }}
                >
                  Paste screenshot
                </button>
                <button onClick={() => closeFileRef.current?.click()} disabled={closeBusy} style={{ ...goldBtnSm, opacity: closeBusy ? 0.6 : 1 }}>
                  {closeBusy ? 'Reading…' : 'Upload photo'}
                </button>
                <input ref={closeFileRef} type="file" accept="image/*" onChange={(e) => { closeFromShot(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
                <button onClick={() => setClosing(false)} disabled={closeBusy} style={ghostBtnSm}>{"Cancel"}</button>
              </div>
              {closeErr && <div style={{ fontSize: 11, color: RED, marginTop: 9 }}>{closeErr}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  strong,
  color,
  title,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
  title?: string;
}) {
  return (
    <span title={title} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: color ?? TEXT, fontFamily: MONO }}>{value}</span>
    </span>
  );
}

// Forex-only detail block: the risk and reward to the stop loss and take profit
// (in pips and account-currency money), and the resulting reward-to-risk ratio.
// Money is shown only when balances are visible; pips and R:R always show
// because they are price facts, not balances.
//
// What one pip is worth used to be here too, and is now on the size row above —
// next to the size it is derived from, which is the pairing a trader reads. Do
// not restate it here: one card stating the same figure twice invites the two to
// drift when one of them is edited.
function ForexDetails({ f, showMoney }: { f: ForexMetrics; showMoney: boolean }) {
  const ccy = f.accountCurrency;
  const hasRR = !!(f.risk || f.reward || f.rr != null);
  if (!hasRR) return null;
  return (
    <div style={{ padding: '0 14px 10px' }}>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={fxTag}>FOREX</span>
        </div>
        {hasRR && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {f.risk && <RRBox label="Risk → SL" pips={f.risk.pips} money={showMoney ? f.risk.money : null} ccy={ccy} color={RED} />}
            {f.reward && <RRBox label="Reward → TP" pips={f.reward.pips} money={showMoney ? f.reward.money : null} ccy={ccy} color={GREEN} />}
            {f.rr != null && (
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                <span style={fxLabel}>R:R</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, fontFamily: MONO }}>1:{f.rr}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RRBox({ label, pips, money, ccy, color }: { label: string; pips: number; money: number | null; ccy: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={fxLabel}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color, fontFamily: MONO }}>
        {fmtPips(pips)}
        {money != null && <span style={{ color: MUTED, fontWeight: 500 }}> · {fmtMoney(money, ccy)}</span>}
      </span>
    </span>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 };

// A wash of an accent colour blended into a tile's base background, so the whole
// tile reads in that colour. Exported because four surfaces draw the same
// position — the full card, the board tile's compact list, the Trade Desk's book
// and the funded screen — and a group's colour has to look like one colour
// across all of them. `pct` lets a dense row carry a stronger wash than a large
// card, where the same blend over a much bigger area reads heavier.
//
// The default was 13% and was raised to 24% (owner instruction, 2026-08): at 13%
// four people's cards were nearly indistinguishable on a real wall, which is the
// whole job. Do not quietly lower it again — if a colour looks too strong, the
// answer is a different colour, not a wash nobody can see.
export function tileTint(accent: string, base: string, pct = 24): string {
  return `color-mix(in srgb, ${accent} ${pct}%, ${base})`;
}

// The identity chip — the owner or broker label in a card's header, drawn in
// that position's colour. This is what actually makes a tile "pop": the wash
// tells you two cards differ, and a saturated chip beside the name tells you
// whose it is without decoding anything. Kept off every figure on the card, so
// the money and the side keep their own green/red meaning.
export function tileChip(accent: string): CSSProperties {
  return {
    color: accent,
    background: `color-mix(in srgb, ${accent} 22%, transparent)`,
    border: `1px solid ${accent}`,
  };
}
const fxLabel: CSSProperties = { fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT };
const fxTag: CSSProperties = {
  fontSize: 8.5,
  fontWeight: 800,
  letterSpacing: '0.6px',
  color: GOLD,
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 4,
  padding: '2px 6px',
};
const ghostBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: '#dfe7fa',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  padding: '7px 12px',
  borderRadius: 7,
  cursor: 'pointer',
};
const goldBtn: CSSProperties = {
  border: 'none',
  background: `linear-gradient(180deg,${GOLD},${'#C9A24B'})`,
  color: '#0c2768',
  fontWeight: 700,
  fontSize: 11.5,
  padding: '8px 14px',
  borderRadius: 7,
  cursor: 'pointer',
};
const ghostBtnSm: CSSProperties = { ...ghostBtn, fontSize: 11, padding: '6px 10px' };
const goldBtnSm: CSSProperties = { ...goldBtn, fontSize: 11, padding: '6px 11px' };
// Close-trade CTA on a funded card — green to echo the "off-book / live" accent.
const closeTradeBtn: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#bff0d4',
  background: 'rgba(53,196,123,.1)',
  border: '1px solid rgba(53,196,123,.5)',
  padding: '7px 13px',
  borderRadius: 7,
  cursor: 'pointer',
};
const sideBadge: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: '0.6px',
  borderRadius: 4,
  padding: '2px 6px',
};
const brokerTag: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: MUTED,
  background: 'rgba(255,255,255,.04)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 5,
  padding: '3px 7px',
};
// Funded/prop (FTP) positions are marked off OANDA but never count toward the
// desk's broker capital — tag them so that's unmistakable on the wall.
const ftpTag: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: GOLD,
  background: 'rgba(235,203,116,.1)',
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 5,
  padding: '3px 7px',
};
function ownerTag(mine: boolean): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    color: mine ? GOLD : '#bcd0ff',
    background: mine ? 'rgba(235,203,116,.12)' : 'rgba(120,150,220,.12)',
    border: `1px solid ${mine ? 'rgba(235,203,116,.4)' : BORDER2}`,
    borderRadius: 5,
    padding: '3px 7px',
    fontFamily: MONO,
  };
}
const metaChip: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: MUTED,
  border: `1px solid ${BORDER2}`,
  borderRadius: 5,
  padding: '3px 8px',
};
