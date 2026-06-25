import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { usePrivacy } from '../../privacy/privacy';
import type { NetWorthData, NetWorthItem, NetWorthKind } from '../../api/types';

const ACCENT = '#6f8bff';
const GREEN = '#35c47b';
const RED = '#ef5468';
const TEXT = '#eef3ff';
const MUTED = '#9fb0d6';
const FAINT = '#6f84b0';
const CARD = 'rgba(20,26,62,.5)';
const PANEL = 'rgba(14,18,46,.6)';
const INPUT_BG = '#12162f';
const BORDER = '#262e57';
const BORDER2 = '#2e3766';

const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function FinanceNetWorth() {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const { privacy } = usePrivacy();
  const [data, setData] = useState<NetWorthData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<NetWorthKind>('asset');

  async function load() {
    try { setData(await api.financeNetWorth()); setErr(null); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
  }
  useEffect(() => { void load(); }, []);

  async function run(p: Promise<NetWorthData>) {
    setBusy(true);
    try { setData(await p); setErr(null); return true; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }
  async function add() {
    const amt = Number(amount);
    if (!label.trim() || !Number.isFinite(amt)) return;
    if (await run(api.financeAddNetWorth({ label: label.trim(), amount: amt, kind }))) { setLabel(''); setAmount(''); setKind('asset'); }
  }

  if (err && !data) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading…</div>;

  const showMoney = !privacy;
  const money = (n: number) => (showMoney ? usd(n) : '•••••');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Net Worth</h2>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>List your accounts and assets, minus what you owe.</div>
      </div>

      <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 12, color: MUTED }}>
          Assets <b style={{ color: GREEN, fontFamily: "'IBM Plex Mono', monospace" }}>{money(data.assets)}</b>
          <span style={{ margin: '0 8px', color: FAINT }}>−</span>
          Liabilities <b style={{ color: RED, fontFamily: "'IBM Plex Mono', monospace" }}>{money(data.liabilities)}</b>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>Net Worth</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: data.total >= 0 ? '#fff' : RED }}>{money(data.total)}</div>
        </div>
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {!readOnly && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={sectionLabel}>Add an item</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Savings, Car loan)" style={{ ...input, flex: '1 1 180px' }} />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" placeholder="Amount $" style={{ ...input, flex: '0 0 130px' }} />
            <select value={kind} onChange={(e) => setKind(e.target.value as NetWorthKind)} style={{ ...input, flex: '0 0 130px' }}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
            <button onClick={add} disabled={busy || !label.trim() || !amount} style={{ ...accentBtn, opacity: busy || !label.trim() || !amount ? 0.6 : 1 }}>Add</button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {data.items.length === 0 ? (
          <div style={{ padding: '24px 18px', color: MUTED, fontSize: 12.5, fontStyle: 'italic' }}>Nothing yet — add your accounts, assets, and debts above.</div>
        ) : (
          data.items.map((it) => (
            <NwRow key={it.id} it={it} busy={busy} money={money} readOnly={readOnly}
              onSave={(patch) => run(api.financeUpdateNetWorth(it.id, patch))}
              onRemove={() => run(api.financeRemoveNetWorth(it.id))} />
          ))
        )}
      </div>
    </div>
  );
}

function NwRow({ it, busy, money, readOnly, onSave, onRemove }: {
  it: NetWorthItem; busy: boolean; money: (n: number) => string; readOnly: boolean;
  onSave: (p: { label?: string; amount?: number; kind?: NetWorthKind }) => void; onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(it.label);
  const [amount, setAmount] = useState(String(it.amount));
  const [kind, setKind] = useState<NetWorthKind>(it.kind);
  const liability = it.kind === 'liability';

  if (editing && !readOnly) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ ...input, flex: '1 1 160px' }} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" style={{ ...input, flex: '0 0 120px' }} />
        <select value={kind} onChange={(e) => setKind(e.target.value as NetWorthKind)} style={{ ...input, flex: '0 0 120px' }}>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
        </select>
        <button onClick={() => { onSave({ label: label.trim(), amount: Number(amount), kind }); setEditing(false); }} disabled={busy} style={accentBtn}>Save</button>
        <button onClick={() => setEditing(false)} style={ghostBtn}>Cancel</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: liability ? RED : GREEN, flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{it.label}</span>
        <span style={{ ...chip, marginLeft: 8 }}>{liability ? 'Liability' : 'Asset'}</span>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: liability ? RED : TEXT }}>{liability ? `(${money(it.amount)})` : money(it.amount)}</div>
      {!readOnly && (
        <>
          <button onClick={() => setEditing(true)} style={ghostBtn}>Edit</button>
          <button onClick={() => !busy && onRemove()} title="Remove" style={{ ...ghostBtn, color: '#ff9a9a', borderColor: 'transparent' }}>×</button>
        </>
      )}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const sectionLabel: CSSProperties = { fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 9 };
const input: CSSProperties = { background: INPUT_BG, border: `1px solid ${BORDER2}`, borderRadius: 7, color: TEXT, fontSize: 12.5, padding: '9px 11px', outline: 'none' };
const chip: CSSProperties = { fontSize: 9.5, fontWeight: 600, color: MUTED, border: `1px solid ${BORDER2}`, borderRadius: 4, padding: '1px 6px' };
const accentBtn: CSSProperties = { border: 'none', background: `linear-gradient(180deg,${ACCENT},#4f63d6)`, color: '#fff', fontWeight: 700, fontSize: 12, padding: '9px 14px', borderRadius: 7, cursor: 'pointer' };
const ghostBtn: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: '#dfe7fa', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER2}`, padding: '7px 11px', borderRadius: 7, cursor: 'pointer' };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
