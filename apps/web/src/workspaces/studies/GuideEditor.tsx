import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { GuideSlide, StudyGuide } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { EditableText } from '../../copy/SiteCopy';

// The study-presentation editor: rename the presentation and edit its slides —
// each slide's title and body, reorder them, or delete one. Attached
// screenshots are preserved (shown but not re-uploaded here). Saving replaces
// the presentation's slides in one call.

const muted = '#a99ff0';

interface EditSlide {
  uid: number;
  title: string;
  body: string;
  image: string | null;
}
let _uid = 1;

export function GuideEditor({
  theme,
  guideId,
  onClose,
}: {
  theme: Theme;
  guideId: string;
  onClose: (guides?: StudyGuide[]) => void;
}) {
  const accentGrad = accentGradient(theme);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [slides, setSlides] = useState<EditSlide[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .studyGuide(guideId)
      .then((r) => {
        if (!alive) return;
        setName(r.guide.name);
        setSlides(r.guide.slides.map((s) => ({ uid: _uid++, title: s.title, body: s.body, image: s.image ?? null })));
        setLoading(false);
      })
      .catch(() => alive && (setLoadError(true), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [guideId]);

  const patch = (uid: number, p: Partial<EditSlide>) => setSlides((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...p } : s)));
  const removeSlide = (uid: number) => setSlides((prev) => prev.filter((s) => s.uid !== uid));
  const move = (uid: number, dir: -1 | 1) =>
    setSlides((prev) => {
      const i = prev.findIndex((s) => s.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addSlide = () => setSlides((prev) => [...prev, { uid: _uid++, title: '', body: '', image: null }]);

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      setError('Give the presentation a name.');
      return;
    }
    const kept: GuideSlide[] = slides
      .map((s) => ({ title: s.title.trim(), body: s.body.trim(), image: s.image }))
      .filter((s) => s.title || s.body || s.image);
    if (kept.length === 0) {
      setError('A presentation needs at least one slide with text or an image.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { guides } = await api.updateStudyGuide(guideId, { name: name.trim(), slides: kept });
      onClose(guides);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the presentation.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={wrap}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}><EditableText id="guideeditor.back" text="‹ Back" /></button>
        <div style={{ ...card(theme), color: muted, fontSize: 13, marginTop: 12 }}>
          <EditableText id="guideeditor.loading" text="Loading the presentation…" />
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={wrap}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}><EditableText id="guideeditor.back" text="‹ Back" /></button>
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13, marginTop: 12 }}>
          <EditableText id="guideeditor.load_error" text="Couldn’t load this presentation." />
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}>
          <EditableText id="guideeditor.back" text="‹ Back to presentations" />
        </button>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn(theme, accentGrad), opacity: saving ? 0.6 : 1 }}>
          {saving ? <EditableText id="guideeditor.saving" text="Saving…" /> : <EditableText id="guideeditor.save" text="Save changes" />}
        </button>
      </div>

      <div style={{ ...card(theme), marginBottom: 12 }}>
        <label style={fieldLabel}><EditableText id="guideeditor.name_label" text="Presentation name" /></label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={field(theme)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}><EditableText id="guideeditor.slides_heading" text="Slides" /> · {slides.length}</span>
        <button onClick={addSlide} style={ghostBtn(theme)}><EditableText id="guideeditor.add_slide" text="+ Add slide" /></button>
      </div>

      {error && <div style={{ ...warn, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slides.map((s, i) => (
          <div key={s.uid} style={card(theme)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: muted }}>Slide {i + 1}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => move(s.uid, -1)} disabled={i === 0} style={{ ...miniBtn(theme), opacity: i === 0 ? 0.4 : 1 }} title="Move up">↑</button>
                <button onClick={() => move(s.uid, 1)} disabled={i === slides.length - 1} style={{ ...miniBtn(theme), opacity: i === slides.length - 1 ? 0.4 : 1 }} title="Move down">↓</button>
                <button onClick={() => removeSlide(s.uid)} style={{ ...miniBtn(theme), color: '#ff9a9a', borderColor: '#ef5468' }} title="Delete slide">✕</button>
              </div>
            </div>
            <input value={s.title} onChange={(e) => patch(s.uid, { title: e.target.value })} placeholder="Slide title" maxLength={400} style={{ ...field(theme), marginBottom: 8, fontWeight: 700 }} />
            <textarea value={s.body} onChange={(e) => patch(s.uid, { body: e.target.value })} placeholder="Slide text" maxLength={6000} rows={4} style={{ ...field(theme), resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }} />
            {s.image && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={s.image} alt="slide screenshot" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 8, border: `1px solid ${theme.navBorder}` }} />
                <button onClick={() => patch(s.uid, { image: null })} style={{ ...miniBtn(theme), color: '#ff9a9a' }}><EditableText id="guideeditor.remove_image" text="Remove image" /></button>
              </div>
            )}
          </div>
        ))}
        {slides.length === 0 && <div style={{ ...card(theme), color: muted, fontSize: 13, textAlign: 'center' }}><EditableText id="guideeditor.no_slides" text="No slides. Add one above." /></div>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn(theme, accentGrad), opacity: saving ? 0.6 : 1 }}>
          {saving ? <EditableText id="guideeditor.saving" text="Saving…" /> : <EditableText id="guideeditor.save" text="Save changes" />}
        </button>
        <button onClick={() => onClose()} style={ghostBtn(theme)}><EditableText id="guideeditor.cancel" text="Cancel" /></button>
      </div>
    </div>
  );
}

const wrap: CSSProperties = { maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' };
const fieldLabel: CSSProperties = { display: 'block', fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 };
const warn: CSSProperties = { fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px' };

function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '16px 16px',
  };
}
function field(theme: Theme): CSSProperties {
  return {
    width: '100%',
    background: 'rgba(10,8,26,.6)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    padding: '9px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  };
}
function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return { border: 'none', background: grad, color: theme.accentText, fontSize: 13, fontWeight: 700, padding: '11px 18px', borderRadius: 8, cursor: 'pointer', minHeight: 44 };
}
function ghostBtn(theme: Theme): CSSProperties {
  return { border: `1px solid ${theme.navBorder}`, background: 'rgba(255,255,255,.05)', color: '#cdbcff', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', minHeight: 40 };
}
function miniBtn(theme: Theme): CSSProperties {
  return { border: `1px solid ${theme.navBorder}`, background: 'rgba(255,255,255,.05)', color: '#cdbcff', fontSize: 12, fontWeight: 700, padding: '5px 9px', borderRadius: 7, cursor: 'pointer', lineHeight: 1 };
}
