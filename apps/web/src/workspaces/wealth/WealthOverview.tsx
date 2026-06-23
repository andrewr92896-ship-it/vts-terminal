import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy, maskName } from '../../privacy/privacy';
import { useAiBrief, BriefButton, BriefCard, BriefError } from '../../components/AiBrief';
import type { PracticeOverview, WealthClientStatus } from '../../api/types';

// Wealth workspace palette — the dark green "pro-terminal" theme, hardcoded so
// the screen is self-contained (mirrors WealthClients / KiaDashboard).
const GREEN = '#34b87a';
const CARD = '#0e1a15';
const PANEL = '#0a201a';
const BORDER = '#1d4a38';
const TEXT = '#eaf3ee';
const MUTED = '#8fb3a3';
const FAINT = '#5f7d6f';

const usd = (n: number) => '$' + n.toLocaleString('en-US');
const usdCompact = (n: number) => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + 'K';
  return '$' + n.toLocaleString('en-US');
};

const STATUS_META: Record<WealthClientStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: GREEN },
  onboarding: { label: 'Onboarding', color: '#5fb0e0' },
  prospect: { label: 'Prospect', color: '#e0a23a' },
  inactive: { label: 'Inactive', color: '#7d8a83' },
};

function fmtAgo(ms: number): string {
  const diff = Date.now() - ms;
  const d = Math.floor(diff / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return mo === 1 ? '1mo ago' : `${mo}mo ago`;
}

export function WealthOverview({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const [data, setData] = useState<PracticeOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hideMoney, setHideMoney] = useState(false);
  const ai = useAiBrief(api.wealthOverviewBrief);

  // Claude quick-add (clients, portfolios, plans, compliance items)
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteReply, setNoteReply] = useState<string | null>(null);
  const [noteSkipped, setNoteSkipped] = useState<string[]>([]);

  async function quickAdd() {
    const text = note.trim();
    if (!text || noteBusy) return;
    setNoteBusy(true);
    setErr(null);
    try {
      const r = await api.wealthCommand(text);
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

  useEffect(() => {
    let alive = true;
    api
      .wealthOverview()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : 'Failed to load'));
    return () => { alive = false; };
  }, []);

  if (err) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading practice overview…</div>;

  const showMoney = !hideMoney && !privacy;
  const money = (n: number) => (showMoney ? usd(n) : '•••••');
  const moneyC = (n: number) => (showMoney ? usdCompact(n) : '•••');

  const { summary } = data;
  const maxBreakdown = Math.max(1, ...data.breakdown.map((b) => b.count));
  const empty = summary.totalClients === 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Practice Overview</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>A snapshot of the advisory book — assets under management, client mix, and recent activity.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!empty && <BriefButton onClick={ai.run} busy={ai.busy} accent={GREEN} />}
          <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>{hideMoney ? 'Show $ details' : 'Hide $ details'}</button>
        </div>
      </div>

      {ai.brief && <BriefCard brief={ai.brief} accent={GREEN} onDismiss={ai.dismiss} />}
      {ai.error && <BriefError message={ai.error} onDismiss={ai.dismiss} />}

      {/* Claude quick-add */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          Quick add
          <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: FAINT, letterSpacing: 0 }}>Sonnet</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            placeholder='Plain English: "Add client Jane Doe, active, $250k" or "Add a CPI filing due July 30"'
            style={inputStyle}
          />
          <button onClick={quickAdd} disabled={noteBusy || !note.trim()} style={{ ...greenBtn, opacity: noteBusy || !note.trim() ? 0.6 : 1 }}>
            {noteBusy ? '…' : 'Add'}
          </button>
        </div>
        {noteReply && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#a7e0c4', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: GREEN }}>✓</span> {noteReply}
            <button onClick={() => { setNoteReply(null); setNoteSkipped([]); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: FAINT, fontSize: 10.5, cursor: 'pointer' }}>dismiss</button>
          </div>
        )}
        {noteSkipped.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#e0a23a' }}>Skipped: {noteSkipped.join('; ')}</div>
        )}
      </div>

      {empty ? (
        <div style={{ ...card, textAlign: 'center', padding: '44px 24px' }}>
          <div style={{ fontSize: 14, color: TEXT, marginBottom: 6 }}>Your book is empty.</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 16 }}>Add your first client to start tracking AUM and pipeline.</div>
          {onNavigate && <button onClick={() => onNavigate('wm_clients')} style={greenBtn}>Go to Clients →</button>}
        </div>
      ) : (
        <>
          {/* Headline metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            <Metric label="Assets under mgmt" value={moneyC(summary.totalAum)} sub={`${money(summary.totalAum)}`} accent />
            <Metric label="Clients" value={String(summary.totalClients)} sub={`${summary.activeClients} active`} />
            <Metric label="Avg account" value={moneyC(data.avgAccount)} sub="of valued clients" />
            <Metric label="Largest" value={moneyC(data.largestAccount)} sub="top relationship" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
            {/* Book by status */}
            <div style={card}>
              <SectionHeader title="Book by status" action={onNavigate ? { label: 'All clients →', onClick: () => onNavigate('wm_clients') } : undefined} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 4 }}>
                {data.breakdown.map((b) => {
                  const m = STATUS_META[b.status];
                  return (
                    <div key={b.status}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
                          <span style={{ fontSize: 12.5, color: TEXT }}>{m.label}</span>
                          <span style={{ fontSize: 11, color: FAINT }}>· {b.count}</span>
                        </span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: MUTED }}>{moneyC(b.aum)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: '#10241c', overflow: 'hidden' }}>
                        <div style={{ width: `${(b.count / maxBreakdown) * 100}%`, height: '100%', background: m.color, opacity: 0.8 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: MUTED }}>Pipeline ({data.pipelineCount} prospect/onboarding)</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: TEXT }}>{money(data.pipelineValue)}</span>
              </div>
            </div>

            {/* Top relationships */}
            <div style={card}>
              <SectionHeader title="Top relationships" />
              {data.topClients.length === 0 ? (
                <div style={{ fontSize: 12, color: FAINT, fontStyle: 'italic', padding: '8px 0' }}>No clients with a recorded account value yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {data.topClients.map((c, i) => {
                    const m = STATUS_META[c.status];
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < data.topClients.length - 1 ? `1px solid #12251d` : 'none' }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: FAINT, width: 16 }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{maskName(c.name, privacy, 'Client')}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: m.color, border: `1px solid ${m.color}`, borderRadius: 4, padding: '1px 6px' }}>{m.label}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: TEXT, width: 74, textAlign: 'right' }}>{moneyC(c.accountValue)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div style={{ ...card, marginTop: 16 }}>
            <SectionHeader title="Recent activity" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data.recent.map((c, i) => {
                const m = STATUS_META[c.status];
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < data.recent.length - 1 ? `1px solid #12251d` : 'none' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{maskName(c.name, privacy, 'Client')}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>{m.label}</span>
                    <span style={{ fontSize: 11, color: FAINT, width: 78, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{fmtAgo(c.updatedAt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? GREEN : '#fff', marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, fontWeight: 600 }}>{title}</span>
      {action && <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: GREEN, fontSize: 11.5, cursor: 'pointer', padding: 0 }}>{action.label}</button>}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const greenBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GREEN},#239160)`, color: '#05231a', fontWeight: 700, fontSize: 12.5, padding: '9px 16px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#cfe6da', background: PANEL, border: `1px solid ${BORDER}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const sectionLabel: CSSProperties = { fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED };
const inputStyle: CSSProperties = { flex: 1, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 12px', color: TEXT, fontSize: 12.5, outline: 'none' };
