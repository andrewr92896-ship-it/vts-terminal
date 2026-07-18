import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { classifyOutcome, configFrom, configActive, type BreakEvenConfig } from './outcome';
import { tradePips, fmtPips, netPips, hasAnyPips } from './pips';
import { DesignationTag } from './DesignationTag';
import type { HistoryData, HistoryGroup, HistoryRecord, HistorySummary, TradeInput, TradeSide } from '../../api/types';

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

// Day-of-week / month are derived in Eastern Time so they line up with the ET
// clock the desk runs on (and with the "Closed" column above, which is also ET).
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const etWeekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'long' });
const etMonthLabelFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: 'long' });
const etMonthPartsFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit' });
// Full weekday name in ET, e.g. "Monday".
function etWeekday(ms: number): string {
  return etWeekdayFmt.format(new Date(ms));
}
// Sortable month key in ET, e.g. "2026-01" — stable for filtering & grouping.
function etMonthKey(ms: number): string {
  const p = etMonthPartsFmt.formatToParts(new Date(ms));
  const y = p.find((x) => x.type === 'year')?.value ?? '';
  const m = p.find((x) => x.type === 'month')?.value ?? '';
  return `${y}-${m}`;
}
// Human month label in ET, e.g. "January 2026".
function etMonthLabel(ms: number): string {
  return etMonthLabelFmt.format(new Date(ms));
}

// Group a set of closed trades the same way the server's groupBy does, so a
// filtered (by day/month) breakdown scores identically to the full history.
function groupTrades(
  trades: HistoryRecord[],
  pick: (t: HistoryRecord) => string | null,
  canSeeBalances: boolean,
  config: BreakEvenConfig,
): HistoryGroup[] {
  const map = new Map<string, { count: number; wins: number; losses: number; breakeven: number; pl: number; pips: number }>();
  for (const t of trades) {
    const label = (pick(t) ?? '—').trim() || '—';
    const g = map.get(label) ?? { count: 0, wins: 0, losses: 0, breakeven: 0, pl: 0, pips: 0 };
    g.count += 1;
    const pips = tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument);
    if (pips != null) g.pips += pips;
    if (t.realizedPl != null) {
      g.pl += t.realizedPl;
      const outcome = classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config);
      if (outcome === 'win') g.wins += 1;
      else if (outcome === 'loss') g.losses += 1;
      else g.breakeven += 1;
    }
    map.set(label, g);
  }
  return [...map.entries()]
    .map(([label, g]) => ({
      label,
      count: g.count,
      wins: g.wins,
      losses: g.losses,
      breakeven: g.breakeven,
      realizedPl: canSeeBalances ? g.pl : null,
      pips: Number(g.pips.toFixed(1)),
    }))
    .sort((a, b) => b.count - a.count);
}

