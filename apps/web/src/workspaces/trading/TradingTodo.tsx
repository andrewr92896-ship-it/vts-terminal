import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useUndo } from '../../hooks/useUndo';
import { UndoBar } from '../../components/UndoBar';
import type { RemovedTodoItem, TodoItem, TodoSection } from '../../api/types';

const GOLD = '#EBCB74';
const GOLD2 = '#C9A24B';

// The Trading To Do tab shows the shared trading task list: the trading-tagged
// section (Vitalis Trading) of the todo store, so tasks here are shared with the
// team.
export function TradingTodo() {
  const { user } = useAuth();
  const readOnly = !!user?.access.readOnlyWorkspaces.includes('trading');
  const [sections, setSections] = useState<TodoSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const undo = useUndo<RemovedTodoItem>();

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

  async function removeWithUndo(id: string) {
    setBusy(true);
    try {
      const r = await api.removeTodoItem(id);
      setSections(r.sections);
      setActionError(null);
      if (r.removed) undo.flag(r.removed);
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

  function restoreRemoved() {
    const item = undo.pending;
    if (!item) return;
    undo.clear();
    void run(api.restoreTodoItem(item));
  }

  const tradingSections = sections.filter((s) => s.tag === 'trading');
  const primarySection = tradingSections[0];

  async function add() {
    const text = draft.trim();
    if (!text || !primarySection) return;
    setDraft('');
    await run(api.addTodoItem(primarySection.id, text));
  }

  if (loading) return <div style={{ color: '#7e8aa6', padding: 20, fontSize: 13 }}>{"Loading..."}</div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 720, color: '#dfe6f5', animation: 'fadeIn .25s ease' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 700, color: '#eef3ff' }}>{"Trading To-Do"}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#8b97b3' }}>
        {"Trading tasks and reminders."}
      </p>

      {actionError && (
        <div
          onClick={() => setActionError(null)}
          style={{ marginBottom: 14, maxWidth: 560, fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer' }}
        >
          {actionError} — refreshed. Click to dismiss.
        </div>
      )}

      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, maxWidth: 560 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="New trading task..."
            style={{ flex: 1, background: '#0a1834', border: '1px solid #16294f', borderRadius: 7, padding: '10px 12px', color: '#dfe6f5', fontSize: 12.5, outline: 'none' }}
          />
          <button onClick={add} disabled={busy || !draft.trim()} style={{ border: 'none', background: `linear-gradient(180deg,${GOLD},${GOLD2})`, color: '#0c2768', fontWeight: 700, fontSize: 12.5, padding: '0 16px', borderRadius: 7, cursor: busy || !draft.trim() ? 'default' : 'pointer', opacity: busy || !draft.trim() ? 0.6 : 1 }}>
            {"Add"}
          </button>
        </div>
      )}

      {tradingSections.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#6b78a0', fontStyle: 'italic' }}>{"No trading section yet."}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, alignItems: 'start' }}>
        {tradingSections.map((sec) => (
          <div key={sec.id} style={{ background: '#0c1a3a', border: '1px solid #16294f', borderRadius: 10, padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 16 }}>{sec.icon}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eef3ff' }}>{sec.n}. {sec.title}</span>
              </div>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#7e8aa6' }}>{sec.count}</span>
            </div>
            {sec.empty && (
              <div style={{ fontSize: 11.5, color: '#5d6b94', fontStyle: 'italic', padding: '4px 0' }}>
                — empty —
              </div>
            )}
            {sec.items.map((item) => (
              <Row key={item.id} item={item} busy={busy} readOnly={readOnly} onToggle={(id) => run(api.toggleTodoItem(id))} onRemove={removeWithUndo} />
            ))}
          </div>
        ))}
      </div>

      {undo.pending && (
        <UndoBar message="Task removed." onUndo={restoreRemoved} onDismiss={undo.clear} />
      )}
    </div>
  );
}

function Row({ item, busy, readOnly, onToggle, onRemove }: { item: TodoItem; busy: boolean; readOnly: boolean; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  const boxStyle = { flex: 'none', width: 18, height: 18, marginTop: 1, borderRadius: 5, border: `1.5px solid ${item.done ? GOLD : '#2a3d68'}`, background: item.done ? GOLD : 'transparent', color: '#0c2768', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid #142648' }}>
      {readOnly ? (
        <span style={boxStyle}>{item.done ? '✓' : ''}</span>
      ) : (
        <button onClick={() => !busy && onToggle(item.id)} style={{ ...boxStyle, cursor: busy ? 'default' : 'pointer' }}>
          {item.done ? '✓' : ''}
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.4, color: item.done ? '#6b78a0' : '#dfe6f5', textDecoration: item.done ? 'line-through' : 'none' }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5d6b94', marginRight: 6 }}>{item.code}</span>
          {item.text}
        </div>
      </div>
      {!readOnly && (
        <button onClick={() => !busy && onRemove(item.id)} title="Remove" style={{ flex: 'none', background: 'none', border: 'none', color: '#3a4868', fontSize: 15, lineHeight: 1, cursor: busy ? 'default' : 'pointer' }}>
          ×
        </button>
      )}
    </div>
  );
}
