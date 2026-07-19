import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { EditableText } from '../../copy/SiteCopy';

// The study-game editor: rename the game, manage its categories, and edit every
// question (stem, the four options, the correct answer, the explanation, and the
// category). Questions can be sorted by category, and VTS AI can auto-categorize
// them (optionally with a custom prompt). Saving replaces the game's questions
// and category list in one call.

const muted = '#a99ff0';
const GREEN = '#35c47b';
type Letter = 'A' | 'B' | 'C' | 'D';
const LETTERS: Letter[] = ['A', 'B', 'C', 'D'];

interface EditQ {
  uid: number;
  topic: string;
  stem: string;
  options: { label: Letter; text: string }[];
  answer: Letter;
  explanation: string;
  sourceName: string | null;
}

let _uid = 1;
function blankQuestion(topic: string): EditQ {
  return {
    uid: _uid++,
    topic,
    stem: '',
    options: LETTERS.map((l) => ({ label: l, text: '' })),
    answer: 'A',
    explanation: '',
    sourceName: null,
  };
}

export function DeckEditor({
  theme,
  deckId,
  onClose,
}: {
  theme: Theme;
  deckId: string;
  onClose: (decks?: TeamDeck[]) => void;
}) {
  const accentGrad = accentGradient(theme);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [questions, setQuestions] = useState<EditQ[]>([]);
  const [sortByCat, setSortByCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI categorize panel.
  const [catOpen, setCatOpen] = useState(false);
  const [catPrompt, setCatPrompt] = useState('');
  const [catConstrain, setCatConstrain] = useState(false);
  const [catBusy, setCatBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .studyDeck(deckId)
      .then((r) => {
        if (!alive) return;
        const d = r.deck;
        setName(d.name);
        setCategories(d.categories.length ? d.categories : []);
        setQuestions(
          d.questions.map((q) => ({
            uid: _uid++,
            topic: q.topic,
            stem: q.stem,
            options: LETTERS.map((l) => ({ label: l, text: q.options.find((o) => o.label === l)?.text ?? '' })),
            answer: q.answer,
            explanation: q.explanation ?? '',
            sourceName: q.sourceName ?? null,
          })),
        );
        setLoading(false);
      })
      .catch(() => alive && (setLoadError(true), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [deckId]);

  const patchQ = (uid: number, patch: Partial<EditQ>) =>
    setQuestions((prev) => prev.map((q) => (q.uid === uid ? { ...q, ...patch } : q)));
  const patchOption = (uid: number, label: Letter, text: string) =>
    setQuestions((prev) =>
      prev.map((q) => (q.uid === uid ? { ...q, options: q.options.map((o) => (o.label === label ? { ...o, text } : o)) } : q)),
    );

  function addCategory() {
    const c = newCat.trim();
    if (!c) return;
    if (!categories.some((x) => x.toLowerCase() === c.toLowerCase())) setCategories((prev) => [...prev, c]);
    setNewCat('');
  }
  function renameCategory(oldName: string, next: string) {
    const nm = next.trim();
    setCategories((prev) => prev.map((c) => (c === oldName ? (nm || c) : c)));
    if (nm) setQuestions((prev) => prev.map((q) => (q.topic === oldName ? { ...q, topic: nm } : q)));
  }
  function removeCategory(name: string) {
    const remaining = categories.filter((c) => c !== name);
    const fallback = remaining[0] ?? 'General';
    setCategories(remaining.length ? remaining : []);
    // Reassign any question in the removed category to a remaining one.
    setQuestions((prev) => prev.map((q) => (q.topic === name ? { ...q, topic: fallback } : q)));
  }

  function addQuestion(topic?: string) {
    const t = topic ?? categories[0] ?? 'General';
    setQuestions((prev) => [...prev, blankQuestion(t)]);
  }
  function removeQuestion(uid: number) {
    setQuestions((prev) => prev.filter((q) => q.uid !== uid));
  }

  // All categories that actually appear (stored list + any topic on a question),
  // so a question's category dropdown always includes its current value.
  const allCategories = useMemo(() => {
    const set = new Map<string, string>();
    for (const c of categories) set.set(c.toLowerCase(), c);
    for (const q of questions) if (q.topic.trim()) set.set(q.topic.trim().toLowerCase(), q.topic.trim());
    return [...set.values()];
  }, [categories, questions]);

  async function runAutoCategorize() {
    if (catBusy || questions.length === 0) return;
    setCatBusy(true);
    setError(null);
    try {
      const res = await api.categorizeStudyDeck({
        questions: questions.map((q, i) => ({ id: i, stem: q.stem || '(no text)' })),
        categories: catConstrain ? categories : undefined,
        instructions: catPrompt.trim() || undefined,
      });
      const byId = new Map(res.assignments.map((a) => [a.id, a.topic]));
      setQuestions((prev) => prev.map((q, i) => ({ ...q, topic: byId.get(i) ?? q.topic })));
      // Fold any AI-proposed categories into the list (keep existing empty ones).
      const proposed = [...new Set(res.assignments.map((a) => a.topic))];
      setCategories((prev) => {
        const merged = catConstrain ? prev : [...prev];
        for (const p of proposed) if (!merged.some((c) => c.toLowerCase() === p.toLowerCase())) merged.push(p);
        return merged;
      });
      setCatOpen(false);
    } catch (e) {
      setError(catError(e));
    } finally {
      setCatBusy(false);
    }
  }

  function validate(): string | null {
    if (!name.trim()) return 'Give the game a name.';
    for (const q of questions) {
      if (!q.stem.trim()) return 'Every question needs a question text.';
      if (q.options.some((o) => !o.text.trim())) return 'Every question needs all four options filled in.';
      if (!q.topic.trim()) return 'Every question needs a category.';
    }
    return null;
  }

  async function save() {
    if (saving) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { decks } = await api.updateStudyDeck(deckId, {
        name: name.trim(),
        categories,
        questions: questions.map((q) => ({
          topic: q.topic.trim(),
          stem: q.stem.trim(),
          options: q.options.map((o) => ({ label: o.label, text: o.text.trim() })),
          answer: q.answer,
          explanation: q.explanation.trim() || null,
          sourceName: q.sourceName,
        })),
      });
      onClose(decks);
    } catch (e) {
      setError(catError(e));
    } finally {
      setSaving(false);
    }
  }

  // Display order: grouped by category (in category order, unknown last) or the
  // natural question order.
  const displayed = useMemo(() => {
    if (!sortByCat) return questions.map((q, i) => ({ q, n: i + 1 }));
    const withN = questions.map((q, i) => ({ q, n: i + 1 }));
    const order = new Map(allCategories.map((c, i) => [c.toLowerCase(), i]));
    return [...withN].sort((a, b) => {
      const ai = order.get(a.q.topic.trim().toLowerCase()) ?? 999;
      const bi = order.get(b.q.topic.trim().toLowerCase()) ?? 999;
      return ai - bi || a.n - b.n;
    });
  }, [questions, sortByCat, allCategories]);

  if (loading) {
    return (
      <div style={wrap}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}>‹ Back</button>
        <div style={{ ...card(theme), color: muted, fontSize: 13, marginTop: 12 }}>
          <EditableText id="deckeditor.loading" text="Loading the study game…" />
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={wrap}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}>‹ Back</button>
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13, marginTop: 12 }}>
          <EditableText id="deckeditor.load_error" text="Couldn’t load this study game." />
        </div>
      </div>
    );
  }

  let lastCat = '';
  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}>
          <EditableText id="deckeditor.back" text="‹ Back to games" />
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn(theme, accentGrad), opacity: saving ? 0.6 : 1 }}>
            {saving ? <EditableText id="deckeditor.saving" text="Saving…" /> : <EditableText id="deckeditor.save" text="Save changes" />}
          </button>
        </div>
      </div>

      {/* Rename */}
      <div style={{ ...card(theme), marginBottom: 12 }}>
        <label style={fieldLabel}><EditableText id="deckeditor.game_name" text="Game name" /></label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={field(theme)} />
      </div>

      {/* Categories */}
      <div style={{ ...card(theme), marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}><EditableText id="deckeditor.categories" text="Categories" /></span>
          <button onClick={() => setCatOpen((v) => !v)} style={ghostBtn(theme)}><EditableText id="deckeditor.auto_cat_btn" text="✦ Auto-categorize" /></button>
        </div>

        {catOpen && (
          <div style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: 12, marginBottom: 12, background: 'rgba(10,8,26,.35)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: muted, lineHeight: 1.5 }}>
              <EditableText id="deckeditor.auto_cat_blurb" text="VTS AI sorts every question into a category. Leave the prompt blank to let it choose the groupings, or describe how you want them grouped." />
            </p>
            <textarea
              value={catPrompt}
              onChange={(e) => setCatPrompt(e.target.value)}
              placeholder="Optional: e.g. “Group by which chapter of the material each question tests.”"
              maxLength={2000}
              rows={2}
              style={{ ...field(theme), resize: 'vertical', minHeight: 48, fontFamily: 'inherit' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: muted, margin: '8px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={catConstrain} onChange={(e) => setCatConstrain(e.target.checked)} style={{ width: 15, height: 15, accentColor: theme.accent }} />
              <EditableText id="deckeditor.constrain_label" text="Only use my current categories (don’t invent new ones)" />
            </label>
            <button onClick={runAutoCategorize} disabled={catBusy} style={{ ...primaryBtn(theme, accentGrad), opacity: catBusy ? 0.6 : 1 }}>
              {catBusy ? <EditableText id="deckeditor.categorizing" text="Categorizing…" /> : <EditableText id="deckeditor.run_cat" text="Run auto-categorize" />}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allCategories.length === 0 && <span style={{ fontSize: 12, color: muted }}><EditableText id="deckeditor.no_categories" text="No categories yet — add one below or auto-categorize." /></span>}
          {allCategories.map((c) => {
            const count = questions.filter((q) => q.topic.trim().toLowerCase() === c.toLowerCase()).length;
            return (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  defaultValue={c}
                  onBlur={(e) => e.target.value.trim() !== c && renameCategory(c, e.target.value)}
                  style={{ ...field(theme), flex: 1, padding: '7px 10px' }}
                />
                <span style={{ fontSize: 11, color: muted, minWidth: 58, textAlign: 'right' }}>{count} q{count === 1 ? '' : 's'}</span>
                <button onClick={() => removeCategory(c)} title="Remove category" style={{ ...ghostBtn(theme), minHeight: 34, padding: '6px 10px', color: '#ff9a9a' }}>✕</button>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="New category name"
            maxLength={60}
            style={{ ...field(theme), flex: 1, minWidth: 160 }}
          />
          <button onClick={addCategory} style={ghostBtn(theme)}><EditableText id="deckeditor.add_category" text="+ Add category" /></button>
        </div>
      </div>

      {/* Questions toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}><EditableText id="deckeditor.questions_heading" text="Questions" /> · {questions.length}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={sortByCat} onChange={(e) => setSortByCat(e.target.checked)} style={{ width: 15, height: 15, accentColor: theme.accent }} />
            <EditableText id="deckeditor.sort_by_cat" text="Sort by category" />
          </label>
          <button onClick={() => addQuestion()} style={ghostBtn(theme)}><EditableText id="deckeditor.add_question" text="+ Add question" /></button>
        </div>
      </div>

      {error && <div style={{ ...warn, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {displayed.map(({ q, n }) => {
          const showHeader = sortByCat && q.topic !== lastCat;
          lastCat = q.topic;
          return (
            <div key={q.uid}>
              {showHeader && (
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.accent, margin: '6px 2px 8px' }}>
                  {q.topic || 'Uncategorized'}
                </div>
              )}
              <QuestionEditor
                q={q}
                n={n}
                theme={theme}
                categories={allCategories}
                onPatch={(p) => patchQ(q.uid, p)}
                onOption={(l, t) => patchOption(q.uid, l, t)}
                onRemove={() => removeQuestion(q.uid)}
              />
            </div>
          );
        })}
        {questions.length === 0 && (
          <div style={{ ...card(theme), color: muted, fontSize: 13, textAlign: 'center' }}>
            <EditableText id="deckeditor.no_questions" text="No questions. Add one above." />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn(theme, accentGrad), opacity: saving ? 0.6 : 1 }}>
          {saving ? <EditableText id="deckeditor.saving" text="Saving…" /> : <EditableText id="deckeditor.save" text="Save changes" />}
        </button>
        <button onClick={() => onClose()} style={ghostBtn(theme)}><EditableText id="deckeditor.cancel" text="Cancel" /></button>
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  n,
  theme,
  categories,
  onPatch,
  onOption,
  onRemove,
}: {
  q: EditQ;
  n: number;
  theme: Theme;
  categories: string[];
  onPatch: (p: Partial<EditQ>) => void;
  onOption: (label: Letter, text: string) => void;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: muted }}>Q{n}{q.sourceName ? ` · from ${q.sourceName}` : ''}</span>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} style={{ ...ghostBtn(theme), minHeight: 32, padding: '5px 10px', color: '#ff9a9a' }}>Delete</button>
        ) : (
          <span style={{ display: 'flex', gap: 6 }}>
            <button onClick={onRemove} style={{ ...ghostBtn(theme), minHeight: 32, padding: '5px 10px', borderColor: '#ef5468', color: '#ff9a9a' }}>Confirm</button>
            <button onClick={() => setConfirm(false)} style={{ ...ghostBtn(theme), minHeight: 32, padding: '5px 10px' }}>Cancel</button>
          </span>
        )}
      </div>

      <textarea
        value={q.stem}
        onChange={(e) => onPatch({ stem: e.target.value })}
        placeholder="Question text"
        maxLength={600}
        rows={2}
        style={{ ...field(theme), resize: 'vertical', minHeight: 48, fontFamily: 'inherit', marginBottom: 8 }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {q.options.map((o) => {
          const correct = q.answer === o.label;
          return (
            <div key={o.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => onPatch({ answer: o.label })}
                title={correct ? 'Correct answer' : 'Mark as the correct answer'}
                style={{
                  flex: 'none',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: `1px solid ${correct ? GREEN : theme.navBorder}`,
                  background: correct ? 'rgba(53,196,123,.18)' : 'rgba(255,255,255,.04)',
                  color: correct ? GREEN : muted,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {correct ? '✓' : o.label}
              </button>
              <input
                value={o.text}
                onChange={(e) => onOption(o.label, e.target.value)}
                placeholder={`Option ${o.label}`}
                maxLength={400}
                style={{ ...field(theme), flex: 1, padding: '7px 10px' }}
              />
            </div>
          );
        })}
        <div style={{ fontSize: 10.5, color: muted }}>Tap a letter to set the correct answer (green ✓).</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Category
          <select value={q.topic} onChange={(e) => onPatch({ topic: e.target.value })} style={{ ...field(theme), padding: '7px 9px', maxWidth: 220 }}>
            {!categories.some((c) => c.toLowerCase() === q.topic.trim().toLowerCase()) && q.topic && (
              <option value={q.topic} style={{ background: '#12102a' }}>{q.topic}</option>
            )}
            {categories.map((c) => (
              <option key={c} value={c} style={{ background: '#12102a' }}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <input
        value={q.explanation}
        onChange={(e) => onPatch({ explanation: e.target.value })}
        placeholder="Explanation (optional) — shown after answering"
        maxLength={400}
        style={{ ...field(theme), marginTop: 8 }}
      />
    </div>
  );
}

function catError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'AI isn’t configured yet — an API key needs to be set on the server.';
    return e.message;
  }
  return 'Something went wrong. Please try again.';
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
    padding: '9px 14px',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 40,
  };
}
