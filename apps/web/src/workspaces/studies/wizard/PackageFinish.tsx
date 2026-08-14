import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../api/client';
import type { StudyPackageDetail } from '../../../api/types';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import { NumberField } from '../NumberField';
import { emptyBlueprint, type Audience, type Depth, type StudyPackageBlueprint } from './blueprint';
import { newDraftId } from './draft';
import { PackageHandoff } from './PackageHandoff';
import { PackageImport } from './PackageImport';
import type { WizardResult } from './PackageWizard';
import { BORDER, FAINT, MUTED, TEXT, primaryBtn, secondaryBtn } from './wizardUi';

// FINISHING a package — giving it a part it was created without.
//
// A package is committed with whatever the creator had at the time, so a
// blueprint that asked for no questions produces a package with no study game.
// There was no route back: nothing could attach a component to a package that
// already existed, so a creator who had already had their AI write the
// questions had nowhere to put them.
//
// The whole screen is one idea: DESCRIBE THE MISSING PART, then reuse the
// ordinary handoff. It builds a blueprint out of the package the creator
// already has — its name, its subject, and above all its CATEGORIES, with their
// stored ids and weights — so the handoff asks for exactly what fits, and the
// importer checks the answer against the same thing. It calls no VTS AI, like
// everything else on this path.

const AUDIENCES: Audience[] = ['me', 'another_learner', 'students_or_staff', 'other'];
const DEPTHS: Depth[] = ['quick_review', 'standard', 'comprehensive', 'exam_prep'];

/**
 * A blueprint describing only what the package is missing.
 *
 * The categories come from the package's own rows, ids and all, which is what
 * makes the returned questions land on the categories the learner is already
 * scored against rather than on new ones with the same names. `categoryAuthor`
 * is 'user' because these categories are fixed — the AI is being told them, not
 * asked for them.
 */
export function finishBlueprint(
  pkg: StudyPackageDetail,
  want: { questions: boolean; flashcards: boolean; presentation: boolean; lessons: boolean },
  questionCount: number,
  /**
   * The creator already has a finished file, written before this package's plan
   * existed or against a different one.
   *
   * The blueprint then describes only WHICH PARTS to take, and stops making
   * demands about the shape of them: the categories are not locked and no
   * question counts are required, so a file with its own four categories is
   * accepted rather than refused for not matching a package that happens to
   * carry one. `addToPackage` reuses a category the package already has by name
   * and appends the rest, so the file's own structure survives intact.
   *
   * Everything that protects the package is untouched — a part it already has
   * is still refused, every limit still applies, and a malformed file is still
   * rejected. What is dropped is only the plan-conformance half, which cannot
   * be true of a file written against a different plan and which nothing needs
   * to be true in order to store the content correctly.
   */
  permissive = false,
): StudyPackageBlueprint {
  const bp = emptyBlueprint();
  bp.packageName = pkg.name;
  bp.subject = pkg.subject ?? pkg.name;
  // Stored as free text, so it is narrowed rather than trusted — an unknown
  // value simply goes unsaid in the handoff, which is better than asserting a
  // tone the package never had.
  bp.audience = AUDIENCES.includes(pkg.audience as Audience) ? (pkg.audience as Audience) : null;
  bp.depth = DEPTHS.includes(pkg.depth as Depth) ? (pkg.depth as Depth) : null;
  // Explanations are additive — a question that carries one is never worse than
  // a question that does not — so the added part asks for them regardless of
  // what the rest of the package settled on.
  bp.explanationMode = 'always';
  bp.categoriesEnabled = pkg.categories.length > 0;
  // 'user' locks the categories to exactly these ids — right when the AI is
  // being told them, wrong when the file already exists and brought its own.
  bp.categoryAuthor = permissive ? 'ai' : 'user';
  bp.categories = pkg.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight }));
  // Weights already stored on the package are the exam's blueprint. Declaring
  // them used is what makes the handoff ask for a proportional split rather
  // than an even one.
  bp.categoryWeightMode = pkg.categories.some((c) => c.weight != null) ? 'draw_and_score' : null;
  bp.weightAuthor = 'user';
  bp.questionMethod = want.questions ? 'ai_create' : 'manual';
  bp.sourceMaterial = want.questions ? 'topic_and_instructions' : null;
  // 'fixed' makes the exact total a requirement the file must meet. A file that
  // already exists has however many questions it has.
  bp.questionCountMode = permissive ? 'ai_recommend' : 'fixed';
  bp.questionCount = want.questions ? questionCount : 0;
  bp.includeFlashcards = want.flashcards;
  bp.flashcardFocus = want.flashcards ? 'mix' : null;
  bp.includePresentation = want.presentation;
  bp.presentationSource = want.presentation ? 'ai_draft' : null;
  bp.includeLessons = want.lessons;
  return bp;
}

