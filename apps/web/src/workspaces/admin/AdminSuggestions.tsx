import { useEffect, useState } from 'react';
import type { Theme } from '../../theme/themes';
import type { Suggestion } from '../../api/types';
import { api, ApiError } from '../../api/client';
import { panel, SectionHeader, ghostBtn, dangerBtn, msgStyle } from './adminUi';
import { Icon } from '../../components/Icon';
import { EditableText } from '../../copy/SiteCopy';

function dayTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Admin section: suggestions members sent from the Site Help workspace.
export function AdminSuggestions({ theme }: { theme: Theme }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminSuggestions()
      .then((r) => alive && (setItems(r.suggestions), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function run(p: Promise<{ suggestions: Suggestion[] }>) {
    setError(null);
    try {
      setItems((await p).suggestions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  const newCount = items.filter((s) => s.status !== 'reviewed').length;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <SectionHeader
        titleId="admin.suggestions.title"
        title="Suggestions"
        subtitle={`Ideas members sent in from Site Help.${newCount ? ` ${newCount} new.` : ''}`}
      />
      {error && <div style={msgStyle(false)}>{error}</div>}
      {!loaded ? (
        <div style={{ color: '#9fb0d6', fontSize: 12.5 }}><EditableText id="admin.suggestions.loading">Loading...</EditableText></div>
      ) : items.length === 0 ? (
        <div style={panel(theme)}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#9fb0d6' }}><EditableText id="admin.suggestions.empty">No suggestions yet.</EditableText></p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((s) => {
            const reviewed = s.status === 'reviewed';
            return (
              <div key={s.id} style={{ ...panel(theme), opacity: reviewed ? 0.7 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon name="lightbulb" size={15} color={theme.accent} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#eef3ff' }}>{s.author}</span>
                  {!reviewed && (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600, color: '#7fd6a3', border: '1px solid #7fd6a3', borderRadius: 4, padding: '1px 6px' }}>NEW</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#7488b5', fontFamily: "'IBM Plex Mono', monospace" }}>{dayTime(s.createdAt)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#ccd7ef', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{s.body}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => void run(api.adminSetSuggestionStatus(s.id, reviewed ? 'new' : 'reviewed'))}
                    style={ghostBtn}
                  >
                    {reviewed ? 'Mark new' : 'Mark reviewed'}
                  </button>
                  <button onClick={() => void run(api.adminDeleteSuggestion(s.id))} style={dangerBtn}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
