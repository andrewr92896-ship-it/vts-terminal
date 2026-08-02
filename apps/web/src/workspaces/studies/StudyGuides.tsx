import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { GuideSlide, GuideDraftSlide, StudyGuide, StudyGuideDetail } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { useResponsive } from '../../hooks/useMediaQuery';
import { ActionTile } from './ActionTile';
import { useAuth } from '../../auth/AuthContext';
import { fileToScaledDataUrl } from '../../lib/image';
import { GuidePresentation } from './GuidePresentation';
import { GuideEditor } from './GuideEditor';

// Study guides are split across two Studies sections:
//   • Study Creation (`StudyGuideCreator`) — where a team *builds* a guide by
//     conversing with VTS AI (which drafts the slide text) and attaching its own
//     screenshots.
//   • Study Guides (`StudyGuidesLibrary`) — where the finished guides live and
//     are presented like a slideshow.
// The public demo sees both read-only.

const muted = '#a99ff0';

// A slide as the builder holds it: a stable client id so an attached screenshot
// survives the AI rewriting the text, plus the title/body/image.
interface BuildSlide {
  id: string;
  title: string;
  body: string;
  image: string | null;
}

// One conversation turn. `send` is what we post to the model (assistant turns
// carry the model's own JSON so it sees the running draft); `display` is what the
// user reads (their message, or the assistant's friendly reply).
interface Turn {
  role: 'user' | 'assistant';
  send: string;
  display: string;
}

