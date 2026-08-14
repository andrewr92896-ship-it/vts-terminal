import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../api/client';
import type { PackageDiagnostics, PackageValidation, StudyBugContext } from '../../../api/types';
import { APP_VERSION } from '../../../meta/version';
import { useAuth } from '../../../auth/AuthContext';
import { isFounder } from '../../../auth/access';
import { reportProblem } from '../../../lib/reportProblem';
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
  /**
   * Finishing an existing package rather than creating a new one.
   *
   * The reading, checking and editing are identical either way — the same file
   * from the same handoff — so this changes only where the confirmed content is
   * written, and the wording on the button. A second importer for the same job
   * is how the two come to validate differently.
   */
  addToPackageId,
}: {
  theme: Theme;
  blueprint: StudyPackageBlueprint;
  draftId: string;
  onImported: (pkg: { id: string; name: string }) => void;
  addToPackageId?: string;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [paste, setPaste] = useState('');
  const [result, setResult] = useState<PackageValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [manual, setManual] = useState<ManualQuestion[]>([]);
  // How the most recent document arrived, for the bug report. Upload and paste
  // fail differently — a paste can be truncated by the chat window it came from
  // — so which one it was is the first thing worth knowing.
  const [lastSource, setLastSource] = useState<'upload' | 'paste' | 'fixture' | undefined>(undefined);
  const { user } = useAuth();
  // Developer capabilities inside the REAL importer, never a second one. Gated
  // on the effective roles, so previewing as the public hides them — which is
  // the point of previewing.
  const canDebug = !!user && isFounder(user.roles);

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
    setLastSource('upload');
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
    const texts = docs.map((d) => d.text);
    const questions = owesQuestions
      ? manual.map((q) => ({
          categoryId: q.categoryId,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation || null,
        }))
      : undefined;
    try {
      const { package: pkg } = addToPackageId
        ? await api.addToStudyPackage(addToPackageId, texts, payload, questions)
        : await api.commitStudyPackage(texts, payload, questions);
      onImported(pkg);
    } catch (e) {
      // A 409 here is the server naming what it refused — a part the package
      // already has, or a package that is locked in the library — and that
      // sentence is far more use than "could not". Show it.
      const said = e instanceof ApiError && e.message && e.status === 409 ? e.message : null;
      const verb = addToPackageId ? 'add that to the package' : 'create that package';
      setError(said ?? (e instanceof ApiError ? `Could not ${verb} (${e.status}).` : `Could not ${verb}.`));
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

  /**
   * Hand the failure to the bug report flow, with the diagnosis attached.
   *
   * The context is ids, versions and validation CODES — never the package. The
   * smallest useful fragment of it is offered separately, as a switch the
   * reporter has to turn on: the first 400 characters of the first document is
   * usually enough to see whether the envelope is malformed, and it is study
   * content, so it is theirs to send or withhold.
   */
  function reportImportProblem() {
    const d = result?.diagnostics;
    reportProblem({
      intro: result?.errors.length
        ? `A study package would not import. The checker said: ${result.errors[0].message}`
        : 'Something went wrong importing a study package.',
      context: {
        ...baseContext(),
        component: 'import',
        source: lastSource,
        parts: d?.multipart?.parts ?? docs.length,
        expectedParts: d?.multipart?.expected ?? undefined,
        missingParts: d?.multipart?.missing?.length ? d.multipart.missing : undefined,
        errorCodes: result?.errors.map((e) => e.code),
        errorMessages: result?.errors.slice(0, 5).map((e) => e.message),
        formatVersion: d?.expectedSchemaVersion,
      },
      offer: docs[0]
        ? { label: 'the first 400 characters of what you added', text: docs[0].text.slice(0, 400) }
        : null,
    });
  }

  // The parts of the context that do not depend on where in the panel we are.
  function baseContext(): StudyBugContext {
    return {
      screen: 'st_decks',
      step: 'import',
      draftId,
      appVersion: APP_VERSION,
      tier: user?.access.membership.tier,
      isDemo: user?.isDemo || undefined,
      previewAs: user?.preview ?? undefined,
    };
  }

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
              setLastSource('paste');
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

      {/* Fixtures, in the REAL importer. They produce the same text a creator
          would paste and then go through validate-then-confirm unchanged, so a
          fixture that behaves differently from a real package is a finding
          rather than a quirk of a test harness. */}
      {canDebug && (
        <FixtureLoader
          theme={theme}
          onLoad={(label, documents) => {
            setLastSource('fixture');
            setResult(null);
            setError(null);
            for (const [i, text] of documents.entries()) {
              addDoc(documents.length === 1 ? label : `${label} — part ${i + 1}`, text);
            }
          }}
          build={(kind) => api.buildStudyFixture(kind, payload.name, payload.subject ?? '', payload)}
        />
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
                {/* Most failures here are the AI's, and the repair prompt fixes
                    those. This is for the other kind — a package that looks
                    right and is refused anyway — and it carries the versions and
                    validation codes so the reporter does not have to find them. */}
                <button type="button" onClick={() => reportImportProblem()} style={secondaryBtn(theme)}>
                  Report a problem
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

          {/* Deterministic diagnostics, founder-level only. An ordinary user
              gets the plain-language errors above, which is what they can act
              on; this is the version-and-code detail that answers "why did it
              decide that". */}
          {canDebug && <Diagnostics theme={theme} d={result.diagnostics} />}

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
                {addToPackageId
                  ? busy
                    ? 'Adding…'
                    : 'Add to this package'
                  : busy
                    ? 'Creating…'
                    : 'Confirm import'}
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

// ---- Developer capabilities, inside the real importer ----
//
// Both of these are drawn only for a founder-level reader and both are
// read-only or reversible. There is no path here that commits a package the
// validator refused, and no switch that relaxes a check — a fixture is text, and
// diagnostics are a report.

const DEV_BORDER = 'rgba(255,159,69,.35)';
const DEV_TINT = 'rgba(255,159,69,.06)';
const DEV_INK = '#FF9F45';

/**
 * Known-good and known-bad packages, built by the server against THIS blueprint.
 *
 * Generated rather than checked in, because a fixture written against an older
 * plan fails for the wrong reason and teaches nothing. Each bad one breaks
 * exactly one thing, so what the validator says is attributable.
 */
function FixtureLoader({
  theme,
  onLoad,
  build,
}: {
  theme: Theme;
  onLoad: (label: string, documents: string[]) => void;
  build: (kind: string) => Promise<{ kind: string; label: string; documents: string[] }>;
}) {
  const [kinds, setKinds] = useState<{ kind: string; label: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || kinds) return;
    let alive = true;
    api
      .studyFixtures()
      .then((r) => {
        if (alive) setKinds(r.fixtures);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, kinds]);

  return (
    <div style={{ border: `1px solid ${DEV_BORDER}`, background: DEV_TINT, borderRadius: 10, padding: 11 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          color: DEV_INK,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} color={DEV_INK} />
        {'Test packages'}
        <span style={{ fontWeight: 500, color: FAINT, fontSize: 11.5 }}>{'developer'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {failed && <span style={{ fontSize: 12, color: '#ffb4a8' }}>{'Could not load the fixtures.'}</span>}
          {!kinds && !failed && <span style={{ fontSize: 12, color: MUTED }}>{'Loading…'}</span>}
          {kinds?.map((f) => (
            <button
              key={f.kind}
              type="button"
              disabled={busy === f.kind}
              onClick={async () => {
                setBusy(f.kind);
                try {
                  const r = await build(f.kind);
                  onLoad(r.label, r.documents);
                } catch {
                  setFailed(true);
                }
                setBusy(null);
              }}
              style={{ ...secondaryBtn(theme), fontSize: 11.5, padding: '6px 10px', minHeight: 0 }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** What the validator saw. Never package content — see ValidationDiagnostics. */
function Diagnostics({ theme, d }: { theme: Theme; d: PackageDiagnostics }) {
  const [open, setOpen] = useState(false);
  const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: MUTED };
  return (
    <div style={{ border: `1px solid ${DEV_BORDER}`, background: DEV_TINT, borderRadius: 10, padding: 11 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'none',
          border: 'none',
          color: DEV_INK,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} color={DEV_INK} />
        {'Diagnostics'}
        <span style={{ fontWeight: 500, color: FAINT, fontSize: 11.5 }}>{'developer'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div style={mono}>
            {`expects blueprint ${d.expectedBlueprintId} · schema v${d.expectedSchemaVersion}`}
          </div>
          {d.documents.map((doc) => (
            <div key={doc.index} style={mono}>
              {`doc ${doc.index + 1}: format=${doc.format ?? '—'} v=${doc.schemaVersion ?? '—'} blueprint=${doc.blueprintId ?? '—'} ${doc.bytes}B`}
            </div>
          ))}
          {d.multipart && (
            <div style={mono}>
              {`multipart: ${d.multipart.parts} added, expects ${d.multipart.expected ?? '—'}, received [${d.multipart.received.join(', ')}]${
                d.multipart.missing.length ? `, missing [${d.multipart.missing.join(', ')}]` : ''
              }`}
            </div>
          )}
          {d.categoryTargets.length > 0 && (
            <div style={{ display: 'grid', gap: 3 }}>
              {d.categoryTargets.map((c) => (
                <div
                  key={c.id}
                  style={{
                    ...mono,
                    color: c.target != null && c.found !== c.target ? '#ffb4a8' : MUTED,
                  }}
                >
                  {`${c.name} (${c.id}): ${c.found}${c.target != null ? ` of ${c.target}` : ''}`}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: FAINT, borderTop: `1px solid ${theme.navBorder}`, paddingTop: 7 }}>
            {'Versions, ids and counts only — no package content.'}
          </div>
        </div>
      )}
    </div>
  );
}
