import { useEffect, useState } from 'react';
import type { Theme } from '../../theme/themes';
import type { BugReport } from '../../api/types';
import { api, ApiError } from '../../api/client';
import { panel, SectionHeader, ghostBtn, dangerBtn, msgStyle } from './adminUi';
import { Icon } from '../../components/Icon';
import { EditableText } from '../../copy/SiteCopy';

function dayTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: 'Awaiting reporter', color: '#E5A43B' },
  submitted: { label: 'Filed', color: '#2FC77E' },
  resolved: { label: 'Resolved', color: '#6C9EFF' },
};

// Admin section: bug reports filed from Site Help, with the AI intake thread so
// the admin sees the full clarified report.
export function AdminBugReports({ theme }: { theme: Theme }) {
  const [items, setItems] = useState<BugReport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminBugReports()
      .then((r) => alive && (setItems(r.reports), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function run(p: Promise<{ reports: BugReport[] }>) {
    setError(null);
    try {
      setItems((await p).reports);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  const openCount = items.filter((r) => r.status !== 'resolved').length;

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <SectionHeader
        titleId="admin.bugs.title"
        title="Bug Reports"
        subtitle={`Reports filed from Site Help, with the assistant’s intake chat.${openCount ? ` ${openCount} open.` : ''}`}
      />
      {error && <div style={msgStyle(false)}>{error}</div>}
      {!loaded ? (
        <div style={{ color: '#9fb0d6', fontSize: 12.5 }}><EditableText id="admin.bugs.loading">Loading...</EditableText></div>
      ) : items.length === 0 ? (
        <div style={panel(theme)}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#9fb0d6' }}><EditableText id="admin.bugs.empty">No bug reports yet.</EditableText></p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.open;
            const expanded = openId === r.id;
            return (
              <div key={r.id} style={panel(theme)}>
                <button
                  onClick={() => setOpenId(expanded ? null : r.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                >
                  <Icon name="bug" size={16} color={theme.accent} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#eef3ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: '#7e92c0', marginTop: 2 }}>
                      {r.author} · {dayTime(r.createdAt)}
                    </span>
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, fontWeight: 600, color: meta.color, border: `1px solid ${meta.color}`, borderRadius: 4, padding: '2px 7px', flex: 'none' }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#7488b5' }}>{expanded ? '▴' : '▾'}</span>
                </button>

                {expanded && (
                  <>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${theme.navBorder}`, paddingTop: 12 }}>
                      {r.messages.map((m) => (
                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-start' : 'flex-start' }}>
                          <div style={{ fontSize: 10, color: m.role === 'ai' ? theme.accent : '#7e92c0', margin: '0 0 3px', fontWeight: 600 }}>
                            {m.role === 'ai' ? 'Assistant' : r.author}
                          </div>
                          <div
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.55,
                              padding: '9px 12px',
                              borderRadius: 10,
                              whiteSpace: 'pre-wrap',
                              color: '#dfe7fa',
                              background: m.role === 'ai' ? 'rgba(108,158,255,.08)' : 'rgba(255,255,255,.04)',
                              border: `1px solid ${theme.navBorder}`,
                              maxWidth: '100%',
                            }}
                          >
                            {m.body}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {r.status !== 'resolved' ? (
                        <button onClick={() => void run(api.adminSetBugStatus(r.id, 'resolved'))} style={ghostBtn}>
                          Mark resolved
                        </button>
                      ) : (
                        <button onClick={() => void run(api.adminSetBugStatus(r.id, 'submitted'))} style={ghostBtn}>
                          Reopen
                        </button>
                      )}
                      <button onClick={() => void run(api.adminDeleteBug(r.id))} style={dangerBtn}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
