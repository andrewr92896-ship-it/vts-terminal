import { useMemo, type CSSProperties } from 'react';
import { api } from '../../../api/client';
import { usePrivacy } from '../../../privacy/privacy';
import type { BoardTile, HistoryRecord, SessionBias, SessionStatus } from '../../../api/types';
import { FAINT, GOLD, GREEN, MONO, MUTED, RED, TEXT } from '../tvChart';
import { TradeTimesCell } from '../tradeTime';
import {
  HIDDEN,
  TileFrame,
  TileMessage,
  TileRow,
  TileSelect,
  TileStat,
  money,
  plColor,
  signedMoney,
  useTileData,
} from './TileFrame';
import type { TileProps } from './PersonalTiles';

// The Advanced Trading tiles. Everything here reads the desk — the team's book,
// its record, its sessions and its challenge accounts — so every one of them is
// behind the Advanced Trading opt-in (tileCatalog.ts states that once, and the
// server strips them from anything a non-desk user saves).

const MEDIUM = 60_000;
const SLOW = 120_000;

// ---- Trade Analysis ------------------------------------------------------
//
// The record over a window: how many trades, how many won, and what they made.
// Deliberately the SAME numbers the Trade Log shows — read from the same
// endpoint and scored by the viewer's own desk settings — rather than recomputed
// here, so the tile and the screen can never disagree about a win rate.
export function TradeLogTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { privacy } = usePrivacy();
  const { data, error } = useTileData(() => api.tradingHistory(), SLOW);
  const range = tile.range ?? '30d';

  const scoped = useMemo(() => scoreWindow(data?.trades ?? [], range), [data, range]);

  return (
    <TileFrame
      title={tile.title || 'Trade Analysis'}
      icon="bar-chart-3"
      editing={editing}
      onRemove={onRemove}
      controls={
        <TileSelect
          value={range}
          onChange={(v) => onChange({ range: v as BoardTile['range'] })}
          title="Window scored"
          options={RANGE_OPTIONS}
          width={100}
        />
      }
      status={<span style={stamp}>{RANGE_OPTIONS.find((r) => r.value === range)?.label}</span>}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && scoped.closed === 0 && <TileMessage>{"No closed trades in this window."}</TileMessage>}
      {data && scoped.closed > 0 && (
        <>
          <TileStat
            label="Realized P&L"
            value={privacy ? HIDDEN : signedMoney(scoped.pl)}
            color={plColor(scoped.pl)}
            sub={`${scoped.closed} closed · ${scoped.wins}W ${scoped.losses}L${scoped.breakeven ? ` ${scoped.breakeven}BE` : ''}`}
          />
          <TileRow
            label="Win rate"
            value={`${scoped.winRate.toFixed(0)}%`}
            color={scoped.winRate >= 50 ? GREEN : RED}
            strong
          />
          <TileRow label="Average" value={privacy ? HIDDEN : signedMoney(scoped.pl / scoped.closed)} color={plColor(scoped.pl)} />
          <TileRow label="Best" value={privacy ? HIDDEN : signedMoney(scoped.best)} color={GREEN} />
          <TileRow label="Worst" value={privacy ? HIDDEN : signedMoney(scoped.worst)} color={RED} />
        </>
      )}
    </TileFrame>
  );
}

const RANGE_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

// Score a set of closed trades over a window, client-side.
//
// This is the same rule History followed and the Trade Log inherited when
// History was folded into it: ANY narrowing recomputes the summary from the rows
// on screen, so a filtered selection scores exactly as the unfiltered one does.
// Reading the payload's whole-book summary while showing a 7-day slice would put
// a win rate beside a set of trades that did not produce it.
function scoreWindow(trades: HistoryRecord[], range: string) {
  // A stored board's JSON is not re-validated on read (boards.ts parses it
  // defensively and no more), so an unrecognized window falls back to the whole
  // book rather than producing a NaN cutoff — which would silently score zero
  // trades and read as "no closed trades in this window".
  const days: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const cutoff = days[range] ? Date.now() - days[range] * 86_400_000 : 0;
  const rows = trades.filter((t) => (t.closedAt ?? 0) >= cutoff);
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let pl = 0;
  let best = 0;
  let worst = 0;
  for (const r of rows) {
    const v = r.realizedPl ?? 0;
    pl += v;
    if (v > 0) wins++;
    else if (v < 0) losses++;
    else breakeven++;
    if (v > best) best = v;
    if (v < worst) worst = v;
  }
  const decided = wins + losses;
  return {
    closed: rows.length,
    wins,
    losses,
    breakeven,
    pl,
    best,
    worst,
    winRate: decided === 0 ? 0 : (wins / decided) * 100,
  };
}

