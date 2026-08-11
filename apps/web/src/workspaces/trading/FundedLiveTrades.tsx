import { useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { readClipboardImage } from '../../lib/clipboard';
import { type LiveMark, type LivePrices } from './useLivePrices';
import { etStamp, etStampFull, etSince } from './tradeTime';
import { tileTint } from './TradeCard';
import type { FundedAccount, FundedData, FundedTrade } from '../../api/types';

// Live funded trades, embedded on the private Funded (prop-challenge) page.
// Funded / prop accounts have no API, so an open position is tracked by reading
// it off a screenshot; when the trade closes, the trader pastes/uploads the
// result screenshot and VTS AI reads the exit + P/L to adjust and close it.
// This surfaces the same open positions the desk marks on the Live Wall — but
// right here on the Funded page, so the trader can watch and close them without
// leaving the challenge view. Backed by the shared /api/trading/funded book.

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
interface OpenRow {
  trade: FundedTrade;
  account: FundedAccount;
}

// A read-only viewer never gets funded data (the API is write-gated), so this is
// only ever rendered for a full trader — `readOnly` just hides the write buttons.
//
// The book and the wall's marks are owned by the Funded screen and handed down,
// so the stats, this table and the past-trades list read one copy: closing a
// trade here updates the metrics above it, and the screen polls the Live Wall
// once rather than once per card.
export function FundedLiveTrades({
  data,
  loadError,
  live,
  onData,
  showMoney,
  readOnly,
}: {
  data: FundedData | null;
  loadError: string | null;
  live: LivePrices;
  onData: (d: FundedData) => void;
  showMoney: boolean;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  const openRows: OpenRow[] = data
    ? data.accounts.flatMap((a) => a.trades.filter((t) => t.status === 'open').map((t) => ({ trade: t, account: a })))
    : [];

  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Live funded trades</div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 4, maxWidth: 560 }}>
            Open positions on the desk’s funded accounts, marked against the live price. Close a trade by pasting or
            uploading its result screenshot — VTS AI reads the exit and P/L, adjusts the trade, and closes it. Only the
            trader who owns a position can close it.
          </div>
        </div>
        {!readOnly && data && (
          <button onClick={() => { setError(null); setTracking((v) => !v); }} style={goldBtn}>
            {tracking ? 'Close' : '＋ Track a live trade'}
          </button>
        )}
      </div>

      {error && <div onClick={() => setError(null)} style={warnBanner}>{error} — click to dismiss.</div>}

      {!readOnly && tracking && data && (
        // Only the caller's own accounts can be posted to.
        <TrackLivePanel
          accounts={data.accounts.filter((a) => a.isMine)}
          onData={onData}
          onError={setError}
          onDone={() => setTracking(false)}
        />
      )}

      {loadError ? (
        <div style={{ color: RED, fontSize: 12.5 }}>{loadError}</div>
      ) : !data ? (
        <div style={{ color: MUTED, fontSize: 12.5 }}>{"Loading funded trades…"}</div>
      ) : openRows.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center', color: MUTED, fontSize: 12.5, padding: '22px 16px' }}>
          No live funded trades open.
          {!readOnly && ' Use “＋ Track a live trade” to post an open position from a screenshot.'}
        </div>
      ) : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ ...row, color: FAINT, fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ flex: '1 1 120px' }}>Instrument</span>
            <span style={col}>Side</span>
            <span style={col}>Entry</span>
            <span style={col}>Live</span>
            <span style={col}>Size</span>
            <span style={col}>Stop</span>
            <span style={col}>Target</span>
            <span style={{ ...timeCol, textAlign: 'right' }}>Opened</span>
            {!readOnly && <span style={actionCol} />}
          </div>
          {openRows.map(({ trade, account }) => (
            <LiveTradeRow
              key={trade.id}
              trade={trade}
              account={account}
              showMoney={showMoney}
              // A teammate's position is watch-only: the server refuses a close
              // or a stop change on a row the caller does not own, so the row
              // must not offer either.
              readOnly={readOnly || !account.isMine}
              liveMark={live.priceFor(trade.instrument)}
              // The group's funded tile colour, so these positions read the same
              // here as they do on the Live Wall. Every row on this table is
              // funded, so it is one colour for the table rather than one per
              // row — the colour says what kind of position this is, not whose.
              tileColor={data?.fundedTileColor ?? null}
              onData={onData}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveTradeRow({
  trade,
  account,
  showMoney,
  readOnly,
  liveMark,
  tileColor,
  onData,
  onError,
}: {
  trade: FundedTrade;
  account: FundedAccount;
  showMoney: boolean;
  readOnly: boolean;
  liveMark: LiveMark | null;
  tileColor: string | null;
  onData: (d: FundedData) => void;
  onError: (e: string | null) => void;
}) {
  const long = trade.side === 'long';
  const ccy = account.currency || 'USD';
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Seed from the position as it stands NOW rather than as it stood at mount:
  // the book refreshes underneath, so a level changed since would otherwise open
  // as an empty box — and an empty box saved means "remove that level".
  function openEditor() {
    setSl(trade.stopLoss == null ? '' : String(trade.stopLoss));
    setTp(trade.takeProfit == null ? '' : String(trade.takeProfit));
    setMsg(null);
    setClosing(false);
    setEditing(true);
  }

  async function saveProtection() {
    // A level left exactly as it was is omitted, so saving after changing only
    // the stop never rewrites the target. A cleared box is an explicit null.
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
    onError(null);
    try {
      const d = await api.setFundedTradeProtection(trade.id, {
        ...(stopLoss === undefined ? {} : { stopLoss }),
        ...(takeProfit === undefined ? {} : { takeProfit }),
      });
      onData(d);
      setEditing(false);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not save the stop or target');
    } finally {
      setBusy(false);
    }
  }

  function closeFromShot(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      onError(null);
      try {
        const res = await api.closeFundedTrade(trade.id, { imageBase64: reader.result as string, mediaType: file.type });
        onData(res.funded);
        setClosing(false);
        const pl = res.result?.realizedPl;
        setMsg(pl != null && showMoney ? `Closed — P/L ${money(pl, ccy)}.` : 'Trade closed.');
      } catch (e) {
        onError(e instanceof ApiError ? e.message : 'Could not read that trade-result screenshot');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <>
      {/* Either panel below carries the divider itself, so the row drops its own
          rather than drawing a line between a row and its own open editor. */}
      <div
        style={{
          ...row,
          borderBottom: closing || editing ? 'none' : `1px solid ${BORDER}`,
          flexWrap: 'wrap',
          ...(tileColor ? { borderLeft: `4px solid ${tileColor}`, background: tileTint(tileColor, 'transparent', 32) } : {}),
        }}
      >
        <span style={{ flex: '1 1 120px', fontWeight: 600, color: TEXT, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {trade.instrument}
          <span style={openPill} title="Open position — marked live against the desk price">OPEN</span>
          <span style={{ color: FAINT, fontWeight: 400, fontSize: 10 }}>
            {account.label}
            {!account.isMine && ` · ${account.owner}`}
          </span>
        </span>
        <span style={{ ...col, color: long ? GREEN : RED, fontWeight: 700 }}>{long ? 'L' : 'S'}</span>
        <span style={col}>{fmtPrice(trade.entryPrice)}</span>
        <span style={col}>
          {liveMark ? (
            <span title={`Live mark from the Live Wall — ${liveMark.instrument} @ ${liveMark.owner}`} style={{ color: GOLD, fontWeight: 700 }}>
              {fmtPrice(liveMark.price)}
              <span style={{ fontSize: 8, marginLeft: 3, verticalAlign: 'top' }}>●</span>
            </span>
          ) : (
            '—'
          )}
        </span>
        <span style={col}>{trade.units || '—'}</span>
        {/* The protective levels the prop firm is holding. Coloured like the
            desk's, and an unset one stays faint rather than reading as a price. */}
        <span style={{ ...col, color: trade.stopLoss == null ? FAINT : RED }}>{fmtPrice(trade.stopLoss)}</span>
        <span style={{ ...col, color: trade.takeProfit == null ? FAINT : GREEN }}>{fmtPrice(trade.takeProfit)}</span>
        {/* When it opened, with how long it has been running underneath. */}
        <span style={{ ...timeCol, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, lineHeight: 1.35 }}>
          <span style={{ color: MUTED, whiteSpace: 'nowrap' }} title={`Opened ${etStampFull(trade.openedAt ?? trade.createdAt)}`}>
            {etStamp(trade.openedAt ?? trade.createdAt)}
          </span>
          <span style={{ color: FAINT, whiteSpace: 'nowrap' }}>{etSince(trade.openedAt ?? trade.createdAt)}</span>
        </span>
        {!readOnly && (
          <span style={{ ...actionCol, display: 'inline-flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => (editing ? setEditing(false) : openEditor())}
              disabled={busy}
              title="Set this position's stop and target by hand"
              style={editBtn}
            >
              {editing ? 'Cancel' : 'Stop / target'}
            </button>
            <button
              onClick={() => { setMsg(null); setEditing(false); setClosing((v) => !v); }}
              disabled={busy}
              title="Close this trade using its result screenshot"
              style={closeTradeBtn}
            >
              {closing ? 'Cancel' : 'Close trade'}
            </button>
          </span>
        )}
      </div>

      {!readOnly && editing && (
        <div style={{ padding: '0 12px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={panel}>
            <div style={panelLabel}>{trade.instrument} — stop and target</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 130px' }}>
                <span style={miniLabel}>{"Stop loss"}</span>
                <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="none" style={input} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 130px' }}>
                <span style={miniLabel}>{"Take profit"}</span>
                <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" placeholder="none" style={input} />
              </label>
              <button onClick={() => void saveProtection()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} disabled={busy} style={ghostBtn}>{"Cancel"}</button>
            </div>
          </div>
        </div>
      )}

      {!readOnly && closing && (
        <div style={{ padding: '0 12px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={panel}>
            <div style={panelLabel}>Close {trade.instrument} — paste the trade result</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
              Paste or upload a screenshot of the <b>closed</b> trade. VTS AI reads the exit price and P/L, adjusts this
              trade, and closes it — it drops off the live list and lands in the account’s logged P/L. Or cancel to leave it open.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  const file = await readClipboardImage();
                  if (file) closeFromShot(file);
                  else onError('No image found on the clipboard — copy a screenshot first, or use Upload photo.');
                }}
                disabled={busy}
                title="Paste a trade-result screenshot from your clipboard"
                style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}
              >
                Paste screenshot
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={busy} title="Upload a photo or screenshot of the closed trade" style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Reading…' : 'Upload photo'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { closeFromShot(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
              <button onClick={() => setClosing(false)} disabled={busy} style={ghostBtn}>{"Cancel"}</button>
            </div>
          </div>
        </div>
      )}

      {msg && !closing && (
        <div style={{ fontSize: 11.5, color: GREEN, padding: '8px 12px', borderBottom: `1px solid ${BORDER}` }}>{msg}</div>
      )}
    </>
  );
}

// Read a single OPEN position off an active-trade screenshot and post it live.
// Needs an account to hold it — pick an existing funded account or name a new one.
function TrackLivePanel({
  accounts,
  onData,
  onError,
  onDone,
}: {
  accounts: FundedAccount[];
  onData: (d: FundedData) => void;
  onError: (e: string | null) => void;
  onDone: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [source, setSource] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const creatingNew = accountId === '';

  async function ensureAccount(): Promise<string | null> {
    if (accountId) return accountId;
    const name = newName.trim();
    if (!name) {
      onError('Pick an account, or name a new one to create.');
      return null;
    }
    const d = await api.addFundedAccount({ platform: source.trim() || 'FTP', label: name });
    onData(d);
    const created = d.accounts.find((a) => a.label === name) ?? d.accounts[d.accounts.length - 1];
    setAccountId(created?.id ?? '');
    return created?.id ?? null;
  }

  async function handleFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setMsg(null);
    onError(null);
    setBusy(true);
    try {
      const id = await ensureAccount();
      if (!id) return;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('Could not read the file'));
        r.readAsDataURL(file);
      });
      const res = await api.analyzeFundedPosition(id, { imageBase64: dataUrl, mediaType: file.type });
      onData(res.funded);
      const p = res.parsed;
      const side = p.side === 'short' ? 'Short' : 'Long';
      setMsg(`Tracking ${side} ${p.instrument ?? ''}${p.entryPrice != null ? ` @ ${fmtPrice(p.entryPrice)}` : ''} — now live below.`);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not read that active-trade screenshot');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...panel, marginBottom: 14 }}>
      <div style={panelLabel}>Track an active trade</div>
      <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
        Paste or upload a photo of an <b>open</b> position. VTS AI reads the fill price, side and size, and it shows in the
        live list below — marked against the desk’s live price until you close it.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...input, flex: '0 0 200px', width: 'auto' }}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.platform} · {a.label}</option>
          ))}
          <option value="">＋ New account…</option>
        </select>
        {creatingNew && (
          <>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Broker / label" style={{ ...input, flex: '0 0 130px', width: 'auto' }} />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New account name" style={{ ...input, flex: '1 1 160px', width: 'auto' }} />
          </>
        )}
        <button
          onClick={async () => {
            const file = await readClipboardImage();
            if (file) void handleFile(file);
            else onError('No image found on the clipboard — copy a screenshot first, or use Upload photo.');
          }}
          disabled={busy}
          style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}
        >
          Paste
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Reading…' : 'Upload photo'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
        <button onClick={onDone} style={ghostBtn}>{"Done"}</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: GREEN, marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const closeTradeBtn: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#bff0d4', background: 'rgba(53,196,123,.1)', border: '1px solid rgba(53,196,123,.5)', padding: '4px 9px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
// The transparent left border is reserved by every row, including the header, so
// the funded tile colour can be drawn on a data row without shifting its columns
// 3px out of line with the headings above them.
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 12px',
  fontSize: 11.5,
  fontFamily: MONO,
  borderLeft: '4px solid transparent',
};
const col: CSSProperties = { flex: '0 0 60px' };
// Holds the two row controls side by side; wraps rather than truncating either.
const actionCol: CSSProperties = { flex: '0 0 172px' };
const miniLabel: CSSProperties = { fontSize: 9.5, color: FAINT, letterSpacing: '.4px', textTransform: 'uppercase' };
const editBtn: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' };
// Wider than the rest: it carries the open stamp with the running time beneath.
const timeCol: CSSProperties = { flex: '0 0 118px' };
const openPill: CSSProperties = { fontSize: 8.5, fontWeight: 800, letterSpacing: '0.5px', color: GREEN, background: 'rgba(53,196,123,.12)', border: '1px solid rgba(53,196,123,.45)', borderRadius: 4, padding: '1px 5px' };
const warnBanner: CSSProperties = { marginBottom: 12, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