// Recompute the History summary for a subset of trades (a day/month selection),
// mirroring the server's getHistory math so the KPIs stay consistent.
function summarize(trades: HistoryRecord[], canSeeBalances: boolean, config: BreakEvenConfig): HistorySummary {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let totalPl = 0;
  for (const t of trades) {
    if (t.realizedPl != null) {
      totalPl += t.realizedPl;
      const outcome = classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config);
      if (outcome === 'win') wins += 1;
      else if (outcome === 'loss') losses += 1;
      else breakeven += 1;
    }
  }
  const decided = wins + losses;
  return {
    closed: trades.length,
    wins,
    losses,
    breakeven,
    winRate: decided > 0 ? wins / decided : 0,
    totalRealizedPl: canSeeBalances ? totalPl : null,
    byStrategy: groupTrades(trades, (t) => t.strategy, canSeeBalances, config),
    byInstrument: groupTrades(trades, (t) => t.instrument, canSeeBalances, config),
  };
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
  // Day-of-week and month filters. 'all' = no filter; a day is a full weekday
  // name ("Monday"), a month is an ET month key ("2026-01").
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

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

  const allTrades = data?.trades ?? [];
  const config: BreakEvenConfig = data
    ? configFrom(data)
    : { base: { mode: 'percent', pct: 0, amount: 0 }, overrides: {} };
  const canSeeBalancesRaw = (data?.summary.totalRealizedPl ?? null) !== null;

  // Months that actually have closed trades, newest first, for the Month dropdown.
  const monthOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allTrades) {
      if (t.closedAt == null) continue;
      map.set(etMonthKey(t.closedAt), etMonthLabel(t.closedAt));
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [allTrades]);

  // Apply the day-of-week and month filters. A trade with no close time can't be
  // placed on a calendar, so it drops out whenever either filter is active.
  const filtered = useMemo(() => {
    if (dayFilter === 'all' && monthFilter === 'all') return allTrades;
    return allTrades.filter((t) => {
      if (t.closedAt == null) return false;
      if (dayFilter !== 'all' && etWeekday(t.closedAt) !== dayFilter) return false;
      if (monthFilter !== 'all' && etMonthKey(t.closedAt) !== monthFilter) return false;
      return true;
    });
  }, [allTrades, dayFilter, monthFilter]);

  const filterActive = dayFilter !== 'all' || monthFilter !== 'all';
  // Recompute the summary for a selection; the full view reuses the server's.
  const activeSummary = useMemo(
    () => (filterActive ? summarize(filtered, canSeeBalancesRaw, config) : data?.summary ?? null),
    // config is derived from data, so `data` covers its identity in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterActive, filtered, canSeeBalancesRaw, data],
  );

  if (loadError) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!data || !activeSummary) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading History…</div>;

  const s = activeSummary;
  const canSeeBalances = canSeeBalancesRaw;
  const showMoney = canSeeBalances && !privacy && !hideMoney;
  const money = (n: number | null) => (n == null ? '—' : showMoney ? usd(n) : '•••••');

  // Plain-English label for the current selection, shown on the P/L card.
  const scopeParts: string[] = [];
  if (dayFilter !== 'all') scopeParts.push(`${dayFilter}s`);
  if (monthFilter !== 'all') scopeParts.push(monthOptions.find(([k]) => k === monthFilter)?.[1] ?? monthFilter);
  const scopeLabel = scopeParts.length ? scopeParts.join(' · ') : 'all closed';

  const beActive = configActive(config);
  const showBe = beActive || s.breakeven > 0;
  // Net pips over the current selection — shown beside the Realized P/L, but only
  // on a desk that trades forex (otherwise there's no pip to show).
  const showPips = hasAnyPips(filtered);
  const kpis: { label: string; val: string; sub: string; pips?: string }[] = [
    { label: 'Closed Trades', val: String(s.closed), sub: `${s.wins}W · ${s.losses}L${showBe ? ` · ${s.breakeven}BE` : ''}` },
    { label: 'Win Rate', val: s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—', sub: showBe ? 'wins ÷ decided trades' : 'of scored trades' },
    {
      label: 'Realized P/L',
      val: s.totalRealizedPl == null ? 'hidden' : showMoney ? usd(s.totalRealizedPl) : '•••••',
      sub: scopeLabel,
      pips: showPips ? `(${fmtPips(netPips(filtered), true)})` : undefined,
    },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>History</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            Closed trades across your team — recorded automatically when a Live Wall position closes, tagged by trader.
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

      {/* Day-of-week / month filters */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px' }}>
        <label style={filterField}>
          <span style={filterLabel}>Day of week</span>
          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} style={select} aria-label="Filter by day of week">
            <option value="all">All days</option>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label style={filterField}>
          <span style={filterLabel}>Month</span>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={select}
            aria-label="Filter by month"
            disabled={monthOptions.length === 0}
          >
            <option value="all">All months</option>
            {monthOptions.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>
          {filterActive ? `${filtered.length} of ${allTrades.length}` : `${allTrades.length}`} trade{allTrades.length === 1 ? '' : 's'}
        </span>
        {filterActive && (
          <button onClick={() => { setDayFilter('all'); setMonthFilter('all'); }} style={ghostBtn}>Clear</button>
        )}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{k.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 6 }}>{k.val}</div>
            {k.pips && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: GOLD, marginTop: 3 }}>{k.pips}</div>
            )}
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
          {allTrades.length === 0
            ? 'No closed trades yet. When an open position on the Live Wall closes, it’s recorded here automatically.'
            : `No closed trades for ${scopeLabel}. Try a different day or month.`}
        </div>
      ) : (
        <>
          {/* Per-strategy / per-instrument breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 13, marginBottom: 16 }}>
            <Breakdown title="By Strategy" groups={s.byStrategy} money={money} showPips={showPips} />
            <Breakdown title="By Instrument" groups={s.byInstrument} money={money} showPips={showPips} />
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
            {filtered.map((t) => (
              <TradeRow
                key={t.id}
                t={t}
                config={config}
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

function Breakdown({ title, groups, money, showPips }: { title: string; groups: HistoryGroup[]; money: (n: number | null) => string; showPips: boolean }) {
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
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 64 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: pl == null ? FAINT : pl >= 0 ? GREEN : RED, textAlign: 'right' }}>
                  {pl == null ? '—' : money(pl)}
                </span>
                {showPips && <span style={{ fontSize: 9.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>{`(${fmtPips(g.pips, true)})`}</span>}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function TradeRow({ t, config, isPhone, showMoney, canSeeBalances, canEdit, removing, onRemove, onEdit }: { t: HistoryRecord; config: BreakEvenConfig; isPhone: boolean; showMoney: boolean; canSeeBalances: boolean; canEdit: boolean; removing: boolean; onRemove: () => void; onEdit: () => void }) {
  const long = t.side === 'long';
  const isBreakeven =
    t.realizedPl != null && classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config) === 'breakeven';
  const plUp = (t.realizedPl ?? 0) >= 0;
  const plColor = !canSeeBalances ? FAINT : t.realizedPl == null ? MUTED : isBreakeven ? GOLD : plUp ? GREEN : RED;
  const plText = !canSeeBalances ? '·' : t.realizedPl == null ? '—' : showMoney ? `${isBreakeven ? '' : plUp ? '+' : ''}${usd(t.realizedPl)}` : '•••';
  // Closed forex trade's move in pips, shown beneath its P/L.
  const rowPips = tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument);
  return (
    <div style={{ ...row, borderBottom: `1px solid ${BORDER}`, flexWrap: isPhone ? 'wrap' : 'nowrap', opacity: removing ? 0.5 : 1 }}>
      <span style={{ flex: '1 1 90px', fontWeight: 600, color: TEXT, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {t.instrument}
        {t.code && <span style={{ fontSize: 8.5, color: '#bcd0ff', border: `1px solid ${BORDER2}`, borderRadius: 3, padding: '1px 4px' }} title="Trade code">{t.code}</span>}
        <span style={{ fontSize: 8.5, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 3, padding: '1px 4px' }}>{t.broker}</span>
        {isBreakeven && <span style={{ fontSize: 8.5, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 3, padding: '1px 4px' }} title="Break-even">B/E</span>}
      </span>
      <span style={{ flex: '0 0 90px', display: 'flex', alignItems: 'center', gap: 4, color: t.isMine ? GOLD : MUTED, overflow: 'hidden' }} title={t.isMine ? `${t.owner} (you)` : t.owner}>
        <DesignationTag designation={t.designation} variant="icon" size={12} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{t.owner}{t.isMine ? ' · you' : ''}</span>
      </span>
      <span style={{ ...col, color: long ? GREEN : RED, fontWeight: 700 }}>{long ? 'L' : 'S'}</span>
      <span style={col}>{fmtPrice(t.entryPrice)}</span>
      <span style={col}>{fmtPrice(t.exitPrice)}</span>
      <span style={{ flex: '1 1 90px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.strategy ?? '—'}</span>
      <span style={{ ...col, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <span style={{ fontWeight: 700, color: plColor }}>{plText}</span>
        {rowPips != null && <span style={{ fontSize: 9.5, color: MUTED }}>{`(${fmtPips(rowPips, true)})`}</span>}
      </span>
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
const select: CSSProperties = { ...input, cursor: 'pointer', padding: '8px 11px' };
const filterField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const filterLabel: CSSProperties = { fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED };
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
