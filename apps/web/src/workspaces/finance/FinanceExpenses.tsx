import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { usePrivacy } from '../../privacy/privacy';
import type { Expense } from '../../api/types';

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

const usd = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
function ordinal(d: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function FinanceExpenses() {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const { isPhone } = useResponsive();
  const { privacy } = usePrivacy();
  const [items, setItems] = useState<Expense[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // add form
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('1');
  const [category, setCategory] = useState('');

  async function load() {
    try { setItems((await api.financeExpenses()).expenses); setErr(null); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
  }
  useEffect(() => { void load(); }, []);

  async function run(p: Promise<{ expenses: Expense[] }>) {
    setBusy(true);
    try { setItems((await p).expenses); setErr(null); return true; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }

  async function add() {
    const amt = Number(amount); const d = Number(day);
    if (!label.trim() || !Number.isFinite(amt)) return;
    if (await run(api.financeAddExpense({ label: label.trim(), amount: amt, dayOfMonth: d, category: category.trim() || undefined }))) {
      setLabel(''); setAmount(''); setDay('1'); setCategory('');
    }
  }

  if (err && !items) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!items) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading…</div>;

  const showMoney = !privacy;
  const money = (n: number) => (showMoney ? usd(n) : '•••••');
  const today = new Date().getDate();
  const active = items.filter((e) => e.active);
  const total = active.reduce((a, e) => a + e.amount, 0);
  const paid = active.filter((e) => e.dayOfMonth <= today).reduce((a, e) => a + e.amount, 0);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Expenses</h2>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>Recurring monthly bills, with the day each leaves your bank account.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        <Stat label="Monthly total" value={money(total)} color="#fff" />
        <Stat label="Out so far" value={money(paid)} color={GOLD} sub={`through the ${ordinal(today)}`} />
        <Stat label="Still upcoming" value={money(total - paid)} color={ACCENT} />
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {/* Add */}
      {!readOnly && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={sectionLabel}>Add an expense</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Rent)" style={{ ...input, flex: '1 1 150px' }} />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" placeholder="Amount $" style={{ ...input, flex: '0 0 120px' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: MUTED }}>
              Bank day
              <input value={day} onChange={(e) => setDay(e.target.value)} type="number" min="1" max="31" style={{ ...input, width: 64 }} />
            </label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" style={{ ...input, flex: '1 1 120px' }} />
            <button onClick={add} disabled={busy || !label.trim() || !amount} style={{ ...accentBtn, opacity: busy || !label.trim() || !amount ? 0.6 : 1 }}>Add</button>
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <div style={{ padding: '24px 18px', color: MUTED, fontSize: 12.5, fontStyle: 'italic' }}>No expenses yet — add your bills above.</div>
        ) : (
          items.map((e) => (
            <ExpenseRow key={e.id} e={e} today={today} isPhone={isPhone} money={money} busy={busy} readOnly={readOnly}
              onSave={(patch) => run(api.financeUpdateExpense(e.id, patch))}
              onRemove={() => run(api.financeRemoveExpense(e.id))} />
          ))
        )}
      </div>
    </div>
  );
}

function ExpenseRow({ e, today, isPhone, money, busy, readOnly, onSave, onRemove }: {
  e: Expense; today: number; isPhone: boolean; money: (n: number) => string; busy: boolean; readOnly: boolean;
  onSave: (p: { label?: string; amount?: number; dayOfMonth?: number; category?: string | null; active?: boolean }) => void; onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(e.label);
  const [amount, setAmount] = useState(String(e.amount));
  const [day, setDay] = useState(String(e.dayOfMonth));
  const [category, setCategory] = useState(e.category ?? '');

  if (editing && !readOnly) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
        <input value={label} onChange={(ev) => setLabel(ev.target.value)} style={{ ...input, flex: '1 1 140px' }} />
        <input value={amount} onChange={(ev) => setAmount(ev.target.value)} type="number" step="any" style={{ ...input, flex: '0 0 110px' }} />
        <input value={day} onChange={(ev) => setDay(ev.target.value)} type="number" min="1" max="31" style={{ ...input, width: 64 }} />
        <input value={category} onChange={(ev) => setCategory(ev.target.value)} placeholder="Category" style={{ ...input, flex: '1 1 110px' }} />
        <button onClick={() => { onSave({ label: label.trim(), amount: Number(amount), dayOfMonth: Number(day), category: category.trim() || null }); setEditing(false); }} disabled={busy} style={accentBtn}>Save</button>
        <button onClick={() => setEditing(false)} style={ghostBtn}>Cancel</button>
      </div>
    );
  }

  const out = e.dayOfMonth <= today;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, opacity: e.active ? 1 : 0.5, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          {e.label}
          {e.category && <span style={chip}>{e.category}</span>}
          {!e.active && <span style={{ ...chip, color: FAINT }}>paused</span>}
        </div>
        <div style={{ fontSize: 10.5, color: FAINT, fontFamily: "'IBM Plex Mono', monospace", marginTop: 3 }}>
          out on the {ordinal(e.dayOfMonth)} · <span style={{ color: out ? GREEN : GOLD }}>{out ? 'paid' : 'upcoming'}</span>
        </div>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: TEXT }}>{money(e.amount)}</div>
      {!readOnly && (
        <>
          <button onClick={() => !busy && onSave({ active: !e.active })} style={ghostBtn}>{e.active ? 'Pause' : 'Resume'}</button>
          <button onClick={() => setEditing(true)} style={ghostBtn}>Edit</button>
          <button onClick={() => !busy && onRemove()} title="Remove" style={{ ...ghostBtn, color: '#ff9a9a', borderColor: 'transparent' }}>×</button>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 21, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: FAINT, marginTop: 3 }}>{sub}</div>}
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
