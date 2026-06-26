import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { useAiBrief, BriefButton, BriefCard, BriefError } from '../../components/AiBrief';
import { readClipboardImage, imageFromPasteEvent } from '../../lib/clipboard';
import { FundedManager } from './Funded';
import type { ChallengeData, ChallengeInput, FundedAccount } from '../../api/types';

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

export function FundedScreen() {
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
  const [importing, setImporting] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const ai = useAiBrief(api.tradingMetricsBrief);

  useEffect(() => {
    let alive = true;
    api.tradingChallenge().then((d) => alive && setData(d)).catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load'));
    return () => { alive = false; };
  }, []);

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
  const showMoney = canSee && !privacy && !hideMoney; // FTP challenge figures (brokerage-view gated)
  // Funded/prop capital is a separate data source with no per-account brokerage
  // permission — mask it off privacy + the page Hide-$ toggle only.
  const showCapital = !privacy && !hideMoney;
  const m = data.metrics;
  const st = STATUS[m.status];
  const dollars = (n: number | null) => (n == null ? '—' : showMoney ? usd(n) : '•••••');

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Funded</h2>
            <span style={{ ...pill, color: st.color, border: `1px solid ${st.color}` }}>{data.label} · {st.label}</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
            Everything for your funded account in one place: your {data.label} prop challenge
            ({canSee ? `${usd(data.accountSize ?? 0)} account` : 'funded account'} · {data.targetPct}% target · {data.dailyDdPct}% daily / {data.maxDdPct}% {data.trailing ? 'trailing' : 'max'} drawdown), plus your funded/prop accounts and their trades.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BriefButton onClick={ai.run} busy={ai.busy} accent={GOLD} accentText="#0c2768" />
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
          {!readOnly && (
            <button onClick={() => setImporting((v) => !v)} style={ghostBtn}>{importing ? 'Close' : 'Paste funded trades'}</button>
          )}
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

      {/* Funded / prop accounts — capital + trade P/L, full traders only (hidden
          from the view-only role, like the rest of the capital figures). */}
      {!readOnly && (
        <>
          <SectionLabel>Funded / prop accounts</SectionLabel>
          {importing && <FundedImportPanel onClose={() => setImporting(false)} />}
          <FundedManager showMoney={showCapital} readOnly={readOnly} />
        </>
      )}
    </div>
  );
}

// A divider + label introducing a group of account cards on the Funded screen.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: GOLD }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: BORDER }} />
    </div>
  );
}

// ---- Paste/upload completed funded-account trades ----
// The trades are saved to the funded account; Claude reads the trades (and the
// account equity, if shown) off the screenshot. Duplicates are skipped by time
// + profit. This is the same importer that used to live on the Trade Log.
function FundedImportPanel({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<FundedAccount[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [newName, setNewName] = useState('');
  const [platform, setPlatform] = useState('FTP');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .funded()
      .then((d) => {
        if (!alive) return;
        setAccounts(d.accounts);
        if (d.accounts[0]) setAccountId(d.accounts[0].id);
      })
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  const creatingNew = accountId === '';

  async function ensureAccount(): Promise<string | null> {
    if (accountId) return accountId;
    const name = newName.trim();
    if (!name) {
      setError('Pick an account, or name a new one to create.');
      return null;
    }
    const d = await api.addFundedAccount({ platform: platform.trim() || 'FTP', label: name });
    const created = d.accounts.find((a) => a.label === name) ?? d.accounts[d.accounts.length - 1];
    setAccounts(d.accounts);
    setAccountId(created?.id ?? '');
    return created?.id ?? null;
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Could not read the file'));
      r.readAsDataURL(file);
    });
  }

  async function handleFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const id = await ensureAccount();
      if (!id) return;
      const dataUrl = await fileToDataUrl(file);
      const res = await api.importFundedTrades(id, { imageBase64: dataUrl, mediaType: file.type });
      setAccounts(res.funded.accounts);
      const parts = [`${res.added} added`];
      if (res.skipped) parts.push(`${res.skipped} duplicate${res.skipped === 1 ? '' : 's'} skipped`);
      if (res.ignored) parts.push(`${res.ignored} ignored`);
      if (res.balanceSet != null) parts.push('balance updated');
      setMsg(`${parts.join(' · ')} — added to the account below.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    const file = await readClipboardImage();
    if (file) void handleFile(file);
    else setError('No image found on the clipboard — copy a screenshot first, or use Upload.');
  }

  return (
    <div style={{ ...panel, marginBottom: 16 }}>
      <div style={panelLabel}>Paste completed funded-account trades</div>
      <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10 }}>
        Claude reads the trades (and the account equity, if shown) off the screenshot and logs them on a funded
        account. Duplicates are skipped by time + profit.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {accounts === null ? (
          <span style={{ fontSize: 12, color: MUTED }}>Loading accounts…</span>
        ) : (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...input, flex: '0 0 200px', width: 'auto' }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.platform} · {a.label}</option>
            ))}
            <option value="">＋ New account…</option>
          </select>
        )}
        {creatingNew && accounts !== null && (
          <>
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Platform" style={{ ...input, flex: '0 0 130px', width: 'auto' }} />
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New account name" style={{ ...input, flex: '1 1 160px', width: 'auto' }} />
          </>
        )}
        <button onClick={paste} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>Paste</button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Reading…' : 'Upload screenshot'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { void handleFile(e.target.files?.[0]); e.currentTarget.value = ''; }} style={{ display: 'none' }} />
        <button onClick={onClose} style={ghostBtn}>Done</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: GREEN, marginTop: 10 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12, color: '#ffb4ab', marginTop: 10 }}>{error}</div>}
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
const panelLabel: CSSProperties = { fontSize: 10.5, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 };
const label: CSSProperties = { fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 4 };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' };
const pill: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', borderRadius: 5, padding: '2px 8px' };
const goldBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GOLD},#C9A24B)`, color: '#0c2768', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
