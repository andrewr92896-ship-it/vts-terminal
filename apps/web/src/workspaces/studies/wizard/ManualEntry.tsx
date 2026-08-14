import { useState } from 'react';
import { api, ApiError } from '../../../api/client';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import { parsePptx } from '../../../lib/pptx';
import type { WizardResult } from './PackageWizard';
import { ManualQuestions, blankQuestion, manualQuestionErrors, type ManualQuestion } from './ManualQuestions';
import { BORDER, FAINT, MUTED, TEXT, primaryBtn, secondaryBtn } from './wizardUi';

// The manual ending of the wizard.
//
// The important thing about this screen is what it does NOT do: it creates
// nothing while you work. The questions live in client state until Create is
// pressed, and that single call creates the Study Package and the game inside
// it in one transaction. Opening this screen, typing half a game and leaving
// therefore leaves nothing behind.
//
// It also does not route into the standalone maker. A package built through the
// wizard is package-backed by construction — the deck carries the package's
// `package_id`, the categories keep the stable ids the wizard assigned, and the
// package's settings come with it. The standalone maker still exists for
// building one game on its own, outside the wizard.

export function ManualEntry({
  theme,
  result,
  onBack,
  onCreated,
}: {
  theme: Theme;
  result: WizardResult;
  onBack: () => void;
  onCreated: (pkg: { id: string; name: string }) => void;
}) {
  const bp = result.blueprint;
  const categories = bp.categories.filter((c) => c.name.trim());
  const explanationsRequired = bp.explanationMode === 'always' || bp.explanationMode === 'on_incorrect';
  const wantsUploadedSlides = !!bp.includePresentation && bp.presentationSource === 'upload';

  const [questions, setQuestions] = useState<ManualQuestion[]>([blankQuestion(categories[0]?.id ?? null)]);
  const [slides, setSlides] = useState<{ title: string; body: string }[] | null>(null);
  const [slideNote, setSlideNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = manualQuestionErrors(questions, {
    explanationsRequired,
    categoriesRequired: categories.length > 0,
  });
  const slidesMissing = wantsUploadedSlides && !slides;
  const canCreate = problems.length === 0 && !slidesMissing && !busy;

  // The existing client-side PowerPoint reader, unchanged. The blueprint said
  // the creator is supplying their own presentation, so nothing is asked of an
  // AI here — the slides are read in the browser and committed with everything
  // else.
  const loadPptx = async (file: File) => {
    setSlideNote(null);
    try {
      const parsed = await parsePptx(file);
      const usable = parsed
        .map((s) => ({ title: (s.title ?? '').trim(), body: (s.body ?? '').trim() }))
        .filter((s) => s.title || s.body)
        .slice(0, 40);
      if (!usable.length) {
        setSlideNote('No slide text could be read from that file.');
        return;
      }
      setSlides(usable);
      setSlideNote(`${usable.length} slides read from ${file.name}.`);
    } catch {
      setSlideNote('That file could not be read as a PowerPoint.');
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { package: pkg } = await api.createManualStudyPackage({
        name: bp.packageName.trim() || bp.subject.trim(),
        subject: bp.subject.trim(),
        depth: bp.depth,
        categoryWeightMode: bp.categoryWeightMode,
        explanationMode: bp.explanationMode,
        categories: categories.map((c) => ({ id: c.id, name: c.name.trim(), weight: c.weight })),
        questions: questions.map((q) => ({
          categoryId: q.categoryId,
          stem: q.stem.trim(),
          options: q.options.map((o) => ({ label: o.label, text: o.text.trim() })),
          answer: q.answer,
          explanation: q.explanation.trim() || null,
        })),
        presentation: slides ? { title: bp.packageName.trim() || bp.subject.trim(), slides } : null,
      });
      onCreated(pkg);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `Could not create the package (${e.status}). Nothing was saved.`
          : 'Could not create the package. Nothing was saved.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <button onClick={onBack} style={secondaryBtn(theme)}>
          {'← Study Creation'}
        </button>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, background: 'rgba(255,255,255,.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
          <Icon name="layers" size={17} color={theme.accent} />
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{bp.packageName || 'Study package'}</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
          {categories.length
            ? `${bp.subject} — ${categories.map((c) => c.name.trim()).join(', ')}.`
            : bp.subject}
        </p>

        <ManualQuestions
          theme={theme}
          categories={categories}
          questions={questions}
          onChange={setQuestions}
          explanationsRequired={explanationsRequired}
        />

        {wantsUploadedSlides && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 700, color: '#fff' }}>Your presentation</h3>
            <label style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name="presentation" size={14} color="#dfe7fa" />
              {slides ? 'Choose a different file' : 'Upload a PowerPoint'}
              <input
                type="file"
                accept=".pptx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void loadPptx(f);
                  e.target.value = '';
                }}
              />
            </label>
            {slideNote && <div style={{ marginTop: 9, fontSize: 12.5, color: MUTED }}>{slideNote}</div>}
          </div>
        )}

        {(problems.length > 0 || slidesMissing) && questions.length > 0 && (
          <ul style={{ margin: '16px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            {slidesMissing && <li style={{ fontSize: 12, color: '#ffb4a8' }}>Upload the presentation you planned to include.</li>}
            {problems.slice(0, 8).map((p) => (
              <li key={p} style={{ fontSize: 12, color: '#ffb4a8' }}>
                {p}
              </li>
            ))}
            {problems.length > 8 && <li style={{ fontSize: 12, color: FAINT }}>…and {problems.length - 8} more.</li>}
          </ul>
        )}

        {error && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#ffb4a8' }}>
            <Icon name="alert-triangle" size={13} color="#ffb4a8" />
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void create()} disabled={!canCreate} style={primaryBtn(theme, !canCreate)}>
            {busy ? 'Creating…' : 'Create the study package'}
          </button>
          <span style={{ fontSize: 11.5, color: FAINT }}>Nothing is saved until you press this.</span>
        </div>
      </div>
    </div>
  );
}
