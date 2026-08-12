import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { useAiBrief, BriefButton, BriefCard, BriefError } from '../../components/AiBrief';
import { ReviewMark } from '../../components/ReviewMark';
import { readClipboardImage, imageFromPasteEvent } from '../../lib/clipboard';
import { FundedLiveTrades } from './FundedLiveTrades';
import { FundedPastTrades } from './FundedPastTrades';
import { FundedStats } from './FundedStats';
import { etDateTimeFull } from './etClock';
import { etSince } from './tradeTime';
import { useLivePrices } from './useLivePrices';
import type { ChallengeData, ChallengeInput, FundedData } from '../../api/types';

// The private Funded section: a prop-firm challenge dashboard (equity vs. target
// + daily / max drawdown buffers). Revealed only to holders of the admin-assigned
// `funded` role — never shown in the demo or to the public. Hand-logged trades
// live on the separate, public "Manual Trades" tab; this screen is just the
// challenge tracker.

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
const pct1 = (f: number) => `${(f * 100).toFixed(1)}%`;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function msToDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS: Record<ChallengeData['metrics']['status'], { label: string; color: string }> = {
  active: { label: 'On Track', color: GREEN },
  passed: { label: 'Target Reached', color: GOLD },
  breached: { label: 'Breached', color: RED },
};

// The Funded screen: every funded account the trader's desk is running.
//
// **A funded account is shared with the team and owned by one trader.** The
// server answers with the caller's own accounts plus their teammates' — the
// latter only on a desk holding the Trading Teams grant, so an ordinary account
// still sees exactly its own. A teammate's card is watch-only, and that is
// enforced on the server (every write matches the account against the caller);
// `isMine` only decides whether the controls are drawn at all.
export function FundedChallengeScreen() {
  const { privacy } = usePrivacy();
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [challenges, setChallenges] = useState<ChallengeData[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);
  const ai = useAiBrief(api.tradingMetricsBrief);

  useEffect(() => {
    let alive = true;
    api
      .tradingChallenges()
      .then((d) => alive && setChallenges(d.challenges))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load'));
    return () => { alive = false; };
  }, []);

  // One card's save/sync/screenshot, folded back into the list by id so the
  // other accounts on screen are left exactly as they were.
  function replace(next: ChallengeData) {
    setChallenges((list) => (list ?? []).map((c) => (c.id === next.id ? next : c)));
  }

  async function runList(p: Promise<{ challenges: ChallengeData[] }>) {
    setBusy(true);
    try { setChallenges((await p).challenges); setActionError(null); return true; }
    catch (e) { setActionError(e instanceof ApiError ? e.message : 'Action failed'); return false; }
    finally { setBusy(false); }
  }

  if (loadError) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!challenges) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>{"Loading funded accounts…"}</div>;

  // The brokerage-view gate is the same answer on every card, so the page-level
  // money toggle reads it off the first.
  const canSee = challenges[0]?.canSeeBalances ?? true;
  const showMoney = canSee && !privacy && !hideMoney;
  const mine = challenges.filter((c) => c.isMine);
  const theirs = challenges.filter((c) => !c.isMine);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{"Funded"}</h2>
            <span style={privatePill} title="Private section — visible only to accounts an admin has granted the Funded role">{"Private"}</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
            {theirs.length > 0
              ? `Prop-firm accounts — ${mine.length} of yours and ${theirs.length} belonging to others in your group. You can watch theirs; only they can change them.`
              : 'Your prop-firm accounts — equity against target, and how much drawdown is left on each.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BriefButton onClick={ai.run} busy={ai.busy} accent={GOLD} accentText="#0c2768" />
          {/* The AI read of a challenge is coaching on trading performance —
              flagged for review, and visible only to founder level. */}
          <ReviewMark id="metricsCoach" size={12} />
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
          {!readOnly && (
            <button onClick={() => void runList(api.addChallenge())} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
              {"＋ Add a funded account"}
            </button>
          )}
        </div>
      </div>

      {ai.brief && <BriefCard brief={ai.brief} accent={GOLD} onDismiss={ai.dismiss} />}
      {ai.error && <BriefError message={ai.error} onDismiss={ai.dismiss} />}

      {actionError && <div onClick={() => setActionError(null)} style={banner}>{actionError} — click to dismiss.</div>}

      <div style={{ display: 'grid', gap: 18 }}>
        {challenges.map((c) => (
          <ChallengeCard
            key={c.id}
            data={c}
            showMoney={showMoney}
            readOnly={readOnly}
            // Only the trader's own single account takes a window-wide paste:
            // with several on screen, a paste that silently lands on one of them
            // is a trap rather than a shortcut.
            windowPaste={c.isMine && mine.length === 1}
            onChanged={replace}
            onRemoved={() => runList(api.removeChallenge(c.id))}
            onError={setActionError}
          />
        ))}
      </div>

      {/* The funded book: its own stats, its open positions, and its completed
          trades — shared across the desk the same way the accounts above are.
          Only for full traders — the funded book is write-gated, so a read-only
          viewer would get a 403 and an empty card. */}
      {!readOnly && <FundedBook showMoney={showMoney} readOnly={readOnly} />}

      {!canSee && (
        <div style={{ ...panel, marginTop: 14, fontSize: 12, color: MUTED }}>
          {"Dollar figures are hidden because your account doesn’t have the brokerage-view permission. Targets and drawdown buffers are still shown as percentages."}
        </div>
      )}
    </div>
  );
}

