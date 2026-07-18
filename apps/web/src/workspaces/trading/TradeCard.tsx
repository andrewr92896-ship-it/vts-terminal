import { useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { readClipboardImage } from '../../lib/clipboard';
import { classifyOutcome, type BreakEvenConfig } from './outcome';
import { DesignationTag, tileTint } from './DesignationTag';
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
// the wall and never take a green/red designation tint.
const GRAY = '#8892a6';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';
const MONO = "'IBM Plex Mono', monospace";

export const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US');

// Money in the account currency. USD shows as "$"; other currencies append the
// code so the number is never mistaken for dollars.
export function fmtMoney(n: number, ccy: string): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : '';
  return ccy === 'USD' ? `${sign}$${abs}` : `${sign}${abs} ${ccy}`;
}

// Pips with one decimal and an optional sign (for signed open-P/L distances).
export function fmtPips(n: number, signed = false): string {
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${signed && n > 0 ? '+' : ''}${s} pip${Math.abs(n) === 1 ? '' : 's'}`;
}

// Prices span forex (1.08425), indices (38,958), and crypto (64,255). Show
// thousands with separators and few decimals; sub-1000 prices keep precision.
export function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}

const ET = 'America/New_York';
export function etTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    timeZone: ET,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
export function etSince(ms: number | null): string {
  if (ms == null) return '—';
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
}

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
  showMoney,
  showFxMoney,
  canSeeBalances,
  onClosed,
}: {
  t: LiveTrade;
  config: BreakEvenConfig;
  mine: boolean; // the position is on the viewer's own broker account
  readOnly: boolean;
  showMoney: boolean;
  // Forex pip money is shown to every trader (not balance-gated), but still
  // hidden by the privacy and Hide-$ toggles.
  showFxMoney: boolean;
  canSeeBalances: boolean;
  onClosed: () => void;
}) {
  const long = t.side === 'long';
  const sideColor = long ? GREEN : RED;
  // Off-book (funded/FTP) positions are muted gray and always sorted last on the
  // wall, regardless of who placed them; on-book positions take their owner's
  // designation colour (Chief Strategist green / Chief Analyst red), if any.
  const offBook = t.broker === 'ftp';
  const accent = offBook ? GRAY : t.designation?.color ?? null;
  const fav = slippageFavorable(t);
  const slipColor = fav == null ? MUTED : fav ? GREEN : AMBER;
  // While open, a position sitting inside the desk's break-even band (its move
  // from entry to the current mark) is flagged flat rather than a slim win/loss.
  const isBreakeven =
    t.currentPrice != null &&
    classifyOutcome(t.side, t.entryPrice, t.currentPrice, t.unrealizedPl, t.instrument, config) === 'breakeven';

  // A funded (FTP off-book) position the viewer owns can be closed right here on
  // the wall: its id is `funded:<tradeId>`. Closing reads a trade-result
  // screenshot to stamp the exit/P-L and drop it off the wall.
  const fundedTradeId = t.broker === 'ftp' && t.id.startsWith('funded:') ? t.id.slice('funded:'.length) : null;
  const canClose = mine && !readOnly && fundedTradeId != null;
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
        onClosed(); // reload the wall — the position drops off once it's closed
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
        // Tint the whole tile in its accent colour with a matching left accent:
        // the owner's designation colour on-book, or gray for an off-book
        // (funded) position — so whose position it is reads at a glance.
        ...(accent ? { borderLeft: `3px solid ${accent}`, background: tileTint(accent, CARD) } : {}),
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
          {/* The owner's Chief Strategist / Chief Analyst designation, shown on
              every card (including the viewer's own). On an off-book position it
              renders in gray to match the muted tile. */}
          <DesignationTag designation={t.designation} color={offBook ? GRAY : undefined} />
          {/* On the viewer's own card the broker name already identifies it, so
              the owner tag is dropped. On teammates' cards show their handle
              (the part of the email before the domain) so it's clear whose it
              is. */}
          {!mine && <span style={ownerTag(false)} title={t.owner}>@{ownerHandle(t.owner)}</span>}
          {t.broker === 'ftp' ? (
            <span style={ftpTag} title="Hand-tracked position — priced off OANDA, and kept off the Trade Log & Live Brokers capital">{t.brokerName} · off-book</span>
          ) : (
            <span style={brokerTag}>{t.brokerName}</span>
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
        <Field label="Size" value={String(t.units)} />
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

      {/* Footer: P/L + opened */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
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
        <span style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace" }} title={t.openedAt ? `${etTime(t.openedAt)} ET` : ''}>
          {etSince(t.openedAt)}
        </span>
      </div>

      {/* Close trade — funded (off-book) positions the viewer owns */}
      {canClose && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '10px 14px', background: PANEL }}>
          {!closing ? (
            <button onClick={() => { setCloseErr(null); setClosing(true); }} style={closeTradeBtn}>Close trade</button>
          ) : (
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
                <button onClick={() => setClosing(false)} disabled={closeBusy} style={ghostBtnSm}>Cancel</button>
              </div>
              {closeErr && <div style={{ fontSize: 11, color: RED, marginTop: 9 }}>{closeErr}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: color ?? TEXT, fontFamily: MONO }}>{value}</span>
    </span>
  );
}

// Forex-only detail block: the money value of one pip, the risk and reward to
// the stop loss and take profit (in pips and account-currency money), and the
// resulting reward-to-risk ratio. Money is shown only when balances are visible;
// pips and R:R always show because they are price facts, not balances.
function ForexDetails({ f, showMoney }: { f: ForexMetrics; showMoney: boolean }) {
  const ccy = f.accountCurrency;
  const showPerPip = showMoney && f.moneyPerPip != null;
  const hasRR = !!(f.risk || f.reward || f.rr != null);
  if (!showPerPip && !hasRR) return null;
  return (
    <div style={{ padding: '0 14px 10px' }}>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={fxTag}>FOREX</span>
          {showPerPip && (
            <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{fmtMoney(f.moneyPerPip!, ccy)} / pip</span>
          )}
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
