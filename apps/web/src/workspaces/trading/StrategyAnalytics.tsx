import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { usePrivacy } from '../../privacy/privacy';
import type { StrategyBoard, StrategyRow, StratSideStat } from '../../api/types';

// Strategy Performance — the analytics tab. Every alert is a hypothetical (paper)
// trade; the real trades you placed are the actual track. They are scored side by
// side per strategy. Volatile alert labels (lot size, version, direction) are
// collapsed to one stable strategy name, and a per-strategy start date scopes the
// numbers to "since the logic last changed". Hypothetical P&L is in price points;
// actual P&L is in account dollars — never mixed.

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

function toDateInput(ms: number | null): string {
  return ms == null ? '' : new Date(ms).toISOString().slice(0, 10);
}
function fromDateInput(v: string): number | null {
  return v ? Date.parse(`${v}T12:00:00Z`) : null;
}
function pts(n: number | null): string {
  if (n == null) return '—';
  return (n > 0 ? '+' : '') + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function record(s: StratSideStat): string {
  const base = `${s.wins}–${s.losses}${s.breakeven ? `–${s.breakeven}` : ''}`;
  return s.open ? `${base} · ${s.open} open` : base;
}
function winRateColor(wr: number | null): string {
  if (wr == null) return FAINT;
  if (wr >= 55) return GREEN;
  if (wr >= 45) return GOLD;
  return RED;
}

export function StrategyAnalytics() {
  const { privacy } = usePrivacy();
  const [board, setBoard] = useState<StrategyBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);
  const [newToken, setNewToken] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [importCsv, setImportCsv] = useState<{ name: string; text: string } | null>(null);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      setBoard(await api.tradingStrategies());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load strategies');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveMeta(name: string, patch: { startedAt?: number | null; notes?: string | null }) {
    try {
      setBoard(await api.setStrategyMeta({ name, ...patch }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save strategy');
    }
  }

  async function setIgnore(tokens: string[]) {
    try {
      setBoard(await api.setStrategyIgnore(tokens));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update ignored words');
    }
  }
  function addToken() {
    const t = newToken.trim();
    if (!t || !board) return;
    setNewToken('');
    void setIgnore([...board.ignoreTokens, t]);
  }
  function onTokenKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addToken();
    }
  }

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportCsv({ name: file.name, text: String(reader.result) });
    reader.readAsText(file);
  }
  async function doImport() {
    if (!importCsv || !importName.trim() || importing) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await api.importBacktest(importName.trim(), importCsv.text);
      setBoard(r);
      setImportMsg(`Imported ${r.imported.imported} trades into “${r.imported.strategy}” · ${r.imported.wins}W ${r.imported.losses}L.`);
      setImportCsv(null);
      setImportName('');
    } catch (e) {
      setImportMsg(e instanceof ApiError ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const canSee = board?.canSeeBalances ?? false;
  const showMoney = canSee && !privacy && !hideMoney;
  const actMoney = (n: number | null) => {
    if (!canSee) return '—';
    if (!showMoney) return '•••';
    if (n == null) return '—';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  };
  // Backtest $ is simulated, not real account money, so it isn't gated by the
  // brokerage permission — only masked under privacy / hide-$.
  const btMoney = (n: number | null) => {
    if (n == null) return '—';
    if (privacy || hideMoney) return '•••';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Strategy Performance</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            Hypothetical = every alert as a paper trade (P&L in points). Actual = the real trades you placed (P&L in $). Set a start date to score only since the logic last changed.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canSee && (
            <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
          )}
          <button onClick={() => void load()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div style={warnBanner}>{error}</div>}

      {/* Ignored words — how labels collapse to one strategy */}
      {board && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Grouping</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 9 }}>
            Lot size, version (v2.4), and direction (LONG/SHORT/BOTH) are stripped automatically. Add any other words that vary — e.g. a brand tag — so labels like
            <code style={{ color: GOLD, margin: '0 4px' }}>NAS100 BOTH (Lot 8) 5m mk1 VTS v2.4</code>
            collapse to one strategy.
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            {board.ignoreTokens.map((t) => (
              <span key={t} style={chip}>
                {t}
                <button
                  onClick={() => void setIgnore(board.ignoreTokens.filter((x) => x !== t))}
                  style={{ background: 'none', border: 'none', color: FAINT, cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              onKeyDown={onTokenKey}
              placeholder="add a word…"
              style={{ background: '#0d1f44', border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT, fontSize: 11.5, padding: '6px 9px', width: 130 }}
            />
            <button onClick={addToken} disabled={!newToken.trim()} style={{ ...ghostBtn, opacity: newToken.trim() ? 1 : 0.5 }}>Add</button>
          </div>
        </div>
      )}

      {/* Backtest import — one TradingView "List of Trades" CSV per strategy */}
      {board && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>Backtest</div>
            <span style={{ fontSize: 11.5, color: MUTED }}>
              Import a TradingView “List of Trades” CSV to set a strategy’s backtest baseline. One file = one strategy; re-importing replaces it.
            </span>
            {!importCsv && (
              <button onClick={() => fileRef.current?.click()} style={{ ...goldBtn, marginLeft: 'auto' }}>Import backtest CSV</button>
            )}
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onPickFile} />
          </div>
          {importCsv && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <span style={{ fontSize: 11, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>{importCsv.name}</span>
              <span style={{ fontSize: 11, color: FAINT }}>→ assign to</span>
              <input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void doImport()}
                placeholder="strategy, e.g. BTC 5m mk2"
                list="strat-names"
                style={{ background: '#0d1f44', border: `1px solid ${BORDER2}`, borderRadius: 6, color: TEXT, fontSize: 12, padding: '7px 10px', minWidth: 200 }}
              />
              <datalist id="strat-names">
                {board.strategies.map((s) => <option key={s.name} value={s.name} />)}
              </datalist>
              <button onClick={() => void doImport()} disabled={importing || !importName.trim()} style={{ ...goldBtn, opacity: importing || !importName.trim() ? 0.6 : 1 }}>
                {importing ? 'Importing…' : 'Import'}
              </button>
              <button onClick={() => { setImportCsv(null); setImportName(''); }} style={ghostBtn}>Cancel</button>
            </div>
          )}
          {importMsg && <div style={{ fontSize: 11.5, color: '#a7d8bf', marginTop: 8 }}>{importMsg}</div>}
        </div>
      )}

      {!board ? (
        <div style={{ ...card, color: MUTED, fontSize: 12.5 }}>Loading…</div>
      ) : board.strategies.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          No strategies yet. They appear automatically once your alerts or trades carry a strategy label.
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1040, fontSize: 11.5 }}>
              <thead>
                <tr style={{ color: FAINT }}>
                  <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>Strategy</th>
                  <th style={th} rowSpan={2}>Start date</th>
                  <th style={th} rowSpan={2}>Taken</th>
                  <th style={{ ...th, borderLeft: `1px solid ${BORDER2}`, color: '#8fa3cc' }} colSpan={3}>Backtest (CSV)</th>
                  <th style={{ ...th, borderLeft: `1px solid ${BORDER2}`, color: GOLD }} colSpan={3}>Hypothetical (alerts)</th>
                  <th style={{ ...th, borderLeft: `1px solid ${BORDER2}`, color: GREEN }} colSpan={3}>Actual (trades)</th>
                </tr>
                <tr style={{ color: FAINT }}>
                  <th style={{ ...th, borderLeft: `1px solid ${BORDER2}` }}>W–L</th>
                  <th style={th}>Win%</th>
                  <th style={th}>Net ($)</th>
                  <th style={{ ...th, borderLeft: `1px solid ${BORDER2}` }}>W–L</th>
                  <th style={th}>Win%</th>
                  <th style={th}>Net (pts)</th>
                  <th style={{ ...th, borderLeft: `1px solid ${BORDER2}` }}>W–L</th>
                  <th style={th}>Win%</th>
                  <th style={th}>Net ($)</th>
                </tr>
              </thead>
              <tbody>
                {board.strategies.map((r) => (
                  <Row key={r.name} r={r} actMoney={actMoney} btMoney={btMoney} onSave={saveMeta} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  r,
  actMoney,
  btMoney,
  onSave,
}: {
  r: StrategyRow;
  actMoney: (n: number | null) => string;
  btMoney: (n: number | null) => string;
  onSave: (name: string, patch: { startedAt?: number | null; notes?: string | null }) => void;
}) {
  const emptySide = (s: typeof r.backtest) => s.trades === 0 && s.open === 0;
  return (
    <tr style={{ borderTop: `1px solid ${BORDER}` }}>
      <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: TEXT }}>
        {r.name}
        <div style={{ fontSize: 9.5, color: FAINT, fontWeight: 400 }}>{r.signals} signal{r.signals === 1 ? '' : 's'}</div>
      </td>
      <td style={td}>
        <input
          type="date"
          value={toDateInput(r.startedAt)}
          onChange={(e) => onSave(r.name, { startedAt: fromDateInput(e.target.value) })}
          style={{ background: '#0d1f44', border: `1px solid ${BORDER2}`, borderRadius: 5, color: TEXT, fontSize: 10.5, padding: '3px 5px', fontFamily: 'inherit' }}
        />
      </td>
      <td style={{ ...td, color: r.takenRate != null && r.takenRate > 0 ? TEXT : FAINT }}>
        {r.taken}/{r.signals}
        {r.takenRate != null && <span style={{ color: FAINT }}> · {r.takenRate}%</span>}
      </td>
      {/* Backtest */}
      <td style={{ ...td, borderLeft: `1px solid ${BORDER2}`, color: r.hasBacktest ? MUTED : FAINT }}>
        {r.hasBacktest ? record(r.backtest) : '—'}
      </td>
      <td style={{ ...td, color: winRateColor(r.backtest.winRate), fontWeight: 700 }}>
        {r.backtest.winRate == null ? '—' : `${r.backtest.winRate}%`}
      </td>
      <td style={{ ...td, color: emptySide(r.backtest) ? FAINT : (r.backtest.totalPnl ?? 0) >= 0 ? GREEN : RED, fontWeight: 700 }}>
        {r.hasBacktest ? btMoney(r.backtest.totalPnl) : '—'}
      </td>
      {/* Hypothetical */}
      <td style={{ ...td, borderLeft: `1px solid ${BORDER2}` }}>{record(r.hypothetical)}</td>
      <td style={{ ...td, color: winRateColor(r.hypothetical.winRate), fontWeight: 700 }}>
        {r.hypothetical.winRate == null ? '—' : `${r.hypothetical.winRate}%`}
      </td>
      <td style={{ ...td, color: r.hypothetical.totalPnl == null ? FAINT : r.hypothetical.totalPnl >= 0 ? GREEN : RED, fontWeight: 700 }}>
        {pts(r.hypothetical.totalPnl)}
      </td>
      {/* Actual */}
      <td style={{ ...td, borderLeft: `1px solid ${BORDER2}` }}>{record(r.actual)}</td>
      <td style={{ ...td, color: winRateColor(r.actual.winRate), fontWeight: 700 }}>
        {r.actual.winRate == null ? '—' : `${r.actual.winRate}%`}
      </td>
      <td style={{ ...td, color: r.actual.totalPnl == null ? FAINT : r.actual.totalPnl >= 0 ? GREEN : RED, fontWeight: 700 }}>
        {actMoney(r.actual.totalPnl)}
      </td>
    </tr>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const th: CSSProperties = { padding: '6px 10px', textAlign: 'center', fontSize: 9.5, letterSpacing: '0.4px', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '7px 10px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", color: MUTED, whiteSpace: 'nowrap' };
const chip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: TEXT, background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, borderRadius: 6, padding: '4px 8px' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 11.5, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };
const warnBanner: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', marginBottom: 14 };