// ---- The "Study Guides" section: the finished guides, presented ----
// This is the library side — list, present, and manage guides. Building a new
// one happens in Study Creation (StudyGuideCreator).
export function StudyGuidesLibrary({
  theme,
  onNavigate,
}: {
  theme: Theme;
  onNavigate?: (screen: string) => void;
}) {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;

  const [guides, setGuides] = useState<StudyGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [presenting, setPresenting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .studyGuides()
      .then((r) => {
        if (alive) {
          setGuides(r.guides);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  async function remove(id: string) {
    try {
      const r = await api.deleteStudyGuide(id);
      setGuides(r.guides);
    } catch {
      /* best-effort */
    }
  }

  if (presenting) {
    return <GuidePresentation theme={theme} guideId={presenting} onExit={() => setPresenting(null)} />;
  }
  if (editing) {
    return (
      <GuideEditor
        theme={theme}
        guideId={editing}
        onClose={(updated) => {
          if (updated) setGuides(updated);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
            {"Team Study Presentations"}
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            {"Present your team’s slide-by-slide study presentations."}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ ...card(theme), color: muted, fontSize: 13 }}>
          {"Loading your team’s study guides…"}
        </div>
      ) : loadError ? (
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13 }}>
          {"Couldn’t load your team’s study guides. Try again in a moment."}
        </div>
      ) : (
        // The build tile closes the list, so an empty library still offers the
        // way forward without a separate empty-state block.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {guides.map((g) => (
            <GuideCard
              key={g.id}
              guide={g}
              theme={theme}
              canManage={!readOnly && (g.createdBy === user?.id || user?.roles.includes('admin') === true)}
              onPresent={() => setPresenting(g.id)}
              onEdit={() => setEditing(g.id)}
              onDelete={() => remove(g.id)}
            />
          ))}
          {!readOnly && onNavigate && (
            <ActionTile
              theme={theme}
              icon="sparkles"
              title="Build a presentation"
              subtitle="Draft the slides with VTS AI, or upload a PowerPoint."
              feature="studyCreation"
              onClick={() => onNavigate('st_decks')}
              onLockedClick={() => onNavigate('my_access')}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---- The "Study Creation" side: build a new guide (from scratch or a .pptx) ----
export function StudyGuideCreator({
  theme,
  onNavigate,
}: {
  theme: Theme;
  onNavigate?: (screen: string) => void;
}) {
  const { user } = useAuth();
  const readOnly = !!user?.isDemo;
  const accentGrad = accentGradient(theme);

  // null = not building; otherwise the seed the builder opens with (empty for a
  // from-scratch guide, or the slides parsed out of an uploaded presentation).
  const [builderInit, setBuilderInit] = useState<{ name?: string; slides?: BuildSlide[] } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setError(
        /\.ppt$/i.test(file.name)
          ? 'That’s an older .ppt file. Open it in PowerPoint or Google Slides and export it as .pptx, then upload again.'
          : 'Upload a PowerPoint .pptx file. In Google Slides, use File ▸ Download ▸ Microsoft PowerPoint (.pptx).',
      );
      return;
    }
    setParsing(true);
    setError(null);
    setSavedName(null);
    try {
      const { parsePptx } = await import('../../lib/pptx');
      const parsed = await parsePptx(file);
      const slides: BuildSlide[] = parsed.map((s) => ({ id: nextSlideId(), ...s }));
      setBuilderInit({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 120), slides });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that presentation. Try exporting it as .pptx again.');
    } finally {
      setParsing(false);
    }
  }

  if (builderInit) {
    return (
      <GuideBuilder
        theme={theme}
        initialName={builderInit.name}
        initialSlides={builderInit.slides}
        onCancel={() => setBuilderInit(null)}
        onSaved={(_gs, guide) => {
          setBuilderInit(null);
          setSavedName(guide.name);
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: '#eef3ff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>
            {"Team Study Presentations"}
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: muted }}>
            {"Build a slide-by-slide study presentation with VTS AI, or upload a presentation — then present it from Study Presentations."}
          </p>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { setSavedName(null); setError(null); setBuilderInit({}); }} style={primaryBtn(theme, accentGrad)}>
              {"✦ New presentation"}
            </button>
            <label style={{ ...ghostBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 6, cursor: parsing ? 'default' : 'pointer', opacity: parsing ? 0.6 : 1 }}>
              {parsing ? 'Reading…' : '⬆ Upload a presentation'}
              <input
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={onUpload}
                disabled={parsing}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        )}
      </div>

      {error && (
        <div onClick={() => setError(null)} style={{ fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', marginBottom: 12 }}>
          {error} — click to dismiss.
        </div>
      )}

      {savedName && (
        <div style={{ ...card(theme), marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: '#dfe7fa', lineHeight: 1.5 }}>
            Saved <strong style={{ color: '#fff' }}>{savedName}</strong>. It’s ready to present in Study Guides.
          </div>
          {onNavigate && (
            <button onClick={() => onNavigate('st_guides')} style={primaryBtn(theme, accentGrad)}>
              ▶ Open Study Guides
            </button>
          )}
        </div>
      )}

      <div style={{ ...card(theme), textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📽️</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          {"Build a study guide"}
        </div>
        <div style={{ fontSize: 12.5, color: muted, maxWidth: 460, margin: '0 auto', lineHeight: 1.55 }}>
          {readOnly
            ? "A team builds study guides here by chatting with VTS AI to draft the slides, or by uploading a PowerPoint. They add screenshots, then present it from Study Guides."
            : "Describe what you want to teach and go back and forth with VTS AI to shape the slides — or upload a PowerPoint (export Google Slides as .pptx). Refine, drop in screenshots, then present it from Study Guides."}
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <button onClick={() => { setSavedName(null); setError(null); setBuilderInit({}); }} style={primaryBtn(theme, accentGrad)}>
              {"✦ New study guide"}
            </button>
            <label style={{ ...ghostBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 6, cursor: parsing ? 'default' : 'pointer', opacity: parsing ? 0.6 : 1 }}>
              {parsing ? 'Reading…' : '⬆ Upload a presentation'}
              <input
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={onUpload}
                disabled={parsing}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function GuideCard({
  guide,
  theme,
  canManage,
  onPresent,
  onEdit,
  onDelete,
}: {
  guide: StudyGuide;
  theme: Theme;
  canManage: boolean;
  onPresent: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{guide.name}</h3>
        <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 5, padding: '2px 6px' }}>
          Slides
        </span>
      </div>
      {guide.description && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#d7ccff', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {guide.description}
        </p>
      )}
      <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
        {guide.slideCount} slide{guide.slideCount === 1 ? '' : 's'}
        {guide.createdByName && ` · by ${guide.createdByName}`}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={onPresent} disabled={guide.slideCount === 0} style={{ ...primaryBtn(theme, accentGradient(theme)), minHeight: 38, opacity: guide.slideCount === 0 ? 0.6 : 1 }}>
          ▶ Present
        </button>
        {canManage && !confirm && (
          <button onClick={onEdit} style={ghostBtn(theme)}>
            Edit
          </button>
        )}
        {canManage && !confirm && (
          <button onClick={() => setConfirm(true)} style={ghostBtn(theme)}>
            Delete
          </button>
        )}
        {canManage && confirm && (
          <>
            <button onClick={onDelete} style={{ ...ghostBtn(theme), borderColor: '#ef5468', color: '#ff9a9a' }}>
              Confirm delete
            </button>
            <button onClick={() => setConfirm(false)} style={ghostBtn(theme)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- The builder: a back-and-forth chat that drafts slides, plus screenshots ----

let slideSeq = 0;
function nextSlideId(): string {
  slideSeq += 1;
  return `s${slideSeq}_${Math.random().toString(36).slice(2, 7)}`;
}

// Merge a fresh AI draft into the existing slides, preserving each slide's
// attached screenshot by its stable id (the model echoes ids it kept; brand-new
// slides come back as "new" and get a fresh id here).
function reconcile(prev: BuildSlide[], draft: GuideDraftSlide[]): BuildSlide[] {
  const byId = new Map(prev.map((s) => [s.id, s]));
  return draft.map((d) => {
    const existing = d.id && d.id !== 'new' ? byId.get(d.id) : undefined;
    return {
      id: existing ? existing.id : nextSlideId(),
      title: d.title,
      body: d.body,
      image: existing ? existing.image : null,
    };
  });
}

const SEED_PROMPTS = [
  'Build a study guide on candlestick reversal patterns.',
  'Create a guide explaining risk-to-reward and position sizing.',
  'Make a study guide on the basics of options trading.',
];

function GuideBuilder({
  theme,
  onCancel,
  onSaved,
  initialName,
  initialSlides,
}: {
  theme: Theme;
  onCancel: () => void;
  onSaved: (guides: StudyGuide[], guide: StudyGuideDetail) => void;
  // When opened from an uploaded presentation, the builder starts with these
  // slides already in place (the user then refines them / adds screenshots).
  initialName?: string;
  initialSlides?: BuildSlide[];
}) {
  const { isPhone } = useResponsive();
  const accentGrad = accentGradient(theme);

  // Snapshot the imported slides once so the ids stay stable across renders.
  const seeded = useMemo(() => initialSlides ?? [], [initialSlides]);

  const [name, setName] = useState(initialName ?? '');
  // Seed the transcript with an assistant turn carrying the imported slides so
  // the model sees (and preserves) them by id on the user's first refinement.
  const [turns, setTurns] = useState<Turn[]>(() =>
    seeded.length > 0
      ? [
          {
            role: 'assistant',
            send: JSON.stringify({
              reply: 'Imported your presentation.',
              slides: seeded.map((s) => ({ id: s.id, title: s.title, body: s.body })),
            }),
            display:
              'I imported your presentation into the slides on the right. Tell me what to refine — or just add screenshots and save.',
          },
        ]
      : [],
  );
  const [slides, setSlides] = useState<BuildSlide[]>(seeded);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const nextTurns: Turn[] = [...turns, { role: 'user', send: t, display: t }];
    setTurns(nextTurns);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const payload = nextTurns.map((m) => ({ role: m.role, content: m.send }));
      const { reply, slides: draft } = await api.studyGuideChat(payload);
      const merged = reconcile(slides, draft);
      setSlides(merged);
      // Feed the reconciled draft (with stable ids) back as the assistant turn so
      // the model keeps referencing the same slide ids on the next turn.
      const assistantSend = JSON.stringify({
        reply,
        slides: merged.map((s) => ({ id: s.id, title: s.title, body: s.body })),
      });
      setTurns([...nextTurns, { role: 'assistant', send: assistantSend, display: reply }]);
      if (!name.trim() && merged.length > 0 && merged[0].title) setName(merged[0].title.slice(0, 120));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 503
            ? 'VTS AI isn’t configured yet — an API key needs to be set on the server.'
            : e.status === 403
              ? 'This is a read-only demo, so study guides can’t be built here.'
              : e.message
          : 'Could not reach the guide builder. Please try again.',
      );
      // Roll the user's turn back so they can retry without a dangling message.
      setTurns(turns);
      setInput(t);
    } finally {
      setBusy(false);
    }
  }

  function patchSlide(id: string, patch: Partial<BuildSlide>) {
    setSlides((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function moveSlide(id: string, dir: -1 | 1) {
    setSlides((cur) => {
      const i = cur.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function deleteSlide(id: string) {
    setSlides((cur) => cur.filter((s) => s.id !== id));
  }
  function addBlankSlide() {
    const id = nextSlideId();
    setSlides((cur) => [...cur, { id, title: '', body: '', image: null }]);
    setSelectedId(id);
  }

  async function attachImage(id: string, file: File) {
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      patchSlide(id, { image: dataUrl });
    } catch {
      setError('Could not read that image. Try a PNG or JPEG screenshot.');
    }
  }

  // Paste a screenshot straight onto the selected slide (or the last slide).
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      const target = selectedId ?? slides[slides.length - 1]?.id;
      if (!target) return;
      e.preventDefault();
      await attachImage(target, file);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, slides]);

  const canSave = !saving && name.trim().length > 0 && slides.some((s) => s.title || s.body || s.image);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const payload: GuideSlide[] = slides
        .filter((s) => s.title || s.body || s.image)
        .map((s) => ({ title: s.title, body: s.body, image: s.image }));
      const res = await api.saveStudyGuide({ name: name.trim(), slides: payload });
      onSaved(res.guides, res.guide);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 403
            ? 'This is a read-only demo, so study guides can’t be saved here.'
            : e.message
          : 'Could not save the study guide. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  const chatPane = (
    <div style={{ ...card(theme), display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
        {"Build it with VTS AI"}
      </div>
      <div
        ref={threadRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 120,
          maxHeight: isPhone ? 260 : 360,
          overflowY: 'auto',
          padding: '2px 2px',
        }}
      >
        {turns.length === 0 && !busy && (
          <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.6 }}>
            Tell VTS AI what to teach and it drafts the slides. Then keep chatting to refine them — “add a slide on
            dojis”, “make slide 2 shorter”, “reorder so the summary is last”.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {SEED_PROMPTS.map((p) => (
                <button key={p} onClick={() => void send(p)} style={seedBtn(theme)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((m, i) => (
          <div key={i} style={m.role === 'user' ? userRow : assistantRow}>
            <div style={m.role === 'user' ? userBubble(theme) : assistantBubble(theme)}>
              {m.role === 'assistant' && (
                <div style={{ fontSize: 9.5, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, marginBottom: 4 }}>
                  VTS AI
                </div>
              )}
              {m.display}
            </div>
          </div>
        ))}
        {busy && (
          <div style={assistantRow}>
            <div style={{ ...assistantBubble(theme), color: muted }}>
              {"Drafting…"}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void send(input);
            }
          }}
          disabled={busy}
          placeholder={turns.length ? 'Ask for a change…' : 'Describe the study guide you want…'}
          maxLength={2000}
          style={{ flex: 1, minWidth: 0, fontSize: 16, padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.navBorder}`, background: 'rgba(255,255,255,.05)', color: '#eef3ff', outline: 'none' }}
        />
        <button onClick={() => void send(input)} disabled={busy || !input.trim()} aria-label="Send" style={{ border: 'none', background: accentGrad, color: theme.accentText, fontSize: 15, fontWeight: 700, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', opacity: busy || !input.trim() ? 0.6 : 1 }}>
          →
        </button>
      </div>
    </div>
  );

  const previewPane = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
          {"Slides"} {slides.length > 0 && <span style={{ color: muted, fontWeight: 500 }}>· {slides.length}</span>}
        </div>
        {slides.length > 0 && (
          <button onClick={addBlankSlide} style={ghostBtn(theme)}>
            {"+ Blank slide"}
          </button>
        )}
      </div>
      {slides.length === 0 ? (
        <div style={{ ...card(theme), color: muted, fontSize: 12.5, textAlign: 'center', lineHeight: 1.6 }}>
          {"Your slides appear here as VTS AI drafts them."}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {slides.map((s, i) => (
            <SlideEditor
              key={s.id}
              theme={theme}
              index={i}
              total={slides.length}
              slide={s}
              selected={selectedId === s.id}
              onSelect={() => setSelectedId(s.id)}
              onChange={(patch) => patchSlide(s.id, patch)}
              onMove={(dir) => moveSlide(s.id, dir)}
              onDelete={() => deleteSlide(s.id)}
              onAttach={(file) => attachImage(s.id, file)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', color: '#eef3ff', animation: 'fadeIn .25s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={onCancel} style={ghostBtn(theme)}>
          {"‹ Back"}
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Study guide name — e.g. “Chart Patterns 101”"
          maxLength={120}
          style={{ flex: 1, minWidth: 180, fontSize: 16, padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.navBorder}`, background: 'rgba(10,8,26,.6)', color: '#fff', outline: 'none' }}
        />
        <button onClick={() => void save()} disabled={!canSave} style={{ ...primaryBtn(theme, accentGrad), opacity: canSave ? 1 : 0.6 }}>
          {saving ? "Saving…" : "Save guide"}
        </button>
      </div>

      {error && (
        <div onClick={() => setError(null)} style={{ fontSize: 12.5, color: '#ffb4ab', background: 'rgba(239,84,104,.1)', border: '1px solid rgba(239,84,104,.4)', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', marginBottom: 12 }}>
          {error} — click to dismiss.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '360px 1fr', gap: 14, alignItems: 'start' }}>
        {chatPane}
        {previewPane}
      </div>
    </div>
  );
}

function SlideEditor({
  theme,
  index,
  total,
  slide,
  selected,
  onSelect,
  onChange,
  onMove,
  onDelete,
  onAttach,
}: {
  theme: Theme;
  index: number;
  total: number;
  slide: BuildSlide;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<BuildSlide>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAttach: (file: File) => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        ...card(theme),
        padding: 14,
        border: `1px solid ${selected ? theme.accent : theme.navBorder}`,
        boxShadow: selected ? `0 0 0 1px ${theme.accent}` : undefined,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, color: theme.accentText, background: accentGradient(theme), borderRadius: 5, padding: '2px 8px' }}>
          {index + 1}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); onMove(-1); }} disabled={index === 0} title="Move up" style={{ ...miniBtn(theme), opacity: index === 0 ? 0.4 : 1 }}>↑</button>
        <button onClick={(e) => { e.stopPropagation(); onMove(1); }} disabled={index === total - 1} title="Move down" style={{ ...miniBtn(theme), opacity: index === total - 1 ? 0.4 : 1 }}>↓</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete slide" style={{ ...miniBtn(theme), color: '#ff9a9a', borderColor: '#ef5468' }}>✕</button>
      </div>
      <input
        value={slide.title}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Slide title"
        maxLength={200}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, fontWeight: 700, padding: '8px 10px', borderRadius: 7, border: `1px solid ${theme.navBorder}`, background: 'rgba(10,8,26,.5)', color: '#fff', outline: 'none', marginBottom: 8 }}
      />
      <textarea
        value={slide.body}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Slide text…"
        rows={4}
        maxLength={4000}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.55, padding: '8px 10px', borderRadius: 7, border: `1px solid ${theme.navBorder}`, background: 'rgba(10,8,26,.5)', color: '#dfe7fa', outline: 'none', resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
      />
      {slide.image ? (
        <div style={{ marginTop: 10, position: 'relative' }}>
          <img src={slide.image} alt="" style={{ width: '100%', borderRadius: 8, border: `1px solid ${theme.navBorder}`, display: 'block' }} />
          <button
            onClick={(e) => { e.stopPropagation(); onChange({ image: null }); }}
            style={{ position: 'absolute', top: 8, right: 8, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(12,10,28,.8)', border: `1px solid ${theme.navBorder}`, borderRadius: 6, padding: '5px 9px', cursor: 'pointer' }}
          >
            Remove screenshot
          </button>
        </div>
      ) : (
        <label
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, ...ghostBtn(theme), cursor: 'pointer', fontSize: 12 }}
        >
          📎 Add screenshot
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAttach(file);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </label>
      )}
    </div>
  );
}

// ---- shared styles ----

export function card(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '18px 18px',
  };
}

function primaryBtn(theme: Theme, grad: string): CSSProperties {
  return {
    border: 'none',
    background: grad,
    color: theme.accentText,
    fontSize: 13,
    fontWeight: 700,
    padding: '11px 18px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  };
}

function ghostBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };
}

function miniBtn(theme: Theme): CSSProperties {
  return {
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.05)',
    color: '#cdbcff',
    fontSize: 12,
    fontWeight: 700,
    width: 30,
    height: 30,
    borderRadius: 7,
    cursor: 'pointer',
    lineHeight: 1,
  };
}

