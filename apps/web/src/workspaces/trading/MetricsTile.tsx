import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../../api/client';
import { usePrivacy } from '../../privacy/privacy';
import type { BoardTile, TradeLogData } from '../../api/types';
import { configActive, configFrom } from './outcome';
import { fmtPips, hasAnyPips, netPips } from './pips';
import { profitFactorStats, profitFactorText, projectedProfitFactorStats, scaledProfitFactorText, summarizeTrades } from './tradeStats';
import { useTileData } from './tiles/TileFrame';
import { capitalSub } from './CapitalCards';
import { BORDER, BORDER2, FAINT, GREEN, MONO, MUTED, PANEL, RED } from './tvChart';
import { ScrollLockButton } from './scrollLock';
import { Icon } from '../../components/Icon';

const REFRESH_MS = 20_000;
const CAPITAL_MS = 60_000;
const GOLD = '#EBCB74';
const AMBER = '#e0a23a';

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const signedUsd = (n: number) => `${n > 0 ? '+' : ''}${usd(n)}`;

// Slippage is a price, not money — same formatting rule the Trade Log uses.
function fmtPrice(n: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}

// A compact desk-metrics tile for the Live Wall — the SAME KPI row the Trade Log
// carries, in one board cell: trades, win rate, realized / unrealized / net P/L,
// gross profit and loss, profit factor and projected PF, average slippage, and
// the trader's own capital. Every figure is computed by the shared functions the
// Trade Log calls, so the two screens can never disagree about a number.
//
// Team-scoped like the Trade Log, and the capital cells follow this tile's own
// trader picker with everything else (see below). Polls on its own interval and
// keeps the last snapshot on a failed refresh.
export function MetricsTile({
  tile,
  editing,
  onChange,
  onRemove,
}: {
  tile: BoardTile;
  editing: boolean;
  onChange: (patch: Partial<BoardTile>) => void;
  onRemove: () => void;
}) {
  const { privacy } = usePrivacy();
  const [data, setData] = useState<TradeLogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // WHOSE figures this tile reports — '' = the whole desk, otherwise one
  // trader's ownerId.
  //
  // It lives ON THE TILE rather than in local state, so a board can carry
  // several Desk Metrics tiles each pinned to a different trader and each one
  // stays where it was left. Changed from the header, which is usable while
  // reading as well as while editing, so a change here marks the board dirty
  // the way any other tile setting does — the arrangement is kept per board on
  // the device either way, and Save is what makes it permanent.
  const trader = tile.trader ?? '';
  const setTrader = useCallback((v: string) => onChange({ trader: v || undefined }), [onChange]);
  const firstLoad = useRef(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const d = await api.tradeLog();
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (firstLoad.current) setError(e instanceof ApiError ? e.message : 'Could not load metrics');
    } finally {
      firstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  // Distinct traders for the picker, plus the chosen scope's trades + summary —
  // whole desk (server summary) or one trader (recomputed the same way).
  const config = data ? configFrom(data) : null;
  const traders = data
    ? [...new Map(data.trades.map((t) => [t.ownerId, t.ownerName || t.owner])).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  // A pinned trader who is no longer on the desk falls back to the whole desk
  // rather than filtering to nothing: the picker would still read "Whole desk"
  // (its label falls back too) above a tile of zeros, which is a figure nobody
  // could tell from a flat month.
  const activeTrader = trader && traders.some((t) => t.id === trader) ? trader : '';
  const shownTrades = data ? (activeTrader ? data.trades.filter((t) => t.ownerId === activeTrader) : data.trades) : [];
  const s = data && config ? (activeTrader ? summarizeTrades(shownTrades, config) : data.summary) : undefined;
  // Read the permission off the SERVER's whole-desk summary, never the
  // recomputed one: `summarizeTrades` always returns a number, so asking the
  // per-trader summary whether balances are visible always answers yes.
  const canSeeBalances = data ? data.summary.totalRealizedPl !== null : false;
  const showMoney = canSeeBalances && !privacy;
  const pf = config ? profitFactorStats(shownTrades, config) : null;
  // Projected PF: realized closed trades + each open position at its current mark.
  const ppf = config ? projectedProfitFactorStats(shownTrades, config) : null;
  const realized = s?.totalRealizedPl ?? 0;
  const unreal = s?.totalUnrealizedPl ?? 0;
  const net = realized + unreal;
  // Pips sit under every money figure, but only on a desk that trades forex —
  // there is no pip to show otherwise.
  const showPips = hasAnyPips(shownTrades);
  const beActive = config ? configActive(config) : false;

  const money = (n: number) => (!showMoney ? '•••' : signedUsd(n));
  const plColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : MUTED);

  return (
    <div style={tileWrap}>
      <div className="tile-header" style={{ ...header, cursor: editing ? 'move' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {editing && <span style={{ color: FAINT, fontSize: 13, lineHeight: 1 }}>⠿</span>}
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{tile.title || 'Desk Metrics'}</span>
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ScrollLockButton />
          {traders.length > 1 && (
            <TraderPicker value={activeTrader} options={traders} onChange={setTrader} />
          )}
          {editing && <button onClick={onRemove} style={iconBtn} title="Remove tile">✕</button>}
        </div>
      </div>
      <div style={body}>
        {!data && !error && <div style={hint}>{"Loading metrics…"}</div>}
        {error && !data && <div style={{ ...hint, color: '#ffb4ab' }}>{error}</div>}
        {data && s && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(112px,1fr))', gap: 1, background: BORDER }}>
            {/* Same figures, same order, same wording as the Trade Log's KPI
                row — a board tile that reorders or renames them reads as a
                different set of numbers than the screen it summarises. */}
            <Stat label="Trades" value={String(s.total)} sub={`${s.open} open · ${s.closed} closed`} />
            <Stat
              label="Win Rate"
              value={s.wins + s.losses > 0 ? `${Math.round(s.winRate * 100)}%` : '—'}
              sub={`${s.wins}W · ${s.losses}L${beActive || s.breakeven > 0 ? ` · ${s.breakeven}BE` : ''}`}
            />
            <Stat
              label="Realized P/L"
              value={!canSeeBalances ? 'hidden' : money(realized)}
              color={plColor(realized)}
              pips={showPips ? `(${fmtPips(netPips(shownTrades), true)})` : undefined}
              sub="closed trades"
            />
            <Stat
              label="Unrealized P/L"
              value={!canSeeBalances ? 'hidden' : money(unreal)}
              color={plColor(unreal)}
              sub={`${s.open} open`}
            />
            <Stat label="Net P/L" value={!canSeeBalances ? 'hidden' : money(net)} color={plColor(net)} sub="realized + open" />
            <Stat
              label="Gross Profit"
              value={!canSeeBalances ? 'hidden' : showMoney ? usd(pf?.grossProfit ?? 0) : '•••'}
              pips={showPips && pf ? `(${fmtPips(pf.grossProfitPips)})` : undefined}
              sub="winning trades"
            />
            <Stat
              label="Gross Loss"
              value={!canSeeBalances ? 'hidden' : showMoney ? usd(-(pf?.grossLoss ?? 0)) : '•••'}
              pips={showPips && pf ? `(${fmtPips(-pf.grossLossPips)})` : undefined}
              sub="losing trades"
            />
            <Stat
              label="Profit Factor"
              value={pf ? profitFactorText(pf) : '—'}
              pips={pf ? `scaled ${scaledProfitFactorText(pf)}` : undefined}
              sub="gross profit ÷ loss"
            />
            <Stat
              label="Projected PF"
              value={ppf ? profitFactorText(ppf) : '—'}
              pips={ppf ? `scaled ${scaledProfitFactorText(ppf)}` : undefined}
              sub="if closed now"
            />
            <Stat label="Avg Slippage" value={s.avgSlippage == null ? '—' : fmtPrice(s.avgSlippage)} sub="entry vs. plan" />
            <CapitalStats trades={shownTrades} trader={activeTrader} showMoney={showMoney} />
          </div>
        )}
      </div>
    </div>
  );
}

// The trader's own money — Deposited, Withdrawn and Total Capital — as three
// more cells on the same grid.
//
// THEY FOLLOW THE TILE'S TRADER PICKER, like the screen's cards follow its
// filter and like every other figure in this tile: pinning the tile to one
// trader shows that trader's deposit against that trader's results, and the
// whole desk shows what everyone the viewer can see put in between them. Both
// sides of the return move together — a deposit read beside somebody else's P/L
// is a percentage nobody earned, which is what this used to draw.
//
// Deposited and Withdrawn are each a total across that scope's broker accounts,
// which is why the sub-line says how many accounts it covers and how many state
// nothing: a figure that leaves an account out must say so rather than reading
// as complete. `capitalSub` is shared with the screen so the two cannot phrase
// the same total differently.
//
// Read-only here. The figures are typed or synced from Closed Trades & Metrics,
// which is the one screen that owns them; a board tile states what they are.
function CapitalStats({
  trades,
  trader,
  showMoney,
}: {
  // Already narrowed to the tile's scope, so the P/L below covers exactly the
  // people the capital does.
  trades: TradeLogData['trades'];
  trader: string;
  showMoney: boolean;
}) {
  // The key names the scope, or every tile on a board would show the first
  // one's figures — the shared-fetch rule for useTileData.
  const { data: cap, error } = useTileData(
    `trading:trader-capital:${trader || 'desk'}`,
    () => api.traderCapital(trader || 'desk'),
    CAPITAL_MS,
  );

  const scopeClosedPl = trades
    .filter((t) => t.status === 'closed' && t.realizedPl != null)
    .reduce((sum, t) => sum + (t.realizedPl as number), 0);
  const pct = cap?.deposited.value != null && cap.deposited.value > 0 ? (scopeClosedPl / cap.deposited.value) * 100 : null;

  // These three share one payload, so a load failure is reported once rather
  // than three times over.
  if (error && !cap) return <Stat label="Deposited Capital" value="—" sub="could not read" />;

  const flow = (value: number | null | undefined) =>
    cap == null ? '…' : value == null ? '—' : showMoney ? usd(value) : '•••';

  return (
    <>
      <Stat
        label="Deposited Capital"
        value={flow(cap?.deposited.value)}
        pips={pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% return` : undefined}
        pipsColor={pct != null && pct < 0 ? RED : GREEN}
        sub={cap == null ? 'reading' : capitalSub(cap.deposited, cap.traders, 'not set')}
      />
      <Stat
        label="Withdrawn Capital"
        value={flow(cap?.withdrawn.value)}
        sub={cap == null ? 'reading' : capitalSub(cap.withdrawn, cap.traders, 'not set')}
      />
      <Stat
        label="Total Capital"
        value={flow(cap?.total)}
        sub={
          cap == null
            ? 'reading the accounts'
            : cap.total == null
              ? cap.accounts > 1
                ? 'accounts use different currencies'
                : cap.unreadable > 0
                  ? 'the broker did not answer'
                  : 'no broker account connected'
              : `held now · ${cap.accounts} account${cap.accounts === 1 ? '' : 's'}`
        }
        // An account left out makes the total an understatement — say so rather
        // than letting it read as complete.
        note={
          cap != null && cap.total != null && cap.unreadable > 0
            ? `${cap.unreadable} account${cap.unreadable === 1 ? '' : 's'} could not be read`
            : undefined
        }
      />
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
  pips,
  pipsColor,
  note,
  wide,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  pips?: string;
  pipsColor?: string;
  note?: string;
  wide?: boolean;
}) {
  return (
    <div style={{ background: 'rgba(9,20,46,1)', padding: '10px 12px', ...(wide ? { gridColumn: '1 / -1' } : null) }}>
      <div style={{ fontSize: 9, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: color ?? '#fff', marginTop: 4 }}>{value}</div>
      {pips && <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: pipsColor ?? GOLD, marginTop: 2 }}>{pips}</div>}
      {sub && <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2 }}>{sub}</div>}
      {note && <div style={{ fontSize: 9, color: AMBER, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

// A compact, on-theme trader picker for the tile header. Replaces the native
// <select> (whose OS dropdown clashes with the dark theme) with a pill button
// and a portal-rendered menu — the portal escapes the tile's `overflow:hidden`,
// and it closes on outside click or scroll so it never floats detached.
function TraderPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const items = [{ id: '', name: 'Whole desk' }, ...options];
  const current = items.find((o) => o.id === value) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Show metrics across your instruments or one at a time"
        style={pickerBtn}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.name}</span>
        <Icon name="chevron-down" size={12} color={FAINT} />
      </button>
      {open &&
        rect &&
        createPortal(
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            <div
              style={{
                position: 'fixed',
                top: rect.bottom + 6,
                right: Math.max(8, window.innerWidth - rect.right),
                minWidth: Math.max(rect.width, 168),
                maxWidth: 'min(calc(80 * var(--vw)), 280px)',
                maxHeight: 'calc(50 * var(--vh))',
                overflowY: 'auto',
                background: '#0C1C3C',
                border: `1px solid ${BORDER2}`,
                borderRadius: 10,
                boxShadow: '0 16px 40px rgba(0,0,0,.5)',
                padding: 6,
                zIndex: 201,
              }}
            >
              {items.map((o) => {
                const sel = o.id === value;
                return (
                  <button
                    key={o.id || 'desk'}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    style={menuRow(sel)}
                  >
                    <span style={{ flex: '0 0 16px', display: 'inline-flex' }}>
                      {sel ? <Icon name="check" size={13} color={GREEN} /> : null}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

const tileWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  background: 'rgba(9,20,46,1)',
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  overflow: 'hidden',
};
const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 10px',
  background: PANEL,
  borderBottom: `1px solid ${BORDER}`,
  flex: '0 0 auto',
};
const body: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' };
const pickerBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  maxWidth: 150,
  background: 'rgba(255,255,255,.04)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 999,
  color: '#cfe0ff',
  fontSize: 11,
  fontWeight: 600,
  padding: '5px 10px',
  lineHeight: 1,
  cursor: 'pointer',
};
const menuRow = (sel: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  background: sel ? 'rgba(255,255,255,.06)' : 'transparent',
  border: 'none',
  borderRadius: 7,
  color: sel ? '#fff' : '#cfe0ff',
  fontSize: 13,
  fontWeight: sel ? 700 : 500,
  fontFamily: 'inherit',
  textAlign: 'left',
  padding: '9px 8px',
  cursor: 'pointer',
});
const hint: CSSProperties = { padding: '18px 14px', fontSize: 11.5, color: MUTED, textAlign: 'center', lineHeight: 1.5 };
const iconBtn: CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
  color: '#ffb4ab',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER2}`,
  borderRadius: 6,
  padding: '4px 7px',
  cursor: 'pointer',
};
