import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { HOWTO_TOPICS, mergedTutorial, serializeTutorial, tutorialFor, type Tutorial } from '../../help/tutorials';
import {
  Badge,
  SectionHeader,
  fieldLabel,
  ghostBtn,
  ghostDangerBtn,
  inputStyle,
  msgStyle,
  panel,
  primaryBtn,
} from './adminUi';

// Admin panel: edit the wording of the Site Help "How to" walkthroughs. Each
// screen's guide can be reworded (title, intro, and numbered steps) and saved,
// or reset back to the built-in copy.
export function AdminContent({ theme }: { theme: Theme }) {
  const accentGrad = accentGradient(theme);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState(HOWTO_TOPICS[0].key);
  const [draft, setDraft] = useState<Tutorial>(() => tutorialFor(HOWTO_TOPICS[0].key));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .adminSiteContent()
      .then((r) => {
        if (!alive) return;
        setOverrides(r.howto);
        setDraft(clone(mergedTutorial(HOWTO_TOPICS[0].key, r.howto)));
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const overridden = overrides[screen] != null;

  function selectScreen(key: string) {
    setScreen(key);
    setDraft(clone(mergedTutorial(key, overrides)));
    setMsg(null);
  }

  function updateStep(i: number, patch: Partial<{ title: string; body: string }>) {
    setDraft((d) => ({ ...d, steps: d.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  }
  function addStep() {
    setDraft((d) => ({ ...d, steps: [...d.steps, { title: '', body: '' }] }));
  }
  function removeStep(i: number) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, idx) => idx !== i) }));
  }

  async function save() {
    if (!draft.title.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const clean: Tutorial = {
      title: draft.title.trim(),
      intro: draft.intro?.trim() || undefined,
      steps: draft.steps.map((s) => ({ title: s.title.trim(), body: s.body.trim() })).filter((s) => s.title || s.body),
    };
    try {
      await api.adminSaveHowto(screen, serializeTutorial(clean));
      setOverrides((o) => ({ ...o, [screen]: serializeTutorial(clean) }));
      setMsg({ ok: true, text: 'Saved. Members see the new wording in Site Help.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setMsg(null);
    try {
      await api.adminResetHowto(screen);
      const next = { ...overrides };
      delete next[screen];
      setOverrides(next);
      setDraft(clone(tutorialFor(screen)));
      setMsg({ ok: true, text: 'Reset to the built-in wording.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not reset' });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ color: '#8ea3cc', padding: 20, fontSize: 13 }}>{"Loading content..."}</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#dfe7fa' }}>
      <SectionHeader
        title="Site Wording"
        subtitle="Edit the “How to” walkthroughs members see in Site Help. Pick a screen, reword its guide, and save — or reset it back to the built-in copy."
      />

      {/* Screen picker */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {HOWTO_TOPICS.map((tp) => {
          const on = tp.key === screen;
          const custom = overrides[tp.key] != null;
          return (
            <button
              key={tp.key}
              onClick={() => selectScreen(tp.key)}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: '8px 13px',
                borderRadius: 999,
                border: `1px solid ${on ? theme.accent : theme.navBorder}`,
                cursor: 'pointer',
                color: on ? theme.accentText : '#aebcd8',
                background: on ? accentGrad : 'transparent',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {tp.label}
              {custom && <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? theme.accentText : theme.accent }} />}
            </button>
          );
        })}
      </div>

      <div style={panel(theme)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {overridden ? <Badge color={theme.accent}>Customized</Badge> : <Badge color="#7488b5">Default</Badge>}
        </div>

        <label style={fieldLabel}>{"Title"}</label>
        <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={120} style={inputStyle} />

        <label style={{ ...fieldLabel, marginTop: 12 }}>{"Intro (optional)"}</label>
        <textarea
          value={draft.intro ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, intro: e.target.value }))}
          rows={2}
          maxLength={600}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />

        <div style={{ ...fieldLabel, marginTop: 14, marginBottom: 8 }}>{"Steps"}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draft.steps.map((s, i) => (
            <div key={i} style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 8, padding: 10, background: 'rgba(0,0,0,.16)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#7488b5', fontWeight: 700, flex: 'none' }}>{i + 1}.</span>
                <input value={s.title} onChange={(e) => updateStep(i, { title: e.target.value })} placeholder="Step title" maxLength={120} style={{ ...inputStyle, minHeight: 34 }} />
                <button onClick={() => removeStep(i)} style={{ ...ghostDangerBtn, minHeight: 34, padding: '6px 10px' }} title="Remove step">✕</button>
              </div>
              <textarea
                value={s.body}
                onChange={(e) => updateStep(i, { body: e.target.value })}
                rows={2}
                maxLength={1000}
                placeholder="Step description"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </div>
          ))}
          <button onClick={addStep} style={{ ...ghostBtn, alignSelf: 'flex-start' }}>{"+ Add step"}</button>
        </div>

        {msg && <div style={msgStyle(msg.ok)}>{msg.text}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={busy || !draft.title.trim()} style={{ ...primaryBtn(theme, accentGrad), opacity: busy || !draft.title.trim() ? 0.55 : 1 }}>
            {busy ? 'Saving…' : "Save wording"}
          </button>
          {overridden && (
            <button onClick={reset} disabled={busy} style={ghostBtn}>{"Reset to default"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function clone(t: Tutorial): Tutorial {
  return { title: t.title, intro: t.intro, steps: t.steps.map((s) => ({ title: s.title, body: s.body })) };
}