// One funded account: its equity against target, its two drawdown floors, and —
// when the viewer owns it — the controls that keep it current.
function ChallengeCard({
  data,
  showMoney,
  readOnly,
  windowPaste,
  onChanged,
  onRemoved,
  onError,
}: {
  data: ChallengeData;
  showMoney: boolean;
  readOnly: boolean;
  windowPaste: boolean;
  onChanged: (c: ChallengeData) => void;
  onRemoved: () => void;
  onError: (e: string | null) => void;
}) {
  const { isPhone } = useResponsive();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const canWrite = data.isMine && !readOnly;

  // Read the current balance off an account screenshot and set this account's
  // equity from it.
  function readBalanceShot(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/') || !canWrite) return;
    setShotMsg(null);
    const reader = new FileReader();
    reader.onload = async () => {
      setShotBusy(true);
      onError(null);
      try {
        const res = await api.analyzeChallengeBalance(data.id, { imageBase64: reader.result as string, mediaType: file.type });
        onChanged(res.challenge);
        const read = res.parsed.equity ?? res.parsed.balance;
        setShotMsg(read != null ? `Equity set to ${usd(read)} — ${res.parsed.summary}` : res.parsed.summary);
      } catch (e) {
        onError(e instanceof ApiError ? e.message : 'Could not read that screenshot');
      } finally {
        setShotBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  // Ctrl/Cmd+V anywhere on the screen reads a balance onto this account — only
  // when it is the trader's one and only, so the paste has a single obvious home.
  useEffect(() => {
    if (!canWrite || !windowPaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromPasteEvent(e);
      if (file) { e.preventDefault(); readBalanceShot(file); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite, windowPaste, data.id]);

  async function run(p: Promise<ChallengeData>) {
    setBusy(true);
    try { onChanged(await p); onError(null); return true; }
    catch (e) { onError(e instanceof ApiError ? e.message : 'Action failed'); return false; }
    finally { setBusy(false); }
  }

  const canSee = data.canSeeBalances;
  const m = data.metrics;
  const st = STATUS[m.status];
  const dollars = (n: number | null) => (n == null ? '—' : showMoney ? usd(n) : '•••••');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{data.label}</span>
          <span style={{ ...pill, color: st.color, border: `1px solid ${st.color}` }}>{st.label}</span>
          {/* Whose account this is. Only drawn on a teammate's — labelling your
              own "you" on a solo desk is noise. */}
          {!data.isMine && <span style={ownerPill}>{data.owner}</span>}
          <span style={{ fontSize: 11, color: FAINT }}>
            {canSee ? `${usd(data.accountSize ?? 0)} account` : 'funded account'} · {data.targetPct}% target ·{' '}
            {data.dailyDdPct}% daily / {data.maxDdPct}% {data.trailing ? 'trailing' : 'max'}
          </span>
        </div>
        {canWrite && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setEditing((v) => !v)} style={ghostBtn}>{editing ? 'Close' : 'Edit'}</button>
            <button
              onClick={() => {
                if (window.confirm(`Remove the “${data.label}” funded account? Its settings and equity go with it.`)) onRemoved();
              }}
              style={{ ...ghostBtn, color: '#cf6a78' }}
            >
              {"Remove"}
            </button>
          </div>
        )}
      </div>

      {editing && canWrite && (
        <ChallengeForm
          data={data}
          busy={busy}
          onSave={async (patch) => { if (await run(api.updateChallenge(data.id, patch))) setEditing(false); }}
          onSync={() => run(api.syncChallengeEquity(data.id))}
        />
      )}

      {canWrite && (
        <div style={{ ...panel, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>{"Update balance from a screenshot"}</div>
            <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>
              {"No API here — VTS AI reads the balance off a screenshot of your account and sets this equity from it."}
            </div>
            {shotMsg && <div style={{ fontSize: 11.5, color: GREEN, marginTop: 6 }}>{shotMsg}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                const file = await readClipboardImage();
                if (file) readBalanceShot(file);
                else onError('No image found on the clipboard — copy a screenshot first, or use Upload.');
              }}
              disabled={shotBusy}
              style={{ ...ghostBtn, opacity: shotBusy ? 0.6 : 1 }}
            >
              {"Paste"}
            </button>
            <label style={{ ...goldBtn, opacity: shotBusy ? 0.6 : 1, cursor: shotBusy ? 'default' : 'pointer' }}>
              {shotBusy ? "Reading…" : "Upload screenshot"}
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

      {/* Equity + progress to target, led by the stamp that qualifies all of it. */}
      <div style={{ ...card, marginBottom: 14 }}>
        <LastUpdated at={data.updatedAt} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={label}>{"Current Equity"}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color: '#fff' }}>{dollars(data.equity)}</div>
          </div>
          <div style={{ textAlign: isPhone ? 'left' : 'right' }}>
            <div style={label}>{"Profit"}</div>
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

      {/* Drawdown gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 14 }}>
        <Gauge title="Max Drawdown" subtitle={`${data.trailing ? 'Trailing' : 'Static'} · ${data.maxDdPct}%`} floorLabel="Floor" floor={dollars(m.maxFloor)} headroom={dollars(m.maxHeadroom)} headroomPct={m.maxHeadroomPct} breached={m.breaches.max} canSee={canSee} showMoney={showMoney} />
        <Gauge title="Daily Drawdown" subtitle={`Resets daily · ${data.dailyDdPct}%`} floorLabel="Today's floor" floor={dollars(m.dailyFloor)} headroom={dollars(m.dailyHeadroom)} headroomPct={m.dailyHeadroomPct} breached={m.breaches.daily} canSee={canSee} showMoney={showMoney} />
      </div>
    </div>
  );
}

// WHEN THIS ACCOUNT WAS LAST TOUCHED — the first thing on the equity card,
// because it qualifies every figure under it.
//
// A prop firm has no API, so nothing on this screen refreshes itself: the
// equity, both drawdown floors and the progress bar are all derived from a
// number the trader last typed in, synced from the Trade Log, or read off a
// screenshot. A three-day-old equity renders identically to one set a minute
// ago, which on the gauge that says whether a challenge is about to be breached
// is the worst thing a stale figure can do quietly. So the stamp is stated
// outright, in full, rather than left to be inferred.
//
// **Eastern, whatever zone the reader displays in** — the exception the timezone
// module carves out for anything cut on the trading day. The daily-drawdown
// floor beneath this rolls on the ET calendar day, so "updated 9:40 PM" only
// answers "was this before or after today's reset" if it is an Eastern reading.
// The zone is named on the stamp for exactly that reason.
//
// The relative age sits beside it because on a hand-kept account that is the
// reading people actually act on; the absolute stamp is what makes it precise.
function LastUpdated({ at }: { at: number }) {
  return (
    <div style={updatedBar}>
      <span style={updatedTag}>{"Last updated"}</span>
      <span style={updatedStamp}>{etDateTimeFull(at)}</span>
      <span style={updatedAge}>{etSince(at)}</span>
    </div>
  );
}

// The funded book, on one copy of the data.
//
// The three cards below all read the same trades — the stats score them, the
// live card watches the open ones, the past card lists the closed ones — so the
// fetch lives here rather than in each. Closing a trade from the live card
// therefore moves the win rate above it in the same render, and the screen polls
// the Live Wall once instead of once per card.
//
// These figures are the FUNDED account alone. A funded trade never reconciles
// into trading_positions, so it reaches neither the Trade Log nor Live Brokers,
// and nothing here is ever added to the desk's own numbers.
function FundedBook({ showMoney, readOnly }: { showMoney: boolean; readOnly: boolean }) {
  const live = useLivePrices();
  const [data, setData] = useState<FundedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .funded()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load funded trades'));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      {data && <FundedStats accounts={data.accounts} showMoney={showMoney} live={live} />}
      <FundedLiveTrades data={data} loadError={loadError} live={live} onData={setData} showMoney={showMoney} readOnly={readOnly} />
      <FundedPastTrades data={data} loadError={loadError} onData={setData} showMoney={showMoney} readOnly={readOnly} />
    </>
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
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{"Challenge settings"}</div>
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
        <button onClick={save} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>{"Save"}</button>
        <button onClick={onSync} disabled={busy} style={ghostBtn} title="Set equity to account size + realized P/L from your Trade Log">{"Pull equity from Trade Log"}</button>
      </div>
      <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>{"No API here — keep equity current from your prop dashboard, or pull it from the Trade Log. Day-start equity drives the daily-drawdown floor and rolls onto your current equity at the start of each Eastern trading day."}</div>
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
// The last-updated strip. Gold-on-navy and boxed so it reads as its own
// statement rather than as a caption on the equity below it, and `flexWrap` so
// the stamp keeps its size on a phone instead of being squeezed or clipped —
// the bar grows taller, the same rule the employee portal's nav follows.
const updatedBar: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexWrap: 'wrap',
  background: 'rgba(235,203,116,.09)',
  border: '1px solid rgba(235,203,116,.4)',
  borderRadius: 9,
  padding: '10px 13px',
  marginBottom: 16,
};
const updatedTag: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: MUTED };
// `nowrap` so the stamp breaks BETWEEN the three parts of the strip rather than
// inside itself — at 390px the bar wraps to "Last updated" / the stamp / the
// age, which reads fine, whereas a date split after its comma does not.
const updatedStamp: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 700, color: GOLD, letterSpacing: '0.2px', whiteSpace: 'nowrap' };
const updatedAge: CSSProperties = { fontSize: 11.5, color: FAINT };
const privatePill: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: FAINT, background: 'rgba(159,176,214,.1)', border: `1px solid ${BORDER2}`, borderRadius: 5, padding: '2px 8px' };
// Whose account a card is — drawn only on a teammate's.
const ownerPill: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.4px', color: '#bcd0ff', background: 'rgba(90,200,250,.1)', border: '1px solid rgba(90,200,250,.35)', borderRadius: 5, padding: '2px 8px' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
