import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { useAiBrief, BriefButton, BriefCard, BriefError } from '../../components/AiBrief';
import { readClipboardImage, imageFromPasteEvent } from '../../lib/clipboard';
import type { ChallengeData, ChallengeInput, OandaCapital, FundedAccount } from '../../api/types';

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

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
// Money in a given account currency (USD shows as "$"; others append the code).
const fmtCcy = (n: number, ccy: string) => {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : '';
  return ccy === 'USD' ? `${sign}$${abs}` : `${sign}${abs} ${ccy}`;
};
const pct1 = (f: number) => `${(f * 100).toFixed(1)}%`;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ET = 'America/New_York';
const etDate = (ms: number) => new Date(ms).toLocaleDateString('en-US', { timeZone: ET, month: 'short', day: 'numeric', year: 'numeric' });
function msToDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS: Record<ChallengeData['metrics']['status'], { label: string; color: string }> = {
  active: { label: 'On Track', color: GREEN },
  passed: { label: 'Target Reached', color: GOLD },
  breached: { label: 'Breached', color: RED },
};

export function AccountMetrics() {
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [data, setData] = useState<ChallengeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const [oanda, setOanda] = useState<OandaCapital | null>(null);
  const [funded, setFunded] = useState<FundedAccount[] | null>(null);
  const ai = useAiBrief(api.tradingMetricsBrief);

  useEffect(() => {
    let alive = true;
    api.tradingChallenge().then((d) => alive && setData(d)).catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load'));
    return () => { alive = false; };
  }, []);

  // Live OANDA capital — full traders only (the endpoint 403s for view-only, so
  // skip the call entirely for read-only users). Errors are swallowed: a missing
  // OANDA connection just means no capital card.
  useEffect(() => {
    if (readOnly) return;
    let alive = true;
    api.oandaCapital().then((c) => alive && setOanda(c)).catch(() => {});
    api.funded().then((d) => alive && setFunded(d.accounts)).catch(() => {});
    return () => { alive = false; };
  }, [readOnly]);

  // Ctrl/Cmd+V anywhere on this screen reads a balance off the pasted screenshot.
  useEffect(() => {
    if (readOnly) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromPasteEvent(e);
      if (file) { e.preventDefault(); readBalanceShot(file); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  async function run(p: Promise<ChallengeData>) {
    setBusy(true);
    try { setData(await p); setActionError(null); return true; }
    catch (e) { setActionError(e instanceof ApiError ? e.message : 'Action failed'); return false; }
    finally { setBusy(false); }
  }

  // Read the current balance off an FTP-account screenshot and set the equity.
  function readBalanceShot(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setShotMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      setShotBusy(true);
      setActionError(null);
      try {
        const res = await api.analyzeChallengeBalance({ imageBase64: reader.result as string, mediaType: file.type });
        setData(res.challenge);
        const read = res.parsed.equity ?? res.parsed.balance;
        setShotMsg(read != null ? `Equity set to ${usd(read)} — ${res.parsed.summary}` : res.parsed.summary);
      } catch (e) {
        setActionError(e instanceof ApiError ? e.message : 'Could not read that screenshot');
      } finally {
        setShotBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  if (loadError) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading challenge…</div>;

  const canSee = data.canSeeBalances;
  const showMoney = canSee && !privacy && !hideMoney;
  const m = data.metrics;
  const st = STATUS[m.status];
  const dollars = (n: number | null) => (n == null ? '—' : showMoney ? usd(n) : '•••••');

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{data.label}</h2>
            <span style={{ ...pill, color: st.color, border: `1px solid ${st.color}` }}>{st.label}</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
            {canSee ? `${usd(data.accountSize ?? 0)} account` : 'Funded account'} · {data.targetPct}% target · {data.dailyDdPct}% daily / {data.maxDdPct}% {data.trailing ? 'trailing' : 'max'} drawdown · since {etDate(data.startedAt)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BriefButton onClick={ai.run} busy={ai.busy} accent={GOLD} accentText="#0c2768" />
          {canSee && <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>}
          {!readOnly && <button onClick={() => setEditing((v) => !v)} style={goldBtn}>{editing ? 'Close' : 'Edit'}</button>}
        </div>
      </div>

      {ai.brief && <BriefCard brief={ai.brief} accent={GOLD} onDismiss={ai.dismiss} />}
      {ai.error && <BriefError message={ai.error} onDismiss={ai.dismiss} />}

      {actionError && <div onClick={() => setActionError(null)} style={banner}>{actionError} — click to dismiss.</div>}

      {editing && (
        <ChallengeForm
          data={data}
          busy={busy}
          onSave={async (patch) => { if (await run(api.updateChallenge(patch))) setEditing(false); }}
          onSync={() => run(api.syncChallengeEquity())}
        />
      )}

      {!readOnly && (
        <div style={{ ...panel, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>Update balance from a screenshot</div>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
              FTP has no API. Upload or paste (⌘/Ctrl+V) a screenshot of your account and Claude reads the balance, then sets your equity here.
            </div>
            {shotMsg && <div style={{ fontSize: 11.5, color: GREEN, marginTop: 6 }}>{shotMsg}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                const file = await readClipboardImage();
                if (file) readBalanceShot(file);
                else setActionError('No image found on the clipboard — copy a screenshot first, or use Upload.');
              }}
              disabled={shotBusy}
              style={{ ...ghostBtn, opacity: shotBusy ? 0.6 : 1 }}
            >
              Paste
            </button>
            <label style={{ ...goldBtn, opacity: shotBusy ? 0.6 : 1, cursor: shotBusy ? 'default' : 'pointer' }}>
              {shotBusy ? 'Reading…' : 'Upload screenshot'}
              <input
                type="file"
                accept="image/*"
                disabled={shotBusy}
                onChange={(e) => { readBalanceShot(e.target.files?.[0]); e.currentTarget.value = ''; }}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Equity + progress to target */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={label}>Current Equity</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color: '#fff' }}>{dollars(data.equity)}</div>
          </div>
          <div style={{ textAlign: isPhone ? 'left' : 'right' }}>
            <div style={label}>Profit</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: m.profitPct >= 0 ? GREEN : RED }}>
              {canSee ? `${m.profit != null && m.profit >= 0 ? '+' : ''}${dollars(m.profit)}` : '•••••'} · {m.profitPct >= 0 ? '+' : ''}{pct1(m.profitPct)}
            </div>
          </div>
        </div>
        <Bar pct={clamp(m.progressPct)} color={m.progressPct >= 1 ? GOLD : GREEN} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginTop: 6 }}>
          <span>{Math.round(clamp(m.progressPct) * 100)}% of target</span>
          <span>Target {dollars(m.targetEquity)} · {m.toTarget != null && m.toTarget > 0 ? `${dollars(m.toTarget)} to go` : 'reached'}</span>
        </div>
      </div>

      {/* Live OANDA capital — full traders only */}
      {!readOnly && oanda?.configured && (
        <OandaCapitalCard oanda={oanda} showMoney={showMoney} isPhone={isPhone} />
      )}

      {/* Funded platforms — capital + trade P/L windows, same as OANDA */}
      {!readOnly && funded?.map((a) => (
        <FundedCapitalCard key={a.id} a={a} showMoney={showMoney} isPhone={isPhone} />
      ))}

      {/* Drawdown gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 14 }}>
        <Gauge title="Max Drawdown" subtitle={`${data.trailing ? 'Trailing' : 'Static'} · ${data.maxDdPct}%`} floorLabel="Floor" floor={dollars(m.maxFloor)} headroom={dollars(m.maxHeadroom)} headroomPct={m.maxHeadroomPct} breached={m.breaches.max} canSee={canSee} showMoney={showMoney} />
        <Gauge title="Daily Drawdown" subtitle={`Resets daily · ${data.dailyDdPct}%`} floorLabel="Today's floor" floor={dollars(m.dailyFloor)} headroom={dollars(m.dailyHeadroom)} headroomPct={m.dailyHeadroomPct} breached={m.breaches.daily} canSee={canSee} showMoney={showMoney} />
      </div>

      {!canSee && (
        <div style={{ ...panel, marginTop: 14, fontSize: 12, color: MUTED }}>
          Dollar figures are hidden because your account doesn’t have the brokerage-view permission. Targets and drawdown buffers are still shown as percentages.
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
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>OANDA Capital</span>
          <span style={{ ...pill, color: GREEN, border: `1px solid ${GREEN}` }}>Live</span>
        </div>
        <span style={{ fontSize: 10.5, color: FAINT }}>From the OANDA API — updates as trades are placed</span>
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
              <span style={{ fontSize: 12, color: TEXT, fontWeight: 600 }}>{a.label}</span>
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

// A funded platform's capital and trade-P/L windows on Account Metrics — same
// shape as the OANDA card, but for screenshot-tracked accounts. No goals or
// drawdown (those are only on the funded FTP challenge above).
function FundedCapitalCard({ a, showMoney, isPhone }: { a: FundedAccount; showMoney: boolean; isPhone: boolean }) {
  const ccy = a.currency || 'USD';
  const m = (n: number | null) => (n == null ? '—' : showMoney ? fmtCcy(n, ccy) : '•••••');
  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{a.label}</span>
          <span style={{ ...pill, color: GOLD, border: `1px solid ${GOLD}` }}>{a.platform}</span>
        </div>
        <span style={{ fontSize: 10.5, color: FAINT }}>{a.tradeCount} trade{a.tradeCount === 1 ? '' : 's'} · from screenshots</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2,1fr)', gap: 14 }}>
        <Stat label="Balance" value={m(a.balance)} big />
        <Stat label="Logged P/L" value={m(a.realizedPl)} color={a.realizedPl >= 0 ? GREEN : RED} />
      </div>

      <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>
          Gained from trades <span style={{ color: FAINT, textTransform: 'none', letterSpacing: 0 }}>· deposits excluded</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr 1fr' : 'repeat(3,1fr)', gap: 14 }}>
          <PnlStat label="Today" n={a.pnl.daily} m={m} />
          <PnlStat label="This week" n={a.pnl.weekly} m={m} />
          <PnlStat label="30 days" n={a.pnl.monthly} m={m} />
        </div>
      </div>
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

function Gauge({ title, subtitle, floorLabel, floor, headroom, headroomPct, breached, canSee, showMoney }: {
  title: string; subtitle: string; floorLabel: string; floor: string; headroom: string; headroomPct: number; breached: boolean; canSee: boolean; showMoney: boolean;
}) {
  const p = clamp(headroomPct);
  const color = breached ? RED : p > 0.5 ? GREEN : p > 0.25 ? AMBER : RED;
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{title}</div>
          <div style={{ fontSize: 10.5, color: FAINT }}>{subtitle}</div>
        </div>
        <span style={{ ...pill, color, border: `1px solid ${color}` }}>{breached ? 'Breached' : `${Math.round(p * 100)}% buffer`}</span>
      </div>
      <Bar pct={p} color={color} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: MUTED, marginTop: 8 }}>
        <span>{floorLabel} <b style={{ color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{floor}</b></span>
        <span>Headroom <b style={{ color: breached ? RED : TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{canSee && showMoney ? headroom : canSee ? '•••••' : '—'}</b></span>
      </div>
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 9, background: 'rgba(255,255,255,.06)', borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ width: `${clamp(pct) * 100}%`, height: '100%', background: color, borderRadius: 6, transition: 'width .3s ease' }} />
    </div>
  );
}

function ChallengeForm({ data, busy, onSave, onSync }: { data: ChallengeData; busy: boolean; onSave: (p: ChallengeInput) => void; onSync: () => void }) {
  const [label, setLabel] = useState(data.label);
  const [accountSize, setAccountSize] = useState(String(data.accountSize ?? 200000));
  const [targetPct, setTargetPct] = useState(String(data.targetPct));
  const [dailyDdPct, setDailyDdPct] = useState(String(data.dailyDdPct));
  const [maxDdPct, setMaxDdPct] = useState(String(data.maxDdPct));
  const [trailing, setTrailing] = useState(data.trailing);
  const [equity, setEquity] = useState(String(data.equity ?? data.accountSize ?? 200000));
  const [peak, setPeak] = useState(String(data.peakEquity ?? data.accountSize ?? 200000));
  const [dayStart, setDayStart] = useState(String(data.dayStartEquity ?? data.accountSize ?? 200000));
  const [started, setStarted] = useState(msToDateInput(data.startedAt));

  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : undefined; };

  function save() {
    onSave({
      label: label.trim() || undefined,
      accountSize: num(accountSize),
      targetPct: num(targetPct),
      dailyDdPct: num(dailyDdPct),
      maxDdPct: num(maxDdPct),
      trailing,
      currentEquity: num(equity),
      peakEquity: num(peak),
      dayStartEquity: num(dayStart),
      startedAt: started ? Date.parse(started + 'T00:00:00') || undefined : undefined,
    });
  }

  return (
    <div style={{ ...panel, marginBottom: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>Challenge settings</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Field label="Label"><input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...input, flex: '1 1 160px' }} /></Field>
        <Field label="Account size $"><input value={accountSize} onChange={(e) => setAccountSize(e.target.value)} type="number" style={input} /></Field>
        <Field label="Target %"><input value={targetPct} onChange={(e) => setTargetPct(e.target.value)} type="number" step="any" style={input} /></Field>
        <Field label="Daily DD %"><input value={dailyDdPct} onChange={(e) => setDailyDdPct(e.target.value)} type="number" step="any" style={input} /></Field>
        <Field label="Max DD %"><input value={maxDdPct} onChange={(e) => setMaxDdPct(e.target.value)} type="number" step="any" style={input} /></Field>
        <Field label="Max DD type">
          <select value={trailing ? 'trailing' : 'static'} onChange={(e) => setTrailing(e.target.value === 'trailing')} style={input}>
            <option value="trailing">Trailing</option>
            <option value="static">Static</option>
          </select>
        </Field>
        <Field label="Current equity $"><input value={equity} onChange={(e) => setEquity(e.target.value)} type="number" step="any" style={input} /></Field>
        <Field label="Peak equity $"><input value={peak} onChange={(e) => setPeak(e.target.value)} type="number" step="any" style={input} /></Field>
        <Field label="Day-start equity $"><input value={dayStart} onChange={(e) => setDayStart(e.target.value)} type="number" step="any" style={input} /></Field>
        <Field label="Started"><input value={started} onChange={(e) => setStarted(e.target.value)} type="date" style={input} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>Save</button>
        <button onClick={onSync} disabled={busy} style={ghostBtn} title="Set equity to account size + realized P/L from your Trade Log">Pull equity from Trade Log</button>
      </div>
      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>FTP has no API — keep equity current from your prop dashboard, or pull it from the Trade Log. Day-start equity drives the daily-drawdown floor; reset it each trading day.</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 130px' }}>
      <span style={{ fontSize: 9.5, letterSpacing: '0.4px', textTransform: 'uppercase', color: FAINT }}>{label}</span>
      {children}
    </label>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const label: CSSProperties = { fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 4 };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const pill: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRadius: 5, padding: '2px 8px' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
