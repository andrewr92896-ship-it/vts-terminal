import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useUndo } from '../../hooks/useUndo';
import { UndoBar } from '../../components/UndoBar';
import { usePrivacy } from '../../privacy/privacy';
import { classifyOutcome, configFrom, configActive, type BreakEvenBand, type BreakEvenConfig } from './outcome';
import {
  Breakdown,
  WEEKDAYS,
  etMonthKey,
  etMonthLabel,
  etWeekday,
  filterField,
  filterLabel,
  filterSelect,
  groupTrades,
} from './tradeBreakdown';
import {
  tradePips,
  fmtUnitCount,
  fmtUnitSize,
  lotsTitle,
  fmtMovement,
  hasAnyMovement,
  negMovement,
  netMovement,
  tradePoints,
  perPipForSize,
  pipsParenthetical,
} from './pips';
import { profitFactorStats, profitFactorText, projectedProfitFactorStats, scaledProfitFactorText, summarizeTrades } from './tradeStats';
import { getTradeLayout, type Layout } from './preferences';
import { ScreenTitle } from './ScreenTitle';
import { TradeTimes, TradeTimesCell, ageLabel } from './tradeTime';
import { excludedNote } from './excludedNote';
import { CapitalCards } from './CapitalCards';
import type {
  ExcludedTrades,
  RemovedTrade,
  TradeInput,
  TradeLogData,
  TradeRecord,
  TradeSide,
  TradeStatus,
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

// FTP is intentionally absent — funded/FTP trades are tracked on the Funded
// tab, kept separate from the desk Trade Log.
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

// Format a ms epoch as an Eastern-Time date + time, e.g. "2026-07-23 09:31:05 ET".
// Times are rendered in ET (America/New_York) — the same clock the rest of the
// terminal uses for session windows and market hours — so an exported time reads
// the same for everyone regardless of the exporter's own timezone. DST is
// handled by Intl. A null/undefined ms (e.g. a still-open trade's close time)
// yields an empty cell.
function msToEtDateTime(ms: number | null | undefined): string {
  if (ms == null) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} ET`;
}

function slippageFavorable(t: TradeRecord): boolean | null {
  if (t.slippage == null) return null;
  if (t.slippage === 0) return true;
  return t.side === 'long' ? t.slippage < 0 : t.slippage > 0;
}

// ---- CSV export ----
// Escape a single cell for CSV (quote when it holds a comma, quote or newline).
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build one CSV file that carries the metrics summary and the full trade list,
// so a single download covers both. `generatedAt` is passed in (YYYY-MM-DD).
function buildExportCsv(opts: {
  trades: TradeRecord[];
  config: BreakEvenConfig;
  scopeLabel: string;
  rangeLabel: string;
  generatedAt: string;
  excluded?: ExcludedTrades;
}): string {
  const { trades, config, scopeLabel, rangeLabel, generatedAt, excluded } = opts;
  const s = summarizeTrades(trades, config);
  const pf = profitFactorStats(trades, config);
  const money = (n: number) => n.toFixed(2);
  const lines: string[] = [];
  const row = (...cells: (string | number | null | undefined)[]) => lines.push(cells.map(csvCell).join(','));

  row('Trade Metrics Export');
  row('Scope', scopeLabel);
  row('Date range', rangeLabel);
  row('Generated', generatedAt);
  row('Break-even buffer (default)', bandLabel(config.base));
  for (const [key, b] of Object.entries(config.overrides)) {
    row(`Break-even buffer (${key})`, bandLabel(b));
  }
  // Immediately under the date range, because that is the line these qualify: a
  // range starting Jun 1 with every June trade behind a cutoff otherwise reads
  // as "there were no June trades". Written whenever anything was left out, so
  // no row here means everything in the range is counted.
  if (excluded && excluded.beforeCutoff > 0) {
    row(
      'Excluded — before connection cutoff',
      excluded.cutoffFrom != null
        ? `${excluded.beforeCutoff} (opened before ${msToDateInput(excluded.cutoffFrom)})`
        : String(excluded.beforeCutoff),
    );
  }
  if (excluded && excluded.belowFloor > 0) {
    row('Excluded — under the test-trade floor', excluded.belowFloor);
  }
  row();
  row('Metric', 'Value');
  row('Total trades', s.total);
  row('Open', s.open);
  row('Closed', s.closed);
  row('Wins', s.wins);
  row('Losses', s.losses);
  row('Break-even', s.breakeven);
  row('Win rate', s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—');
  row('Gross profit', money(pf.grossProfit));
  row('Gross profit (pips)', pf.grossProfitMove.pips ?? '');
  row('Gross profit (points)', pf.grossProfitMove.points ?? '');
  row('Gross loss', money(-pf.grossLoss));
  row('Gross loss (pips)', pf.grossLossMove.pips == null ? '' : -pf.grossLossMove.pips);
  row('Gross loss (points)', pf.grossLossMove.points == null ? '' : -pf.grossLossMove.points);
  row('Profit factor', pf.grossProfit === 0 && pf.grossLoss === 0 ? '' : pf.grossLoss === 0 ? 'Infinite (no losses)' : (pf.grossProfit / pf.grossLoss).toFixed(2));
  row('Profit factor (scaled to one lot)', pf.scaledProfit === 0 && pf.scaledLoss === 0 ? '' : pf.scaledLoss === 0 ? 'Infinite (no losses)' : (pf.scaledProfit / pf.scaledLoss).toFixed(2));
  row('Realized P/L', s.totalRealizedPl == null ? '' : money(s.totalRealizedPl));
  row('Net pips', netMovement(trades).pips ?? '');
  row('Net points', netMovement(trades).points ?? '');
  row('Avg slippage', s.avgSlippage == null ? '' : String(s.avgSlippage));
  row();
  row('Trades');
  row('Code', 'Opened', 'Open Time', 'Close Time', 'Trader', 'Instrument', 'Side', 'Status', 'Planned Entry', 'Entry', 'Exit', 'Take Profit', 'Stop Loss', 'Size', 'Slippage', 'Realized P/L', 'Pips', 'Outcome', 'Strategy', 'Timeframe', 'Broker', 'Source', 'Notes');
  for (const t of trades) {
    const outcome =
      t.status === 'closed' && t.realizedPl != null
        ? classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config)
        : '';
    const pips = tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument);
    row(
      t.code, msToDateInput(t.openedAt), msToEtDateTime(t.openedAt), msToEtDateTime(t.closedAt), t.owner, t.instrument, t.side, t.status,
      t.plannedEntry, t.entryPrice, t.exitPrice, t.takeProfit, t.stopLoss, t.units,
      t.slippage, t.realizedPl, pips == null ? '' : Number(pips.toFixed(1)), outcome, t.strategy, t.timeframe, t.broker, t.source, t.notes,
    );
  }
  return lines.join('\r\n');
}

// One-line description of the desk's break-even buffer, e.g. "0.05% price move",
// "$5 realized", or "3 pips". Shared by the CSV export and any label that needs
// to name the active buffer.
function bandLabel(band: BreakEvenBand): string {
  if (band.mode === 'dollars') return `$${band.amount} realized`;
  if (band.mode === 'pips') return `${band.amount} pips`;
  return `${band.pct}% price move`;
}

// Trigger a browser download of a CSV string. A BOM keeps Excel on UTF-8.
function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


export function TradeLog() {
  const { user } = useAuth();
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const undo = useUndo<RemovedTrade>();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');

  const [data, setData] = useState<TradeLogData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);
  // Deck vs tape is a saved preference now (My Terminal ▸ Preferences), read once
  // on mount rather than toggled from the header.
  const [layout] = useState<Layout>(() => getTradeLayout());
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Per-trader filter: '' = the whole desk; otherwise an ownerId.
  const [trader, setTrader] = useState('');
  // Day-of-week and month filters, folded in from the removed History screen.
  // 'all' = no filter; a day is a full weekday name ("Monday"), a month an ET
  // month key ("2026-01"). They select on the CLOSE day, so an open position —
  // which has no close day — drops out while a filter is on.
  const [dayFilter, setDayFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  // The closed trade being corrected, from the pencil on a closed row.
  const [editingClosed, setEditingClosed] = useState<TradeRecord | null>(null);
  const [savingClosed, setSavingClosed] = useState(false);

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

  // Correcting a closed trade — the pencil History used to carry. It saves
  // through PATCH /api/trading/history/:id, which is the only route that will
  // touch a broker-imported row, then re-reads the log (that route answers with
  // the History shape, not this screen's).
  async function saveClosedEdit(patch: Partial<TradeInput>) {
    if (!editingClosed) return;
    setSavingClosed(true);
    try {
      await api.updateHistoryTrade(editingClosed.id, patch);
      setData(await api.tradeLog());
      setActionError(null);
      setEditingClosed(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Could not save that trade');
    } finally {
      setSavingClosed(false);
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
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>{"Loading the log…"}</div>;

  // Whether this trader may clear a teammate's row as well as their own. The
  // server decides (team leader, the team's "Delete trades" permission, or an
  // admin) and enforces it — this only shows or hides the control.
  const canRemoveAny = data.canDeleteAny;

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
  const config = configFrom(data);
  const traderTrades = trader ? data.trades.filter((t) => t.ownerId === trader) : data.trades;

  // Only closed rows can answer "which weekday" / "which month", so the pickers
  // are built from them and the filter selects among them.
  const closedTrades = traderTrades.filter(
    (t): t is TradeRecord & { closedAt: number } => t.status === 'closed' && t.closedAt != null,
  );
  const filterActive = dayFilter !== 'all' || monthFilter !== 'all';
  const dayOptions = WEEKDAYS.filter((d) => closedTrades.some((t) => etWeekday(t.closedAt) === d));
  const monthOptions = [
    ...new Map(closedTrades.map((t) => [etMonthKey(t.closedAt), etMonthLabel(t.closedAt)])).entries(),
  ].sort((x, y) => y[0].localeCompare(x[0]));
  const shownTrades = filterActive
    ? closedTrades.filter(
        (t) =>
          (dayFilter === 'all' || etWeekday(t.closedAt) === dayFilter) &&
          (monthFilter === 'all' || etMonthKey(t.closedAt) === monthFilter),
      )
    : traderTrades;

  // The open book — every position this scope is currently in, and NEVER
  // narrowed by the day/month filter. Those filters select on the CLOSE day, so
  // an open position has nothing for them to match and drops out of
  // `shownTrades` the moment one is on. That is right for the closed-trade
  // metrics and wrong for the open ones: with a month picked, "Unrealized P/L
  // $0 · 0 open" was a flat statement that the desk held nothing, made while
  // the wall beside it showed live positions. Same rule the Live Wall's
  // `source` union follows — a figure that was not measured must never be
  // reported as a measured one, and here it can be measured, so it is.
  const openBook = traderTrades.filter((t) => t.status === 'open');
  const openPl = openBook.reduce((sum, t) => sum + (t.unrealizedPl ?? 0), 0);

  // The server's summary only describes the whole desk unfiltered, so any
  // narrowing recomputes it here — the same rule History followed, so a filtered
  // selection scores exactly the way the unfiltered one does.
  const s = trader || filterActive ? summarizeTrades(shownTrades, config) : data.summary;
  const pf = profitFactorStats(shownTrades, config);
  // "If I closed everything right now" — realized closed trades with each open
  // position's live P/L folded in as though it were just realized. The open leg
  // comes from the open book rather than the selection, so the reading keeps
  // meaning what it says while a filter is on; unfiltered, `shownTrades`
  // already carries those rows and adding them again would double-count.
  const ppf = projectedProfitFactorStats(filterActive ? [...shownTrades, ...openBook] : shownTrades, config);
  // Movement is the desk's preferred unit beside every $ metric: pips for a
  // currency pair, points for everything else. Both are shown when the desk
  // holds each, and neither is shown when nothing could be measured — a pip sum
  // on its own silently described only the forex half of the money beside it.
  const showPips = hasAnyMovement(shownTrades);
  const netClosedMove = netMovement(shownTrades);
  const beActive = configActive(config);
  // By Strategy / By Instrument, folded in from History. Computed over the CLOSED
  // rows on screen — an open trade has no realized result to attribute.
  const shownClosed = shownTrades.filter((t) => t.status === 'closed');
  const byStrategy = groupTrades(shownClosed, (t) => t.strategy, canSeeBalances, config);
  const byInstrument = groupTrades(shownClosed, (t) => t.instrument, canSeeBalances, config);
  const selectedTraderName = traders.find((t) => t.id === trader)?.name ?? null;
  // Export scope follows the on-screen trader filter: whole desk, or one trader.
  const scopeLabel = selectedTraderName ? `@${selectedTraderName}` : 'Whole desk';
  const scopeSlug =
    (selectedTraderName ?? 'whole-desk').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'desk';
  // W · L · BE. Break-even trades are shown only when the desk has a band set or
  // any actually landed there, so the line stays clean when the feature is off.
  const wlSub = `${s.wins}W · ${s.losses}L${beActive || s.breakeven > 0 ? ` · ${s.breakeven}BE` : ''}`;

  // Pip figure shown in parentheses under a $ metric — omitted on a desk with no
  // forex trades. Realized P/L is signed (direction matters); the gross cards
  // carry the sign of the bucket they total.
  const kpis: { label: string; val: string; sub: string; pips?: string }[] = [
    {
      label: 'Trades',
      val: String(s.total),
      // A filtered selection is closed rows only, so "0 open" beside them is a
      // claim about the book rather than about the selection — and a false one
      // whenever a position is running. The count of what is open is on the
      // Unrealized card, which is measured over the whole book.
      sub: filterActive ? `${s.closed} closed in this selection` : `${s.open} open · ${s.closed} closed`,
    },
    { label: 'Win Rate', val: s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—', sub: wlSub },
    {
      label: 'Realized P/L',
      val: s.totalRealizedPl == null ? 'hidden' : showMoney ? usd(s.totalRealizedPl) : '•••••',
      sub: 'closed trades',
      pips: showPips ? fmtMovement(netClosedMove, true) || undefined : undefined,
    },
    {
      // The live open P/L across currently-open positions — the leg realized P/L
      // leaves out. Signed so a green open book reads as a gain at a glance.
      // Always the whole open book (see `openBook` above), so a day/month filter
      // narrows the closed record without ever reading as a flat desk.
      label: 'Unrealized P/L',
      val: !canSeeBalances ? 'hidden' : showMoney ? `${openPl > 0 ? '+' : ''}${usd(openPl)}` : '•••••',
      sub: filterActive ? `${openBook.length} open · whole book` : `${openBook.length} open`,
    },
    {
      label: 'Gross Profit',
      val: !canSeeBalances ? 'hidden' : showMoney ? usd(pf.grossProfit) : '•••••',
      sub: 'winning trades',
      pips: showPips ? fmtMovement(pf.grossProfitMove) || undefined : undefined,
    },
    {
      label: 'Gross Loss',
      val: !canSeeBalances ? 'hidden' : showMoney ? usd(-pf.grossLoss) : '•••••',
      sub: 'losing trades',
      pips: showPips ? fmtMovement(negMovement(pf.grossLossMove)) || undefined : undefined,
    },
    {
      // Raw profit factor with the size-scaled reading always shown beneath it.
      label: 'Profit Factor',
      val: profitFactorText(pf),
      sub: 'gross profit ÷ loss',
      pips: `scaled ${scaledProfitFactorText(pf)}`,
    },
    {
      // Projected profit factor: the realized PF with every open position folded
      // in at its current mark (as if closed now). Stays a real number as long as
      // the closed history has any loss, so it doesn't blow up to "∞" the way an
      // open-book-only ratio does when no open position is red.
      label: 'Projected PF',
      val: profitFactorText(ppf),
      sub: 'if closed now',
      pips: `scaled ${scaledProfitFactorText(ppf)}`,
    },
    { label: 'Avg Slippage', val: s.avgSlippage == null ? '—' : fmtPrice(s.avgSlippage), sub: 'entry vs. plan' },
  ];

  // The realized P/L the Deposited card divides by, over the SAME selection the
  // card's deposit covers — one trader when the filter names one, the whole desk
  // otherwise. The two used to disagree: the deposit was always the viewer's own
  // while this filtered to their rows, so reading a teammate's stats showed the
  // viewer's deposit against no P/L at all. The day/month filters apply to both.
  const scopeClosedPl = shownTrades
    .filter((t) => t.status === 'closed' && t.realizedPl != null)
    .reduce((sum, t) => sum + (t.realizedPl as number), 0);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          {/* The heading for the whole review screen, which now carries the
              broker capital below it as well (owner instruction, 2026-08 — it
              read "Trade Log" when this was one of two tabs). It matches the
              sidebar row exactly: one screen, one name. */}
          <ScreenTitle>Closed Trades &amp; Metrics</ScreenTitle>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {traders.length > 1 && (
            <TraderMenu traders={traders} value={trader} onChange={setTrader} userId={user?.id} />
          )}
          {canSeeBalances && (
            <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>
              {hideMoney ? 'Show $' : 'Hide $'}
            </button>
          )}
          <button onClick={() => setExporting((v) => !v)} style={exporting ? { ...ghostBtn, borderColor: GOLD, color: GOLD } : ghostBtn}>
            {exporting ? "Close" : "Export"}
          </button>
          {!readOnly && (
            <button onClick={() => setAdding((v) => !v)} style={goldBtn}>
              {adding ? "Close" : "+ Log a trade"}
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div style={{ ...infoBanner, marginBottom: 14 }}>{"View-only access — you can browse the log but not edit it."}</div>
      )}
      {actionError && (
        <div onClick={() => setActionError(null)} style={warnBanner}>{actionError} — refreshed. Click to dismiss.</div>
      )}

      {exporting && (
        <ExportPanel
          trades={shownTrades}
          config={config}
          scopeLabel={scopeLabel}
          scopeSlug={scopeSlug}
          excluded={data?.excluded}
          onClose={() => setExporting(false)}
        />
      )}

      {/* Day / month filters, folded in from the removed History screen. Only
          drawn once there is a closed trade to narrow. */}
      {closedTrades.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <label style={filterField}>
            <span style={filterLabel}>{"Day of week"}</span>
            <select
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              style={filterSelect}
              aria-label="Filter by day of week"
              disabled={dayOptions.length === 0}
            >
              <option value="all">All days</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label style={filterField}>
            <span style={filterLabel}>{"Month"}</span>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              style={filterSelect}
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
            {filterActive ? `${shownTrades.length} of ${traderTrades.length}` : `${traderTrades.length}`} trade
            {traderTrades.length === 1 ? '' : 's'}
          </span>
          {filterActive && (
            <button onClick={() => { setDayFilter('all'); setMonthFilter('all'); }} style={ghostBtn}>{"Clear"}</button>
          )}
        </div>
      )}

      {/* Summary */}
      <div style={{ fontSize: 11, color: FAINT, marginBottom: 8, letterSpacing: '0.3px' }}>
        {traders.length > 1 && (selectedTraderName ? `Individual stats — @${selectedTraderName}` : 'Whole desk — combined stats')}
        {filterActive ? `${traders.length > 1 ? ' · ' : ''}Closed trades only, for the selected day/month` : ''}
      </div>
      {/* What these figures leave out. Replaces a note that said the test-trade
          floor was on without saying whether it had actually caught anything,
          and said nothing at all about a connection cutoff — which is the one
          that hides whole months. Drawn only when something really was
          excluded, so no line here means everything on the desk is counted. */}
      {excludedNote(data.excluded) && (
        <div
          style={{ fontSize: 10.5, color: FAINT, marginBottom: 8 }}
          title={
            data.minTradeUnits > 0
              ? `Broker fills under ${data.minTradeUnits.toLocaleString('en-US')} units are excluded, as are trades opened before a connection's "count trades since" date.`
              : `Trades opened before a connection's "count trades since" date are excluded.`
          }
        >
          {excludedNote(data.excluded)}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
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
        <CapitalCards scope={trader} realizedPl={scopeClosedPl} showMoney={showMoney} readOnly={readOnly} />
      </div>

      {/* Per-strategy / per-instrument breakdown, folded in from History. Only
          drawn once something has closed — before that both panels say "no data"
          twice over. */}
      {shownClosed.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 13, marginBottom: 16 }}>
          <Breakdown title="By Strategy" groups={byStrategy} money={(n) => (n == null ? '—' : showMoney ? usd(n) : '•••')} showPips={showPips} />
          <Breakdown title="By Instrument" groups={byInstrument} money={(n) => (n == null ? '—' : showMoney ? usd(n) : '•••')} showPips={showPips} />
        </div>
      )}

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
            : `No trades logged yet.${!readOnly ? ' Use “+ Log a trade” to add the first one.' : ''}`}
        </div>
      ) : layout === 'deck' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill,minmax(290px,1fr))', gap: 13 }}>
          {shownTrades.map((t) => (
            <DeckCard
              key={t.id}
              t={t}
              config={config}
              showMoney={showMoney}
              canSeeBalances={canSeeBalances}
              readOnly={readOnly}
              canRemove={t.isMine || canRemoveAny}
              busy={busy}
              onRemove={() => removeWithUndo(t.id)}
              onSave={(patch) => run(api.updateTrade(t.id, patch))}
              onEditClosed={() => setEditingClosed(t)}
            />
          ))}
        </div>
      ) : (
        <Tape
          trades={shownTrades}
          config={config}
          showMoney={showMoney}
          canSeeBalances={canSeeBalances}
          readOnly={readOnly}
          canRemoveAny={canRemoveAny}
          busy={busy}
          isPhone={isPhone}
          onRemove={removeWithUndo}
          onEditClosed={setEditingClosed}
        />
      )}

      {/* Correcting a closed trade — the one thing History could do that this
          screen could not, since a broker-imported row is not `editable`. */}
      {editingClosed && (
        <ClosedTradeEditModal
          key={editingClosed.id}
          t={editingClosed}
          busy={savingClosed}
          onSave={saveClosedEdit}
          onClose={() => setEditingClosed(null)}
        />
      )}

      {undo.pending && <UndoBar message="Trade removed." onUndo={restoreRemoved} onDismiss={undo.clear} />}
    </div>
  );
}

