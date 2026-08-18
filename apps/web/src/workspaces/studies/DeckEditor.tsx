import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { TeamDeck } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { accentGradient } from '../../theme/themes';
import { weightTotal } from './examWeights';
import { NumberField } from './NumberField';

// The study-game editor: rename the game, manage its categories and what each
// one is worth, and edit every question (stem, the four options, the correct
// answer, the explanation, and the category). Questions can be sorted by
// category, and VTS AI can auto-categorize them (optionally with a custom
// prompt). Saving replaces the game's questions, category list and weights in
// one call.
//
// Category weights are the exam blueprint — see examWeights.ts. They are typed
// as percentages and stored raw; nothing here forces them to total 100, because
// a total the author is halfway through typing must not block a save.

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

// One flagged problem from the AI correct-answer audit, keyed to a question.
interface AuditIssue {
  severity: 'high' | 'low';
  problem: string;
  suggestedAnswer: Letter | null;
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
  // Null = this game is not weighted, which is different from every weight being
  // zero. Kept as the author typed it and normalized wherever it is read.
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [questions, setQuestions] = useState<EditQ[]>([]);
  const [sortByCat, setSortByCat] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI categorize panel.
  const [catOpen, setCatOpen] = useState(false);
  const [catPrompt, setCatPrompt] = useState('');
  const [catConstrain, setCatConstrain] = useState(false);
  const [catBusy, setCatBusy] = useState(false);

