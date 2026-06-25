import { useEffect, useState, type CSSProperties } from 'react';
import { AiEntry } from '../../components/AiEntry';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type {
  ComplianceCategory,
  ComplianceData,
  ComplianceInput,
  ComplianceItem,
  ComplianceStatus,
  WealthClient,
} from '../../api/types';

const GREEN = '#34b87a';
const CARD = '#0e1a15';
const PANEL = '#0a201a';
const BORDER = '#1d4a38';
const INPUT_BG = '#081410';
const TEXT = '#eaf3ee';
const MUTED = '#8fb3a3';
const FAINT = '#5f7d6f';
const RED = '#ef5468';
const AMBER = '#e0a23a';
const BLUE = '#5fb0e0';

const CATEGORY: Record<ComplianceCategory, { label: string; color: string }> = {
  filing: { label: 'Filing', color: BLUE },
  disclosure: { label: 'Disclosure', color: '#a07ce0' },
  policy: { label: 'Policy', color: GREEN },
  client_doc: { label: 'Client Doc', color: '#46c2a8' },
  review: { label: 'Review', color: AMBER },
  other: { label: 'Other', color: '#7d8a83' },
};
const CATEGORY_KEYS = Object.keys(CATEGORY) as ComplianceCategory[];

const STATUS: Record<ComplianceStatus, { label: string; color: string }> = {
  not_started: { label: 'Not started', color: FAINT },
  in_progress: { label: 'In progress', color: AMBER },
  complete: { label: 'Complete', color: GREEN },
};
const NEXT_STATUS: Record<ComplianceStatus, ComplianceStatus> = {
  not_started: 'in_progress',
  in_progress: 'complete',
  complete: 'not_started',
};

// Common RIA recordkeeping items offered as one-click templates.
const TEMPLATES: { title: string; category: ComplianceCategory }[] = [
  { title: 'Form ADV Part 1 — annual amendment', category: 'filing' },
  { title: 'Form ADV Part 2A brochure — annual delivery', category: 'disclosure' },
  { title: 'Form CRS (Relationship Summary)', category: 'disclosure' },
  { title: 'Investment Policy Statement on file', category: 'client_doc' },
  { title: 'Privacy policy (Reg S-P) annual notice', category: 'policy' },
  { title: 'Code of Ethics review', category: 'policy' },
  { title: 'Books & records review', category: 'review' },
];

const ET = 'America/New_York';
function fmtDate(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric', year: 'numeric' }).format(ms);
}
function toDateInput(ms: number | null): string {
  if (ms == null) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}
function fromDateInput(v: string): number | null {
  if (!v) return null;
  const ms = Date.parse(v + 'T00:00:00Z');
  return Number.isNaN(ms) ? null : ms;
}