function seedBtn(theme: Theme): CSSProperties {
  return {
    textAlign: 'left',
    border: `1px solid ${theme.navBorder}`,
    background: 'rgba(255,255,255,.04)',
    color: '#dfe7fa',
    fontSize: 12.5,
    fontWeight: 500,
    padding: '9px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    lineHeight: 1.4,
  };
}

const userRow: CSSProperties = { display: 'flex', justifyContent: 'flex-end' };
const assistantRow: CSSProperties = { display: 'flex', justifyContent: 'flex-start' };

function userBubble(theme: Theme): CSSProperties {
  return {
    maxWidth: '88%',
    fontSize: 12.5,
    lineHeight: 1.5,
    color: '#fff',
    background: 'rgba(255,255,255,.08)',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: '10px 10px 2px 10px',
    padding: '8px 11px',
    whiteSpace: 'pre-wrap',
  };
}

function assistantBubble(theme: Theme): CSSProperties {
  return {
    maxWidth: '92%',
    fontSize: 13,
    lineHeight: 1.6,
    color: '#dfe7fa',
    background: 'rgba(255,255,255,.04)',
    border: `1px solid ${theme.navBorder}`,
    borderLeft: `3px solid ${theme.accent}`,
    borderRadius: '10px 10px 10px 2px',
    padding: '9px 12px',
    whiteSpace: 'pre-wrap',
  };
}
