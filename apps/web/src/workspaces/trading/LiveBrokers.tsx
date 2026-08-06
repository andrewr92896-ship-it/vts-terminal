import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import type { OandaCapital } from '../../api/types';

const GOLD = '#EBCB74';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(13,31,68,.5)';
const PANEL = 'rgba(11,26,58,.5)';
const BORDER = '#16294f';
const BORDER2 = '#1c3a7a';

// Money in a given account currency (USD shows as "$"; others append the code).
const fmtCcy = (n: number, ccy: string) => {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : '';
  return ccy === 'USD' ? `${sign}$${abs}` : `${sign}${abs} ${ccy}`;
};

// Live broker capital (OANDA). Pulled from the broker API, so it updates as
// trades are placed. The FTP prop challenge and funded/prop accounts live on
// the Funded Trades screen — this panel is just the live brokerage view.
export function LiveBrokers() {
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [oanda, setOanda] = useState<OandaCapital | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);

  // Live OANDA capital — full traders only (the endpoint 403s for view-only, so
  // skip the call entirely for read-only users). Errors are swallowed: a missing
  // OANDA connection just means no capital card.
  useEffect(() => {
    if (readOnly) {
      setLoaded(true);
      return;
    }
    let alive = true;
    api
      .oandaCapital()
      .then((c) => alive && setOanda(c))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [readOnly]);

  // Capital is masked off privacy mode and the page Hide-$ toggle.
  const showMoney = !privacy && !hideMoney;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{"Live Brokers"}</h2>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
            {"Your team’s live brokerage capital, each account tagged with its trader, pulled from the broker API so it updates as trades are placed. Hand-kept accounts are in Manual Trades."}
          </div>
        </div>
        {!readOnly && oanda?.configured && (
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
        )}
      </div>

      {!loaded ? (
        <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>{"Loading live brokers…"}</div>
      ) : readOnly ? (
        <div style={{ ...panel, fontSize: 12, color: MUTED }}>
          {"Live broker capital is available to full traders only."}
        </div>
      ) : oanda?.configured ? (
        <OandaCapitalCard oanda={oanda} showMoney={showMoney} isPhone={isPhone} />
      ) : (
        <div style={{ ...panel, fontSize: 12.5, color: MUTED }}>
          {"No live broker connected yet. Connect an OANDA account from the Admin → Broker connections panel and your live capital (NAV, balance, open P/L) will appear here."}
        </div>
      )}
    </div>
  );
}

function OandaCapitalCard({ oanda, showMoney, isPhone }: { oanda: OandaCapital; showMoney: boolean; isPhone: boolean }) {
  const multi = oanda.accounts.length > 1;
  const ccy = oanda.currency ?? oanda.accounts[0]?.currency ?? 'USD';
  const m = (n: number | null, c = ccy) => (n == null ? '—' : showMoney ? fmtCcy(n, c) : '•••••');
  const upPl = (oanda.unrealizedPl ?? 0) >= 0;
  const anyError = oanda.accounts.some((a) => !a.ok);
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>OANDA Capital</span>
          <span style={{ ...pill, color: GREEN, border: `1px solid ${GREEN}` }}>Live</span>
          {multi && <span style={{ fontSize: 11, color: FAINT }}>· desk total</span>}
          {oanda.accounts.length === 1 && (
            <span style={{ fontSize: 11, color: GOLD }}>· @{oanda.accounts[0].owner}</span>
          )}
        </div>
        <span style={{ fontSize: 10.5, color: FAINT }}>{"From the OANDA API — updates as trades are placed"}</span>
      </div>

      {/* Headline NAV / balance / open P/L (combined when one currency) */}
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3,1fr)', gap: 14 }}>
        <Stat label="Capital (NAV)" value={m(oanda.nav)} big />
        <Stat label="Balance" value={m(oanda.balance)} />
        <Stat label="Open P/L" value={m(oanda.unrealizedPl)} color={oanda.unrealizedPl == null ? undefined : upPl ? GREEN : RED} />
      </div>

      {/* Capital gained from trades — deposits/withdrawals don't count */}
      {oanda.pnl && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
            Gained from trades <span style={{ color: FAINT, textTransform: 'none', letterSpacing: 0 }}>· deposits excluded</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr 1fr' : 'repeat(3,1fr)', gap: 14 }}>
            <PnlStat label="Today" n={oanda.pnl.daily} m={m} />
            <PnlStat label="This week" n={oanda.pnl.weekly} m={m} />
            <PnlStat label="30 days" n={oanda.pnl.monthly} m={m} />
          </div>
        </div>
      )}

      {(multi || oanda.currency == null) && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}` }}>
          {oanda.accounts.map((a) => (
            <div key={a.connectionId} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '9px 2px', borderTop: `1px solid ${BORDER}`, gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: TEXT, fontWeight: 600 }}>
                <span style={{ color: GOLD }}>@{a.owner}</span> · {a.label}
              </span>
              {a.ok ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', fontFamily: "'IBM Plex Mono', monospace" }}>
                  <span style={{ fontSize: 12, color: MUTED }}>
                    NAV <b style={{ color: '#fff' }}>{m(a.nav, a.currency)}</b> · Bal {m(a.balance, a.currency)} · Open P/L{' '}
                    <b style={{ color: (a.unrealizedPl ?? 0) >= 0 ? GREEN : RED }}>{m(a.unrealizedPl, a.currency)}</b>
                  </span>
                  {a.pnl && (
                    <span style={{ fontSize: 11, color: FAINT }}>
                      Trades · today <b style={{ color: a.pnl.daily >= 0 ? GREEN : RED }}>{m(a.pnl.daily, a.currency)}</b> · 7d{' '}
                      <b style={{ color: a.pnl.weekly >= 0 ? GREEN : RED }}>{m(a.pnl.weekly, a.currency)}</b> · 30d{' '}
                      <b style={{ color: a.pnl.monthly >= 0 ? GREEN : RED }}>{m(a.pnl.monthly, a.currency)}</b>
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ fontSize: 11.5, color: RED }}>Couldn’t reach: {a.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {oanda.currency == null && oanda.accounts.length > 1 && !multi && (
        <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>Accounts use different currencies — shown separately.</div>
      )}
      {anyError && !multi && (
        <div style={{ fontSize: 11, color: RED, marginTop: 8 }}>Couldn’t reach OANDA — showing the last figures available.</div>
      )}
    </div>
  );
}

function Stat({ label, value, big, color }: { label: string; value: string; big?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: big ? 26 : 18, fontWeight: 700, color: color ?? '#fff', marginTop: 4 }}>{value}</div>
    </div>
  );
}

// One trade-P/L window (Today / This week / 30 days). Green for a gain, red for a
// loss, and a leading + on gains so the sign reads at a glance.
function PnlStat({ label, n, m }: { label: string; n: number; m: (v: number | null) => string }) {
  const up = n >= 0;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: up ? GREEN : RED, marginTop: 4 }}>
        {n === 0 ? m(0) : `${up ? '+' : ''}${m(n)}`}
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const pill: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRadius: 5, padding: '2px 8px' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
