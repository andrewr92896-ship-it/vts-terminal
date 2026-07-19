import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { AiPrompt } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { Badge, SectionHeader, fieldLabel, ghostBtn, inputStyle, msgStyle, panel, primaryBtn } from './adminUi';
import { EditableText } from '../../copy/SiteCopy';

// Admin panel: edit the AI system prompts (the instructions the assistant
// follows) that used to be hardcoded. Each prompt shows its current text; the
// admin can reword it and save, or reset it back to the built-in default.
export function AdminAiInstructions({ theme }: { theme: Theme }) {
  const accentGrad = accentGradient(theme);
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-prompt working copy, save state, and message.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminAiPrompts()
      .then((r) => {
        if (!alive) return;
        setPrompts(r.prompts);
        setDrafts(Object.fromEntries(r.prompts.map((p) => [p.id, p.value])));
      })
      .catch((e) => alive && setLoadError(e instanceof ApiError ? e.message : 'Failed to load prompts'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Group prompts by their `group` field, preserving first-seen order.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, AiPrompt[]> = {};
    for (const p of prompts) {
      if (!map[p.group]) {
        map[p.group] = [];
        order.push(p.group);
      }
      map[p.group].push(p);
    }
    return order.map((g) => ({ group: g, items: map[g] }));
  }, [prompts]);

  function apply(updated: AiPrompt) {
    setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setDrafts((prev) => ({ ...prev, [updated.id]: updated.value }));
  }

  async function save(p: AiPrompt) {
    setBusyId(p.id);
    setMsg(null);
    try {
      const r = await api.adminSaveAiPrompt(p.id, drafts[p.id] ?? '');
      apply({ ...p, value: r.value, overridden: r.overridden });
      setMsg({ id: p.id, ok: true, text: r.overridden ? 'Saved your custom wording.' : 'Matches the default — override cleared.' });
    } catch (e) {
      setMsg({ id: p.id, ok: false, text: e instanceof ApiError ? e.message : 'Could not save' });
    } finally {
      setBusyId(null);
    }
  }

  async function reset(p: AiPrompt) {
    setBusyId(p.id);
    setMsg(null);
    try {
      const r = await api.adminResetAiPrompt(p.id);
      apply({ ...p, value: r.value, overridden: r.overridden });
      setMsg({ id: p.id, ok: true, text: 'Reset to the built-in default.' });
    } catch (e) {
      setMsg({ id: p.id, ok: false, text: e instanceof ApiError ? e.message : 'Could not reset' });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}><EditableText id="admin.ai.loading">Loading AI instructions...</EditableText></div>;
  if (loadError) return <div style={{ color: '#ef5468', padding: 20, fontSize: 13 }}>{loadError}</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="AI Instructions"
        subtitle="Edit what each AI feature is told to do. Changes apply the next time the feature runs. Reset any prompt to restore the built-in wording. Keep any {tokens} and JSON-format instructions intact."
      />

      {groups.map(({ group, items }) => (
        <div key={group} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#7488b5', fontWeight: 600, margin: '0 0 10px 2px' }}>
            {group}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((p) => {
              const draft = drafts[p.id] ?? '';
              const dirty = draft !== p.value;
              return (
                <div key={p.id} style={panel(theme)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#eef3ff' }}>{p.label}</span>
                    {p.overridden ? <Badge color={theme.accent}>Customized</Badge> : <Badge color="#7488b5">Default</Badge>}
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9fb0d6', lineHeight: 1.5 }}>{p.description}</p>
                  {p.placeholder && (
                    <div style={{ fontSize: 11, color: '#7fb3ff', marginBottom: 6 }}>
                      Keep this token in place: <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{p.placeholder}</code>
                    </div>
                  )}
                  <label style={fieldLabel}><EditableText id="admin.ai.f_instructions">Instructions</EditableText></label>
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    rows={Math.min(12, Math.max(4, Math.ceil(draft.length / 90)))}
                    maxLength={8000}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                  {msg && msg.id === p.id && <div style={msgStyle(msg.ok)}>{msg.text}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => save(p)} disabled={busyId === p.id || !dirty} style={{ ...primaryBtn(theme, accentGrad), opacity: busyId === p.id || !dirty ? 0.55 : 1 }}>
                      {busyId === p.id ? 'Saving…' : 'Save'}
                    </button>
                    {dirty && (
                      <button onClick={() => setDrafts((prev) => ({ ...prev, [p.id]: p.value }))} disabled={busyId === p.id} style={ghostBtn}>
                        Undo changes
                      </button>
                    )}
                    {p.overridden && (
                      <button onClick={() => reset(p)} disabled={busyId === p.id} style={ghostBtn}>
                        Reset to default
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