export function WealthCompliance() {
  const { isPhone } = useResponsive();
  const [data, setData] = useState<ComplianceData | null>(null);
  const [clients, setClients] = useState<WealthClient[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    try { setData(await api.wealthCompliance()); setErr(null); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed to load'); }
  }
  useEffect(() => {
    void load();
    api.wealthClients().then((d) => setClients(d.clients)).catch(() => { /* optional */ });
  }, []);

  async function run(p: Promise<ComplianceData>): Promise<boolean> {
    setBusy(true);
    try { setData(await p); setErr(null); return true; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Action failed'); return false; } finally { setBusy(false); }
  }

  if (err && !data) return <div style={{ color: RED, padding: 20, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading register…</div>;

  const s = data.summary;
  const usedTemplates = new Set(data.items.map((i) => i.title));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Compliance</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>RIA recordkeeping register — filings, disclosures, policies, and client documents with status and due dates.</div>
        </div>
        <button onClick={() => setAdding((v) => !v)} style={greenBtn}>{adding ? 'Close' : '+ New item'}</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <Metric label="Open items" value={String(s.open)} />
        <Metric label="Overdue" value={String(s.overdue)} accent={s.overdue > 0 ? RED : undefined} />
        <Metric label="Complete" value={`${s.complete}/${s.total}`} accent={GREEN} />
        <Metric label="Next due" value={s.nextDueAt ? fmtDate(s.nextDueAt) : '—'} />
      </div>

      {err && <div onClick={() => setErr(null)} style={banner}>{err} — click to dismiss.</div>}

      {/* Templates */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: FAINT, alignSelf: 'center', marginRight: 2 }}>Quick add:</span>
        {TEMPLATES.filter((t) => !usedTemplates.has(t.title)).map((t) => (
          <button key={t.title} disabled={busy} onClick={() => void run(api.wealthAddCompliance({ title: t.title, category: t.category }))}
            style={{ fontSize: 11, color: '#cfe6da', background: 'rgba(52,184,122,.08)', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '5px 11px', cursor: busy ? 'default' : 'pointer' }}>
            + {t.title}
          </button>
        ))}
      </div>

      {adding && (
        <ItemForm busy={busy} clients={clients} submitLabel="Add item" onSubmit={async (input) => { if (await run(api.wealthAddCompliance(input))) setAdding(false); }} onCancel={() => setAdding(false)} />
      )}

      {data.items.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 22px', color: MUTED, fontSize: 13 }}>
          No compliance items yet. Use a quick-add above or “+ New item” to start your register.
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {data.items.map((it, i) => (
            <ItemRow key={it.id} it={it} clients={clients} busy={busy} last={i === data.items.length - 1}
              onCycle={() => run(api.wealthUpdateCompliance(it.id, { status: NEXT_STATUS[it.status] }))}
              onSave={(patch) => run(api.wealthUpdateCompliance(it.id, patch))}
              onRemove={() => run(api.wealthRemoveCompliance(it.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...card, padding: '12px 15px' }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ?? '#fff', marginTop: 5, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
    </div>
  );
}

function ItemRow({ it, clients, busy, last, onCycle, onSave, onRemove }: {
  it: ComplianceItem; clients: WealthClient[]; busy: boolean; last: boolean;
  onCycle: () => void; onSave: (patch: ComplianceInput) => void; onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div style={{ padding: '13px 16px', background: PANEL, borderBottom: last ? 'none' : `1px solid ${BORDER}` }}>
        <ItemForm busy={busy} clients={clients} initial={it} submitLabel="Save" onSubmit={(patch) => { onSave(patch); setEditing(false); }} onCancel={() => setEditing(false)} />
      </div>
    );
  }
  const cat = CATEGORY[it.category];
  const st = STATUS[it.status];
  const client = it.clientId ? clients.find((c) => c.id === it.clientId) : undefined;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: last ? 'none' : `1px solid ${BORDER}` }}>
      <button onClick={() => !busy && onCycle()} title="Change status" style={{ flex: 'none', marginTop: 1, width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${st.color}`, background: it.status === 'complete' ? GREEN : 'transparent', color: '#05231a', fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        {it.status === 'complete' ? '✓' : it.status === 'in_progress' ? '·' : ''}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: it.status === 'complete' ? MUTED : TEXT, textDecoration: it.status === 'complete' ? 'line-through' : 'none' }}>{it.title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 5, fontSize: 10.5, alignItems: 'center' }}>
          <span style={{ color: cat.color, border: `1px solid ${cat.color}`, borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{cat.label}</span>
          <span style={{ color: st.color }}>{st.label}</span>
          {it.dueAt != null && (
            <span style={{ color: it.overdue ? RED : MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>
              {it.overdue ? 'overdue · ' : 'due '}{fmtDate(it.dueAt)}
            </span>
          )}
          {client && <span style={{ color: FAINT }}>{client.name}</span>}
        </div>
        {it.notes && <div style={{ fontSize: 11, color: '#8fa39a', marginTop: 4 }}>{it.notes}</div>}
      </div>
      <div style={{ flex: 'none', display: 'flex', gap: 4 }}>
        <button onClick={() => setEditing(true)} style={iconBtn} title="Edit">✎</button>
        <button onClick={() => !busy && onRemove()} style={{ ...iconBtn, color: '#ff9a9a' }} title="Remove">×</button>
      </div>
    </div>
  );
}

function ItemForm({ initial, clients, busy, submitLabel, onSubmit, onCancel }: {
  initial?: ComplianceItem; clients: WealthClient[]; busy: boolean; submitLabel: string;
  onSubmit: (input: ComplianceInput) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<ComplianceCategory>(initial?.category ?? 'filing');
  const [status, setStatus] = useState<ComplianceStatus>(initial?.status ?? 'not_started');
  const [due, setDue] = useState(toDateInput(initial?.dueAt ?? null));
  const [clientId, setClientId] = useState(initial?.clientId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  function submit() {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), category, status, dueAt: fromDateInput(due), clientId: clientId || null, notes: notes.trim() || null });
  }
  return (
    <div style={{ ...(initial ? {} : panel), marginBottom: initial ? 0 : 16 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>{initial ? 'Edit item' : 'New compliance item'}</div>
      {!initial && (
        <div style={{ marginBottom: 10 }}>
          <AiEntry
            kind="wealth_compliance"
            label="item"
            accent={GREEN}
            notePlaceholder='Describe the item, or drop a notice/screenshot — e.g. "ADV amendment due 3/31"'
            onFill={(f) => {
              if (typeof f.title === 'string') setTitle(f.title);
              if (
                f.category === 'filing' ||
                f.category === 'disclosure' ||
                f.category === 'policy' ||
                f.category === 'client_doc' ||
                f.category === 'review' ||
                f.category === 'other'
              )
                setCategory(f.category);
              if (f.status === 'not_started' || f.status === 'in_progress' || f.status === 'complete') setStatus(f.status);
              if (typeof f.dueAt === 'string') setDue(f.dueAt);
              if (typeof f.notes === 'string') setNotes(f.notes);
            }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Form ADV annual amendment)" style={{ ...input, flex: '1 1 100%' }} />
        <select value={category} onChange={(e) => setCategory(e.target.value as ComplianceCategory)} style={{ ...input, flex: '1 1 140px' }}>
          {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY[k].label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as ComplianceStatus)} style={{ ...input, flex: '1 1 140px' }}>
          {(Object.keys(STATUS) as ComplianceStatus[]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED }}>
          Due<input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...input, width: 150 }} />
        </label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...input, flex: '1 1 160px' }}>
          <option value="">No client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...input, flex: '1 1 100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={submit} disabled={busy || !title.trim()} style={{ ...greenBtn, opacity: busy || !title.trim() ? 0.6 : 1 }}>{submitLabel}</button>
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
const iconBtn: CSSProperties = { background: 'none', border: 'none', color: FAINT, fontSize: 13, lineHeight: 1, cursor: 'pointer', padding: 2 };
const banner: CSSProperties = { marginBottom: 14, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' };