// ---- Closed trades -------------------------------------------------------

export function ClosedTradesTile({ tile, editing, onRemove }: TileProps) {
  const { privacy } = usePrivacy();
  const { data, error } = useTileData(() => api.tradingHistory(), SLOW);
  const limit = tile.limit ?? 8;

  const rows = useMemo(
    () => [...(data?.trades ?? [])].sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, limit),
    [data, limit],
  );

  return (
    <TileFrame
      title={tile.title || 'Closed Trades'}
      icon="history"
      count={data ? data.trades.length : null}
      editing={editing}
      onRemove={onRemove}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && rows.length === 0 && <TileMessage>{"No closed trades yet."}</TileMessage>}
      {rows.map((t) => (
        <div key={t.id} style={tradeRow}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{t.instrument}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: t.side === 'long' ? GREEN : RED }}>
                {t.side === 'long' ? 'LONG' : 'SHORT'}
              </span>
            </div>
            <div style={{ marginTop: 2 }}>
              <TradeTimesCell openedAt={t.openedAt} closedAt={t.closedAt} />
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              fontFamily: MONO,
              color: plColor(t.realizedPl),
              flex: '0 0 auto',
              marginLeft: 8,
            }}
          >
            {privacy ? HIDDEN : signedMoney(t.realizedPl)}
          </span>
        </div>
      ))}
    </TileFrame>
  );
}

// ---- Strategy sessions ---------------------------------------------------
//
// Which of the trader's own session windows are open now, and what is next.
// A session carries a Bull/Bear/Two-way bias the trader set themselves — it is
// their own note about their plan, not a recommendation from the terminal, and
// the footer says so.
export function SessionsTile({ tile, editing, onRemove }: TileProps) {
  const { data, error } = useTileData(() => api.tradingSessions(), MEDIUM);
  // Active-now first, then opening soon, then idle — the same order the Strategy
  // Sessions screen groups them in, so the tile's top row is the one that
  // matters right now.
  const sessions = useMemo(() => {
    const rank: Record<SessionStatus, number> = { active: 0, opening: 1, idle: 2 };
    return (data?.sessions ?? []).filter((s) => s.active).sort((a, b) => rank[a.status] - rank[b.status]);
  }, [data]);
  const liveNow = sessions.filter((s) => s.status === 'active').length;

  return (
    <TileFrame
      title={tile.title || 'Strategy Sessions'}
      icon="calendar-clock"
      count={data ? `${liveNow} active` : null}
      editing={editing}
      onRemove={onRemove}
      footer="Your own session notes — informational only, not investment advice."
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && sessions.length === 0 && <TileMessage>{"No sessions yet."}</TileMessage>}
      {sessions.map((s) => (
        <div key={s.id} style={sessionRow}>
          <span style={{ ...dot, background: STATUS_COLOR[s.status] }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </div>
            <div style={{ fontSize: 9.5, color: FAINT, marginTop: 2 }}>
              {s.instrument ?? 'Any instrument'} · {BIAS_LABEL[s.bias]}
            </div>
          </div>
          <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, flex: 'none' }}>
            {s.status === 'active'
              ? 'Active'
              : s.minsToOpen == null
                ? 'Idle'
                : s.minsToOpen < 60
                  ? `in ${s.minsToOpen}m`
                  : `in ${Math.floor(s.minsToOpen / 60)}h`}
          </span>
        </div>
      ))}
    </TileFrame>
  );
}

// The same three readings the Strategy Sessions screen groups by, in its colours.
const STATUS_COLOR: Record<SessionStatus, string> = {
  active: GREEN,
  opening: GOLD,
  idle: '#3b4a70',
};
const BIAS_LABEL: Record<SessionBias, string> = { bull: 'Bull', bear: 'Bear', both: 'Two-way' };

