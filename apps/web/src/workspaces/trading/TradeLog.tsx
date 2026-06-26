import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useUndo } from '../../hooks/useUndo';
import { UndoBar } from '../../components/UndoBar';
import { usePrivacy } from '../../privacy/privacy';
import { readClipboardImage } from '../../lib/clipboard';
import type {
  FundedAccount,
  RemovedTrade,
  TradeInput,
  TradeLogData,
  TradeRecord,
  TradeSide,
  TradeStatus,
  TradeSummary,
} from '../../api/types';

// Trading navy/gold palette — self-contained, matching the Live Wall.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const AMBER = '#e0a23a';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

// FTP is intentionally absent — funded/FTP trades are tracked under Accounts
// (the Funded subsection), kept separate from the desk Trade Log.
const BROKERS: { key: string; label: string }[] = [
  { key: '', label: 'No broker' },
  { key: 'oanda', label: 'OANDA' },
  { key: 'kraken', label: 'Kraken' },
  { key: 'tradestation', label: 'TradeStation' },
];

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

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
// A date input (YYYY-MM-DD) → ms at ET-ish midnight. Blank → undefined.
function dateToMs(v: string): number | undefined {
  if (!v) return undefined;
  const ms = Date.parse(v + 'T00:00:00');
  return Number.isNaN(ms) ? undefined : ms;
}
function msToDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function slippageFavorable(t: TradeRecord): boolean | null {
  if (t.slippage == null) return null;
  if (t.slippage === 0) return true;
  return t.side === 'long' ? t.slippage < 0 : t.slippage > 0;
}

// Recompute the KPI stats for a subset of trades (one trader's), mirroring the
// backend's desk-wide summarize() so a per-trader view reads the same way.
function summarizeTrades(trades: TradeRecord[]): TradeSummary {
  let open = 0, closed = 0, wins = 0, losses = 0, totalPl = 0, slipSum = 0, slipCount = 0, scored = 0;
  for (const t of trades) {
    if (t.status === 'open') open += 1;
    else closed += 1;
    if (t.realizedPl != null) {
      totalPl += t.realizedPl;
      if (t.status === 'closed') {
        scored += 1;
        if (t.realizedPl >= 0) wins += 1;
        else losses += 1;
      }
    }
    if (t.slippage != null) {
      slipSum += t.slippage;
      slipCount += 1;
    }
  }
  return {
    total: trades.length,
    open,
    closed,
    wins,
    losses,
    winRate: scored > 0 ? wins / scored : 0,
    totalRealizedPl: totalPl,
    avgSlippage: slipCount > 0 ? Number((slipSum / slipCount).toFixed(8)) : null,
  };
}

type Layout = 'deck' | 'tape';