export function PackageFinish({
  theme,
  packageId,
  onBack,
  onFinished,
}: {
  theme: Theme;
  packageId: string;
  onBack: () => void;
  onFinished: (pkg: { id: string; name: string }) => void;
}) {
  const [pkg, setPkg] = useState<StudyPackageDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [want, setWant] = useState({ questions: false, flashcards: false, presentation: false, lessons: false });
  const [count, setCount] = useState(50);
  const [started, setStarted] = useState<WizardResult | null>(null);
  // 'handoff' composes a prompt to take away; 'paste' goes straight to the box,
  // for a creator whose AI has already written the thing.
  const [route, setRoute] = useState<'handoff' | 'paste'>('handoff');

  useEffect(() => {
    let alive = true;
    api
      .getStudyPackage(packageId)
      .then(({ package: p }) => {
        if (!alive) return;
        setPkg(p);
        // Preselect everything the package does not have, because wanting all
        // of it is the ordinary case — somebody finishing a package usually
        // wants it finished.
        setWant({
          questions: !p.deckId,
          flashcards: !p.flashcardSetId,
          presentation: !p.guideId,
          lessons: p.lessons.length === 0,
        });
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof ApiError && e.status === 404 ? 'That package is gone.' : 'Could not read that package.');
      });
    return () => {
      alive = false;
    };
  }, [packageId]);

  if (loadError) {
    return (
      <Shell theme={theme} onBack={onBack}>
        <p style={{ margin: 0, fontSize: 13, color: '#ffb4a8' }}>{loadError}</p>
      </Shell>
    );
  }
  if (!pkg) {
    return (
      <Shell theme={theme} onBack={onBack}>
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>{'Reading the package…'}</p>
      </Shell>
    );
  }

  // From here it is the ordinary import path, aimed at this package rather than
  // at a new one. The two routes differ only in whether a prompt is composed on
  // the way — the reading, checking and writing are the same code either way.
  if (started) {
    if (route === 'paste') {
      return (
        <Shell theme={theme} onBack={() => setStarted(null)} backLabel="← What to add">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <Icon name="layers" size={17} color={theme.accent} />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{pkg.name}</h2>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
            {'Add the file your AI made. It is read and checked exactly as a new package is, then added to this one.'}
          </p>
          <PackageImport
            theme={theme}
            blueprint={started.blueprint}
            draftId={started.draftId}
            onImported={onFinished}
            addToPackageId={pkg.id}
          />
        </Shell>
      );
    }
    return (
      <PackageHandoff
        theme={theme}
        result={started}
        onBack={() => setStarted(null)}
        onImported={onFinished}
        addToPackageId={pkg.id}
        backLabel="← What to add"
      />
    );
  }

  const missing = [
    !pkg.deckId && { key: 'questions' as const, label: 'A study game', note: 'Questions to answer and be scored on.' },
    !pkg.flashcardSetId && { key: 'flashcards' as const, label: 'Flashcards', note: 'Term and definition cards.' },
    !pkg.guideId && { key: 'presentation' as const, label: 'A presentation', note: 'Slides to read through.' },
    pkg.lessons.length === 0 && { key: 'lessons' as const, label: 'Lessons', note: 'Groups of slides with an objective.' },
  ].filter(Boolean) as { key: keyof typeof want; label: string; note: string }[];

  // Lessons describe a presentation's slides, so asking for them without one is
  // asking for a set of pointers to nothing.
  const lessonsNeedSlides = want.lessons && !pkg.guideId && !want.presentation;
  const picked = Object.values(want).some(Boolean);
  const ready = picked && !lessonsNeedSlides && (!want.questions || count >= 1);

  return (
    <Shell theme={theme} onBack={onBack}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <Icon name="layers" size={17} color={theme.accent} />
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{pkg.name}</h2>
      </div>
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
        {has(pkg).length
          ? `This package already has ${list(has(pkg))}. Pick what to add — your AI writes it, and it joins the package you already have.`
          : 'This package has nothing in it yet. Pick what to add — your AI writes it, and it joins the package you already have.'}
      </p>
      {pkg.categories.length > 0 && (
        <p style={{ margin: '0 0 14px', fontSize: 12, color: FAINT, lineHeight: 1.55 }}>
          {`It will be written against the ${pkg.categories.length === 1 ? 'one category' : `${pkg.categories.length} categories`} this package already uses, so it scores with everything else in it.`}
        </p>
      )}

      {missing.length === 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED }}>
          {'Nothing is missing — this package has a study game, flashcards, a presentation and lessons.'}
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {missing.map((m) => (
              <label
                key={m.key}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '11px 13px',
                  borderRadius: 10,
                  border: `1px solid ${want[m.key] ? theme.accent : BORDER}`,
                  background: want[m.key] ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.02)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={want[m.key]}
                  onChange={(e) => setWant((w) => ({ ...w, [m.key]: e.target.checked }))}
                  style={{ marginTop: 2, accentColor: theme.accent }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: '#fff' }}>{m.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: FAINT, marginTop: 2 }}>{m.note}</span>
                </span>
              </label>
            ))}
          </div>

          {want.questions && (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, color: MUTED, marginBottom: 6 }}>
                {'How many questions?'}
              </label>
              <NumberField
                value={count}
                onChange={setCount}
                min={1}
                max={1000}
                emptyValue={0}
                style={{
                  width: 120,
                  padding: '9px 11px',
                  borderRadius: 9,
                  border: `1px solid ${BORDER}`,
                  background: '#0d1630',
                  color: TEXT,
                  fontSize: 14,
                }}
              />
              {pkg.categories.some((c) => c.weight != null) && (
                <p style={{ margin: '7px 0 0', fontSize: 12, color: FAINT, lineHeight: 1.5 }}>
                  {'They will be split across the categories by the weights this package already carries.'}
                </p>
              )}
            </div>
          )}

          {lessonsNeedSlides && (
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: '#ffd7a8', lineHeight: 1.5 }}>
              {'Lessons group a presentation’s slides, so add the presentation too — or leave lessons for later.'}
            </p>
          )}

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18 }}>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                setRoute('handoff');
                setStarted({ draftId: newDraftId(), blueprint: finishBlueprint(pkg, want, count), route: 'ai_handoff' });
              }}
              style={primaryBtn(theme, !ready)}
            >
              {'Build the handoff'}
            </button>
            {/* The creator who has already done the AI half. Without this the
                only way to a paste box was through composing a prompt they did
                not need — and the prompt's plan then refused their file for not
                matching a package it was never written against. */}
            <button
              type="button"
              disabled={!picked}
              onClick={() => {
                setRoute('paste');
                setStarted({ draftId: newDraftId(), blueprint: finishBlueprint(pkg, want, count, true), route: 'ai_handoff' });
              }}
              style={secondaryBtn(theme)}
            >
              {'I already have the file'}
            </button>
          </div>
          <p style={{ margin: '9px 0 0', fontSize: 12, color: FAINT, lineHeight: 1.5 }}>
            {'Already had your AI write it? Add it straight in — it is taken as it is, with its own categories.'}
          </p>
        </>
      )}
    </Shell>
  );
}

function has(pkg: StudyPackageDetail): string[] {
  return [
    pkg.deckId ? 'a study game' : null,
    pkg.flashcardSetId ? 'flashcards' : null,
    pkg.guideId ? 'a presentation' : null,
    pkg.lessons.length ? `${pkg.lessons.length} lessons` : null,
  ].filter(Boolean) as string[];
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function Shell({
  theme,
  onBack,
  children,
  backLabel = '← Study Creation',
}: {
  theme: Theme;
  onBack: () => void;
  children: React.ReactNode;
  backLabel?: string;
}) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: TEXT, animation: 'fadeIn .25s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <button onClick={onBack} style={secondaryBtn(theme)}>
          {backLabel}
        </button>
      </div>
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, background: 'rgba(255,255,255,.02)' }}>
        {children}
      </div>
    </div>
  );
}