// ---- Funded account ------------------------------------------------------
//
// A prop-firm challenge: what the account is at, and what it has made. Note the
// figure here is the FIRM's capital, not the trader's own — which is exactly why
// Net Worth excludes a funded account and names it rather than adding it in.
export function FundedTile({ tile, editing, onChange, onRemove }: TileProps) {
  const { privacy } = usePrivacy();
  const { data, error } = useTileData(() => api.funded(), SLOW);
  const accounts = data?.accounts ?? [];
  const account = tile.accountId ? accounts.find((a) => a.id === tile.accountId) : accounts[0];

  return (
    <TileFrame
      title={tile.title || 'Funded Account'}
      icon="shield-check"
      editing={editing}
      onRemove={onRemove}
      controls={
        accounts.length > 1 ? (
          <TileSelect
            value={tile.accountId ?? accounts[0]?.id ?? ''}
            onChange={(v) => onChange({ accountId: v })}
            title="Which account"
            options={accounts.map((a) => ({ value: a.id, label: a.label || a.platform }))}
          />
        ) : null
      }
      status={account ? <span style={stamp}>{account.platform}</span> : null}
      footer="Balances shown are the funding firm's capital, not your own."
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && !account && <TileMessage>{"No funded accounts yet."}</TileMessage>}
      {account && (
        <>
          <TileStat
            label="Balance"
            value={privacy ? HIDDEN : money(account.balance, account.currency)}
            sub={account.label}
          />
          <TileRow
            label="Realized P&L"
            value={privacy ? HIDDEN : signedMoney(account.realizedPl, account.currency)}
            color={plColor(account.realizedPl)}
            strong
          />
          {account.startingBalance != null && account.balance != null && (
            <TileRow
              label="Against start"
              value={privacy ? HIDDEN : signedMoney(account.balance - account.startingBalance, account.currency)}
              color={plColor(account.balance - account.startingBalance)}
            />
          )}
          <TileRow label="Trades" value={account.tradeCount} />
        </>
      )}
    </TileFrame>
  );
}

// ---- Broker capital -------------------------------------------------------
//
// What each connected account is actually worth right now, read from the broker
// itself. NAV — balance plus open P&L — is the capital figure, and it is what the
// Live Brokers screen leads with, so the tile leads with the same one.
export function CapitalTile({ tile, editing, onRemove }: TileProps) {
  const { privacy } = usePrivacy();
  const { data, error } = useTileData(() => api.oandaCapital(), MEDIUM);
  const accounts = data?.accounts ?? [];

  return (
    <TileFrame
      title={tile.title || 'Broker Capital'}
      icon="landmark"
      count={data ? accounts.length : null}
      editing={editing}
      onRemove={onRemove}
    >
      {!data && !error && <TileMessage>{"Loading…"}</TileMessage>}
      {error && !data && <TileMessage tone="error">{error}</TileMessage>}
      {data && !data.configured && <TileMessage>{"No broker connected yet."}</TileMessage>}
      {data && data.configured && accounts.length === 0 && <TileMessage>{"No accounts to read."}</TileMessage>}
      {data && data.nav != null && accounts.length > 1 && (
        // Only worth a headline when there is more than one account to total.
        <TileStat
          label="Total capital"
          value={privacy ? HIDDEN : money(data.nav, data.currency ?? 'USD')}
          sub={data.pnl ? <span style={{ color: plColor(data.pnl.daily) }}>{signedMoney(privacy ? null : data.pnl.daily)} today</span> : null}
        />
      )}
      {accounts.map((a) => (
        <div key={a.connectionId} style={capitalRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{ ...dot, background: a.ok ? GREEN : RED }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.label}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, fontFamily: MONO, color: '#fff', flex: 'none' }}>
              {privacy ? HIDDEN : money(a.nav, a.currency)}
            </span>
          </div>
          {/* A connection that would not answer says so rather than reading as
              an account worth nothing. */}
          {!a.ok && a.error ? (
            <div style={{ fontSize: 10, color: '#ffb4ab', lineHeight: 1.45 }}>{a.error}</div>
          ) : (
            <div style={{ display: 'flex', gap: 10, fontSize: 9.5, color: FAINT, fontFamily: MONO }}>
              {a.pnl && <span style={{ color: plColor(a.pnl.daily) }}>{signedMoney(privacy ? null : a.pnl.daily)} today</span>}
              {a.unrealizedPl != null && (
                <span style={{ color: plColor(a.unrealizedPl) }}>{signedMoney(privacy ? null : a.unrealizedPl)} open</span>
              )}
              {a.openTradeCount != null && <span>{a.openTradeCount} open</span>}
            </div>
          )}
        </div>
      ))}
    </TileFrame>
  );
}

const stamp: CSSProperties = { fontSize: 10, color: FAINT, whiteSpace: 'nowrap' };
const capitalRow: CSSProperties = { padding: '9px 12px', borderBottom: `1px solid rgba(22,41,79,.5)` };
const tradeRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderBottom: `1px solid rgba(22,41,79,.5)`,
};
const sessionRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '9px 12px',
  borderBottom: `1px solid rgba(22,41,79,.5)`,
};
const dot: CSSProperties = { width: 7, height: 7, borderRadius: '50%', flex: 'none' };
