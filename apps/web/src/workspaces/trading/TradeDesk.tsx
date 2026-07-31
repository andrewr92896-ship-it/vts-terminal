import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { BrokerConnections } from './BrokerConnections';
import { OrderTicket } from './OrderTicket';
import { OrderJournal, TeamPositions, WorkingOrders } from './DeskPositions';
import { ScreenTitle } from './ScreenTitle';
import { fmtMoney } from './TradeCard';
import type { DeskAccount, DeskInstrument, DeskOrderRecord, DeskWorkingOrder, LiveWall } from '../../api/types';

// The Trade Desk — where a trade is *placed*, not reviewed. (Reviewing past
// trades is Trade Analysis, the screen this one used to share a name with.)
//
// Two things sit side by side on purpose: the order ticket, which acts on the
// trader's own broker account, and the desk's live book, which shows every
// position their team currently holds. A trader should not be sizing a EUR/USD
// long without seeing that two teammates are already short it.
//
// The split in what those two halves may do is the important part:
//   • watching is team-wide — the positions panel reads the same team-scoped
//     Live Wall feed every other screen does;
//   • acting is personal — the ticket, close and amend endpoints only ever
//     resolve connections owned by the caller, so there is no path to another
//     trader's account.

const GOLD = '#EBCB74';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';
const MONO = "'IBM Plex Mono', monospace";

// The book refreshes on the Live Wall's cadence; resting orders change far less
// often, so they poll slower.
const WALL_MS = 8000;
const ORDERS_MS = 20_000;

const STORE_KEY = 'vts.tradedesk.v1';

// Remember the account and instrument a trader last worked from, per browser —
// re-picking them on every visit is friction on a screen used many times a day.
function loadPrefs(): { connectionId?: string; instrument?: string } {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as { connectionId?: string; instrument?: string };
  } catch {
    return {};
  }
}
function savePrefs(p: { connectionId?: string; instrument?: string }) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* private mode / full quota — the desk just forgets */
  }
}