  // AI correct-answer audit: problems keyed by question uid, plus how many the
  // last run flagged (null = not run yet) so the summary stays stable while the
  // per-question flags clear as they're addressed.
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditFound, setAuditFound] = useState<number | null>(null);
  const [auditIssues, setAuditIssues] = useState<Record<number, AuditIssue>>({});

  useEffect(() => {
    let alive = true;
    api
      .studyDeck(deckId)
      .then((r) => {
        if (!alive) return;
        const d = r.deck;
        setName(d.name);
        setCategories(d.categories.length ? d.categories : []);
        setWeights(d.categoryWeights);
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

  // Once the author acts on a flagged question, clear its audit flag — the
  // problem is presumed addressed until they re-run the audit.
  const clearIssue = (uid: number) =>
    setAuditIssues((prev) => {
      if (!(uid in prev)) return prev;
      const { [uid]: _drop, ...rest } = prev;
      return rest;
    });
  const patchQ = (uid: number, patch: Partial<EditQ>) => {
    setQuestions((prev) => prev.map((q) => (q.uid === uid ? { ...q, ...patch } : q)));
    clearIssue(uid);
  };
  const patchOption = (uid: number, label: Letter, text: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.uid === uid ? { ...q, options: q.options.map((o) => (o.label === label ? { ...o, text } : o)) } : q)),
    );
    clearIssue(uid);
  };

  function addCategory() {
    const c = newCat.trim();
    if (!c) return;
    if (!categories.some((x) => x.toLowerCase() === c.toLowerCase())) setCategories((prev) => [...prev, c]);
    setNewCat('');
  }
  function renameCategory(oldName: string, next: string) {
    const nm = next.trim();
    setCategories((prev) => prev.map((c) => (c === oldName ? (nm || c) : c)));
    if (nm) {
      setQuestions((prev) => prev.map((q) => (q.topic === oldName ? { ...q, topic: nm } : q)));
      // The weight belongs to the category, not to the spelling of its name — a
      // rename that dropped it would silently take that share off the paper.
      setWeights((prev) => {
        if (!prev || !(oldName in prev)) return prev;
        const { [oldName]: moved, ...rest } = prev;
        return { ...rest, [nm]: moved };
      });
    }
  }
  function removeCategory(name: string) {
    const remaining = categories.filter((c) => c !== name);
    const fallback = remaining[0] ?? 'General';
    setCategories(remaining.length ? remaining : []);
    // Reassign any question in the removed category to a remaining one.
    setQuestions((prev) => prev.map((q) => (q.topic === name ? { ...q, topic: fallback } : q)));
    setWeights((prev) => {
      if (!prev || !(name in prev)) return prev;
      const { [name]: _drop, ...rest } = prev;
      return rest;
    });
  }

  // Turning weighting on seeds an even split that totals 100, so the author
  // starts from a valid blueprint and edits it rather than facing a row of
  // zeroes that would score every category out of the paper.
  function toggleWeighting(on: boolean) {
    if (!on) {
      setWeights(null);
      return;
    }
    const names = allCategories;
    if (names.length === 0) {
      setWeights({});
      return;
    }
    const each = Math.floor(100 / names.length);
    const seeded: Record<string, number> = {};
    names.forEach((c, i) => (seeded[c] = each + (i < 100 - each * names.length ? 1 : 0)));
    setWeights(seeded);
  }
  function setWeight(name: string, value: number) {
    setWeights((prev) => ({ ...(prev ?? {}), [name]: Math.max(0, Math.min(100, value)) }));
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

  // Run the AI correct-answer audit over every question and flag the ones with
  // problems. Read-only — it never changes the game; the author reviews the
  // flags and fixes what they agree with, then saves.
  async function runAudit() {
    if (auditBusy || questions.length === 0) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setAuditBusy(true);
    setError(null);
    try {
      const res = await api.auditStudyDeck({
        questions: questions.map((q) => ({
          id: q.uid,
          stem: q.stem.trim(),
          options: q.options.map((o) => ({ label: o.label, text: o.text.trim() })),
          answer: q.answer,
          explanation: q.explanation.trim() || null,
        })),
      });
      const map: Record<number, AuditIssue> = {};
      for (const it of res.issues) {
        map[it.id] = { severity: it.severity, problem: it.problem, suggestedAnswer: it.suggestedAnswer };
      }
      setAuditIssues(map);
      setAuditFound(res.issues.length);
    } catch (e) {
      setError(catError(e));
    } finally {
      setAuditBusy(false);
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
        // Only the categories in play — a weight for a category that no longer
        // exists would still count toward the total a score is measured against.
        categoryWeights: weights ? Object.fromEntries(allCategories.map((c) => [c, weights[c] ?? 0])) : null,
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

  // Questions that ask the same thing as another one in this game, matched on
  // the stem alone (trimmed, lowercased, inner whitespace collapsed). A game
  // built by merging two others, or by importing the same set twice, holds them
  // — and there was nothing anywhere that would say so. The learner meets them
  // as the same question coming round again, which is indistinguishable from
  // the game repeating itself.
  const duplicateUids = useMemo(() => {
    const byStem = new Map<string, number[]>();
    for (const q of questions) {
      const k = q.stem.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!k) continue;
      const list = byStem.get(k);
      if (list) list.push(q.uid);
      else byStem.set(k, [q.uid]);
    }
    const out = new Set<number>();
    for (const uids of byStem.values()) if (uids.length > 1) for (const u of uids) out.add(u);
    return out;
  }, [questions]);

  // Display order: grouped by category (in category order, unknown last) or the
  // natural question order — narrowed to the repeats when that is asked for.
  const displayed = useMemo(() => {
    const withN = questions
      .map((q, i) => ({ q, n: i + 1 }))
      .filter(({ q }) => !onlyDuplicates || duplicateUids.has(q.uid));
    if (!sortByCat) return withN;
    const order = new Map(allCategories.map((c, i) => [c.toLowerCase(), i]));
    return [...withN].sort((a, b) => {
      const ai = order.get(a.q.topic.trim().toLowerCase()) ?? 999;
      const bi = order.get(b.q.topic.trim().toLowerCase()) ?? 999;
      return ai - bi || a.n - b.n;
    });
  }, [questions, sortByCat, allCategories, onlyDuplicates, duplicateUids]);

  const issueCount = Object.keys(auditIssues).length;
  const weighted = weights !== null;
  const total = weighted ? weightTotal(allCategories, weights) : 0;
  const totalIs100 = Math.abs(total - 100) < 0.05;
  const zeroWeighted = weighted ? allCategories.filter((c) => (weights?.[c] ?? 0) <= 0) : [];

  if (loading) {
    return (
      <div style={wrap}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}>‹ Back</button>
        <div style={{ ...card(theme), color: muted, fontSize: 13, marginTop: 12 }}>
          {"Loading the study game…"}
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={wrap}>
        <button onClick={() => onClose()} style={ghostBtn(theme)}>‹ Back</button>
        <div style={{ ...card(theme), color: '#ffb4ab', fontSize: 13, marginTop: 12 }}>
          {"Couldn’t load this study game."}
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
          {"‹ Back to games"}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn(theme, accentGrad), opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Rename */}
      <div style={{ ...card(theme), marginBottom: 12 }}>
        <label style={fieldLabel}>{"Game name"}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={field(theme)} />
      </div>

      {/* Categories */}
      <div style={{ ...card(theme), marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{"Categories"}</span>
          <button onClick={() => setCatOpen((v) => !v)} style={ghostBtn(theme)}>{"✦ Auto-categorize"}</button>
        </div>

        {catOpen && (
          <div style={{ border: `1px solid ${theme.navBorder}`, borderRadius: 10, padding: 12, marginBottom: 12, background: 'rgba(10,8,26,.35)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: muted, lineHeight: 1.5 }}>
              {"VTS AI sorts every question into a category. Leave the prompt blank to let it choose the groupings, or describe how you want them grouped."}
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
              {"Only use my current categories (don’t invent new ones)"}
            </label>
            <button onClick={runAutoCategorize} disabled={catBusy} style={{ ...primaryBtn(theme, accentGrad), opacity: catBusy ? 0.6 : 1 }}>
              {catBusy ? "Categorizing…" : "Run auto-categorize"}
            </button>
          </div>
        )}

        {/* Weighting: what each category is worth when a practice test is scored
            the way the real exam is. Off by default — a game with no weights
            scores plainly, exactly as it always has. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#e7e0ff', cursor: 'pointer', marginBottom: weighted ? 8 : 12 }}>
          <input
            type="checkbox"
            checked={weighted}
            onChange={(e) => toggleWeighting(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: theme.accent }}
          />
          {"Weight categories for scoring"}
        </label>
        {weighted && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: muted, lineHeight: 1.5 }}>
            {"Give each category the share of the exam it carries. A practice test then draws its questions in those proportions and scores each category against its share, so the result reflects the real paper rather than whichever questions happened to come up."}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allCategories.length === 0 && <span style={{ fontSize: 12, color: muted }}>{"No categories yet — add one below or auto-categorize."}</span>}
          {allCategories.map((c) => {
            const count = questions.filter((q) => q.topic.trim().toLowerCase() === c.toLowerCase()).length;
            const w = weights?.[c] ?? 0;
            return (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  defaultValue={c}
                  onBlur={(e) => e.target.value.trim() !== c && renameCategory(c, e.target.value)}
                  style={{ ...field(theme), flex: 1, padding: '7px 10px' }}
                />
                {weighted && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <NumberField
                      value={w}
                      onChange={(n) => setWeight(c, n)}
                      min={0}
                      max={100}
                      emptyValue={0}
                      title={w === 0 ? 'Weight 0% — this category is left off a weighted test' : undefined}
                      style={{
                        ...field(theme),
                        width: 62,
                        padding: '7px 8px',
                        textAlign: 'right',
                        borderColor: w === 0 ? '#e0a23a' : theme.navBorder,
                      }}
                    />
                    <span style={{ fontSize: 11.5, color: muted }}>%</span>
                  </span>
                )}
                <span style={{ fontSize: 11, color: muted, minWidth: 58, textAlign: 'right' }}>{count} q{count === 1 ? '' : 's'}</span>
                <button onClick={() => removeCategory(c)} title="Remove category" style={{ ...ghostBtn(theme), minHeight: 34, padding: '6px 10px', color: '#ff9a9a' }}>✕</button>
              </div>
            );
          })}
        </div>

        {/* The running total. Not enforced — a total mid-edit must not block a
            save — but a total that is not 100 is rescaled, which is worth
            saying outright rather than letting a 95 quietly score as a 100. */}
        {weighted && allCategories.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 10,
              paddingTop: 10,
              borderTop: `1px solid ${theme.navBorder}`,
              fontSize: 12,
            }}
          >
            <span style={{ color: totalIs100 ? GREEN : '#e0a23a', fontWeight: 700 }}>
              {"Total "}{Math.round(total * 10) / 10}%
            </span>
            {!totalIs100 && (
              <span style={{ color: muted }}>
                {total <= 0
                  ? "Every category is at 0% — a weighted test would have nothing to draw from."
                  : "Scored in these proportions, scaled to 100%."}
              </span>
            )}
            {zeroWeighted.length > 0 && total > 0 && (
              <span style={{ color: muted }}>
                {"Left off a weighted test: "}{zeroWeighted.join(', ')}
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="New category name"
            maxLength={60}
            style={{ ...field(theme), flex: 1, minWidth: 160 }}
          />
          <button onClick={addCategory} style={ghostBtn(theme)}>{"+ Add category"}</button>
        </div>
      </div>

      {/* Questions toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
          {"Questions"} · {questions.length}
          {duplicateUids.size > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#e0a23a' }}>
              {' · '}
              {duplicateUids.size} ask the same thing
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {duplicateUids.size > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: muted, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={onlyDuplicates}
                onChange={(e) => setOnlyDuplicates(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: theme.accent }}
              />
              {"Show only repeats"}
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={sortByCat} onChange={(e) => setSortByCat(e.target.checked)} style={{ width: 15, height: 15, accentColor: theme.accent }} />
            {"Sort by category"}
          </label>
          <button onClick={runAudit} disabled={auditBusy || questions.length === 0} style={{ ...ghostBtn(theme), opacity: auditBusy || questions.length === 0 ? 0.6 : 1 }}>
            {auditBusy ? (
              "Auditing…"
            ) : (
              "✓ Audit answers"
            )}
          </button>
          <button onClick={() => addQuestion()} style={ghostBtn(theme)}>{"+ Add question"}</button>
        </div>
      </div>

      {/* Audit result summary. Three states: the run came back clean; some
          flags are still open; or every flag has been addressed (re-run to
          confirm). The per-question count is live as flags clear. */}
      {auditFound !== null && !auditBusy && (
        auditFound === 0 ? (
          <div style={{ ...okBanner, marginBottom: 10 }}>
            {"Audit found no problems — every answer key checks out."}
          </div>
        ) : issueCount > 0 ? (
          <div style={{ ...warn, marginBottom: 10 }}>
            {"Audit flagged"} {issueCount}{' '}
            {issueCount === 1 ? (
              "question to review — see the highlighted question below."
            ) : (
              "questions to review — see the highlighted questions below."
            )}
          </div>
        ) : (
          <div style={{ ...okBanner, marginBottom: 10 }}>
            {"All flagged questions addressed — save your changes, then re-audit to confirm."}
          </div>
        )
      )}

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
                issue={auditIssues[q.uid] ?? null}
                onPatch={(p) => patchQ(q.uid, p)}
                onOption={(l, t) => patchOption(q.uid, l, t)}
                onRemove={() => removeQuestion(q.uid)}
              />
            </div>
          );
        })}
        {questions.length === 0 && (
          <div style={{ ...card(theme), color: muted, fontSize: 13, textAlign: 'center' }}>
            {"No questions. Add one above."}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn(theme, accentGrad), opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={() => onClose()} style={ghostBtn(theme)}>{"Cancel"}</button>
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  n,
  theme,
  categories,
  issue,
  onPatch,
  onOption,
  onRemove,
}: {
  q: EditQ;
  n: number;
  theme: Theme;
  categories: string[];
  issue: AuditIssue | null;
  onPatch: (p: Partial<EditQ>) => void;
  onOption: (label: Letter, text: string) => void;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const flagged = !!issue;
  const high = issue?.severity === 'high';
  const flagColor = high ? '#ef5468' : '#e0a23a';
  return (
    <div style={{ ...card(theme), ...(flagged ? { borderColor: flagColor, boxShadow: `0 0 0 1px ${flagColor}55` } : null) }}>
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

      {/* Audit flag: the problem the review found, and (when the model named a
          different answer) a one-tap fix to adopt it. */}
      {issue && (
        <div
          style={{
            border: `1px solid ${flagColor}`,
            background: high ? 'rgba(239,84,104,.1)' : 'rgba(224,162,58,.1)',
            borderRadius: 8,
            padding: '9px 12px',
            marginBottom: 10,
            fontSize: 12.5,
            color: '#f3e8ff',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: flagColor, marginBottom: 2 }}>
            {high ? (
              "⚠ Possible answer-key issue"
            ) : (
              "⚠ Possible issue"
            )}
          </div>
          <div>{issue.problem}</div>
          {issue.suggestedAnswer && issue.suggestedAnswer !== q.answer && (
            <button
              onClick={() => onPatch({ answer: issue.suggestedAnswer! })}
              style={{ ...ghostBtn(theme), minHeight: 32, padding: '6px 11px', marginTop: 9, borderColor: GREEN, color: GREEN, fontWeight: 700 }}
            >
              Set correct answer to {issue.suggestedAnswer}
            </button>
          )}
        </div>
      )}

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
const okBanner: CSSProperties = { fontSize: 12.5, color: '#9be7c4', background: 'rgba(53,196,123,.1)', border: '1px solid rgba(53,196,123,.4)', borderRadius: 8, padding: '9px 12px' };

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
