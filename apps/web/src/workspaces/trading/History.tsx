import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import type { HistoryData, HistoryGroup, HistoryRecord, StrategyBoard, StrategyRow, StratSideStat } from '../../api/types';

// Trading navy/gold palette — matches the Live Wall / Trade Log.
const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

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
  const [data, setData] = useState<HistoryData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  if (loadError) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading History…</div>;

  const s = data.summary;
  const canSeeBalances = s.totalRealizedPl !== null;
  const showMoney = canSeeBalances && !privacy && !hideMoney;
  const money = (n: number | null) => (n == null ? '—' : showMoney ? usd(n) : '•••••');

  const kpis = [
    { label: 'Closed Trades', val: String(s.closed), sub: `${s.wins}W · ${s.losses}L` },
    { label: 'Win Rate', val: s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—', sub: 'of scored trades' },
    { label: 'Realized P/L', val: s.totalRealizedPl == null ? 'hidden' : showMoney ? usd(s.totalRealizedPl) : '•••••', sub: 'all closed' },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>History</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            Closed trades — recorded automatically when a Live Wall position closes.
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

      {/* Strategy performance — hypothetical (alerts) vs. actual (real trades) */}
      <StrategyPerformance isPhone={isPhone} hideMoney={hideMoney || privacy} />

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
                <span style={col}>Side</span>
                <span style={col}>Entry</span>
                <span style={col}>Exit</span>
                <span style={{ flex: '1 1 90px' }}>Strategy</span>
                <span style={{ ...col, textAlign: 'right' }}>P/L</span>
                <span style={{ ...col, textAlign: 'right' }}>Closed</span>
              </div>
            )}
            {data.trades.map((t) => (
              <TradeRow key={t.id} t={t} isPhone={isPhone} showMoney={showMoney} canSeeBalances={canSeeBalances} />
            ))}
          </div>
        </>
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
              <span style={{ fontSize: 10.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>{g.count} · {g.wins}W {g.losses}L</span>
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

function TradeRow({ t, isPhone, showMoney, canSeeBalances }: { t: HistoryRecord; isPhone: boolean; showMoney: boolean; canSeeBalances: boolean }) {
  const long = t.side === 'long';
  const plUp = (t.realizedPl ?? 0) >= 0;
  const plText = !canSeeBalances ? '·' : t.realizedPl == null ? '—' : showMoney ? `${plUp ? '+' : ''}${usd(t.realizedPl)}` : '•••';
  return (
    <div style={{ ...row, borderBottom: `1px solid ${BORDER}`, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
      <span style={{ flex: '1 1 90px', fontWeight: 600, color: TEXT, display: 'flex', gap: 6, alignItems: 'center' }}>
        {t.instrument}
        <span style={{ fontSize: 8.5, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 3, padding: '1px 4px' }}>{t.broker}</span>
      </span>
      <span style={{ ...col, color: long ? GREEN : RED, fontWeight: 700 }}>{long ? 'L' : 'S'}</span>
      <span style={col}>{fmtPrice(t.entryPrice)}</span>
      <span style={col}>{fmtPrice(t.exitPrice)}</span>
      <span style={{ flex: '1 1 90px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.strategy ?? '—'}</span>
      <span style={{ ...col, textAlign: 'right', fontWeight: 700, color: !canSeeBalances ? FAINT : t.realizedPl == null ? MUTED : plUp ? GREEN : RED }}>{plText}</span>
      <span style={{ ...col, textAlign: 'right', color: FAINT }}>{etDate(t.closedAt)}</span>
    </div>
  );
}

// ---- Strategy performance spreadsheet ----------------------------------------
// Auto-updating per-strategy scoreboard: the hypothetical track (every alert as
// a paper trade) next to the actual track (the real trades you placed). Editing
// a strategy's start date re-scopes its metrics to "since the logic last
// changed". Hypothetical P&L is in price points; actual P&L is account dollars.

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

function StrategyPerformance({ isPhone, hideMoney }: { isPhone: boolean; hideMoney: boolean }) {
  const [board, setBoard] = useState<StrategyBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const canSee = board?.canSeeBalances ?? false;
  const actMoney = (n: number | null) => {
    if (!canSee) return '—';
    if (hideMoney) return '•••';
    if (n == null) return '—';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: `1px solid ${BORDER}`, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Strategy Performance</span>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
            Hypothetical = every alert as a paper trade (P&L in points). Actual = the real trades you placed (P&L in $). Set a start date to score only since the logic last changed.
          </div>
        </div>
        <button onClick={() => void load()} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? '…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ padding: '10px 16px', color: RED, fontSize: 12 }}>{error}</div>}

      {!board ? (
        <div style={{ padding: '16px', color: MUTED, fontSize: 12.5 }}>Loading…</div>
      ) : board.strategies.length === 0 ? (
        <div style={{ padding: '20px 16px', color: MUTED, fontSize: 12.5 }}>
          No strategies yet. Strategies appear here automatically once alerts or trades carry a strategy label.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: isPhone ? 720 : undefined, fontSize: 11.5 }}>
            <thead>
              <tr style={{ color: FAINT }}>
                <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>Strategy</th>
                <th style={th} rowSpan={2}>Start date</th>
                <th style={th} rowSpan={2}>Taken</th>
                <th style={{ ...th, borderLeft: `1px solid ${BORDER2}`, color: GOLD }} colSpan={3}>Hypothetical (alerts)</th>
                <th style={{ ...th, borderLeft: `1px solid ${BORDER2}`, color: GREEN }} colSpan={3}>Actual (trades)</th>
              </tr>
              <tr style={{ color: FAINT }}>
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
                <StrategyRowView key={r.name} r={r} actMoney={actMoney} onSave={saveMeta} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StrategyRowView({
  r,
  actMoney,
  onSave,
}: {
  r: StrategyRow;
  actMoney: (n: number | null) => string;
  onSave: (name: string, patch: { startedAt?: number | null; notes?: string | null }) => void;
}) {
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

const th: CSSProperties = { padding: '6px 10px', textAlign: 'center', fontSize: 9.5, letterSpacing: '0.4px', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '7px 10px', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", color: MUTED, whiteSpace: 'nowrap' };

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" };
const col: CSSProperties = { flex: '0 0 64px' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 11.5, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };
