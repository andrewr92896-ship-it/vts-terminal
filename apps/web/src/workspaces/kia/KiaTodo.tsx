import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useResponsive } from '../../hooks/useMediaQuery';
import type { TodoItem, TodoSection } from '../../api/types';

const RED = '#BB162B';
const RED2 = '#8d0f20';

// The Kia To-Do tab is a filtered view of the shared To Do list: the
// kia-tagged sections (Dealership/Sales and Working Deals). It uses the same
// todo endpoints, so changes here also show in the To Do List workspace.
export function KiaTodo() {
  const { isPhone } = useResponsive();
  const [sections, setSections] = useState<TodoSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getTodo()
      .then((r) => alive && setSections(r.sections))
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function run(action: Promise<{ sections: TodoSection[] }>) {
    setBusy(true);
    try {
      setSections((await action).sections);
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
      try {
        setSections((await api.getTodo()).sections);
      } catch {
        /* keep view */
      }
    } finally {
      setBusy(false);
    }
  }

  const kiaSections = sections.filter((s) => s.tag === 'kia');
  // New dealership tasks go to the Dealership/Sales section (n=8).
  const dealershipSection = kiaSections.find((s) => s.n === 8) ?? kiaSections[0];

  async function add() {
    const text = draft.trim();
    if (!text || !dealershipSection) return;
    setDraft('');
    await run(api.addTodoItem(dealershipSection.id, text));
  }

  if (loading) return <div style={{ color: '#8b9098', padding: 20, fontSize: 13 }}>Loading...</div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 920, color: '#eceef0', animation: 'fadeIn .25s ease' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, color: '#fff' }}>Dealership To-Do</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#9aa0a8' }}>
        Sales tasks and working deals. Also visible in your full To Do List workspace.
      </p>

      {actionError && (
        <div
          onClick={() => setActionError(null)}
          style={{ marginBottom: 14, maxWidth: 560, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }}
        >
          {actionError} — refreshed. Click to dismiss.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, maxWidth: 560 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New dealership task..."
          style={{ flex: 1, background: '#0e0f12', border: '1px solid #2c2f36', borderRadius: 7, padding: '10px 12px', color: '#eceef0', fontSize: 12.5, outline: 'none' }}
        />
        <button onClick={add} disabled={busy || !draft.trim()} style={{ border: 'none', background: `linear-gradient(180deg,${RED},${RED2})`, color: '#fff', fontWeight: 600, fontSize: 12.5, padding: '0 16px', borderRadius: 7, cursor: busy || !draft.trim() ? 'default' : 'pointer', opacity: busy || !draft.trim() ? 0.6 : 1 }}>
          Add
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {kiaSections.map((sec) => (
          <div key={sec.id} style={{ background: '#15171b', border: '1px solid #2a2d33', borderRadius: 10, padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 16 }}>{sec.icon}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f1f2f4' }}>{sec.n}. {sec.title}</span>
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#8b9098' }}>{sec.count}</span>
            </div>
            {sec.empty && (
              <div style={{ fontSize: 11.5, color: '#6b7079', fontStyle: 'italic', padding: '4px 0' }}>
                {sec.type === 'deals' ? 'No active deals. Add one above.' : '— empty —'}
              </div>
            )}
            {sec.items.map((item) => (
              <Row key={item.id} item={item} busy={busy} onToggle={(id) => run(api.toggleTodoItem(id))} onRemove={(id) => run(api.removeTodoItem(id))} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ item, busy, onToggle, onRemove }: { item: TodoItem; busy: boolean; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid #1f2227' }}>
      <button
        onClick={() => !busy && onToggle(item.id)}
        style={{ flex: 'none', width: 18, height: 18, marginTop: 1, borderRadius: 5, border: `1.5px solid ${item.done ? RED : '#3a3d44'}`, background: item.done ? RED : 'transparent', color: '#fff', fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
      >
        {item.done ? '✓' : ''}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.4, color: item.done ? '#7d828a' : '#eceef0', textDecoration: item.done ? 'line-through' : 'none' }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#6b7079', marginRight: 6 }}>{item.code}</span>
          {item.text}
        </div>
      </div>
      <button onClick={() => !busy && onRemove(item.id)} title="Remove" style={{ flex: 'none', background: 'none', border: 'none', color: '#4a4f57', fontSize: 15, lineHeight: 1, cursor: busy ? 'default' : 'pointer' }}>
        ×
      </button>
    </div>
  );
}
