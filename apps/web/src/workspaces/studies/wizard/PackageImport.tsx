import { useState } from 'react';
import { api, ApiError } from '../../../api/client';
import type { PackageValidation } from '../../../api/types';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import type { StudyPackageBlueprint } from './blueprint';
import { buildRepairPrompt } from './handoffPrompt';
import { ManualQuestions, blankQuestion, manualQuestionErrors, type ManualQuestion } from './ManualQuestions';
import { needsManualQuestions, toImportBlueprint } from './payload';
import { BORDER, FAINT, MUTED, TEXT, fieldStyle, primaryBtn, secondaryBtn } from './wizardUi';

// Reading back what the creator's AI produced.
//
// Upload the file, or paste the JSON — both land in the same list, because an
// AI that cannot write a file is the common case rather than the exception. A
// package too big for one reply is added as several parts.
//
// Two server calls and only the second one writes. Validating is free and
// repeatable: paste, read exactly what is wrong, have the AI fix it, paste
// again. Nothing exists until Confirm.

type Doc = { key: string; label: string; text: string };
let docCounter = 0;

export function PackageImport({
  theme,
  blueprint,
  draftId,
  onImported,
}: {
  theme: Theme;
  blueprint: StudyPackageBlueprint;
  draftId: string;
  onImported: (pkg: { id: string; name: string }) => void;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [paste, setPaste] = useState('');
  const [result, setResult] = useState<PackageValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [manual, setManual] = useState<ManualQuestion[]>([]);

  const payload = toImportBlueprint(blueprint, draftId);
  const owesQuestions = needsManualQuestions(blueprint);
  const manualErrors = owesQuestions
    ? manualQuestionErrors(manual, {
        explanationsRequired: payload.explanationsRequired,
        categoriesRequired: payload.categories.length > 0,
      })
    : [];

  const addDoc = (label: string, text: string) => {
    docCounter += 1;
    setDocs((d) => [...d, { key: `doc_${docCounter}`, label, text }]);
    setResult(null);
    setError(null);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) addDoc(f.name, await f.text());
  };

  const validate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { result: r } = await api.validateStudyPackage(docs.map((d) => d.text), payload);
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? `Could not check that package (${e.status}).` : 'Could not check that package.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { package: pkg } = await api.commitStudyPackage(
        docs.map((d) => d.text),
        payload,
        owesQuestions
          ? manual.map((q) => ({
              categoryId: q.categoryId,
              stem: q.stem,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation || null,
            }))
          : undefined,
      );
      onImported(pkg);
    } catch (e) {
      setError(e instanceof ApiError ? `Could not create that package (${e.status}).` : 'Could not create that package.');
    } finally {
      setBusy(false);
    }
  };

  const copyRepair = async () => {
    const text = buildRepairPrompt(draftId, result?.errors ?? []);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not reach the clipboard. Select the errors above and copy them by hand.');
    }
  };

  const canConfirm = !!result?.ok && !busy && manualErrors.length === 0;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#fff' }}>Bring the package back</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
          Upload the file your AI made, or paste what it wrote. Nothing is created until you confirm.
        </p>
      </div>

      {/* ---- Adding documents ---- */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Icon name="file-plus-2" size={14} color="#dfe7fa" />
          {docs.length ? 'Add another file' : 'Upload the file'}
          <input
            type="file"
            accept=".json,application/json,text/plain"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="…or paste what your AI wrote here"
          rows={5}
          style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
        {paste.trim() && (
          <button
            type="button"
            onClick={() => {
              addDoc(docs.length ? `Pasted part ${docs.length + 1}` : 'Pasted package', paste);
              setPaste('');
            }}
            style={{ ...secondaryBtn(theme), marginTop: 8 }}
          >
            {docs.length ? 'Add this part' : 'Add this'}
          </button>
        )}
      </div>

      {docs.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {docs.map((d, i) => (
            <div
              key={d.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 11px',
                border: `1px solid ${BORDER}`,
                borderRadius: 9,
                background: 'rgba(255,255,255,.02)',
              }}
            >
              <Icon name="file-check-2" size={14} color={theme.accent} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.label}
              </span>
              <span style={{ fontSize: 11.5, color: FAINT }}>{Math.max(1, Math.round(d.text.length / 1024))} KB</span>
              <button
                type="button"
                aria-label={`Remove ${d.label}`}
                onClick={() => {
                  setDocs((list) => list.filter((x) => x.key !== d.key));
                  setResult(null);
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}
              >
                <Icon name="trash-2" size={13} color={MUTED} />
              </button>
              {i === 0 && docs.length > 1 && null}
            </div>
          ))}
        </div>
      )}

      {docs.length > 0 && !result && (
        <div>
          <button type="button" onClick={() => void validate()} disabled={busy} style={primaryBtn(theme, busy)}>
            {busy ? 'Checking…' : 'Check the package'}
          </button>
        </div>
      )}

      {error && <Note tone="bad">{error}</Note>}

      {/* ---- What passed and what failed ---- */}
      {result && (
        <div style={{ display: 'grid', gap: 12 }}>
          {result.passed.length > 0 && (
            <div style={{ display: 'grid', gap: 5 }}>
              {result.passed.map((p) => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#7fd6a6' }}>
                  <Icon name="check" size={13} color="#7fd6a6" />
                  {p}
                </div>
              ))}
            </div>
          )}

          {result.errors.length > 0 && (
            <div
              style={{
                border: '1px solid #5a2b2b',
                background: 'rgba(255,120,100,.07)',
                borderRadius: 10,
                padding: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <Icon name="alert-triangle" size={14} color="#ffb4a8" />
                <strong style={{ fontSize: 13, color: '#ffb4a8' }}>
                  {result.errors.length} thing{result.errors.length === 1 ? '' : 's'} to fix
                </strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 5 }}>
                {result.errors.slice(0, 40).map((e, i) => (
                  <li key={`${e.code}-${i}`} style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.55 }}>
                    {e.message}
                  </li>
                ))}
              </ul>
              {result.errors.length > 40 && (
                <div style={{ marginTop: 7, fontSize: 12, color: MUTED }}>
                  …and {result.errors.length - 40} more.
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => void copyRepair()} style={secondaryBtn(theme)}>
                  {copied ? 'Copied' : 'Copy repair instructions'}
                </button>
                <span style={{ fontSize: 11.5, color: FAINT }}>
                  Lists the problems and the affected ids — not your questions.
                </span>
              </div>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div style={{ display: 'grid', gap: 5 }}>
              {result.warnings.map((w, i) => (
                <div key={`${w.code}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#EBCB74' }}>
                  <Icon name="alert-triangle" size={13} color="#EBCB74" style={{ marginTop: 2, flex: 'none' }} />
                  <span style={{ lineHeight: 1.55 }}>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* ---- Preview ---- */}
          {result.ok && result.preview && (
            <Preview theme={theme} result={result} showQuestions={showQuestions} onToggle={() => setShowQuestions((v) => !v)} />
          )}

          {/* The hybrid: the AI wrote the extras, the creator writes the questions.
              Collected here so both halves commit together. */}
          {result.ok && owesQuestions && (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 13 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#fff' }}>Your questions</h4>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED }}>
                You chose to write these yourself. They are created with the rest of the package.
              </p>
              <ManualQuestions
                theme={theme}
                categories={blueprint.categories.filter((c) => c.name.trim())}
                questions={manual}
                onChange={setManual}
                explanationsRequired={payload.explanationsRequired}
              />
              {manual.length === 0 && (
                <button type="button" onClick={() => setManual([blankQuestion(blueprint.categories[0]?.id ?? null)])} style={{ ...secondaryBtn(theme), marginTop: 10 }}>
                  Start typing questions
                </button>
              )}
              {manualErrors.length > 0 && (
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                  {manualErrors.slice(0, 8).map((m) => (
                    <li key={m} style={{ fontSize: 12, color: '#ffb4a8' }}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setResult(null)} style={secondaryBtn(theme)}>
              Check again
            </button>
            {result.ok && (
              <button type="button" onClick={() => void confirm()} disabled={!canConfirm} style={primaryBtn(theme, !canConfirm)}>
                {busy ? 'Creating…' : 'Confirm import'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Preview({
  theme,
  result,
  showQuestions,
  onToggle,
}: {
  theme: Theme;
  result: PackageValidation;
  showQuestions: boolean;
  onToggle: () => void;
}) {
  const p = result.preview!;
  const rows: [string, string][] = [
    ['Name', p.name],
    ['Subject', p.subject || '—'],
    ['Questions', String(p.questionCount)],
  ];
  if (p.flashcardCount) rows.push(['Flashcards', String(p.flashcardCount)]);
  if (p.slideCount) rows.push(['Slides', String(p.slideCount)]);
  if (p.lessonCount) rows.push(['Lessons', String(p.lessonCount)]);

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="check-check" size={15} color="#7fd6a6" />
        <strong style={{ fontSize: 13.5, color: '#fff' }}>Ready to import</strong>
      </div>
      <div style={{ display: 'grid', gap: 6, marginBottom: p.categories.length ? 12 : 0 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
            <span style={{ width: 92, flex: 'none', color: FAINT }}>{k}</span>
            <span style={{ color: TEXT }}>{v}</span>
          </div>
        ))}
      </div>

      {p.categories.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.3px', color: FAINT, marginBottom: 2 }}>
            BY CATEGORY
          </div>
          {p.categories.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, fontSize: 12.5, alignItems: 'baseline' }}>
              <span style={{ flex: 1, minWidth: 0, color: TEXT }}>{c.name}</span>
              {c.weight != null && <span style={{ color: FAINT }}>{c.weight}%</span>}
              <span style={{ color: TEXT, minWidth: 54, textAlign: 'right' }}>
                {c.found}
                {c.target != null ? ` / ${c.target}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {result.questions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={onToggle} style={secondaryBtn(theme)}>
            {showQuestions ? 'Hide the questions' : 'Read the questions first'}
          </button>
          {showQuestions && (
            <div style={{ marginTop: 10, maxHeight: 340, overflowY: 'auto', display: 'grid', gap: 10 }}>
              {result.questions.map((q, i) => (
                <div key={q.id} style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 9 }}>
                  <div style={{ fontSize: 12.5, color: TEXT, marginBottom: 5 }}>
                    <strong style={{ color: FAINT, marginRight: 6 }}>Q{i + 1}</strong>
                    {q.stem}
                  </div>
                  {q.options.map((o) => (
                    <div
                      key={o.label}
                      style={{ fontSize: 12, color: o.label === q.answer ? '#7fd6a6' : MUTED, paddingLeft: 18 }}
                    >
                      {o.label}. {o.text}
                    </div>
                  ))}
                  {q.explanation && (
                    <div style={{ fontSize: 11.5, color: FAINT, paddingLeft: 18, marginTop: 4, lineHeight: 1.5 }}>
                      {q.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone: 'bad' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12.5,
        color: tone === 'bad' ? '#ffb4a8' : TEXT,
      }}
    >
      <Icon name="alert-triangle" size={13} color="#ffb4a8" />
      {children}
    </div>
  );
}
