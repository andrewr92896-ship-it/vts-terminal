import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import { useAiBrief, BriefButton, BriefCard, BriefError } from '../../components/AiBrief';
import type { FinanceOverview as Data, FtpPhase } from '../../api/types';

const ACCENT = '#6f8bff';
const GREEN = '#35c47b';
const RED = '#ef5468';
const GOLD = '#e0a23a';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(20,26,62,.5)';
const PANEL = 'rgba(14,18,46,.6)';
const INPUT_BG = '#12162f';
const BORDER = '#262e57';
const BORDER2 = '#2e3766';

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function FinanceOverview() {
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);
  const [scaleVal, setScaleVal] = useState('');
  const ai = useAiBrief(api.financeOverviewBrief);

  // Claude quick-add (plain-English: expenses, net-worth items, FTP settings)
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteReply, setNoteReply] = useState<string | null>(null);
  const [noteSkipped, setNoteSkipped] = useState<string[]>([]);

  async function load() {
    try { const d = await api.financeOverview(); setData(d); setScaleVal(String(d.settings.ftpPhase === 'funded' ? d.settings.ftpPayoutPct : d.settings.ftpDivisor)); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
  }
  useEffect(() => { void load(); }, []);

  async function save(patch: { ftpPhase?: FtpPhase; ftpDivisor?: number; ftpPayoutPct?: number }) {
    setBusy(true);
    try { const d = await api.financeUpdateSettings(patch); setData(d); setScaleVal(String(d.settings.ftpPhase === 'funded' ? d.settings.ftpPayoutPct : d.settings.ftpDivisor)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  }

  async function quickAdd() {
    const text = note.trim();
    if (!text || noteBusy) return;
    setNoteBusy(true);
    setErr(null);
    try {
      const r = await api.financeCommand(text);
      if (r.overview) setData(r.overview);
      setNoteReply(r.reply);
      setNoteSkipped(r.skipped);
      if (r.applied.length) setNote('');
    } catch (e) {
      setErr(
        e instanceof ApiError
          ? e.status === 503
            ? 'Claude isn’t configured yet — an API key needs to be set on the server.'
            : e.message
          : 'Could not add that',
      );
    } finally {
      setNoteBusy(false);
    }
  }

  if (err) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading…</div>;

  const showMoney = !privacy && !hideMoney;
  const money = (n: number) => (showMoney ? usd(n) : '•••••');
  const e = data.earnings;
  const x = data.expenses;
  const funded = data.settings.ftpPhase === 'funded';

  function setPhase(p: FtpPhase) { if (p !== data!.settings.ftpPhase) void save({ ftpPhase: p }); }
  function saveScale() {
    const v = Number(scaleVal);
    if (!Number.isFinite(v)) return;
    void save(funded ? { ftpPayoutPct: v } : { ftpDivisor: v });
  }

  const sources = [
    { label: 'Car sales commission', value: e.kiaCommission, sub: 'Kia tracker, this month' },
    { label: 'Trading (real brokers)', value: e.tradingReal, sub: 'OANDA · Kraken closed P/L' },
  ];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Personal Finance</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>Take-home across every job & business — {data.monthLabel}.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <BriefButton onClick={ai.run} busy={ai.busy} accent={ACCENT} accentText="#0a1226" />
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $' : 'Hide $'}</button>
        </div>
      </div>

      {ai.brief && <BriefCard brief={ai.brief} accent={ACCENT} onDismiss={ai.dismiss} />}
      {ai.error && <BriefError message={ai.error} onDismiss={ai.dismiss} />}

      {/* Claude quick-add */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          Quick add
          <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: FAINT, letterSpacing: 0 }}>Sonnet</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            onKeyDown={(ev) => ev.key === 'Enter' && quickAdd()}
            placeholder='Add in plain English, e.g. "Add a $120 phone bill on the 15th" or "Add my car worth 18000 as an asset"'
            style={{ ...input, flex: 1 }}
          />
          <button onClick={quickAdd} disabled={noteBusy || !note.trim()} style={{ ...accentBtn, opacity: noteBusy || !note.trim() ? 0.6 : 1 }}>
            {noteBusy ? '…' : 'Add'}
          </button>
        </div>
        {noteReply && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#a7d8bf', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: GREEN }}>✓</span> {noteReply}
            <button onClick={() => { setNoteReply(null); setNoteSkipped([]); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: FAINT, fontSize: 10.5, cursor: 'pointer' }}>dismiss</button>
          </div>
        )}
        {noteSkipped.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: GOLD }}>Skipped: {noteSkipped.join('; ')}</div>
        )}
      </div>

      {/* This month headline */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3,1fr)', gap: 14 }}>
          <Stat label="Earnings this month" value={money(e.total)} color="#fff" big />
          <Stat label="Expenses" value={money(x.total)} color={GOLD} big />
          <Stat label="Left after bills" value={money(data.net)} color={data.net >= 0 ? GREEN : RED} big sub={data.net >= 0 ? 'bills covered + extra' : 'short this month'} />
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginBottom: 6 }}>
            <span>Bills covered</span>
            <span>{Math.round(clamp(data.billsCoveredPct) * 100)}%{x.total > 0 ? ` of ${money(x.total)}` : ''}</span>
          </div>
          <Bar pct={clamp(data.billsCoveredPct)} color={data.billsCoveredPct >= 1 ? GREEN : data.billsCoveredPct >= 0.5 ? GOLD : RED} />
        </div>
      </div>

      {/* Earnings sources */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={sectionLabel}>Earnings sources</div>
        {sources.map((s) => (
          <Row key={s.label} label={s.label} sub={s.sub} value={money(s.value)} />
        ))}

        {/* FTP — scaled simulation */}
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Funded Trading Plus</div>
              <div style={{ fontSize: 10.5, color: FAINT }}>Simulated P/L {money(e.ftpRaw)} → counted as {money(e.ftpScaled)}</div>
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 700, color: ACCENT }}>{money(e.ftpScaled)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
              {(['testing', 'funded'] as FtpPhase[]).map((p) => (
                <button key={p} onClick={() => setPhase(p)} disabled={busy} style={{ ...seg, ...(data.settings.ftpPhase === p ? segOn : {}) }}>
                  {p === 'testing' ? 'Testing' : 'Funded'}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: MUTED }}>{funded ? 'Payout % of P/L' : 'Divide P/L by'}</span>
            <input value={scaleVal} onChange={(ev) => setScaleVal(ev.target.value)} onBlur={saveScale} onKeyDown={(ev) => ev.key === 'Enter' && saveScale()} type="number" step="any" style={{ ...input, width: 90 }} />
            <span style={{ fontSize: 11, color: FAINT }}>{funded ? '%' : '÷'}</span>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Total earnings</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: GREEN }}>{money(e.total)}</span>
        </div>
      </div>

      {/* Net worth mini */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={sectionLabel}>Net Worth</div>
          <div style={{ fontSize: 11, color: FAINT }}>Assets {money(data.netWorth.assets)} · Liabilities {money(data.netWorth.liabilities)} — manage in the Net Worth tab</div>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 700, color: data.netWorth.total >= 0 ? '#fff' : RED }}>{money(data.netWorth.total)}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, color, big, sub }: { label: string; value: string; color: string; big?: boolean; sub?: string }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: big ? 24 : 18, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: FAINT, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
function Row({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BORDER}` }}>
      <div><div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{label}</div><div style={{ fontSize: 10.5, color: FAINT }}>{sub}</div></div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: TEXT }}>{value}</div>
    </div>
  );
}
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 9, background: 'rgba(255,255,255,.06)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ width: `${clamp(pct) * 100}%`, height: '100%', background: color, borderRadius: 6, transition: 'width .3s ease' }} />
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 };
const sectionLabel: CSSProperties = { fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 8 };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '8px 10px', outline: 'none' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 12px', borderRadius: 7, cursor: 'pointer' };
const accentBtn: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: '#0a1226', background: ACCENT, border: 'none', padding: '8px 18px', borderRadius: 7, cursor: 'pointer' };
const seg: CSSProperties = { background: 'none', border: 'none', color: MUTED, fontSize: 11.5, fontWeight: 600, padding: '7px 13px', cursor: 'pointer' };
const segOn: CSSProperties = { background: 'rgba(111,139,255,.18)', color: ACCENT };
