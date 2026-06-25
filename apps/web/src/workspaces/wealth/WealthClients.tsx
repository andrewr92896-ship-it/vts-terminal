import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useResponsive } from '../../hooks/useMediaQuery';
import { useUndo } from '../../hooks/useUndo';
import { UndoBar } from '../../components/UndoBar';
import { usePrivacy, maskName, REDACTED } from '../../privacy/privacy';
import type {
  WealthClient,
  WealthClientsData,
  WealthClientStatus,
  RemovedWealthClient,
} from '../../api/types';

// Wealth workspace palette — the dark green "pro-terminal" theme (mirrors how
// KiaDashboard hardcodes the Kia red palette so the screen is self-contained).
const GREEN = '#34b87a';
const GREEN2 = '#239160';
const CARD = '#0e1a15';
const PANEL = '#0a201a';
const BORDER = '#1d4a38';
const INPUT_BG = '#081410';
const TEXT = '#eaf3ee';
const MUTED = '#8fb3a3';

const usd = (n: number) => '$' + n.toLocaleString('en-US');

const STATUSES: { key: WealthClientStatus; label: string; color: string }[] = [
  { key: 'active', label: 'Active', color: GREEN },
  { key: 'onboarding', label: 'Onboarding', color: '#5fb0e0' },
  { key: 'prospect', label: 'Prospect', color: '#e0a23a' },
  { key: 'inactive', label: 'Inactive', color: '#7d8a83' },
];

function statusMeta(s: WealthClientStatus) {
  return STATUSES.find((x) => x.key === s) ?? STATUSES[2];
}

export function WealthClients() {
  const { isPhone } = useResponsive();
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const { privacy } = usePrivacy();
  const undo = useUndo<RemovedWealthClient>();
  const [data, setData] = useState<WealthClientsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideMoney, setHideMoney] = useState(false);

  // Add-client form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<WealthClientStatus>('prospect');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .wealthClients()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load clients'));
    return () => {
      alive = false;
    };
  }, []);

  async function run(action: Promise<WealthClientsData>) {
    setBusy(true);
    try {
      setData(await action);
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
      try {
        setData(await api.wealthClients());
      } catch {
        /* keep current view */
      }
    } finally {
      setBusy(false);
    }
  }

  async function addClient() {
    if (!name.trim()) return;
    const v = value.trim() === '' ? undefined : Number(value);
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) return;
    await run(
      api.wealthAddClient({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        accountValue: v,
        status,
        notes: notes.trim() || undefined,
      }),
    );
    setName('');
    setEmail('');
    setPhone('');
    setValue('');
    setStatus('prospect');
    setNotes('');
  }

  async function removeWithUndo(id: string) {
    setBusy(true);
    try {
      const r = await api.wealthRemoveClient(id);
      setData(r);
      setActionError(null);
      if (r.removed) undo.flag(r.removed);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
      try {
        setData(await api.wealthClients());
      } catch {
        /* keep current view */
      }
    } finally {
      setBusy(false);
    }
  }

  function restoreRemoved() {
    const client = undo.pending;
    if (!client) return;
    undo.clear();
    void run(api.wealthRestoreClient(client));
  }

  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;
  if (!data) return <div style={{ color: MUTED, padding: 20, fontSize: 13 }}>Loading clients...</div>;

  // Privacy mode hides every dollar figure, on top of the manual toggle.
  const showMoney = !hideMoney && !privacy;
  const money = (n: number | null) => (n == null ? '—' : showMoney ? usd(n) : '•••••');
  const s = data.summary;
  const addDisabled = busy || !name.trim();

  const kpis: { label: string; val: string; sub: string }[] = [
    { label: 'Clients', val: String(s.totalClients), sub: `${s.activeClients} active` },
    {
      label: 'Assets Under Management',
      val: showMoney ? usd(s.totalAum) : '•••••',
      sub: 'across all clients',
    },
    {
      label: 'Active Relationships',
      val: String(s.activeClients),
      sub: s.totalClients > 0 ? `of ${s.totalClients} total` : 'none yet',
    },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>Clients</h2>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6 }}>
            Your advisory client book — contacts, status, and assets under management.
          </div>
        </div>
        <button onClick={() => setHideMoney((v) => !v)} style={ghostBtn}>
          {hideMoney ? 'Show $ details' : 'Hide $ details'}
        </button>
      </div>

      {actionError && (
        <div onClick={() => setActionError(null)} style={bannerStyle}>
          {actionError} — refreshed. Click to dismiss.
        </div>
      )}

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 13, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: MUTED }}>{k.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 23, fontWeight: 600, color: '#fff', marginTop: 6 }}>{k.val}</div>
            <div style={{ fontSize: 10.5, color: '#6f8a7d', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Add a client */}
      {!readOnly && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={panelLabel}>Add a client</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} placeholder="Name" style={{ ...inputBase, flex: '1 1 160px' }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} placeholder="Email (optional)" style={{ ...inputBase, flex: '1 1 170px' }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} placeholder="Phone (optional)" style={{ ...inputBase, flex: '1 1 140px' }} />
            <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} type="number" min="0" placeholder="Account $ (optional)" style={{ ...inputBase, flex: '0 0 150px' }} />
            <select value={status} onChange={(e) => setStatus(e.target.value as WealthClientStatus)} style={{ ...inputBase, flex: '0 0 130px' }}>
              {STATUSES.map((st) => (
                <option key={st.key} value={st.key}>{st.label}</option>
              ))}
            </select>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} placeholder="Notes (optional)" style={{ ...inputBase, flex: '1 1 100%' }} />
            <button onClick={addClient} disabled={addDisabled} style={{ ...greenBtn, opacity: addDisabled ? 0.6 : 1 }}>
              Add client
            </button>
          </div>
        </div>
      )}

      {/* Client list */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '15px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Client List</span>
          <span style={{ fontSize: 11, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>
            {s.totalClients} {s.totalClients === 1 ? 'client' : 'clients'}
          </span>
        </div>
        <div style={{ padding: '6px 0' }}>
          {data.clients.length === 0 && (
            <div style={{ padding: '16px 18px', fontSize: 12, color: '#6f8a7d', fontStyle: 'italic' }}>
              {readOnly ? 'No clients yet.' : 'No clients yet. Add your first one above.'}
            </div>
          )}
          {data.clients.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              isPhone={isPhone}
              showMoney={showMoney}
              privacy={privacy}
              busy={busy}
              readOnly={readOnly}
              money={money}
              onRemove={() => removeWithUndo(c.id)}
              onSave={(patch) => run(api.wealthUpdateClient(c.id, patch))}
            />
          ))}
        </div>
      </div>

      {undo.pending && (
        <UndoBar message="Client removed." onUndo={restoreRemoved} onDismiss={undo.clear} />
      )}
    </div>
  );
}

