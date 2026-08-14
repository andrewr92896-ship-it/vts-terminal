import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import { parseQuestionsCsv, questionTemplateCsv, downloadCsv } from '../studyCsv';
import type { DraftCategory } from './blueprint';
import { BORDER, FAINT, MUTED, TEXT, fieldStyle, secondaryBtn } from './wizardUi';

// Typing the questions in by hand, for a package the creator is building
// themselves.
//
// It holds them in CLIENT STATE and writes nothing. Whoever renders it decides
// when they are committed, which is what keeps the no-partial-create promise:
// opening this editor, filling half of it in and walking away leaves no package,
// no game and no questions behind.

export interface ManualQuestion {
  key: string;
  categoryId: string | null;
  stem: string;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;
let counter = 0;
export function blankQuestion(categoryId: string | null): ManualQuestion {
  counter += 1;
  return {
    key: `mq_${counter}`,
    categoryId,
    stem: '',
    options: LETTERS.map((label) => ({ label, text: '' })),
    answer: 'A',
    explanation: '',
  };
}

/** What is still wrong with these questions, in plain language. */
export function manualQuestionErrors(
  questions: ManualQuestion[],
  opts: { explanationsRequired: boolean; categoriesRequired: boolean },
): string[] {
  const out: string[] = [];
  if (!questions.length) return ['Add at least one question.'];
  questions.forEach((q, i) => {
    const at = `Question ${i + 1}`;
    if (!q.stem.trim()) out.push(`${at} has no question text.`);
    for (const o of q.options) if (!o.text.trim()) out.push(`${at} has an empty option ${o.label}.`);
    if (opts.explanationsRequired && !q.explanation.trim()) out.push(`${at} has no explanation.`);
    if (opts.categoriesRequired && !q.categoryId) out.push(`${at} is not in a category.`);
  });
  const seen = new Map<string, number>();
  questions.forEach((q, i) => {
    const key = q.stem.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return;
    const prior = seen.get(key);
    if (prior != null) out.push(`Question ${i + 1} asks the same thing as question ${prior + 1}.`);
    else seen.set(key, i);
  });
  return out;
}

export function ManualQuestions({
  theme,
  categories,
  questions,
  onChange,
  explanationsRequired,
}: {
  theme: Theme;
  categories: DraftCategory[];
  questions: ManualQuestion[];
  onChange: (next: ManualQuestion[]) => void;
  explanationsRequired: boolean;
}) {
  const [open, setOpen] = useState<string | null>(questions[0]?.key ?? null);
  const [csvNote, setCsvNote] = useState<string | null>(null);
  const firstCategory = categories[0]?.id ?? null;

  const set = (key: string, patch: Partial<ManualQuestion>) =>
    onChange(questions.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const add = () => {
    const q = blankQuestion(firstCategory);
    onChange([...questions, q]);
    setOpen(q.key);
  };

  // The existing CSV format, unchanged — it stays the advanced/round-trip route
  // into a question list, and it works here exactly as it does in the standalone
  // maker.
  const loadCsv = async (file: File) => {
    const text = await file.text();
    const parsed = parseQuestionsCsv(text);
    if (!parsed.questions.length) {
      setCsvNote(parsed.error ?? parsed.skipped[0] ?? 'No questions found in that file.');
      return;
    }
    const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
    onChange([
      ...questions,
      ...parsed.questions.map((q) => ({
        ...blankQuestion(byName.get((q.topic ?? '').trim().toLowerCase()) ?? firstCategory),
        stem: q.stem,
        options: LETTERS.map((label) => ({
          label,
          text: q.options.find((o) => o.label === label)?.text ?? '',
        })),
        answer: q.answer,
        explanation: q.explanation ?? '',
      })),
    ]);
    setCsvNote(
      parsed.skipped.length
        ? `Added ${parsed.questions.length}. ${parsed.skipped.length} row(s) were skipped.`
        : `Added ${parsed.questions.length} questions.`,
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', flex: 1, minWidth: 120 }}>
          {questions.length} question{questions.length === 1 ? '' : 's'}
        </span>
        <label style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="file-text" size={13} color="#dfe7fa" />
          Load a CSV
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadCsv(f);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" onClick={() => downloadCsv('vts-questions-template.csv', questionTemplateCsv())} style={secondaryBtn(theme)}>
          Template
        </button>
      </div>
      {csvNote && <div style={{ marginBottom: 10, fontSize: 12.5, color: MUTED }}>{csvNote}</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {questions.map((q, i) => {
          const isOpen = open === q.key;
          return (
            <div key={q.key} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, background: 'rgba(255,255,255,.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : q.key)}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: FAINT, marginRight: 8 }}>Q{i + 1}</span>
                  <span style={{ fontSize: 13, color: q.stem.trim() ? TEXT : FAINT }}>
                    {q.stem.trim() || 'Untitled question'}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => onChange(questions.filter((x) => x.key !== q.key))}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}
                >
                  <Icon name="trash-2" size={14} color={MUTED} />
                </button>
              </div>

              {isOpen && (
                <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
                  <textarea
                    value={q.stem}
                    onChange={(e) => set(q.key, { stem: e.target.value })}
                    placeholder="What is the question?"
                    rows={2}
                    style={{ ...fieldStyle, resize: 'vertical' }}
                  />
                  {q.options.map((o, oi) => (
                    <div key={o.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => set(q.key, { answer: o.label })}
                        title={`Mark ${o.label} correct`}
                        style={{
                          flex: 'none',
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: 12,
                          fontWeight: 700,
                          color: q.answer === o.label ? theme.accentText : MUTED,
                          background: q.answer === o.label ? theme.accent : 'transparent',
                          border: `1px solid ${q.answer === o.label ? theme.accent : BORDER}`,
                        }}
                      >
                        {o.label}
                      </button>
                      <input
                        value={o.text}
                        onChange={(e) => {
                          const options = q.options.slice();
                          options[oi] = { ...o, text: e.target.value };
                          set(q.key, { options });
                        }}
                        placeholder={`Option ${o.label}`}
                        style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                      />
                    </div>
                  ))}
                  <input
                    value={q.explanation}
                    onChange={(e) => set(q.key, { explanation: e.target.value })}
                    placeholder={explanationsRequired ? 'Explanation (required)' : 'Explanation (optional)'}
                    style={fieldStyle}
                  />
                  {categories.length > 0 && (
                    <select
                      value={q.categoryId ?? ''}
                      onChange={(e) => set(q.key, { categoryId: e.target.value || null })}
                      style={fieldStyle}
                    >
                      <option value="">No category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        style={{
          marginTop: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 13,
          fontWeight: 600,
          color: theme.accent,
          background: 'transparent',
          border: `1px dashed ${BORDER}`,
          borderRadius: 9,
          padding: '10px 14px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <Icon name="plus" size={14} color={theme.accent} />
        Add a question
      </button>
    </div>
  );
}