export function TradeDesk() {
  const { user } = useAuth();
  const { isPhone, isTablet } = useResponsive();
  const { privacy } = usePrivacy();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');

  const [accounts, setAccounts] = useState<DeskAccount[] | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [instruments, setInstruments] = useState<DeskInstrument[]>([]);
  const [instrument, setInstrument] = useState<string>(loadPrefs().instrument ?? 'EUR/USD');
  const [wall, setWall] = useState<LiveWall | null>(null);
  const [working, setWorking] = useState<DeskWorkingOrder[]>([]);
  const [journal, setJournal] = useState<DeskOrderRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instrumentError, setInstrumentError] = useState<string | null>(null);
  const [hideMoney, setHideMoney] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const firstLoad = useRef(true);

  const account = accounts?.find((a) => a.connectionId === connectionId) ?? null;

  // ---- loads ----

  const loadAccounts = useCallback(async () => {
    try {
      const { accounts: list } = await api.deskAccounts();
      setAccounts(list);
      setLoadError(null);
      setConnectionId((current) => {
        if (current && list.some((a) => a.connectionId === current)) return current;
        const remembered = loadPrefs().connectionId;
        if (remembered && list.some((a) => a.connectionId === remembered)) return remembered;
        // Default to a practice account when there is one — the safer of the two
        // to land on if a trader opens the desk and starts typing.
        return list.find((a) => a.env === 'practice')?.connectionId ?? list[0]?.connectionId ?? null;
      });
    } catch (e) {
      if (firstLoad.current) setLoadError(e instanceof ApiError ? e.message : 'Could not load your accounts');
    } finally {
      firstLoad.current = false;
    }
  }, []);

  const loadWall = useCallback(async () => {
    try {
      setWall(await api.liveWall());
    } catch {
      /* keep the last book on screen rather than blanking it */
    }
  }, []);

  const loadOrders = useCallback(async () => {
    const [w, j] = await Promise.allSettled([api.deskWorkingOrders(), api.deskOrderJournal()]);
    if (w.status === 'fulfilled') setWorking(w.value.orders);
    if (j.status === 'fulfilled') setJournal(j.value.orders);
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadWall();
    const id = window.setInterval(() => void loadWall(), WALL_MS);
    return () => window.clearInterval(id);
  }, [loadWall]);

  useEffect(() => {
    void loadOrders();
    const id = window.setInterval(() => void loadOrders(), ORDERS_MS);
    return () => window.clearInterval(id);
  }, [loadOrders]);

  // The tradeable set is per account, so it reloads whenever the account changes.
  useEffect(() => {
    if (!connectionId) {
      setInstruments([]);
      return;
    }
    let cancelled = false;
    setInstrumentError(null);
    void (async () => {
      try {
        const { instruments: list } = await api.deskInstruments(connectionId);
        if (cancelled) return;
        setInstruments(list);
        // Keep the chosen instrument only if this account can actually trade it.
        setInstrument((cur) =>
          list.some((i) => i.instrument === cur) ? cur : list.find((i) => i.instrument === 'EUR/USD')?.instrument ?? list[0]?.instrument ?? cur,
        );
      } catch (e) {
        if (!cancelled) setInstrumentError(e instanceof ApiError ? e.message : 'Could not load this account’s instruments');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  useEffect(() => {
    savePrefs({ connectionId: connectionId ?? undefined, instrument });
  }, [connectionId, instrument]);

  // After any order goes in, pull the book and the order lists straight away
  // rather than waiting out a poll — the server has already dropped its cached
  // desk snapshot, so this reads the post-trade state.
  const afterAction = useCallback(() => {
    void loadWall();
    void loadOrders();
    void loadAccounts();
  }, [loadWall, loadOrders, loadAccounts]);

  const teamTrades = wall?.trades ?? [];
  const sampleBook = wall?.source === 'sample';
  const currency = account?.currency ?? 'USD';
  const money = privacy || hideMoney;
  const twoColumn = !isPhone && !isTablet;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ScreenTitle>Trade Desk</ScreenTitle>
          <span style={{ fontSize: 11.5, color: FAINT }}>{"Place trades on your own account, beside your team’s open book"}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
          {!readOnly && <button onClick={() => setConnOpen(true)} style={ghostBtn}>{"Connections"}</button>}
        </div>
      </div>

      {/* An accounts failure only costs the ticket — the desk's book still
          renders below, so this is a banner rather than a whole-screen error. */}
      {loadError && <Notice tone="error">{loadError}</Notice>}

      {/* Account strip */}
      {accounts && accounts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
          {accounts.map((a) => (
            <button
              key={a.connectionId}
              onClick={() => setConnectionId(a.connectionId)}
              style={{
                ...accountCard,
                borderColor: a.connectionId === connectionId ? GOLD : BORDER,
                background: a.connectionId === connectionId ? 'rgba(235,203,116,.08)' : PANEL,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT }}>{a.label}</span>
                <span style={a.env === 'live' ? livePill : practicePill}>{a.env === 'live' ? 'LIVE' : 'PRACTICE'}</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: a.ok ? TEXT : FAINT }}>
                {money ? '•••' : a.nav == null ? '—' : fmtMoney(a.nav, a.currency)}
              </div>
              <div style={{ fontSize: 10, color: FAINT, marginTop: 3 }}>
                {a.ok
                  ? `••${a.accountTail} · ${a.openTradeCount ?? 0} open${a.marginAvailable != null && !money ? ` · ${fmtMoney(a.marginAvailable, a.currency)} free` : ''}`
                  : (a.error ?? 'Unreachable')}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No account to trade with */}
      {accounts && accounts.length === 0 && (
        <div style={{ ...panel, marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{"No tradeable account connected"}</div>
          <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginBottom: 12 }}>
            {"The Trade Desk places orders through your own OANDA account. Add your OANDA API token and account ID under Connections and it will appear here. Your key is encrypted on the server and never sent to the browser."}
          </div>
          {!readOnly && <button onClick={() => setConnOpen(true)} style={goldBtn}>{"Add a connection"}</button>}
        </div>
      )}

      {instrumentError && <Notice tone="error">{instrumentError}</Notice>}

      {/* Ticket + book */}
      <div style={{ display: 'grid', gridTemplateColumns: twoColumn ? 'minmax(340px, 420px) 1fr' : '1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {account ? (
            <OrderTicket
              key={account.connectionId}
              account={account}
              instruments={instruments}
              instrument={instrument}
              onInstrument={setInstrument}
              readOnly={readOnly}
              onPlaced={afterAction}
            />
          ) : accounts === null ? (
            <Notice tone="muted">{"Loading your accounts…"}</Notice>
          ) : (
            accounts.length > 0 && <Notice tone="muted">{"Pick an account above to start a ticket."}</Notice>
          )}
          {!twoColumn && (
            <TeamPositions
              trades={teamTrades}
              myUserId={user?.id ?? ''}
              currency={currency}
              hideMoney={money}
              readOnly={readOnly}
              sample={sampleBook}
              onPick={setInstrument}
              onChanged={afterAction}
            />
          )}
          <WorkingOrders orders={working} readOnly={readOnly} onChanged={afterAction} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {twoColumn && (
            <TeamPositions
              trades={teamTrades}
              myUserId={user?.id ?? ''}
              currency={currency}
              hideMoney={money}
              readOnly={readOnly}
              sample={sampleBook}
              onPick={setInstrument}
              onChanged={afterAction}
            />
          )}
          <OrderJournal orders={journal} currency={currency} />
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 16, lineHeight: 1.6, maxWidth: 820 }}>
        {"Orders are sent to the broker account you connected, under your own credentials. The portal does not hold funds, route orders, or give investment advice — every decision, and every fill, is yours."}
      </div>

      <BrokerConnections open={connOpen} onClose={() => setConnOpen(false)} onChanged={afterAction} />
    </div>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'muted'; children: string }) {
  return (
    <div
      style={{
        ...panel,
        marginBottom: 14,
        fontSize: 12.5,
        color: tone === 'error' ? RED : MUTED,
        borderColor: tone === 'error' ? 'rgba(239,84,104,.4)' : BORDER,
      }}
    >
      {children}
    </div>
  );
}

const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const accountCard: CSSProperties = { flex: '0 0 auto', minWidth: 190, textAlign: 'left', border: '1px solid', borderRadius: 11, padding: '11px 14px', cursor: 'pointer' };
const ghostBtn: CSSProperties = { background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, color: '#dfe7fa', fontSize: 12, fontWeight: 600, padding: '8px 13px', borderRadius: 7, cursor: 'pointer' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12.5, padding: '9px 18px', borderRadius: 7, cursor: 'pointer' };
const livePill: CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '.6px', color: RED, background: 'rgba(239,84,104,.14)', border: '1px solid rgba(239,84,104,.45)', padding: '2px 7px', borderRadius: 999 };
const practicePill: CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: '.6px', color: '#6C9EFF', background: 'rgba(108,158,255,.12)', border: '1px solid rgba(108,158,255,.4)', padding: '2px 7px', borderRadius: 999 };