// One client row, with inline editing.
function ClientRow({
  client,
  isPhone,
  showMoney,
  privacy,
  busy,
  readOnly,
  money,
  onRemove,
  onSave,
}: {
  client: WealthClient;
  isPhone: boolean;
  showMoney: boolean;
  privacy: boolean;
  busy: boolean;
  readOnly: boolean;
  money: (n: number | null) => string;
  onRemove: () => void;
  onSave: (patch: {
    name?: string;
    email?: string;
    phone?: string;
    accountValue?: number | null;
    status?: WealthClientStatus;
    notes?: string;
  }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email ?? '');
  const [phone, setPhone] = useState(client.phone ?? '');
  const [value, setValue] = useState(client.accountValue == null ? '' : String(client.accountValue));
  const [status, setStatus] = useState<WealthClientStatus>(client.status);
  const [notes, setNotes] = useState(client.notes ?? '');

  function start() {
    setName(client.name);
    setEmail(client.email ?? '');
    setPhone(client.phone ?? '');
    setValue(client.accountValue == null ? '' : String(client.accountValue));
    setStatus(client.status);
    setNotes(client.notes ?? '');
    setEditing(true);
  }

  function save() {
    if (!name.trim()) return;
    // Blank account field clears the value (null); otherwise validate the number.
    let accountValue: number | null | undefined;
    if (value.trim() === '') {
      accountValue = null;
    } else {
      const v = Number(value);
      if (!Number.isFinite(v) || v < 0) return;
      accountValue = v;
    }
    onSave({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      accountValue,
      status,
      notes: notes.trim(),
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...inputBase, flex: '1 1 150px' }} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={{ ...inputBase, flex: '1 1 160px' }} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={{ ...inputBase, flex: '1 1 130px' }} />
        <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="0" placeholder="Account $" style={{ ...inputBase, flex: '0 0 130px' }} />
        <select value={status} onChange={(e) => setStatus(e.target.value as WealthClientStatus)} style={{ ...inputBase, flex: '0 0 130px' }}>
          {STATUSES.map((st) => (
            <option key={st.key} value={st.key}>{st.label}</option>
          ))}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" style={{ ...inputBase, flex: '1 1 100%' }} />
        <button onClick={save} disabled={busy || !name.trim()} style={{ ...greenBtn, opacity: busy || !name.trim() ? 0.6 : 1 }}>
          Save
        </button>
        <button onClick={() => setEditing(false)} style={ghostBtn}>
          Cancel
        </button>
      </div>
    );
  }

  const meta = statusMeta(client.status);
  // Contact details are masked in privacy mode along with names.
  const emailText = client.email ? (privacy ? REDACTED : client.email) : null;
  const phoneText = client.phone ? (privacy ? REDACTED : client.phone) : null;
  const contactBits = [emailText, phoneText].filter(Boolean) as string[];

  return (
    <div style={{ display: 'flex', alignItems: isPhone ? 'flex-start' : 'center', gap: 14, padding: '12px 18px', borderBottom: `1px solid ${BORDER}`, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT }}>{maskName(client.name, privacy, 'Client')}</span>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: meta.color,
              border: `1px solid ${meta.color}`,
              borderRadius: 5,
              padding: '2px 7px',
              opacity: 0.9,
            }}
          >
            {meta.label}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: MUTED, fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
          {contactBits.length > 0 ? contactBits.join(' · ') : 'no contact details'}
        </div>
        {client.notes && (
          <div style={{ fontSize: 11, color: '#7f9a8d', marginTop: 5, lineHeight: 1.5 }}>
            {privacy ? REDACTED : client.notes}
          </div>
        )}
      </div>
      {showMoney && (
        <div style={{ textAlign: isPhone ? 'left' : 'right', flex: 'none' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: TEXT }}>{money(client.accountValue)}</div>
          <div style={{ fontSize: 9.5, color: '#6f8a7d', letterSpacing: '0.4px', textTransform: 'uppercase', marginTop: 2 }}>assets</div>
        </div>
      )}
      {!readOnly && (
        <>
          <button onClick={() => !busy && start()} title="Edit client" style={{ flex: 'none', background: 'none', border: `1px solid ${BORDER}`, color: MUTED, fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: busy ? 'default' : 'pointer' }}>
            Edit
          </button>
          <button onClick={() => !busy && onRemove()} title="Remove client" style={{ flex: 'none', background: 'none', border: 'none', color: '#3f5249', fontSize: 16, lineHeight: 1, cursor: busy ? 'default' : 'pointer' }}>
            ×
          </button>
        </>
      )}
    </div>
  );
}

const card: CSSProperties = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18 };
const panel: CSSProperties = { background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' };
const panelLabel: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: MUTED,
  marginBottom: 9,
  display: 'flex',
  alignItems: 'center',
};
const inputBase: CSSProperties = {
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 7,
  color: TEXT,
  fontSize: 12.5,
  padding: '10px 12px',
  outline: 'none',
};
const greenBtn: CSSProperties = {
  border: 'none',
  background: `linear-gradient(180deg,${GREEN},${GREEN2})`,
  color: '#05231a',
  fontWeight: 700,
  fontSize: 12.5,
  padding: '0 16px',
  borderRadius: 7,
  cursor: 'pointer',
  minHeight: 38,
};
const ghostBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 11.5,
  fontWeight: 600,
  color: '#cfe6da',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${BORDER}`,
  padding: '7px 12px',
  borderRadius: 7,
  cursor: 'pointer',
};
const bannerStyle: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
  cursor: 'pointer',
};
