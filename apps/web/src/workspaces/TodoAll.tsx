import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../api/client';
import { useResponsive } from '../hooks/useMediaQuery';
import type { TodoItem, TodoSection } from '../api/types';

const ACCENT = '#46c2a8';
const ACCENT2 = '#2f9e86';
const OVERDUE = '#ef5468';

export function TodoAll() {
  const { isPhone } = useResponsive();
  const [sections, setSections] = useState<TodoSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showLife, setShowLife] = useState(false);
  const [draft, setDraft] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getTodo()
      .then((r) => {
        if (!alive) return;
        setSections(r.sections);
        if (r.sections[0]) setSectionId(r.sections[0].id);
      })
      .catch((err) => alive && setLoadError(err instanceof ApiError ? err.message : 'Failed to load tasks'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // A failed mutation shows a banner and resyncs from the server, rather than
  // wiping the list. Keeps the view usable if a request fails.
  async function run(action: Promise<{ sections: TodoSection[] }>) {
    setBusy(true);
    try {
      const r = await action;
      setSections(r.sections);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed');
      try {
        const fresh = await api.getTodo();
        setSections(fresh.sections);
      } catch {
        /* leave current view in place */
      }
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const text = draft.trim();
    if (!text || !sectionId) return;
    setDraft('');
    await run(api.addTodoItem(sectionId, text));
  }

  if (loading) {
    return <div style={{ color: '#6f9aa8', fontSize: 13, padding: 20 }}>Loading tasks...</div>;
  }
  if (loadError) {
    return <div style={{ color: OVERDUE, fontSize: 13, padding: 20 }}>{loadError}</div>;
  }

  const visible = sections.filter((s) => (s.life ? showLife : true));

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#eaf6f1' }}>All Tasks</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#6f9aa8' }}>
            Your full personal list. Recurring tasks track their own reset intervals.
          </p>
        </div>
        <button
          onClick={() => setShowLife((v) => !v)}
          style={{
            border: '1px solid #2f6b5c',
            background: 'rgba(70,194,168,.1)',
            color: '#7fd9c5',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11.5,
            padding: '8px 13px',
            borderRadius: 7,
            cursor: 'pointer',
          }}
        >
          {showLife ? 'Hide Life Changes' : 'Show Life Changes'}
        </button>
      </div>

      {actionError && (
        <div
          onClick={() => setActionError(null)}
          title="Dismiss"
          style={{
            marginBottom: 14,
            fontSize: 12.5,
            color: '#ffb4ab',
            background: 'rgba(239,84,104,.1)',
            border: '1px solid rgba(239,84,104,.4)',
            borderRadius: 8,
            padding: '9px 12px',
            cursor: 'pointer',
          }}
        >
          {actionError} — the list was refreshed. Click to dismiss.
        </div>
      )}

      {/* Add a task */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div style={panelStyle}>
          <div style={panelLabelStyle}>Add a task</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              style={{
                flex: 'none',
                width: isPhone ? '100%' : 168,
                background: '#0d1620',
                border: '1px solid #284158',
                borderRadius: 7,
                color: '#dfeaf0',
                fontSize: 12,
                padding: '9px 8px',
                outline: 'none',
              }}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.n}. {s.title}
                </option>
              ))}
            </select>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="New task..."
              style={{
                flex: 1,
                background: '#0d1620',
                border: '1px solid #284158',
                borderRadius: 7,
                color: '#dfeaf0',
                fontSize: 12.5,
                padding: '9px 11px',
                outline: 'none',
              }}
            />
            <button
              onClick={add}
              disabled={busy || !draft.trim()}
              style={{
                border: 'none',
                background: `linear-gradient(180deg,${ACCENT},${ACCENT2})`,
                color: '#06231d',
                fontWeight: 600,
                fontSize: 12.5,
                padding: '0 15px',
                borderRadius: 7,
                cursor: busy || !draft.trim() ? 'default' : 'pointer',
                opacity: busy || !draft.trim() ? 0.6 : 1,
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Command bar — Claude parser arrives in Stage 4 */}
        <div style={panelStyle}>
          <div style={panelLabelStyle}>
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#06231d',
                fontWeight: 700,
                fontSize: 10,
                marginRight: 7,
              }}
            >
              ✦
            </span>
            Ask Claude / command
          </div>
          <input
            disabled
            placeholder="Command parser arrives in Stage 4 (done 7.3 · P 1.2 · add to ... · reset weekly)"
            style={{
              width: '100%',
              background: '#0d1620',
              border: '1px solid #284158',
              borderRadius: 7,
              color: '#5f7d8c',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              padding: '9px 11px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Sections — masonry columns (single column on phones) */}
      <div style={isPhone ? { columnCount: 1, columnGap: 16 } : { columnWidth: 360, columnGap: 16 }}>
        {visible.map((sec) => (
          <SectionCard key={sec.id} section={sec} busy={busy} onToggle={(id) => run(api.toggleTodoItem(id))} onRemove={(id) => run(api.removeTodoItem(id))} />
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  section,
  busy,
  onToggle,
  onRemove,
}: {
  section: TodoSection;
  busy: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      style={{
        breakInside: 'avoid',
        margin: '0 0 16px',
        background: 'rgba(13,34,46,.55)',
        border: '1px solid #1d3344',
        borderRadius: 10,
        padding: '15px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 16 }}>{section.icon}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#eaf6f1' }}>
            {section.n}. {section.title}
          </span>
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: '#6f9aa8' }}>
          {section.count}
        </span>
      </div>
      {section.empty && (
        <div style={{ fontSize: 11.5, color: '#5f7d8c', fontStyle: 'italic', padding: '4px 0' }}>
          — empty —
        </div>
      )}
      {section.items.map((item) => (
        <Row key={item.id} item={item} busy={busy} onToggle={onToggle} onRemove={onRemove} />
      ))}
    </div>
  );
}

function Row({
  item,
  busy,
  onToggle,
  onRemove,
}: {
  item: TodoItem;
  busy: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '7px 0',
        borderBottom: '1px solid rgba(40,65,88,.4)',
      }}
    >
      {item.marker === 'check' && (
        <button
          onClick={() => !busy && onToggle(item.id)}
          style={{
            flex: 'none',
            width: 18,
            height: 18,
            marginTop: 1,
            borderRadius: 5,
            border: `1.5px solid ${item.done ? ACCENT : '#3a5670'}`,
            background: item.done ? ACCENT : 'transparent',
            color: '#06231d',
            fontSize: 11,
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          {item.done ? '✓' : ''}
        </button>
      )}
      {item.marker === 'dash' && (
        <span style={{ flex: 'none', width: 18, textAlign: 'center', color: ACCENT, marginTop: 1 }}>—</span>
      )}
      {item.marker === 'dot' && (
        <span style={{ flex: 'none', width: 18, textAlign: 'center', color: '#7fd9c5', marginTop: 1 }}>•</span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.4,
            color: item.done ? '#7488a5' : '#dfeaf0',
            textDecoration: item.done ? 'line-through' : 'none',
          }}
        >
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#5f7d8c', marginRight: 6 }}>
            {item.code}
          </span>
          {item.text}
        </div>
        {item.timer && (
          <span
            style={{
              display: 'inline-block',
              marginTop: 4,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9.5,
              color: item.overdue ? OVERDUE : ACCENT,
            }}
          >
            {item.timer}
          </span>
        )}
      </div>

      <button
        onClick={() => !busy && onRemove(item.id)}
        title="Remove"
        style={{
          flex: 'none',
          background: 'none',
          border: 'none',
          color: '#3f5b6c',
          fontSize: 15,
          lineHeight: 1,
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: 'rgba(13,34,46,.6)',
  border: '1px solid #1d3344',
  borderRadius: 9,
  padding: '14px 16px',
};

const panelLabelStyle: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  color: '#6f9aa8',
  marginBottom: 9,
  display: 'flex',
  alignItems: 'center',
};
