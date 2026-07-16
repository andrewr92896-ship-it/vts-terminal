import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import { readClipboardImage } from '../../lib/clipboard';
import { useLivePrices, type LiveMark } from './useLivePrices';
import type { FundedAccount, FundedData, FundedTrade, TradeSide } from '../../api/types';

// Trading navy/gold palette — self-contained, matching the Live Wall / Trade Log.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';
const MONO = "'IBM Plex Mono', monospace";

function money(n: number, ccy: string): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : '';
  return ccy === 'USD' ? `${sign}$${abs}` : `${sign}${abs} ${ccy}`;
}
function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}
const ET = 'America/New_York';
function etDate(ms: number | null): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleDateString('en-US', { timeZone: ET, month: 'short', day: 'numeric' });
}
const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

// The funded-accounts manager, embedded as a section of the Funded screen.
// It owns its own data/state; the parent supplies the single page-level money
// toggle (showMoney) and the viewer's write access (readOnly).
export function FundedManager({ showMoney, readOnly }: { showMoney: boolean; readOnly: boolean }) {
  const { isPhone } = useResponsive();
  const live = useLivePrices();

  const [data, setData] = useState<FundedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .funded()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load accounts'));
    return () => {
      alive = false;
    };
  }, []);

  async function run(action: Promise<FundedData>) {
    setBusy(true);
    try {
      setData(await action);
      setActionError(null);
      return true;
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div style={{ color: RED, fontSize: 12.5 }}>{loadError}</div>;
  if (!data) return <div style={{ color: MUTED, fontSize: 12.5 }}>Loading accounts…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED }}>Accounts</div>
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 4 }}>
            Kept by hand — set the balance and place trades by typing them in or pasting a trade-history photo. “Track live trade” posts an open position to the Live Wall with OANDA-priced P/L (kept off the Trade Log and Live Brokers). Duplicates are skipped by time + profit.
          </div>
        </div>
        {!readOnly && (
          <button onClick={() => setAdding((v) => !v)} style={goldBtn}>{adding ? 'Close' : '+ Add account'}</button>
        )}
      </div>

      {actionError && <div onClick={() => setActionError(null)} style={warnBanner}>{actionError} — click to dismiss.</div>}

      {!readOnly && adding && (
        <AccountForm
          busy={busy}
          onSubmit={async (input) => {
            if (await run(api.addFundedAccount(input))) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {data.accounts.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '28px 20px', color: MUTED, fontSize: 12.5 }}>
          No accounts yet.{!readOnly && ' Use “+ Add account” to set up your first one.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {data.accounts.map((a) => (
            <AccountCard
              key={a.id}
              a={a}
              isPhone={isPhone}
              showMoney={showMoney}
              readOnly={readOnly}
              busy={busy}
              setBusy={setBusy}
              onData={setData}
              onError={setActionError}
              run={run}
              priceFor={live.priceFor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  a,
  isPhone,
  showMoney,
  readOnly,
  busy,
  setBusy,
  onData,
  onError,
  run,
  priceFor,
}: {
  a: FundedAccount;
  isPhone: boolean;
  showMoney: boolean;
  readOnly: boolean;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onData: (d: FundedData) => void;
  onError: (e: string | null) => void;
  run: (p: Promise<FundedData>) => Promise<boolean>;
  priceFor: (instrument: string | null | undefined) => LiveMark | null;
}) {
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(a.balance ?? ''));
  const [addingTrade, setAddingTrade] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Separate flow for reading a single OPEN position off an active-trade
  // screenshot and tracking it live on the Live Wall.
  const [trackingLive, setTrackingLive] = useState(false);
  const [posBusy, setPosBusy] = useState(false);
  const [posMsg, setPosMsg] = useState<string | null>(null);
  const posFileRef = useRef<HTMLInputElement | null>(null);

  const ccy = a.currency || 'USD';
  const dollars = (n: number | null) => (n == null ? '—' : showMoney ? money(n, ccy) : '•••••');

  function importPosition(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setPosMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      setPosBusy(true);
      onError(null);
      try {
        const res = await api.analyzeFundedPosition(a.id, { imageBase64: reader.result as string, mediaType: file.type });
        onData(res.funded);
        const p = res.parsed;
        const side = p.side === 'short' ? 'Short' : 'Long';
        setPosMsg(`Tracking ${side} ${p.instrument ?? ''}${p.entryPrice != null ? ` @ ${fmtPrice(p.entryPrice)}` : ''} — now live on the Live Wall.`);
      } catch (e) {
        onError(e instanceof ApiError ? e.message : 'Could not read that active-trade screenshot');
      } finally {
        setPosBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function importShot(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setShotMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      setShotBusy(true);
      onError(null);
      try {
        const res = await api.importFundedTrades(a.id, { imageBase64: reader.result as string, mediaType: file.type });
        onData(res.funded);
        const parts = [`${res.added} added`];
        if (res.skipped) parts.push(`${res.skipped} duplicate${res.skipped === 1 ? '' : 's'} skipped`);
        if (res.ignored) parts.push(`${res.ignored} ignored`);
        if (res.balanceSet != null) parts.push(`balance set to ${money(res.balanceSet, ccy)}`);
        setShotMsg(parts.join(' · '));
      } catch (e) {
        onError(e instanceof ApiError ? e.message : 'Could not read that screenshot');
      } finally {
        setShotBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveBalance() {
    if (await run(api.updateFundedAccount(a.id, { balance: num(balanceInput) ?? null }))) setEditingBalance(false);
  }

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', borderTop: `2px solid ${GOLD}` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '13px 16px', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{a.label}</span>
            <span style={platformPill}>{a.platform}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>Balance</span>
            {editingBalance ? (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <input value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} type="number" step="any" autoFocus style={{ ...inputBase, width: 130 }} />
                <button onClick={saveBalance} disabled={busy} style={miniGold}>Save</button>
                <button onClick={() => { setEditingBalance(false); setBalanceInput(String(a.balance ?? '')); }} style={miniGhost}>Cancel</button>
              </span>
            ) : (
              <>
                <span style={{ fontSize: 24, fontWeight: 700, fontFamily: MONO, color: '#fff' }}>{dollars(a.balance)}</span>
                {!readOnly && <button onClick={() => setEditingBalance(true)} style={miniGhost}>Edit</button>}
              </>
            )}
          </div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 6 }}>
            Logged P/L <b style={{ color: a.realizedPl >= 0 ? GREEN : RED, fontFamily: MONO }}>{showMoney ? money(a.realizedPl, ccy) : '•••••'}</b> · {a.tradeCount} trade{a.tradeCount === 1 ? '' : 's'}
            {a.startingBalance != null && <> · started at {dollars(a.startingBalance)}</>}
          </div>
          {/* Capital gained from trades — deposits/withdrawals don't count */}
          <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
            <PnlStat label="Today" n={a.pnl.daily} ccy={ccy} showMoney={showMoney} />
            <PnlStat label="This week" n={a.pnl.weekly} ccy={ccy} showMoney={showMoney} />
            <PnlStat label="30 days" n={a.pnl.monthly} ccy={ccy} showMoney={showMoney} />
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => fileRef.current?.click()} disabled={shotBusy} title="Upload a photo or screenshot of your trade history" style={{ ...goldBtn, opacity: shotBusy ? 0.6 : 1 }}>
              {shotBusy ? 'Reading…' : 'Upload photo'}
            </button>
            <button
              onClick={async () => {
                const file = await readClipboardImage();
                if (file) importShot(file);
                else onError('No image found on the clipboard — copy a screenshot first, or use Post screenshot.');
              }}
              disabled={shotBusy}
              title="Paste a screenshot from your clipboard"
              style={{ ...ghostBtn, opacity: shotBusy ? 0.6 : 1 }}
            >
              Paste
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { importShot(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
            <button onClick={() => setTrackingLive((v) => !v)} title="Track an active/open trade live on the Live Wall" style={{ ...ghostBtn, borderColor: 'rgba(53,196,123,.5)', color: '#bff0d4' }}>{trackingLive ? 'Close' : '📈 Track live trade'}</button>
            <button onClick={() => setAddingTrade((v) => !v)} style={ghostBtn}>{addingTrade ? 'Close' : '+ Trade'}</button>
            <button
              onClick={async () => {
                if (window.confirm(`Delete the “${a.label}” account and all its trades? This can't be undone.`)) {
                  setBusy(true);
                  try { onData(await api.removeFundedAccount(a.id)); } catch (e) { onError(e instanceof ApiError ? e.message : 'Action failed'); } finally { setBusy(false); }
                }
              }}
              title="Delete account"
              style={{ ...ghostBtn, color: '#cf6a78' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {shotMsg && <div style={{ fontSize: 11.5, color: GREEN, padding: '0 16px 10px' }}>{shotMsg}</div>}

      {!readOnly && trackingLive && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={panel}>
            <div style={panelLabel}>Track an active trade on the Live Wall</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
              Paste or upload a photo of an <b>open</b> position. Claude reads the fill price and lot size, and it shows on the
              Live Wall with live P/L marked against the desk’s OANDA price — while staying off the Trade Log and Live Brokers totals.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  const file = await readClipboardImage();
                  if (file) importPosition(file);
                  else onError('No image found on the clipboard — copy a screenshot first, or use Upload photo.');
                }}
                disabled={posBusy}
                title="Paste an active-trade screenshot from your clipboard"
                style={{ ...ghostBtn, opacity: posBusy ? 0.6 : 1 }}
              >
                Paste
              </button>
              <button onClick={() => posFileRef.current?.click()} disabled={posBusy} title="Upload a photo or screenshot of your active trade" style={{ ...goldBtn, opacity: posBusy ? 0.6 : 1 }}>
                {posBusy ? 'Reading…' : 'Upload photo'}
              </button>
              <input ref={posFileRef} type="file" accept="image/*" onChange={(e) => { importPosition(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
            </div>
            {posMsg && <div style={{ fontSize: 11.5, color: GREEN, marginTop: 10 }}>{posMsg}</div>}
          </div>
        </div>
      )}

      {!readOnly && addingTrade && (
        <div style={{ padding: '0 16px 12px' }}>
          <TradeForm
            busy={busy}
            priceFor={priceFor}
            onSubmit={async (input) => {
              if (await run(api.addFundedTrade(a.id, input))) setAddingTrade(false);
            }}
            onCancel={() => setAddingTrade(false)}
          />
        </div>
      )}

      {/* Trades */}
      {a.trades.length === 0 ? (
        <div style={{ padding: '0 16px 16px', fontSize: 12, color: MUTED }}>
          No trades logged yet. Post a trade-history screenshot, or add one by hand.
        </div>
      ) : (
        <div style={{ borderTop: `1px solid ${BORDER}` }}>
          {!isPhone && (
            <div style={{ ...row, color: FAINT, fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ flex: '1 1 90px' }}>Instrument</span>
              <span style={col}>Side</span>
              <span style={col}>Entry</span>
              <span style={col}>Exit</span>
              <span style={col}>Size</span>
              <span style={{ ...col, textAlign: 'right' }}>P/L</span>
              <span style={{ ...col, textAlign: 'right' }}>Closed</span>
              {!readOnly && <span style={{ width: 24 }} />}
            </div>
          )}
          {a.trades.map((t) => (
            <TradeRow
              key={t.id}
              t={t}
              ccy={ccy}
              isPhone={isPhone}
              showMoney={showMoney}
              readOnly={readOnly}
              busy={busy}
              liveMark={priceFor(t.instrument)}
              onData={onData}
              onError={onError}
              onRemove={() => {
                if (window.confirm(`Remove this ${t.instrument} trade from ${a.label}?`)) void run(api.removeFundedTrade(t.id));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TradeRow({
  t,
  ccy,
  isPhone,
  showMoney,
  readOnly,
  busy,
  liveMark,
  onData,
  onError,
  onRemove,
}: {
  t: FundedTrade;
  ccy: string;
  isPhone: boolean;
  showMoney: boolean;
  readOnly: boolean;
  busy: boolean;
  liveMark: LiveMark | null;
  onData: (d: FundedData) => void;
  onError: (e: string | null) => void;
  onRemove: () => void;
}) {
  const long = t.side === 'long';
  const plUp = (t.realizedPl ?? 0) >= 0;
  const plText = t.realizedPl == null ? '—' : showMoney ? `${plUp ? '+' : ''}${money(t.realizedPl, ccy)}` : '•••';
  // An open position is tracked live on the Live Wall: borrow the mark for its
  // instrument so the Exit column shows the current price instead of a dash.
  const isOpen = t.status === 'open';
  const showLive = isOpen && liveMark != null;

  // Close flow for an OPEN position: paste/upload a trade-result screenshot that
  // Claude reads to finalize this trade (exit + P/L), or cancel and change nothing.
  const [closing, setClosing] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const closeFileRef = useRef<HTMLInputElement | null>(null);

  function closeFromShot(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setCloseMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      setCloseBusy(true);
      onError(null);
      try {
        const res = await api.closeFundedTrade(t.id, { imageBase64: reader.result as string, mediaType: file.type });
        onData(res.funded);
        setClosing(false);
        const pl = res.result?.realizedPl;
        setCloseMsg(pl != null ? `Trade closed — P/L ${money(pl, ccy)}.` : 'Trade closed.');
      } catch (e) {
        onError(e instanceof ApiError ? e.message : 'Could not read that trade-result screenshot');
      } finally {
        setCloseBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <>
      <div style={{ ...row, borderBottom: closing ? 'none' : `1px solid ${BORDER}`, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
        <span style={{ flex: '1 1 90px', fontWeight: 600, color: TEXT, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {t.instrument}
          {isOpen && <span style={openPill} title="Open position — tracked live on the Live Wall">OPEN</span>}
        </span>
        <span style={{ ...col, color: long ? GREEN : RED, fontWeight: 700 }}>{long ? 'L' : 'S'}</span>
        <span style={col}>{fmtPrice(t.entryPrice)}</span>
        <span style={col}>
          {showLive ? (
            <span title={`Live mark from the Live Wall — ${liveMark!.instrument} @ ${liveMark!.owner}`} style={{ color: GOLD, fontWeight: 700 }}>
              {fmtPrice(liveMark!.price)}<span style={{ fontSize: 8, marginLeft: 3, verticalAlign: 'top' }}>●</span>
            </span>
          ) : (
            fmtPrice(t.exitPrice)
          )}
        </span>
        <span style={col}>{t.units || '—'}</span>
        <span style={{ ...col, textAlign: 'right', fontWeight: 700, color: t.realizedPl == null ? MUTED : plUp ? GREEN : RED }}>{plText}</span>
        <span style={{ ...col, textAlign: 'right', color: FAINT }}>{etDate(t.closedAt ?? t.openedAt)}</span>
        {!readOnly && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {isOpen && (
              <button
                onClick={() => { setCloseMsg(null); setClosing((v) => !v); }}
                title="Close this trade using its result screenshot"
                style={closeTradeBtn}
              >
                {closing ? 'Cancel' : 'Close trade'}
              </button>
            )}
            <button onClick={() => !busy && !closeBusy && onRemove()} title="Remove" style={{ width: 24, background: 'none', border: 'none', color: '#52668f', fontSize: 15, cursor: 'pointer' }}>×</button>
          </span>
        )}
      </div>

      {!readOnly && isOpen && closing && (
        <div style={{ padding: '0 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={panel}>
            <div style={panelLabel}>Close {t.instrument} — paste the trade result</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
              Paste or upload a screenshot of the <b>closed</b> trade. Claude reads the exit price and P/L and finalizes it — the
              position drops off the Live Wall and lands in this account’s logged P/L. Or cancel to leave the trade open.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  const file = await readClipboardImage();
                  if (file) closeFromShot(file);
                  else onError('No image found on the clipboard — copy a screenshot first, or use Upload photo.');
                }}
                disabled={closeBusy}
                title="Paste a trade-result screenshot from your clipboard"
                style={{ ...ghostBtn, opacity: closeBusy ? 0.6 : 1 }}
              >
                Paste screenshot
              </button>
              <button onClick={() => closeFileRef.current?.click()} disabled={closeBusy} title="Upload a photo or screenshot of the closed trade" style={{ ...goldBtn, opacity: closeBusy ? 0.6 : 1 }}>
                {closeBusy ? 'Reading…' : 'Upload photo'}
              </button>
              <input ref={closeFileRef} type="file" accept="image/*" onChange={(e) => { closeFromShot(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
              <button onClick={() => setClosing(false)} disabled={closeBusy} style={ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {closeMsg && !closing && (
        <div style={{ fontSize: 11.5, color: GREEN, padding: '0 16px 10px', borderBottom: `1px solid ${BORDER}` }}>{closeMsg}</div>
      )}
    </>
  );
}

// One trade-P/L window (Today / This week / 30 days). Green for a gain, red for a
// loss, with a leading + on gains. Built from logged trade P/L — deposits excluded.
function PnlStat({ label, n, ccy, showMoney }: { label: string; n: number; ccy: string; showMoney: boolean }) {
  const up = n >= 0;
  const val = !showMoney ? '•••••' : n === 0 ? money(0, ccy) : `${up ? '+' : ''}${money(n, ccy)}`;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: showMoney ? (up ? GREEN : RED) : MUTED }}>{val}</span>
    </span>
  );
}

function AccountForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (input: { platform: string; label: string; currency: string; balance?: number; startingBalance?: number; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState('');
  const [label, setLabel] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [balance, setBalance] = useState('');
  const [starting, setStarting] = useState('');
  const [notes, setNotes] = useState('');

  const disabled = busy || !label.trim();

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={panelLabel}>Add an account</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Broker / label (optional)" style={{ ...inputBase, flex: '0 0 170px' }} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Account name *" style={{ ...inputBase, flex: '1 1 180px' }} />
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="Currency" style={{ ...inputBase, flex: '0 0 90px' }} />
        <input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" step="any" placeholder="Current balance" style={{ ...inputBase, flex: '0 0 150px' }} />
        <input value={starting} onChange={(e) => setStarting(e.target.value)} type="number" step="any" placeholder="Starting balance" style={{ ...inputBase, flex: '0 0 150px' }} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...inputBase, flex: '1 1 100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={() =>
            onSubmit({
              platform: platform.trim() || 'Manual',
              label: label.trim(),
              currency: currency.trim() || 'USD',
              balance: num(balance),
              startingBalance: num(starting),
              notes: notes.trim() || undefined,
            })
          }
          disabled={disabled}
          style={{ ...goldBtn, opacity: disabled ? 0.6 : 1 }}
        >
          Add account
        </button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

function TradeForm({
  busy,
  priceFor,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  priceFor: (instrument: string | null | undefined) => LiveMark | null;
  onSubmit: (input: { instrument: string; side: TradeSide; units?: number; entryPrice?: number; exitPrice?: number; realizedPl?: number }) => void;
  onCancel: () => void;
}) {
  const [instrument, setInstrument] = useState('');
  const [side, setSide] = useState<TradeSide>('long');
  const [units, setUnits] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [pl, setPl] = useState('');

  const disabled = busy || !instrument.trim();
  // Current mark for the typed instrument, borrowed from the Live Wall.
  const mark = priceFor(instrument);

  return (
    <div style={panel}>
      <div style={panelLabel}>Log a trade by hand</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument *" style={{ ...inputBase, flex: '1 1 150px' }} />
        <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)} style={{ ...inputBase, flex: '0 0 110px' }}>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <input value={units} onChange={(e) => setUnits(e.target.value)} type="number" step="any" placeholder="Size / lots" style={{ ...inputBase, flex: '0 0 130px' }} />
        <input value={entry} onChange={(e) => setEntry(e.target.value)} type="number" step="any" placeholder="Entry" style={{ ...inputBase, flex: '0 0 130px' }} />
        <input value={exit} onChange={(e) => setExit(e.target.value)} type="number" step="any" placeholder="Exit" style={{ ...inputBase, flex: '0 0 130px' }} />
        <input value={pl} onChange={(e) => setPl(e.target.value)} type="number" step="any" placeholder="Realized P/L" style={{ ...inputBase, flex: '0 0 140px' }} />
      </div>
      {mark && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap', fontSize: 11.5 }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>● Live {mark.instrument}</span>
          <span style={{ fontFamily: MONO, color: TEXT, fontWeight: 700 }}>{fmtPrice(mark.price)}</span>
          <span style={{ color: FAINT }}>from the Live Wall · @{mark.owner}</span>
          <button type="button" onClick={() => setEntry(String(mark.price))} style={miniGhost}>Use as entry</button>
          <button type="button" onClick={() => setExit(String(mark.price))} style={miniGhost}>Use as exit</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={() => onSubmit({ instrument: instrument.trim(), side, units: num(units), entryPrice: num(entry), exitPrice: num(exit), realizedPl: num(pl) })}
          disabled={disabled}
          style={{ ...goldBtn, opacity: disabled ? 0.6 : 1 }}
        >
          Add trade
        </button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 };
const inputBase: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none', boxSizing: 'border-box' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const miniGold: CSSProperties = { ...goldBtn, fontSize: 11, padding: '6px 11px' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const miniGhost: CSSProperties = { ...ghostBtn, padding: '4px 9px', fontSize: 11 };
const closeTradeBtn: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#bff0d4', background: 'rgba(53,196,123,.1)', border: '1px solid rgba(53,196,123,.5)', padding: '4px 9px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 11.5, fontFamily: MONO };
const col: CSSProperties = { flex: '0 0 64px' };
const platformPill: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: GOLD, background: 'rgba(235,203,116,.12)', border: '1px solid rgba(235,203,116,.4)', borderRadius: 4, padding: '2px 7px' };
const openPill: CSSProperties = { fontSize: 8.5, fontWeight: 800, letterSpacing: '0.5px', color: GREEN, background: 'rgba(53,196,123,.12)', border: '1px solid rgba(53,196,123,.45)', borderRadius: 4, padding: '1px 5px' };
const warnBanner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
