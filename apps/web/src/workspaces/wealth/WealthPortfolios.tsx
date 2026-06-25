import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import type {
  Allocation,
  AllocationInput,
  AssetClass,
  Portfolio,
  PortfolioInput,
  PortfolioRisk,
  PortfoliosData,
} from '../../api/types';

// Wealth palette (mirrors WealthClients / WealthOverview).
const GREEN = '#34b87a';
const CARD = '#0e1a15';
const PANEL = '#0a201a';
const BORDER = '#1d4a38';
const INPUT_BG = '#081410';
const TEXT = '#eaf3ee';
const MUTED = '#8fb3a3';
const FAINT = '#5f7d6f';
const AMBER = '#e0a23a';

const RISKS: { key: PortfolioRisk; label: string }[] = [
  { key: 'conservative', label: 'Conservative' },
  { key: 'moderate_conservative', label: 'Moderately Conservative' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'moderate_aggressive', label: 'Moderately Aggressive' },
  { key: 'aggressive', label: 'Aggressive' },
];
const riskLabel = (r: PortfolioRisk) => RISKS.find((x) => x.key === r)?.label ?? 'Moderate';

const CLASS_META: Record<AssetClass, { label: string; color: string }> = {
  us_equity: { label: 'US Equity', color: '#34b87a' },
  intl_equity: { label: 'Intl Equity', color: '#46c2a8' },
  fixed_income: { label: 'Fixed Income', color: '#5fb0e0' },
  real_assets: { label: 'Real Assets', color: '#c79a4b' },
  cash: { label: 'Cash', color: '#9aa6a0' },
  alternative: { label: 'Alternative', color: '#a07ce0' },
  other: { label: 'Other', color: '#7d8a83' },
};
const CLASS_KEYS = Object.keys(CLASS_META) as AssetClass[];

const pct = (bp: number) => (bp / 100).toFixed(bp % 100 === 0 ? 0 : 1) + '%';

export function WealthPortfolios() {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const [data, setData] = useState<PortfoliosData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    try { setData(await api.wealthPortfolios()); setErr(null); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
  }
  useEffect(() => { void load(); }, []);

  async function run(p: Promise<PortfoliosData>): Promise<boolean> {
    setBusy(true);
    try { setData(await p); setErr(null); return true; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }

  if (err && !data) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading portfolios…</div>;

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Model Portfolios</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>Target allocations by risk level. Each sleeve carries a target weight; a model is balanced when its weights total 100%.</div>
        </div>
        {!readOnly && <button onClick={() => setAdding((v) => !v)} style={greenBtn}>{adding ? 'Close' : '+ New portfolio'}</button>}
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {!readOnly && adding && (
        <PortfolioForm busy={busy} submitLabel="Create portfolio" onSubmit={async (input) => { if (await run(api.wealthAddPortfolio(input))) setAdding(false); }} onCancel={() => setAdding(false)} />
      )}

      {data.portfolios.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 22px', color: MUTED, fontSize: 13 }}>
          {readOnly ? 'No model portfolios yet.' : 'No model portfolios yet. Create one (e.g. “Core Growth”), then add sleeves like US Equity 60%, Fixed Income 35%, Cash 5%.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill,minmax(440px,1fr))', gap: 16, alignItems: 'start' }}>
          {data.portfolios.map((p) => (
            <PortfolioCard key={p.id} p={p} busy={busy} readOnly={readOnly}
              onSave={(patch) => run(api.wealthUpdatePortfolio(p.id, patch))}
              onRemove={() => run(api.wealthRemovePortfolio(p.id))}
              onAddAlloc={(input) => run(api.wealthAddAllocation(p.id, input))}
              onSaveAlloc={(id, patch) => run(api.wealthUpdateAllocation(id, patch))}
              onRemoveAlloc={(id) => run(api.wealthRemoveAllocation(id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioCard({ p, busy, readOnly, onSave, onRemove, onAddAlloc, onSaveAlloc, onRemoveAlloc }: {
  p: Portfolio; busy: boolean; readOnly: boolean;
  onSave: (patch: PortfolioInput) => void; onRemove: () => void;
  onAddAlloc: (input: AllocationInput) => void; onSaveAlloc: (id: string, patch: AllocationInput) => void; onRemoveAlloc: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingAlloc, setAddingAlloc] = useState(false);

  if (editing) {
    return <div style={card}><PortfolioForm busy={busy} initial={p} submitLabel="Save" onSubmit={(patch) => { onSave(patch); setEditing(false); }} onCancel={() => setEditing(false)} /></div>;
  }

  const off = 10000 - p.totalBp;
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '13px 16px 11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: '#fff' }}>{p.name}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: GREEN, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{riskLabel(p.risk)}</span>
        </div>
        {/* Allocation bar */}
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 11, background: '#10241c' }}>
          {p.allocations.map((a) => (
            <div key={a.id} title={`${a.name} · ${pct(a.targetBp)}`} style={{ width: `${a.targetBp / 100}%`, background: CLASS_META[a.assetClass].color }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 11.5 }}>
          <span style={{ color: p.balanced ? GREEN : AMBER, fontFamily: "'IBM Plex Mono', monospace" }}>
            {p.balanced ? '✓ 100% allocated' : `${pct(p.totalBp)} allocated · ${off > 0 ? `${pct(off)} unassigned` : `${pct(-off)} over`}`}
          </span>
          <span style={{ color: FAINT }}>{p.allocations.length} {p.allocations.length === 1 ? 'sleeve' : 'sleeves'}</span>
        </div>
      </div>

      {/* By-class summary */}
      {p.byClass.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '0 16px 11px' }}>
          {p.byClass.map((c) => (
            <span key={c.assetClass} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: MUTED }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: CLASS_META[c.assetClass].color }} />
              {CLASS_META[c.assetClass].label} <span style={{ color: TEXT, fontFamily: "'IBM Plex Mono', monospace" }}>{pct(c.bp)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Sleeves */}
      <div style={{ borderTop: `1px solid ${BORDER}` }}>
        {p.allocations.map((a) => (
          <SleeveRow key={a.id} a={a} busy={busy} readOnly={readOnly} onSave={(patch) => onSaveAlloc(a.id, patch)} onRemove={() => onRemoveAlloc(a.id)} />
        ))}
        {p.allocations.length === 0 && !addingAlloc && (
          <div style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic', padding: '11px 16px' }}>
            {readOnly ? 'No sleeves yet.' : 'No sleeves yet — add the first one below.'}
          </div>
        )}
        {!readOnly && addingAlloc && (
          <div style={{ padding: '11px 16px', background: PANEL }}>
            <AllocationForm busy={busy} submitLabel="Add sleeve" onSubmit={(input) => { onAddAlloc(input); setAddingAlloc(false); }} onCancel={() => setAddingAlloc(false)} />
          </div>
        )}
      </div>

      {p.notes && <div style={{ padding: '9px 16px', fontSize: 11.5, color: '#8fa39a', borderTop: `1px solid ${BORDER}` }}>{p.notes}</div>}

      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, padding: '9px 16px', borderTop: `1px solid ${BORDER}`, background: PANEL }}>
          {!addingAlloc && <button onClick={() => setAddingAlloc(true)} style={smallBtn}>+ Sleeve</button>}
          <button onClick={() => setEditing(true)} style={smallBtn}>Edit</button>
          <button onClick={() => !busy && onRemove()} title="Delete portfolio" style={{ ...smallBtn, marginLeft: 'auto', color: '#ff9a9a', borderColor: 'transparent' }}>Delete</button>
        </div>
      )}
    </div>
  );
}

function SleeveRow({ a, busy, readOnly, onSave, onRemove }: { a: Allocation; busy: boolean; readOnly: boolean; onSave: (patch: AllocationInput) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <div style={{ padding: '11px 16px', background: PANEL, borderBottom: `1px solid #12251d` }}><AllocationForm busy={busy} initial={a} submitLabel="Save" onSubmit={(patch) => { onSave(patch); setEditing(false); }} onCancel={() => setEditing(false)} /></div>;
  }
  const m = CLASS_META[a.assetClass];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: `1px solid #12251d` }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: m.color, flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
      <span style={{ fontSize: 10.5, color: FAINT }}>{m.label}</span>
      <span style={{ fontSize: 12.5, color: TEXT, fontFamily: "'IBM Plex Mono', monospace", width: 52, textAlign: 'right' }}>{pct(a.targetBp)}</span>
      {!readOnly && (
        <>
          <button onClick={() => setEditing(true)} style={{ ...iconBtn }} title="Edit sleeve">✎</button>
          <button onClick={() => !busy && onRemove()} style={{ ...iconBtn, color: '#ff9a9a' }} title="Remove sleeve">×</button>
        </>
      )}
    </div>
  );
}

function PortfolioForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial?: Portfolio; busy: boolean; submitLabel: string; onSubmit: (input: PortfolioInput) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [risk, setRisk] = useState<PortfolioRisk>(initial?.risk ?? 'moderate');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  function submit() { if (!name.trim()) return; onSubmit({ name: name.trim(), risk, notes: notes.trim() || null }); }
  return (
    <div style={{ ...(initial ? {} : panel), marginBottom: initial ? 0 : 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{initial ? 'Edit portfolio' : 'New portfolio'}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Core Growth)" style={{ ...input, flex: '1 1 200px' }} />
        <select value={risk} onChange={(e) => setRisk(e.target.value as PortfolioRisk)} style={{ ...input, flex: '1 1 180px' }}>
          {RISKS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...input, flex: '1 1 100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !name.trim()} style={{ ...greenBtn, opacity: busy || !name.trim() ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

function AllocationForm({ initial, busy, submitLabel, onSubmit, onCancel }: { initial?: Allocation; busy: boolean; submitLabel: string; onSubmit: (input: AllocationInput) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [assetClass, setAssetClass] = useState<AssetClass>(initial?.assetClass ?? 'us_equity');
  const [pctStr, setPctStr] = useState(initial ? String(initial.targetBp / 100) : '');
  function submit() {
    const weight = Number(pctStr);
    if (!name.trim() || Number.isNaN(weight)) return;
    onSubmit({ name: name.trim(), assetClass, targetBp: Math.round(weight * 100) });
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sleeve (e.g. US Large Cap or VTI)" style={{ ...input, flex: '1 1 200px' }} />
        <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)} style={{ ...input, flex: '1 1 150px' }}>
          {CLASS_KEYS.map((k) => <option key={k} value={k}>{CLASS_META[k].label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: MUTED }}>
          <input value={pctStr} onChange={(e) => setPctStr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="0" inputMode="decimal" style={{ ...input, width: 64, textAlign: 'right' }} />%
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={submit} disabled={busy || !name.trim()} style={{ ...greenBtn, opacity: busy || !name.trim() ? 0.6 : 1 }}>{submitLabel}</button>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const greenBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${GREEN},#239160)`, color: '#05231a', fontWeight: 700, fontSize: 12, padding: '8px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#cfe6da', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}`, padding: '8px 12px', borderRadius: 7, cursor: 'pointer' };
const smallBtn: CSSProperties = { background: 'none', border: `1px solid ${BORDER}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' };
const iconBtn: CSSProperties = { flex: 'none', background: 'none', border: 'none', color: FAINT, fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: 2 };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