// ---- Deck card (with inline edit) ----
function DeckCard({
  t,
  config,
  showMoney,
  canSeeBalances,
  readOnly,
  canRemove,
  busy,
  onRemove,
  onSave,
  onEditClosed,
}: {
  t: TradeRecord;
  config: BreakEvenConfig;
  showMoney: boolean;
  canSeeBalances: boolean;
  readOnly: boolean;
  canRemove: boolean;
  busy: boolean;
  onRemove: () => void;
  onSave: (patch: TradeInput) => void;
  // A closed row you own opens the closed-trade editor instead of the inline
  // form: a broker-imported trade is not `editable`, so the inline form cannot
  // touch it, and correcting one is what History existed for.
  onEditClosed: () => void;
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
  // Break-even trades are counted (and coloured) as flat, not slight losses.
  const isBreakeven =
    t.status === 'closed' && t.realizedPl != null &&
    classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config) === 'breakeven';
  // Open trades show their live (unrealized) P/L; closed trades their realized P/L.
  const isOpen = t.status === 'open';
  const plVal = isOpen ? t.unrealizedPl : t.realizedPl;
  const plLabel = isOpen ? 'Unrealized P/L' : 'Realized P/L';
  const plUp = (plVal ?? 0) >= 0;
  const plColor = isBreakeven ? GOLD : plUp ? GREEN : RED;
  // The trade's move in pips, shown beside its realized P/L (closed forex only).
  const plPips = t.status === 'closed' ? pipsParenthetical(t.side, t.entryPrice, t.exitPrice, t.instrument, true) : '';
  // What one pip was worth at this size. Null on anything not quoted in the
  // desk's own money, where the log has no rate to convert with.
  const perPip = perPipForSize(t.instrument, t.units);

  return (
    <div
      style={{
        ...card,
        padding: 0,
        overflow: 'hidden',
        borderTop: `2px solid ${sideColor}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t.instrument}</span>
          <span style={{ ...sideBadge, color: sideColor, border: `1px solid ${sideColor}` }}>{long ? 'LONG' : 'SHORT'}</span>
          {t.status === 'open' && <span style={{ ...sideBadge, color: GOLD, border: `1px solid ${GOLD}` }}>OPEN</span>}
          {isBreakeven && <span style={{ ...sideBadge, color: GOLD, border: `1px solid ${GOLD}` }} title="Break-even — inside the desk's break-even band">B/E</span>}
          {t.source === 'broker' && t.broker && (
            <span style={{ ...sideBadge, color: '#7fa8ff', border: '1px solid #3a5a9a' }} title="Imported automatically from your broker">{t.broker.toUpperCase()}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {t.code && <span style={codeChip} title="Trade code — date + order that day">{t.code}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap' }}>
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
        {/* UNITS here, not lots (owner instruction, 2026-08) — the log is read
            against the order that was placed, and the ticket sizes in units. The
            lot count is on the hover, and what one pip was worth at that size
            sits beside it, which is the figure that makes a size mean something
            without doing the arithmetic. The Live Wall keeps reading in lots;
            that is the surface the owner reads that way. */}
        <Field label="Size" value={fmtUnitSize(t.units)} title={lotsTitle(t.instrument, t.units)} />
        {perPip != null && (
          <Field label="Per pip" value={showMoney ? usd(perPip) : '•••'} />
        )}
      </div>

      {(t.strategy || t.timeframe) && (
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 9px', flexWrap: 'wrap' }}>
          {t.timeframe && <span style={metaChip}>{t.timeframe}</span>}
          {t.strategy && <span style={{ ...metaChip, color: GOLD, borderColor: 'rgba(235,203,116,.4)' }}>{t.strategy}</span>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{plLabel}</span>
          {!canSeeBalances ? (
            <span style={{ fontSize: 11, color: FAINT }}>hidden</span>
          ) : plVal == null ? (
            <span style={{ fontSize: 13, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>—</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: plColor }}>
                {showMoney ? `${isBreakeven ? '' : plUp ? '+' : ''}${usd(plVal)}` : '•••••'}
              </span>
              {plPips && <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", color: MUTED }}>{plPips}</span>}
            </span>
          )}
        </div>
        {/* When the trade opened and, once it's done, when it closed — with how
            long it has been open (or was held) reading on their right. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <TradeTimes openedAt={t.openedAt} closedAt={t.closedAt} />
          <span style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
            {ageLabel(t.openedAt, isOpen ? null : t.closedAt)}
          </span>
          {!readOnly && ((t.isMine && (t.editable || t.status === 'closed')) || canRemove) && (
            <div style={{ display: 'flex', gap: 6 }}>
              {t.isMine && (t.editable || t.status === 'closed') && (
                <button
                  onClick={() => !busy && (t.status === 'closed' ? onEditClosed() : setEditing(true))}
                  title="Edit trade"
                  aria-label="Edit trade"
                  style={iconBtn}
                >
                  ✏️
                </button>
              )}
              {canRemove && (
                <button onClick={() => !busy && onRemove()} title="Delete trade" aria-label="Delete trade" style={{ ...iconBtn, color: '#52668f', fontSize: 16 }}>×</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Tape (dense rows) ----
function Tape({
  trades,
  config,
  showMoney,
  canSeeBalances,
  readOnly,
  canRemoveAny,
  busy,
  isPhone,
  onRemove,
  onEditClosed,
}: {
  trades: TradeRecord[];
  config: BreakEvenConfig;
  showMoney: boolean;
  canSeeBalances: boolean;
  readOnly: boolean;
  canRemoveAny: boolean;
  busy: boolean;
  isPhone: boolean;
  onRemove: (id: string) => void;
  onEditClosed: (t: TradeRecord) => void;
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
          <span style={{ flex: '1 1 80px' }}>Strategy</span>
          <span style={{ ...plCol, textAlign: 'right' }}>P/L</span>
          <span style={{ ...timeCol, textAlign: 'right' }}>Opened / Closed</span>
          {!readOnly && <span style={{ width: 48 }} />}
        </div>
      )}
      {trades.map((t) => {
        const long = t.side === 'long';
        const fav = slippageFavorable(t);
        const slipColor = fav == null ? MUTED : fav ? GREEN : AMBER;
        const isBreakeven =
          t.status === 'closed' && t.realizedPl != null &&
          classifyOutcome(t.side, t.entryPrice, t.exitPrice, t.realizedPl, t.instrument, config) === 'breakeven';
        // Open rows show live unrealized P/L; closed rows their realized P/L.
        const plVal = t.status === 'open' ? t.unrealizedPl : t.realizedPl;
        const plUp = (plVal ?? 0) >= 0;
        const plColor = !canSeeBalances ? FAINT : plVal == null ? MUTED : isBreakeven ? GOLD : plUp ? GREEN : RED;
        const rowMove =
          t.status === 'closed'
            ? fmtMovement(
                {
                  pips: tradePips(t.side, t.entryPrice, t.exitPrice, t.instrument),
                  points: tradePoints(t.side, t.entryPrice, t.exitPrice, t.instrument),
                },
                true,
              )
            : '';
        return (
          <div key={t.id} style={{ ...tapeRow, borderBottom: `1px solid ${BORDER}`, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
            <span style={{ flex: '1 1 90px', fontWeight: 600, color: TEXT, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {t.instrument}
              {t.code && <span style={{ fontSize: 8.5, color: FAINT, border: `1px solid ${BORDER2}`, borderRadius: 3, padding: '1px 4px' }} title="Trade code">{t.code}</span>}
              {t.status === 'open' && <span style={{ fontSize: 8.5, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 3, padding: '1px 4px' }}>OPEN</span>}
              {isBreakeven && <span style={{ fontSize: 8.5, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 3, padding: '1px 4px' }} title="Break-even">B/E</span>}
              {t.source === 'broker' && t.broker && <span style={{ fontSize: 8.5, color: '#7fa8ff', border: '1px solid #3a5a9a', borderRadius: 3, padding: '1px 4px' }} title="Imported automatically from your broker">{t.broker.toUpperCase()}</span>}
            </span>
            <span style={{ flex: '0 0 90px', display: 'flex', alignItems: 'center', gap: 4, color: t.isMine ? GOLD : MUTED, overflow: 'hidden' }} title={t.isMine ? `${t.owner} (you)` : t.owner}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{t.owner}</span>
            </span>
            <span style={{ ...col, color: long ? GREEN : RED, fontWeight: 700 }}>{long ? 'L' : 'S'}</span>
            <span style={col}>{fmtPrice(t.entryPrice)}</span>
            <span style={col}>{fmtPrice(t.exitPrice)}</span>
            <span style={{ ...col, color: slipColor }}>{t.slippage == null ? '—' : `${t.slippage > 0 ? '+' : ''}${fmtPrice(t.slippage)}`}</span>
            {/* Units, like the card above — the raw number printed a standard
                lot as "100000". The column is too narrow for the per-pip figure,
                so it rides the hover with the lot count. */}
            <span style={col} title={sizeHover(t.instrument, t.units, showMoney)}>{fmtUnitCount(t.units)}</span>
            <span style={{ flex: '1 1 80px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.strategy ?? '—'}</span>
            <span style={{ ...plCol, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontWeight: 700, color: plColor }}>
                {!canSeeBalances ? '·' : plVal == null ? '—' : showMoney ? `${isBreakeven ? '' : plUp ? '+' : ''}${usd(plVal)}` : '•••'}
              </span>
              {rowMove !== '' && <span style={{ fontSize: 9.5, color: MUTED }}>{rowMove}</span>}
            </span>
            <span style={{ ...timeCol, display: 'flex', justifyContent: 'flex-end' }}>
              <TradeTimesCell
                openedAt={t.openedAt}
                closedAt={t.status === 'open' ? null : t.closedAt}
                showHeld={t.status === 'closed'}
              />
            </span>
            {!readOnly && (
              <span style={{ display: 'flex', width: 48, justifyContent: 'flex-end', gap: 2 }}>
                {t.status === 'closed' && t.isMine ? (
                  <button onClick={() => !busy && onEditClosed(t)} title="Edit this trade" aria-label="Edit trade" style={{ width: 24, background: 'none', border: 'none', color: '#52668f', fontSize: 12, cursor: 'pointer' }}>✏️</button>
                ) : (
                  <span style={{ width: 24 }} />
                )}
                {t.isMine || canRemoveAny ? (
                  <button onClick={() => !busy && onRemove(t.id)} title="Remove" style={{ width: 24, background: 'none', border: 'none', color: '#52668f', fontSize: 15, cursor: 'pointer' }}>×</button>
                ) : (
                  <span style={{ width: 24 }} />
                )}
              </span>
            )}
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
      <div style={panelLabel}>{initial ? "Edit trade" : "Log a trade"}</div>
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
        <NumInput v={units} set={setUnits} ph="Size / units" />
        <NumInput v={pl} set={setPl} ph="Realized P/L $" />
        <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="Timeframe (M15)" style={{ ...inputBase, flex: '0 0 120px' }} />
        <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy" style={{ ...inputBase, flex: '1 1 150px' }} />
        <input value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} type="date" style={{ ...inputBase, flex: '0 0 150px' }} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...inputBase, flex: '1 1 100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={submit} disabled={disabled} style={{ ...goldBtn, opacity: disabled ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>{"Cancel"}</button>
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

// The hover on a size in the tape: the lot count it works out to, and what a pip
// was worth at it. The money half is dropped while balances are hidden — a
// tooltip is not an exception to Hide $.
function sizeHover(instrument: string, units: number, showMoney: boolean): string | undefined {
  const perPip = showMoney ? perPipForSize(instrument, units) : null;
  const parts = [lotsTitle(instrument, units), perPip == null ? null : `${usd(perPip)} / pip`];
  return parts.filter(Boolean).join(' · ') || undefined;
}

function Field({ label, value, strong, color, title }: { label: string; value: string; strong?: boolean; color?: string; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 8.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: color ?? TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
    </span>
  );
}

// ---- Clean trader picker (replaces the native <select>) ----
function TraderMenu({
  traders,
  value,
  onChange,
  userId,
}: {
  traders: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  // Which edge of the button the popup hangs from. Left by default — see below.
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const ref = useRef<HTMLDivElement>(null);

  // The main column scrolls (`overflow-y: auto`, which makes the horizontal axis
  // clip too), so anything drawn outside it is cut off rather than floating over
  // the shell — on the left that means the popup disappears behind the sidebar.
  // So hang the list off the button's left edge and open rightward into the
  // content, and only flip when it's the right edge that would clip instead.
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const btn = ref.current.getBoundingClientRect();
    const root = ref.current.closest('[data-vts-scroll-root]')?.getBoundingClientRect();
    const limit = (root?.right ?? window.innerWidth) - 8;
    setAlign(btn.left + MENU_POPUP_W <= limit ? 'left' : 'right');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // '' is the desk-wide option; the rest are individual traders.
  const options = [{ id: '', name: 'Whole desk' }, ...traders];
  const optionLabel = (o: { id: string; name: string }) =>
    o.id === '' ? 'Whole desk' : `@${o.name}${o.id === userId ? ' (you)' : ''}`;
  const current = options.find((o) => o.id === value) ?? options[0];

  return (
    <div ref={ref} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Show stats for one trader"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ ...menuButton, ...(open ? { borderColor: GOLD } : {}) }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{optionLabel(current)}</span>
        <span style={{ color: FAINT, fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </button>
      {open && (
        <div
          style={align === 'left' ? { ...menuPopup, left: 0, right: 'auto' } : menuPopup}
          role="listbox"
        >
          {options.map((o) => {
            const selected = o.id === value;
            const hot = hovered === o.id;
            return (
              <button
                key={o.id || 'desk'}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHovered(o.id)}
                onMouseLeave={() => setHovered((h) => (h === o.id ? null : h))}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={{ ...menuItem, ...(selected ? menuItemActive : hot ? menuItemHot : {}) }}
              >
                <span style={{ flex: '0 0 16px', color: GOLD, fontSize: 12 }}>{selected ? '✓' : ''}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{optionLabel(o)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Export panel — date-range picker + one-file CSV download ----
function ExportPanel({
  trades,
  config,
  scopeLabel,
  scopeSlug,
  excluded,
  onClose,
}: {
  trades: TradeRecord[];
  config: BreakEvenConfig;
  scopeLabel: string;
  scopeSlug: string;
  // What the desk already filtered out before these trades reached the screen.
  // Narrowing the range below cannot re-include any of it, so it qualifies every
  // export whatever dates are picked.
  excluded?: ExcludedTrades;
  onClose: () => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fromMs = dateToMs(from);
  const toMs = dateToMs(to);
  // The "to" bound is inclusive of that whole day.
  const toEnd = toMs == null ? undefined : toMs + 24 * 60 * 60 * 1000 - 1;
  const filtered = trades.filter((t) => {
    if (fromMs != null && t.openedAt < fromMs) return false;
    if (toEnd != null && t.openedAt > toEnd) return false;
    return true;
  });
  const rangeLabel = from || to ? `${from || 'earliest'} to ${to || 'latest'}` : 'All dates';

  function doExport() {
    if (filtered.length === 0) return;
    const generatedAt = msToDateInput(Date.now());
    const csv = buildExportCsv({ trades: filtered, config, scopeLabel, rangeLabel, generatedAt, excluded });
    const range = `${from ? `_${from}` : ''}${to ? `_${to}` : ''}`;
    downloadCsv(`trade-metrics_${scopeSlug}${range || '_all'}.csv`, csv);
    onClose();
  }

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={panelLabel}>Export trades &amp; metrics — {scopeLabel}</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={exportField}>
          <span style={exportFieldLabel}>From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ ...inputBase, flex: '0 0 150px' }} />
        </label>
        <label style={exportField}>
          <span style={exportFieldLabel}>To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ ...inputBase, flex: '0 0 150px' }} />
        </label>
        <div style={{ fontSize: 11.5, color: MUTED, flex: '1 1 180px', lineHeight: 1.5 }}>
          {filtered.length} trade{filtered.length === 1 ? '' : 's'} in range · leave the dates blank for all.
          <br />
          One CSV with the metrics summary (incl. profit factor) and the full trade list.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={doExport} disabled={filtered.length === 0} style={{ ...goldBtn, opacity: filtered.length === 0 ? 0.6 : 1, cursor: filtered.length === 0 ? 'default' : 'pointer' }}>
          {"Download CSV"}
        </button>
        <button onClick={onClose} style={ghostBtn}>{"Cancel"}</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 };
const inputBase: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const iconBtn: CSSProperties = { background: 'none', border: `1px solid ${BORDER2}`, color: MUTED, fontSize: 13, lineHeight: 1, padding: '4px 7px', borderRadius: 6, cursor: 'pointer' };
const codeChip: CSSProperties = { fontSize: 9.5, fontWeight: 700, color: '#bcd0ff', background: 'rgba(120,150,220,.12)', border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 6px', fontFamily: "'IBM Plex Mono', monospace" };
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
// The P/L column is a touch wider than the rest — it stacks the money figure
// over the trade's pip move.
const plCol: CSSProperties = { flex: '0 0 78px' };
// Wider again: this one carries the full open stamp with the close stamp under
// it ("Jul 29, 9:31 AM" / "→ Jul 29, 2:49 PM"), not just a date.
const timeCol: CSSProperties = { flex: '0 0 118px' };
const infoBanner: CSSProperties = { fontSize: 12.5, color: '#f3e3b8', background: 'rgba(235,203,116,.08)', border: '1px solid rgba(235,203,116,.35)', borderRadius: 8, padding: '9px 12px' };
const menuButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 150, maxWidth: 240, background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 8, color: TEXT, fontSize: 12.5, fontWeight: 600, padding: '8px 12px', cursor: 'pointer' };
// Widest the trader popup can get — kept next to the style it sets so the
// which-edge-do-we-hang-from measurement in TraderMenu stays honest.
const MENU_POPUP_W = 300;
const menuPopup: CSSProperties = { position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 220, maxWidth: `min(${MENU_POPUP_W}px, calc(var(--app-w) - 24px))`, background: '#0c1f43', border: `1px solid ${BORDER2}`, borderRadius: 12, padding: 6, zIndex: 40, boxShadow: '0 16px 44px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflowY: 'auto' };
const menuItem: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', color: TEXT, fontSize: 13, fontWeight: 500, padding: '9px 10px', borderRadius: 8, cursor: 'pointer' };
const menuItemActive: CSSProperties = { background: 'rgba(235,203,116,.14)', color: GOLD };
const menuItemHot: CSSProperties = { background: 'rgba(255,255,255,.06)' };
const exportField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
const exportFieldLabel: CSSProperties = { fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED };
const warnBanner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };


// Modal editor for a closed trade — the pencil on a closed row opens this. It
// edits the trade's own facts (levels, size, P/L, tags, dates) and saves through
// PATCH /api/trading/history/:id, which is the one route that will touch a
// broker-imported row. Ported verbatim from History when that screen was
// removed; without it there is no way to put a strategy on a broker trade, and
// the By Strategy breakdown would only ever have one bucket.
function ClosedTradeEditModal({ t, busy, onSave, onClose }: { t: TradeRecord; busy: boolean; onSave: (patch: Partial<TradeInput>) => void; onClose: () => void }) {
  const [instrument, setInstrument] = useState(t.instrument);
  const [side, setSide] = useState<TradeSide>(t.side);
  const [units, setUnits] = useState(t.units?.toString() ?? '');
  const [entry, setEntry] = useState(t.entryPrice?.toString() ?? '');
  const [exit, setExit] = useState(t.exitPrice?.toString() ?? '');
  const [pl, setPl] = useState(t.realizedPl?.toString() ?? '');
  const [strategy, setStrategy] = useState(t.strategy ?? '');
  const [timeframe, setTimeframe] = useState(t.timeframe ?? '');
  const [closedAt, setClosedAt] = useState(msToDateInput(t.closedAt ?? t.openedAt));

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
          <strong style={{ fontSize: 15, color: '#fff' }}>{"Edit trade"}{t.code ? ` · ${t.code}` : ''}</strong>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="Instrument" style={{ ...inputBase, flex: '1 1 150px' }} />
            <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)} style={{ ...inputBase, flex: '0 0 110px' }}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <input value={entry} onChange={(e) => setEntry(e.target.value)} type="number" step="any" placeholder="Entry price *" style={{ ...inputBase, flex: '0 0 130px' }} />
            <input value={exit} onChange={(e) => setExit(e.target.value)} type="number" step="any" placeholder="Exit price" style={{ ...inputBase, flex: '0 0 130px' }} />
            <input value={units} onChange={(e) => setUnits(e.target.value)} type="number" step="any" placeholder="Size / units" style={{ ...inputBase, flex: '0 0 130px' }} />
            <input value={pl} onChange={(e) => setPl(e.target.value)} type="number" step="any" placeholder="Realized P/L $" style={{ ...inputBase, flex: '0 0 130px' }} />
            <input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} placeholder="Timeframe (M15)" style={{ ...inputBase, flex: '0 0 120px' }} />
            <input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Strategy" style={{ ...inputBase, flex: '1 1 150px' }} />
            <input value={closedAt} onChange={(e) => setClosedAt(e.target.value)} type="date" style={{ ...inputBase, flex: '0 0 150px' }} />
          </div>
          <div style={{ fontSize: 11, color: FAINT, marginTop: 10 }}>
            {"Win / loss / break-even is decided by the entry → exit price move, so correcting the exit updates how this trade is scored."}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={submit} disabled={disabled} style={{ ...goldBtn, opacity: disabled ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={onClose} style={ghostBtn}>{"Cancel"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

const modalCard: CSSProperties = {
  position: 'fixed',
  top: 'calc(7 * var(--vh))',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(620px, calc(94 * var(--vw)))',
  maxHeight: 'calc(86 * var(--vh))',
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