export function TradeLog() {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const undo = useUndo<RemovedTrade>();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  // Admins manage the shared desk, so they can remove any teammate's trade
  // (e.g. clear a test trade), not just their own.
  const isAdmin = !!user?.roles.includes('admin');

  const [data, setData] = useState<TradeLogData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);
  const [layout, setLayout] = useState<Layout>('deck');
  const [adding, setAdding] = useState(false);
  const [importingFunded, setImportingFunded] = useState(false);
  // Per-trader filter: '' = the whole desk; otherwise an ownerId.
  const [trader, setTrader] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .tradeLog()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load the Trade Log'));
    return () => {
      alive = false;
    };
  }, []);

  async function run(action: Promise<TradeLogData>) {
    setBusy(true);
    try {
      setData(await action);
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
      try {
        setData(await api.tradeLog());
      } catch {
        /* keep view */
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeWithUndo(id: string) {
    const t = data?.trades.find((x) => x.id === id);
    const who = t && !t.isMine ? ` (@${t.owner})` : '';
    if (!window.confirm(`Remove this ${t?.instrument ?? ''} trade${who} from the log?`)) return;
    setBusy(true);
    try {
      const r = await api.removeTrade(id);
      setData(r);
      setActionError(null);
      if (r.removed) undo.flag(r.removed);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  function restoreRemoved() {
    const t = undo.pending;
    if (!t) return;
    undo.clear();
    void run(api.restoreTrade(t));
  }

  if (loadError) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading the log…</div>;

  // Balances are shared across the whole trading team, so the desk summary
  // always carries a number here. (Kept as a guard for the older nullable shape;
  // the Hide-$ and privacy toggles below are the per-screen controls.)
  const canSeeBalances = data.summary.totalRealizedPl !== null;
  const showMoney = canSeeBalances && !privacy && !hideMoney;

  // Distinct traders on the desk (for the filter dropdown), plus the filtered
  // view + its recomputed stats so the KPI cards reflect the chosen trader.
  const traders = [...new Map(data.trades.map((t) => [t.ownerId, t.owner])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const shownTrades = trader ? data.trades.filter((t) => t.ownerId === trader) : data.trades;
  const s = trader ? summarizeTrades(shownTrades) : data.summary;
  const selectedTraderName = traders.find((t) => t.id === trader)?.name ?? null;

  const kpis: { label: string; val: string; sub: string }[] = [
    { label: 'Trades', val: String(s.total), sub: `${s.open} open · ${s.closed} closed` },
    { label: 'Win Rate', val: s.closed ? `${Math.round(s.winRate * 100)}%` : '—', sub: `${s.wins}W · ${s.losses}L` },
    {
      label: 'Realized P/L',
      val: s.totalRealizedPl == null ? 'hidden' : showMoney ? usd(s.totalRealizedPl) : '•••••',
      sub: 'closed trades',
    },
    { label: 'Avg Slippage', val: s.avgSlippage == null ? '—' : fmtPrice(s.avgSlippage), sub: 'entry vs. plan' },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Trade Log</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            Shared desk log — every trader’s fills, tagged by trader, with slippage and realized P/L. Funded/prop
            trades are tracked separately under Accounts — paste a screenshot below to log them there.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {traders.length > 1 && (
            <select
              value={trader}
              onChange={(e) => setTrader(e.target.value)}
              title="Show stats for one trader"
              style={{ ...inputBase, flex: '0 0 auto', padding: '7px 11px' }}
            >
              <option value="">Whole desk</option>
              {traders.map((t) => (
                <option key={t.id} value={t.id}>
                  @{t.name}
                  {t.id === user?.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
            {(['deck', 'tape'] as Layout[]).map((l) => (
              <button key={l} onClick={() => setLayout(l)} style={{ ...segBtn, ...(layout === l ? segActive : {}) }}>
                {l === 'deck' ? 'Deck' : 'Tape'}
              </button>
            ))}
          </div>
          {canSeeBalances && (
            <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>
              {hideMoney ? 'Show $' : 'Hide $'}
            </button>
          )}
          {!readOnly && (
            <button onClick={() => setImportingFunded((v) => !v)} style={ghostBtn}>
              {importingFunded ? 'Close' : 'Paste funded trades'}
            </button>
          )}
          {!readOnly && (
            <button onClick={() => setAdding((v) => !v)} style={goldBtn}>
              {adding ? 'Close' : '+ Log a trade'}
            </button>
          )}
        </div>
      </div>

      {!readOnly && importingFunded && <FundedImportPanel onClose={() => setImportingFunded(false)} />}

      {readOnly && (
        <div style={{ ...infoBanner, marginBottom: 14 }}>View-only access — you can browse the log but not edit it.</div>
      )}
      {actionError && (
        <div onClick={() => setActionError(null)} style={warnBanner}>{actionError} — refreshed. Click to dismiss.</div>
      )}

      {/* Summary */}
      <div style={{ fontSize: 11, color: FAINT, marginBottom: 8, letterSpacing: '0.3px' }}>
        {selectedTraderName ? `Individual stats — @${selectedTraderName}` : 'Whole desk — combined stats'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{k.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 6 }}>{k.val}</div>
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {!readOnly && adding && (
        <TradeForm
          busy={busy}
          submitLabel="Add trade"
          onSubmit={async (input) => {
            await run(api.addTrade(input));
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* List */}
      {shownTrades.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          {selectedTraderName
            ? `No trades logged by @${selectedTraderName}.`
            : `No trades logged on the desk yet.${!readOnly ? ' Use “+ Log a trade” to add the first one.' : ''}`}
        </div>
      ) : layout === 'deck' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill,minmax(290px,1fr))', gap: 13 }}>
          {shownTrades.map((t) => (
            <DeckCard
              key={t.id}
              t={t}
              showMoney={showMoney}
              canSeeBalances={canSeeBalances}
              readOnly={readOnly}
              canRemove={t.isMine || isAdmin}
              busy={busy}
              onRemove={() => removeWithUndo(t.id)}
              onSave={(patch) => run(api.updateTrade(t.id, patch))}
            />
          ))}
        </div>
      ) : (
        <Tape
          trades={shownTrades}
          showMoney={showMoney}
          canSeeBalances={canSeeBalances}
          readOnly={readOnly}
          isAdmin={isAdmin}
          busy={busy}
          isPhone={isPhone}
          onRemove={removeWithUndo}
        />
      )}

      {undo.pending && <UndoBar message="Trade removed." onUndo={restoreRemoved} onDismiss={undo.clear} />}
    </div>
  );
}

// ---- Paste/upload completed funded-account trades from the Trade Log ----
// The trades are saved to the Funded section (not the Trade Log); this is just a
// convenient entry point. Claude reads the trades and the account equity off the
// screenshot; duplicates are skipped by time + profit.
function FundedImportPanel({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<FundedAccount[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [newName, setNewName] = useState('');
  const [platform, setPlatform] = useState('FTP');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .funded()
      .then((d) => {
        if (!alive) return;
        setAccounts(d.accounts);
        if (d.accounts[0]) setAccountId(d.accounts[0].id);
      })
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  const creatingNew = accountId === '' ;

  async function ensureAccount(): Promise<string | null> {
    if (accountId) return accountId;
    const name = newName.trim();
    if (!name) {
      setError('Pick an account, or name a new one to create.');
      return null;
    }
    const d = await api.addFundedAccount({ platform: platform.trim() || 'FTP', label: name });
    const created = d.accounts.find((a) => a.label === name) ?? d.accounts[d.accounts.length - 1];
    setAccounts(d.accounts);
    setAccountId(created?.id ?? '');
    return created?.id ?? null;
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
  }

  async function handleFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const id = await ensureAccount();
      if (!id) return;
      const dataUrl = await fileToDataUrl(file);
      const res = await api.importFundedTrades(id, { imageBase64: dataUrl, mediaType: file.type });
      setAccounts(res.funded.accounts);
      const parts = [`${res.added} added`];
      if (res.skipped) parts.push(`${res.skipped} duplicate${res.skipped === 1 ? '' : 's'} skipped`);
      if (res.ignored) parts.push(`${res.ignored} ignored`);
      if (res.balanceSet != null) parts.push('balance updated');
      setMsg(`${parts.join(' · ')} — view them under Accounts.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    const file = await readClipboardImage();
    if (file) void handleFile(file);
    else setError('No image found on the clipboard — copy a screenshot first, or use Upload.');
  }

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={panelLabel}>Paste completed funded-account trades</div>
      <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
        Claude reads the trades (and the account equity, if shown) off the screenshot and logs them on a Funded account.
        Duplicates are skipped by time + profit.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {accounts === null ? (
          <span style={{ fontSize: 12, color: MUTED }}>Loading accounts…</span>
        ) : (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...inputBase, flex: '0 0 200px' }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.platform} · {a.label}</option>
            ))}
            <option value="">＋ New account…</option>
          </select>
        )}
        {creatingNew && accounts !== null && (
          <>
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Platform" style={{ ...inputBase, flex: '0 0 130px' }} />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New account name" style={{ ...inputBase, flex: '1 1 160px' }} />
          </>
        )}
        <button onClick={paste} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>Paste</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Reading…' : 'Upload screenshot'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
        <button onClick={onClose} style={ghostBtn}>Done</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: GREEN, marginTop: 10 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginTop: 10 }}>{error}</div>}
    </div>
  );
}

// ---- Deck card (with inline edit) ----
function DeckCard({
  t,
  showMoney,
  canSeeBalances,
  readOnly,
  canRemove,
  busy,
  onRemove,
  onSave,
}: {
  t: TradeRecord;
  showMoney: boolean;
  canSeeBalances: boolean;
  readOnly: boolean;
  canRemove: boolean;
  busy: boolean;
  onRemove: () => void;
  onSave: (patch: TradeInput) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div style={{ gridColumn: '1 / -1' }}>
        <TradeForm
          busy={busy}
          initial={t}
          submitLabel="Save"
          onSubmit={async (patch) => {
            onSave(patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const long = t.side === 'long';
  const sideColor = long ? GREEN : RED;
  const fav = slippageFavorable(t);
  const slipColor = fav == null ? MUTED : fav ? GREEN : AMBER;
  const plUp = (t.realizedPl ?? 0) >= 0;

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', borderTop: `2px solid ${sideColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t.instrument}</span>
          <span style={{ ...sideBadge, color: sideColor, border: `1px solid ${sideColor}` }}>{long ? 'LONG' : 'SHORT'}</span>
          {t.status === 'open' && <span style={{ ...sideBadge, color: GOLD, border: `1px solid ${GOLD}` }}>OPEN</span>}
        </div>
        <span style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace" }}>{etDate(t.openedAt)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 8px' }}>
        <span style={ownerChip(t.isMine)}>@{t.owner}</span>
        {t.isMine && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.4px', color: GOLD }}>YOU</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 14px 9px', flexWrap: 'wrap' }}>
        <Field label="Planned" value={fmtPrice(t.plannedEntry)} />
        <span style={{ color: FAINT, fontSize: 13 }}>→</span>
        <Field label="Entry" value={fmtPrice(t.entryPrice)} strong />
        {t.exitPrice != null && (
          <>
            <span style={{ color: FAINT, fontSize: 13 }}>→</span>
            <Field label="Exit" value={fmtPrice(t.exitPrice)} />
          </>
        )}
        {t.slippage != null && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: slipColor, fontFamily: "'IBM Plex Mono', monospace" }} title="Entry minus planned">
            {t.slippage > 0 ? '+' : ''}
            {fmtPrice(t.slippage)} slip
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, padding: '0 14px 9px', flexWrap: 'wrap' }}>
        <Field label="TP" value={fmtPrice(t.takeProfit)} color={GREEN} />
        <Field label="SL" value={fmtPrice(t.stopLoss)} color={RED} />
        <Field label="Size" value={String(t.units)} />
      </div>

      {(t.strategy || t.timeframe) && (
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 9px', flexWrap: 'wrap' }}>
          {t.timeframe && <span style={metaChip}>{t.timeframe}</span>}
          {t.strategy && <span style={{ ...metaChip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{t.strategy}</span>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>Realized P/L</span>
          {!canSeeBalances ? (
            <span style={{ fontSize: 11, color: FAINT }}>hidden</span>
          ) : t.realizedPl == null ? (
            <span style={{ fontSize: 13, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>—</span>
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: plUp ? GREEN : RED }}>
              {showMoney ? `${plUp ? '+' : ''}${usd(t.realizedPl)}` : '•••••'}
            </span>
          )}
        </div>
        {!readOnly && (t.isMine || canRemove) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {t.isMine && <button onClick={() => !busy && setEditing(true)} style={smallBtn}>Edit</button>}
            {canRemove && (
              <button onClick={() => !busy && onRemove()} title="Remove" style={{ ...smallBtn, color: '#52668f', borderColor: 'transparent', fontSize: 16, padding: '2px 6px' }}>×</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Tape (dense rows) ----
function Tape({
  trades,
  showMoney,
  canSeeBalances,
  readOnly,
  isAdmin,
  busy,
  isPhone,
  onRemove,
}: {
  trades: TradeRecord[];
  showMoney: boolean;
  canSeeBalances: boolean;
  readOnly: boolean;
  isAdmin: boolean;
  busy: boolean;
  isPhone: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {!isPhone && (
        <div style={{ ...tapeRow, color: FAINT, fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ flex: '1 1 90px' }}>Instrument</span>
          <span style={{ flex: '0 0 90px' }}>Trader</span>
          <span style={col}>Side</span>
          <span style={col}>Entry</span>
          <span style={col}>Exit</span>
          <span style={col}>Slip</span>
          <span style={col}>Size</span>
          <span style={{ ...col, textAlign: 'right' }}>P/L</span>
          <span style={{ ...col, textAlign: 'right' }}>Date</span>
          {!readOnly && <span style={{ width: 24 }} />}
        </div>
      )}
      {trades.map((t) => {
        const long = t.side === 'long';
        const fav = slippageFavorable(t);
        const slipColor = fav == null ? MUTED : fav ? GREEN : AMBER;
        const plUp = (t.realizedPl ?? 0) >= 0;
        return (
          <div key={t.id} style={{ ...tapeRow, borderBottom: `1px solid ${BORDER}`, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
            <span style={{ flex: '1 1 90px', fontWeight: 600, color: TEXT, display: 'flex', gap: 6, alignItems: 'center' }}>
              {t.instrument}
              {t.status === 'open' && <span style={{ fontSize: 8.5, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 3, padding: '1px 4px' }}>OPEN</span>}
            </span>
            <span style={{ flex: '0 0 90px', color: t.isMine ? GOLD : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.isMine ? `${t.owner} (you)` : t.owner}>
              @{t.owner}
            </span>
            <span style={{ ...col, color: long ? GREEN : RED, fontWeight: 700 }}>{long ? 'L' : 'S'}</span>
            <span style={col}>{fmtPrice(t.entryPrice)}</span>
            <span style={col}>{fmtPrice(t.exitPrice)}</span>
            <span style={{ ...col, color: slipColor }}>{t.slippage == null ? '—' : `${t.slippage > 0 ? '+' : ''}${fmtPrice(t.slippage)}`}</span>
            <span style={col}>{t.units}</span>
            <span style={{ ...col, textAlign: 'right', fontWeight: 700, color: !canSeeBalances ? FAINT : t.realizedPl == null ? MUTED : plUp ? GREEN : RED }}>
              {!canSeeBalances ? '·' : t.realizedPl == null ? '—' : showMoney ? `${plUp ? '+' : ''}${usd(t.realizedPl)}` : '•••'}
            </span>
            <span style={{ ...col, textAlign: 'right', color: FAINT }}>{etDate(t.openedAt)}</span>
            {!readOnly &&
              (t.isMine || isAdmin ? (
                <button onClick={() => !busy && onRemove(t.id)} title="Remove" style={{ width: 24, background: 'none', border: 'none', color: '#52668f', fontSize: 15, cursor: 'pointer' }}>×</button>
              ) : (
                <span style={{ width: 24 }} />
              ))}
          </div>
        );
      })}
    </div>
  );
}

// ---- Add / edit form ----
function TradeForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TradeRecord;
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: TradeInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [broker, setBroker] = useState(initial?.broker ?? '');
  const [instrument, setInstrument] = useState(initial?.instrument ?? '');
  const [side, setSide] = useState<TradeSide>(initial?.side ?? 'long');
  const [status, setStatus] = useState<TradeStatus>(initial?.status ?? 'closed');
  const [planned, setPlanned] = useState(initial?.plannedEntry?.toString() ?? '');
  const [entry, setEntry] = useState(initial?.entryPrice?.toString() ?? '');
  const [exit, setExit] = useState(initial?.exitPrice?.toString() ?? '');
  const [tp, setTp] = useState(initial?.takeProfit?.toString() ?? '');
  const [sl, setSl] = useState(initial?.stopLoss?.toString() ?? '');
  const [units, setUnits] = useState(initial?.units?.toString() ?? '');
  const [pl, setPl] = useState(initial?.realizedPl?.toString() ?? '');
  const [strategy, setStrategy] = useState(initial?.strategy ?? '');
  const [timeframe, setTimeframe] = useState(initial?.timeframe ?? '');
  const [openedAt, setOpenedAt] = useState(msToDateInput(initial?.openedAt ?? Date.now()));
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Empty string → null (clear); otherwise the parsed number (skips NaN).
  const optNum = (v: string): number | null | undefined => {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  function submit() {
    if (!instrument.trim()) return;
    const e = Number(entry);
    if (!Number.isFinite(e)) return;
    const input: TradeInput = {
      broker: broker || null,
      instrument: instrument.trim(),
      side,
      status,
      plannedEntry: optNum(planned),
      entryPrice: e,
      exitPrice: optNum(exit),
      takeProfit: optNum(tp),
      stopLoss: optNum(sl),
      units: optNum(units) ?? 0,
      realizedPl: optNum(pl),
      strategy: strategy.trim() || null,
      timeframe: timeframe.trim() || null,
      openedAt: dateToMs(openedAt),
      notes: notes.trim() || null,
    };
    void onSubmit(input);
  }

  const disabled = busy || !instrument.trim() || !Number.isFinite(Number(entry));

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={panelLabel}>{initial ? 'Edit trade' : 'Log a trade'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument (e.g. EUR/USD)" style={{ ...inputBase, flex: '1 1 150px' }} />
        <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)} style={{ ...inputBase, flex: '0 0 110px' }}>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as TradeStatus)} style={{ ...inputBase, flex: '0 0 110px' }}>
          <option value="closed">Closed</option>
          <option value="open">Open</option>
        </select>
        <select value={broker} onChange={(e) => setBroker(e.target.value)} style={{ ...inputBase, flex: '0 0 130px' }}>
          {BROKERS.map((b) => (
            <option key={b.key} value={b.key}>{b.label}</option>
          ))}
        </select>
        <NumInput v={planned} set={setPlanned} ph="Planned entry" />
        <NumInput v={entry} set={setEntry} ph="Entry price *" />
        <NumInput v={exit} set={setExit} ph="Exit price" />
        <NumInput v={tp} set={setTp} ph="Take profit" />
        <NumInput v={sl} set={setSl} ph="Stop loss" />
        <NumInput v={units} set={setUnits} ph="Size / lots" />
        <NumInput v={pl} set={setPl} ph="Realized P/L $" />
        <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="Timeframe (M15)" style={{ ...inputBase, flex: '0 0 120px' }} />
        <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy" style={{ ...inputBase, flex: '1 1 150px' }} />
        <input value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} type="date" style={{ ...inputBase, flex: '0 0 150px' }} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...inputBase, flex: '1 1 100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={submit} disabled={disabled} style={{ ...goldBtn, opacity: disabled ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

function NumInput({ v, set, ph }: { v: string; set: (s: string) => void; ph: string }) {
  return (
    <input
      value={v}
      onChange={(e) => set(e.target.value)}
      type="number"
      step="any"
      placeholder={ph}
      style={{ ...inputBase, flex: '0 0 130px' }}
    />
  );
}

function Field({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: color ?? TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
    </span>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 };
const inputBase: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const smallBtn: CSSProperties = { background: 'none', border: `1px solid ${BORDER2}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6, cursor: 'pointer' };
const segBtn: CSSProperties = { background: 'none', border: 'none', color: MUTED, fontSize: 11.5, fontWeight: 600, padding: '7px 13px', cursor: 'pointer' };
const segActive: CSSProperties = { background: 'rgba(235,203,116,.14)', color: GOLD };
const sideBadge: CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '0.6px', borderRadius: 4, padding: '2px 6px' };
const metaChip: CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '3px 8px' };
function ownerChip(mine: boolean): CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    color: mine ? GOLD : '#bcd0ff',
    background: mine ? 'rgba(235,203,116,.12)' : 'rgba(120,150,220,.12)',
    border: `1px solid ${mine ? 'rgba(235,203,116,.4)' : BORDER2}`,
    borderRadius: 5,
    padding: '2px 7px',
    fontFamily: "'IBM Plex Mono', monospace",
  };
}
const tapeRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" };
const col: CSSProperties = { flex: '0 0 56px' };
const infoBanner: CSSProperties = { fontSize: 12.5, color: '#f3e3b8', background: 'rgba(235,203,116,.08)', border: '1px solid rgba(235,203,116,.35)', borderRadius: 8, padding: '9px 12px' };
const warnBanner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
