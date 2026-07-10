import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { classifyOutcome } from './outcome';
import type { HistoryData, HistoryGroup, HistoryRecord, TradeInput, TradeSide } from '../../api/types';

// Trading navy/gold palette — matches the Live Wall / Trade Log.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const INPUT_BG = '#091633';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

// A date input (YYYY-MM-DD) → ms at local midnight; blank → undefined.
function dateToMs(v: string): number | undefined {
  if (!v) return undefined;
  const ms = Date.parse(v + 'T00:00:00');
  return Number.isNaN(ms) ? undefined : ms;
}
function msToDateInput(ms: number | null): string {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

export function History() {
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [data, setData] = useState<HistoryData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<HistoryRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setData(await api.tradingHistory());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Failed to load History');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(t: HistoryRecord) {
    if (!window.confirm(`Delete this closed ${t.instrument} trade from History? This can't be undone.`)) return;
    setRemovingId(t.id);
    try {
      setData(await api.removeHistoryTrade(t.id));
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Could not delete the trade');
    } finally {
      setRemovingId(null);
    }
  }

  async function saveEdit(patch: Partial<TradeInput>) {
    if (!editing) return;
    setSaving(true);
    try {
      setData(await api.updateHistoryTrade(editing.id, patch));
      setEditing(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Could not update the trade');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading History…</div>;

  const s = data.summary;
  const canSeeBalances = s.totalRealizedPl !== null;
  const showMoney = canSeeBalances && !privacy && !hideMoney;
  const money = (n: number | null) => (n == null ? '—' : showMoney ? usd(n) : '•••••');

  const showBe = data.breakEvenPct > 0 || s.breakeven > 0;
  const kpis = [
    { label: 'Closed Trades', val: String(s.closed), sub: `${s.wins}W · ${s.losses}L${showBe ? ` · ${s.breakeven}BE` : ''}` },
    { label: 'Win Rate', val: s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—', sub: showBe ? 'wins ÷ decided trades' : 'of scored trades' },
    { label: 'Realized P/L', val: s.totalRealizedPl == null ? 'hidden' : showMoney ? usd(s.totalRealizedPl) : '•••••', sub: 'all closed' },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>History</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            Closed trades across the desk — recorded automatically when a Live Wall position closes, tagged by trader.
            {!readOnly && ' Delete any of your own rows to clear out test trades.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canSeeBalances && (
            <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
          )}
          <button onClick={() => void load()} disabled={refreshing} style={{ ...goldBtn, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{k.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 6 }}>{k.val}</div>
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {data.trades.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          No closed trades yet. When an open position on the Live Wall closes, it’s recorded here automatically.
        </div>
      ) : (
        <>
          {/* Per-strategy / per-instrument breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 13, marginBottom: 16 }}>
            <Breakdown title="By Strategy" groups={s.byStrategy} money={money} />
            <Breakdown title="By Instrument" groups={s.byInstrument} money={money} />
          </div>

          {/* Closed trades */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 14, fontWeight: 600, color: '#fff' }}>
              Closed Trades
            </div>
            {!isPhone && (
              <div style={{ ...row, color: FAINT, fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ flex: '1 1 90px' }}>Instrument</span>
                <span style={{ flex: '0 0 90px' }}>Trader</span>
                <span style={col}>Side</span>
                <span style={col}>Entry</span>
                <span style={col}>Exit</span>
                <span style={{ flex: '1 1 90px' }}>Strategy</span>
                <span style={{ ...col, textAlign: 'right' }}>P/L</span>
                <span style={{ ...col, textAlign: 'right' }}>Closed</span>
                {!readOnly && <span style={{ width: 60 }} />}
              </div>
            )}
            {data.trades.map((t) => (
              <TradeRow
                key={t.id}
                t={t}
                breakEvenPct={data.breakEvenPct}
                isPhone={isPhone}
                showMoney={showMoney}
                canSeeBalances={canSeeBalances}
                canEdit={!readOnly && t.isMine}
                removing={removingId === t.id}
                onRemove={() => remove(t)}
                onEdit={() => setEditing(t)}
              />
            ))}
          </div>
        </>
      )}

      {editing && (
        <HistoryEditModal
          key={editing.id}
          t={editing}
          busy={saving}
          onSave={saveEdit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Breakdown({ title, groups, money }: { title: string; groups: HistoryGroup[]; money: (n: number | null) => string }) {
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 600, color: '#fff' }}>{title}</div>
      {groups.length === 0 ? (
        <div style={{ padding: '14px 16px', fontSize: 12, color: MUTED }}>No data yet.</div>
      ) : (
        groups.slice(0, 6).map((g) => {
          const pl = g.realizedPl;
          return (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderTop: `1px solid ${BORDER}`, gap: 10 }}>
              <span style={{ fontSize: 12.5, color: TEXT, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
              <span style={{ fontSize: 10.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>{g.count} · {g.wins}W {g.losses}L{g.breakeven > 0 ? ` ${g.breakeven}BE` : ''}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: pl == null ? FAINT : pl >= 0 ? GREEN : RED, minWidth: 64, textAlign: 'right' }}>
                {pl == null ? '—' : money(pl)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function TradeRow({ t, breakEvenPct, isPhone, showMoney, canSeeBalances, canEdit, removing, onRemove, onEdit }: { t: HistoryRecord; breakEvenPct: number; isPhone: boolean; showMoney: boolean; canSeeBalances: boolean; canEdit: boolean; removing: boolean; onRemove: () => void; onEdit: () => void }) {
  const long = t.side === 'long';
  const isBreakeven =
    t.realizedPl != null && classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, breakEvenPct) === 'breakeven';
  const plUp = (t.realizedPl ?? 0) >= 0;
  const plColor = !canSeeBalances ? FAINT : t.realizedPl == null ? MUTED : isBreakeven ? GOLD : plUp ? GREEN : RED;
  const plText = !canSeeBalances ? '·' : t.realizedPl == null ? '—' : showMoney ? `${isBreakeven ? '' : plUp ? '+' : ''}${usd(t.realizedPl)}` : '•••';
  return (
    <div style={{ ...row, borderBottom: `1px solid ${BORDER}`, flexWrap: isPhone ? 'wrap' : 'nowrap', opacity: removing ? 0.5 : 1 }}>
      <span style={{ flex: '1 1 90px', fontWeight: 600, color: TEXT, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {t.instrument}
        {t.code && <span style={{ fontSize: 8.5, color: '#bcd0ff', border: `1px solid ${BORDER2}`, borderRadius: 3, padding: '1px 4px' }} title="Trade code">{t.code}</span>}
        <span style={{ fontSize: 8.5, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 3, padding: '1px 4px' }}>{t.broker}</span>
        {isBreakeven && <span style={{ fontSize: 8.5, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 3, padding: '1px 4px' }} title="Break-even">B/E</span>}
      </span>
      <span style={{ flex: '0 0 90px', color: t.isMine ? GOLD : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.isMine ? `${t.owner} (you)` : t.owner}>
        @{t.owner}{t.isMine ? ' · you' : ''}
      </span>
      <span style={{ ...col, color: long ? GREEN : RED, fontWeight: 700 }}>{long ? 'L' : 'S'}</span>
      <span style={col}>{fmtPrice(t.entryPrice)}</span>
      <span style={col}>{fmtPrice(t.exitPrice)}</span>
      <span style={{ flex: '1 1 90px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.strategy ?? '—'}</span>
      <span style={{ ...col, textAlign: 'right', fontWeight: 700, color: plColor }}>{plText}</span>
      <span style={{ ...col, textAlign: 'right', color: FAINT }}>{etDate(t.closedAt)}</span>
      {canEdit ? (
        <span style={{ display: 'flex', gap: 4, width: 60, justifyContent: 'flex-end' }}>
          <button onClick={onEdit} disabled={removing} title="Edit this trade" aria-label="Edit trade" style={rowIconBtn}>✏️</button>
          <button onClick={onRemove} disabled={removing} title="Delete this trade" aria-label="Delete trade" style={{ ...rowIconBtn, color: '#52668f', fontSize: 15 }}>×</button>
        </span>
      ) : (
        !isPhone && <span style={{ width: 60 }} />
      )}
    </div>
  );
}

// Modal editor for a closed trade — the pencil on a History row opens this.
// Edits the trade's own facts (levels, size, P/L, tags, dates) and saves through
// PATCH /api/trading/history/:id.
function HistoryEditModal({ t, busy, onSave, onClose }: { t: HistoryRecord; busy: boolean; onSave: (patch: Partial<TradeInput>) => void; onClose: () => void }) {
  const [instrument, setInstrument] = useState(t.instrument);
  const [side, setSide] = useState<TradeSide>(t.side);
  const [units, setUnits] = useState(t.units?.toString() ?? '');
  const [entry, setEntry] = useState(t.entryPrice?.toString() ?? '');
  const [exit, setExit] = useState(t.exitPrice?.toString() ?? '');
  const [pl, setPl] = useState(t.realizedPl?.toString() ?? '');
  const [strategy, setStrategy] = useState(t.strategy ?? '');
  const [timeframe, setTimeframe] = useState(t.timeframe ?? '');
  const [closedAt, setClosedAt] = useState(msToDateInput(t.closedAt));

  const optNum = (v: string): number | null | undefined => {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  function submit() {
    if (!instrument.trim()) return;
    const e = Number(entry);
    if (!Number.isFinite(e)) return;
    const closedMs = dateToMs(closedAt);
    onSave({
      instrument: instrument.trim(),
      side,
      units: optNum(units) ?? 0,
      entryPrice: e,
      exitPrice: optNum(exit),
      realizedPl: optNum(pl),
      strategy: strategy.trim() || null,
      timeframe: timeframe.trim() || null,
      ...(closedMs != null ? { closedAt: closedMs } : {}),
    });
  }

  const disabled = busy || !instrument.trim() || !Number.isFinite(Number(entry));

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }} />
      <div role="dialog" aria-modal="true" aria-label="Edit closed trade" style={modalCard}>
        <div style={modalHeader}>
          <strong style={{ fontSize: 15, color: '#fff' }}>Edit trade{t.code ? ` · ${t.code}` : ''}</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument" style={{ ...input, flex: '1 1 150px' }} />
            <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)} style={{ ...input, flex: '0 0 110px' }}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <input value={entry} onChange={(e) => setEntry(e.target.value)} type="number" step="any" placeholder="Entry price *" style={{ ...input, flex: '0 0 130px' }} />
            <input value={exit} onChange={(e) => setExit(e.target.value)} type="number" step="any" placeholder="Exit price" style={{ ...input, flex: '0 0 130px' }} />
            <input value={units} onChange={(e) => setUnits(e.target.value)} type="number" step="any" placeholder="Size / lots" style={{ ...input, flex: '0 0 130px' }} />
            <input value={pl} onChange={(e) => setPl(e.target.value)} type="number" step="any" placeholder="Realized P/L $" style={{ ...input, flex: '0 0 130px' }} />
            <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="Timeframe (M15)" style={{ ...input, flex: '0 0 120px' }} />
            <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy" style={{ ...input, flex: '1 1 150px' }} />
            <input value={closedAt} onChange={(e) => setClosedAt(e.target.value)} type="date" style={{ ...input, flex: '0 0 150px' }} />
          </div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 10 }}>
            Win / loss / break-even is decided by the entry → exit price move, so correcting the exit updates how this trade is scored.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={submit} disabled={disabled} style={{ ...goldBtn, opacity: disabled ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" };
const col: CSSProperties = { flex: '0 0 64px' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 11.5, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };
const rowIconBtn: CSSProperties = { background: 'none', border: 'none', color: MUTED, fontSize: 13, lineHeight: 1, padding: '2px 4px', cursor: 'pointer' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const modalCard: CSSProperties = {
  position: 'fixed',
  top: '7vh',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(620px, 94vw)',
  maxHeight: '86vh',
  overflowY: 'auto',
  background: '#081226',
  border: `1px solid ${BORDER2}`,
  borderRadius: 14,
  boxShadow: '0 24px 60px rgba(0,0,0,.55)',
  zIndex: 61,
  animation: 'popIn .25s ease',
  color: TEXT,
};
const modalHeader: CSSProperties = {
  position: 'sticky',
  top: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  background: 'linear-gradient(90deg,#0a1f4d,#0c2768)',
  borderBottom: `1px solid ${BORDER2}`,
};
