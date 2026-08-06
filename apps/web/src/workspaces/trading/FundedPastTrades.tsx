import { useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { readClipboardImage } from '../../lib/clipboard';
import { TradeTimesCell } from './tradeTime';
import type { FundedAccount, FundedData, FundedTrade, FundedTradeInput, TradeSide } from '../../api/types';

// The funded book's completed trades, on the Funded screen beside the live ones.
//
// Why it exists: closed funded trades were only ever listed per account on
// Manual Trades, so this screen showed a challenge with no history behind it —
// and the stats panel above states a win rate with nothing on screen to read it
// against. It is also where a past trade gets loaded in, which the Funded screen
// had no way to do at all: the live card only takes an OPEN position.
//
// Two ways in, both writing to the same book:
//  - a trade-history screenshot, read by VTS AI (the existing import — one photo
//    can carry a whole batch, and duplicates are skipped by time + profit);
//  - typed in by hand, WITH its open and close times, which is the part that
//    matters for loading old trades. The hand-log on Manual Trades stamps
//    nothing, so a trade entered there lands with no date and cannot sit in the
//    account's Today / This week / 30-day windows.

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

// How many rows before the list folds. A funded book runs to hundreds of trades
// and this is a card on a dashboard, not the book itself.
const PAGE = 25;

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
const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
// A `datetime-local` value → ms. Read on the device's own clock, which is what
// the picker itself shows the trader while they type.
const localToMs = (v: string): number | undefined => {
  if (!v) return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : ms;
};

interface ClosedRow {
  trade: FundedTrade;
  account: FundedAccount;
}

export function FundedPastTrades({
  data,
  loadError,
  onData,
  showMoney,
  readOnly,
}: {
  data: FundedData | null;
  loadError: string | null;
  onData: (d: FundedData) => void;
  showMoney: boolean;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Only the caller's own accounts can be written to, so those are the ones the
  // add and import pickers offer. The list below shows the whole desk's.
  const ownAccounts = data ? data.accounts.filter((a) => a.isMine) : [];
  const rows: ClosedRow[] = data
    ? data.accounts
        .flatMap((a) => a.trades.filter((t) => t.status === 'closed').map((t) => ({ trade: t, account: a })))
        // Newest first, on whatever the row can answer with: a closed stamp, else
        // when it opened, else when it was logged. A trade imported without dates
        // still lands somewhere rather than jumping to the top.
        .sort((x, y) => stampOf(y.trade) - stampOf(x.trade))
    : [];
  const shown = showAll ? rows : rows.slice(0, PAGE);

  async function removeTrade(t: FundedTrade, accountLabel: string) {
    if (!window.confirm(`Remove this ${t.instrument} trade from ${accountLabel}?`)) return;
    setBusy(true);
    try {
      onData(await api.removeFundedTrade(t.id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove that trade');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Past funded trades</div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 4, maxWidth: 560 }}>
            Completed trades on the desk’s funded accounts. Load older ones from a trade-history screenshot, or type one
            in with the dates it ran. You can only add to, or remove from, an account of your own.
          </div>
        </div>
        {!readOnly && data && ownAccounts.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => { setError(null); setMsg(null); setAdding(false); setImporting((v) => !v); }} style={ghostBtn}>
              {importing ? 'Close' : 'Load from screenshot'}
            </button>
            <button onClick={() => { setError(null); setMsg(null); setImporting(false); setAdding((v) => !v); }} style={goldBtn}>
              {adding ? 'Close' : '＋ Add a completed trade'}
            </button>
          </div>
        )}
      </div>

      {error && <div onClick={() => setError(null)} style={warnBanner}>{error} — click to dismiss.</div>}
      {msg && <div style={{ fontSize: 11.5, color: GREEN, marginBottom: 10 }}>{msg}</div>}

      {!readOnly && importing && data && (
        <ImportPanel
          accounts={ownAccounts}
          onData={onData}
          onError={setError}
          onMessage={(m) => { setMsg(m); setImporting(false); }}
        />
      )}

      {!readOnly && adding && data && (
        <AddPastTradeForm
          accounts={ownAccounts}
          onError={setError}
          onSaved={(d) => { onData(d); setAdding(false); setMsg('Trade added.'); }}
        />
      )}

      {loadError ? (
        <div style={{ color: RED, fontSize: 12.5 }}>{loadError}</div>
      ) : !data ? (
        <div style={{ color: MUTED, fontSize: 12.5 }}>{"Loading funded trades…"}</div>
      ) : data.accounts.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center', color: MUTED, fontSize: 12.5, padding: '22px 16px' }}>
          No funded accounts yet. Add one on Manual Trades, then load its trades here.
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...panel, textAlign: 'center', color: MUTED, fontSize: 12.5, padding: '22px 16px' }}>
          No completed funded trades yet.
        </div>
      ) : (
        <>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ ...row, color: FAINT, fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ flex: '1 1 120px' }}>Instrument</span>
              <span style={col}>Side</span>
              <span style={col}>Entry</span>
              <span style={col}>Exit</span>
              <span style={col}>Size</span>
              <span style={{ ...col, textAlign: 'right' }}>P/L</span>
              <span style={{ ...timeCol, textAlign: 'right' }}>Opened / Closed</span>
              {!readOnly && <span style={{ width: 24 }} />}
            </div>
            {shown.map(({ trade, account }) => {
              const ccy = account.currency || 'USD';
              const up = (trade.realizedPl ?? 0) >= 0;
              return (
                <div key={trade.id} style={{ ...row, borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 120px', fontWeight: 600, color: TEXT, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {trade.instrument}
                    <span style={{ color: FAINT, fontWeight: 400, fontSize: 10 }}>
                      {account.label}
                      {!account.isMine && ` · ${account.owner}`}
                    </span>
                  </span>
                  <span style={{ ...col, color: trade.side === 'long' ? GREEN : RED, fontWeight: 700 }}>
                    {trade.side === 'long' ? 'L' : 'S'}
                  </span>
                  <span style={col}>{fmtPrice(trade.entryPrice)}</span>
                  <span style={col}>{fmtPrice(trade.exitPrice)}</span>
                  <span style={col}>{trade.units || '—'}</span>
                  <span style={{ ...col, textAlign: 'right', fontWeight: 700, color: trade.realizedPl == null ? MUTED : up ? GREEN : RED }}>
                    {trade.realizedPl == null ? '—' : showMoney ? `${up ? '+' : ''}${money(trade.realizedPl, ccy)}` : '•••'}
                  </span>
                  <span style={{ ...timeCol, display: 'flex', justifyContent: 'flex-end' }}>
                    <TradeTimesCell openedAt={trade.openedAt} closedAt={trade.closedAt} />
                  </span>
                  {/* The cell is always drawn so the columns stay aligned; only
                      a row the viewer owns carries the control. */}
                  {!readOnly && (
                    <span style={{ width: 24, display: 'inline-flex', justifyContent: 'center' }}>
                      {account.isMine && (
                        <button
                          onClick={() => !busy && void removeTrade(trade, account.label)}
                          title="Remove"
                          style={{ background: 'none', border: 'none', color: '#52668f', fontSize: 15, cursor: 'pointer', padding: 0 }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {rows.length > PAGE && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <button onClick={() => setShowAll((v) => !v)} style={ghostBtn}>
                {showAll ? `Show the latest ${PAGE}` : `Show all ${rows.length}`}
              </button>
              <span style={{ fontSize: 11, color: FAINT, fontFamily: MONO }}>
                {shown.length} of {rows.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// When a closed trade happened, for ordering: its close, else its open, else when
// it was logged.
function stampOf(t: FundedTrade): number {
  return t.closedAt ?? t.openedAt ?? t.createdAt;
}

// Read a batch of completed trades off a trade-history photo. The same import
// Manual Trades uses — one endpoint, one dedupe rule — reachable from here so a
// back-fill doesn't mean leaving the screen.
function ImportPanel({
  accounts,
  onData,
  onError,
  onMessage,
}: {
  accounts: FundedAccount[];
  onData: (d: FundedData) => void;
  onError: (e: string | null) => void;
  onMessage: (m: string) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function read(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/') || !accountId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      onError(null);
      try {
        const res = await api.importFundedTrades(accountId, { imageBase64: reader.result as string, mediaType: file.type });
        onData(res.funded);
        const parts = [`${res.added} added`];
        if (res.skipped) parts.push(`${res.skipped} duplicate${res.skipped === 1 ? '' : 's'} skipped`);
        if (res.ignored) parts.push(`${res.ignored} ignored`);
        if (res.balanceSet != null) parts.push('balance updated');
        onMessage(parts.join(' · '));
      } catch (e) {
        onError(e instanceof ApiError ? e.message : 'Could not read that screenshot');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ ...panel, marginBottom: 12 }}>
      <div style={panelLabel}>{"Load completed trades from a screenshot"}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...inputBase, flex: '0 0 210px' }}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.platform} · {a.label}</option>
          ))}
        </select>
        <button
          onClick={async () => {
            const file = await readClipboardImage();
            if (file) read(file);
            else onError('No image found on the clipboard — copy a screenshot first, or use Upload.');
          }}
          disabled={busy}
          style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}
        >
          {"Paste"}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Reading…" : "Upload photo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { read(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
      </div>
      <div style={{ fontSize: 11, color: FAINT, marginTop: 8 }}>
        {"Duplicates are skipped by time + profit, so re-loading the same history adds nothing twice."}
      </div>
    </div>
  );
}

// Type in one completed trade, with the times it ran. Those two fields are the
// reason this form exists rather than reusing the Manual Trades one: a trade
// logged with no close time cannot be placed in a day, a month or a P/L window.
function AddPastTradeForm({
  accounts,
  onError,
  onSaved,
}: {
  accounts: FundedAccount[];
  onError: (e: string | null) => void;
  onSaved: (d: FundedData) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [instrument, setInstrument] = useState('');
  const [side, setSide] = useState<TradeSide>('long');
  const [units, setUnits] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [pl, setPl] = useState('');
  const [opened, setOpened] = useState('');
  const [closed, setClosed] = useState('');
  const [busy, setBusy] = useState(false);

  const disabled = busy || !instrument.trim() || !accountId;

  async function save() {
    setBusy(true);
    onError(null);
    try {
      const input: FundedTradeInput = {
        instrument: instrument.trim(),
        side,
        units: num(units),
        entryPrice: num(entry),
        exitPrice: num(exit),
        realizedPl: num(pl),
        openedAt: localToMs(opened),
        closedAt: localToMs(closed),
      };
      onSaved(await api.addFundedTrade(accountId, input));
      setInstrument('');
      setUnits('');
      setEntry('');
      setExit('');
      setPl('');
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Could not add that trade');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...panel, marginBottom: 12 }}>
      <div style={panelLabel}>{"Add a completed trade"}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...inputBase, flex: '0 0 190px' }}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.platform} · {a.label}</option>
          ))}
        </select>
        <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument *" style={{ ...inputBase, flex: '1 1 140px' }} />
        <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)} style={{ ...inputBase, flex: '0 0 100px' }}>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <input value={units} onChange={(e) => setUnits(e.target.value)} type="number" step="any" placeholder="Size / lots" style={{ ...inputBase, flex: '0 0 120px' }} />
        <input value={entry} onChange={(e) => setEntry(e.target.value)} type="number" step="any" placeholder="Entry" style={{ ...inputBase, flex: '0 0 120px' }} />
        <input value={exit} onChange={(e) => setExit(e.target.value)} type="number" step="any" placeholder="Exit" style={{ ...inputBase, flex: '0 0 120px' }} />
        <input value={pl} onChange={(e) => setPl(e.target.value)} type="number" step="any" placeholder="Realized P/L" style={{ ...inputBase, flex: '0 0 130px' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <label style={field}>
          <span style={fieldLabel}>{"Opened"}</span>
          <input value={opened} onChange={(e) => setOpened(e.target.value)} type="datetime-local" style={{ ...inputBase, width: '100%' }} />
        </label>
        <label style={field}>
          <span style={fieldLabel}>{"Closed"}</span>
          <input value={closed} onChange={(e) => setClosed(e.target.value)} type="datetime-local" style={{ ...inputBase, width: '100%' }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => void save()} disabled={disabled} style={{ ...goldBtn, opacity: disabled ? 0.6 : 1 }}>
          {busy ? "Adding…" : "Add trade"}
        </button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 };
const inputBase: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none', boxSizing: 'border-box' };
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 200px' };
const fieldLabel: CSSProperties = { fontSize: 9.5, letterSpacing: '0.4px', textTransform: 'uppercase', color: FAINT };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const warnBanner: CSSProperties = { marginBottom: 12, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', fontSize: 11.5, fontFamily: MONO };
const col: CSSProperties = { flex: '0 0 64px' };
const timeCol: CSSProperties = { flex: '0 0 118px' };
