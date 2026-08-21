import { useState, type ReactNode } from 'react';
import { Icon } from '../../../components/Icon';
import type { Theme } from '../../../theme/themes';
import {
  AUDIENCE_LABELS,
  DEPTH_LABELS,
  EXPLANATION_LABELS,
  FOCUS_LABELS,
  MAX_QUESTIONS,
  METHOD_LABELS,
  PRESENTATION_LABELS,
  PROVIDER_LABELS,
  SOURCE_LABELS,
  WEIGHT_MODE_LABELS,
  needsExternalAi,
  questionCountLabel,
  questionsUseAi,
  weightsAreUsed,
  type StepId,
  type StudyPackageBlueprint,
} from './blueprint';
import { newCategoryId } from './draft';
import { BORDER, ChoiceGroup, FAINT, MUTED, NumberField, Prompt, TEXT, TextField, fieldStyle } from './wizardUi';

// One card per question. Each renders a prompt and a single control; the shell
// (PackageWizard) owns navigation, validation display and the draft.

export type Patch = (p: Partial<StudyPackageBlueprint>) => void;

export function StepCard({
  step,
  bp,
  patch,
  theme,
  provider,
  onEdit,
  onAdvance,
}: {
  step: StepId;
  bp: StudyPackageBlueprint;
  patch: Patch;
  theme: Theme;
  provider: string;
  /** Jump to a step — used by the review screen's Edit actions. */
  onEdit: (s: StepId) => void;
  /** Continue, for fields where Enter should move on. */
  onAdvance: () => void;
}) {
  switch (step) {
    case 'subject':
      return (
        <>
          <Prompt>What are you studying?</Prompt>
          <TextField
            value={bp.subject}
            onChange={(v) =>
              patch({
                subject: v,
                // The name follows the subject until the person edits it
                // themselves, which is why this compares against the old value
                // rather than checking a "touched" flag.
                packageName: bp.packageName === bp.subject ? v : bp.packageName,
              })
            }
            placeholder="Series 65, pharmacology, Spanish verbs…"
            autoFocus
            onEnter={onAdvance}
          />
        </>
      );

    case 'name':
      return (
        <>
          <Prompt>What should this study package be called?</Prompt>
          <TextField
            value={bp.packageName}
            onChange={(v) => patch({ packageName: v })}
            placeholder={bp.subject || 'Study package name'}
            autoFocus
            onEnter={onAdvance}
          />
        </>
      );

    case 'audience':
      return (
        <>
          <Prompt>Who is this study package for?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.audience}
            onChange={(v) => patch({ audience: v })}
            options={[
              { value: 'me' as const, label: AUDIENCE_LABELS.me },
              { value: 'another_learner' as const, label: AUDIENCE_LABELS.another_learner },
              { value: 'students_or_staff' as const, label: AUDIENCE_LABELS.students_or_staff },
              { value: 'other' as const, label: AUDIENCE_LABELS.other },
            ]}
          />
        </>
      );

    case 'depth':
      return (
        <>
          <Prompt>How comprehensive should it be?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.depth}
            onChange={(v) => patch({ depth: v })}
            options={[
              { value: 'quick_review' as const, label: DEPTH_LABELS.quick_review },
              { value: 'standard' as const, label: DEPTH_LABELS.standard },
              { value: 'comprehensive' as const, label: DEPTH_LABELS.comprehensive },
              { value: 'exam_prep' as const, label: DEPTH_LABELS.exam_prep },
            ]}
          />
        </>
      );

    case 'questionCount':
      return <QuestionCountStep theme={theme} bp={bp} patch={patch} />;

    case 'questionMethod':
      return (
        <>
          <Prompt>How will you create your study questions?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.questionMethod}
            onChange={(v) => patch({ questionMethod: v })}
            options={[
              { value: 'ai_create' as const, label: METHOD_LABELS.ai_create },
              { value: 'ai_format_existing' as const, label: METHOD_LABELS.ai_format_existing },
              { value: 'manual' as const, label: METHOD_LABELS.manual },
            ]}
          />
        </>
      );

    case 'sourceMaterial':
      return (
        <>
          <Prompt sub="You give this to your own AI. Nothing is uploaded here.">
            What should your AI use as source material?
          </Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.sourceMaterial}
            onChange={(v) => patch({ sourceMaterial: v })}
            options={[
              { value: 'topic_and_instructions' as const, label: SOURCE_LABELS.topic_and_instructions },
              { value: 'own_materials' as const, label: SOURCE_LABELS.own_materials },
              { value: 'both' as const, label: SOURCE_LABELS.both },
            ]}
          />
        </>
      );

    case 'categoriesEnabled':
      return (
        <>
          <Prompt>Do you want to track performance by category?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.categoriesEnabled}
            onChange={(v) =>
              patch(
                v
                  ? { categoriesEnabled: true }
                  : // Turning categories off clears what only makes sense with
                    // them on, so the review screen cannot show a weighting
                    // choice for a package that has no categories.
                    {
                      categoriesEnabled: false,
                      categoryAuthor: null,
                      categories: [],
                      categoryWeightMode: null,
                      weightAuthor: null,
                    },
              )
            }
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ]}
          />
        </>
      );

    case 'categoryAuthor':
      return (
        <>
          <Prompt>Who should choose the categories?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.categoryAuthor}
            onChange={(v) => patch({ categoryAuthor: v })}
            options={[
              { value: 'user' as const, label: "I'll set them" },
              { value: 'ai' as const, label: 'Let my AI recommend them' },
            ]}
          />
        </>
      );

    case 'categoryEditor':
      return <CategoryEditor bp={bp} patch={patch} theme={theme} mode="names" />;

    case 'categoryBehavior':
      return (
        <>
          <Prompt>How should categories affect the study game?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.categoryWeightMode}
            onChange={(v) => patch({ categoryWeightMode: v, ...(weightsAreUsed(v) ? null : { weightAuthor: null }) })}
            options={[
              { value: 'tracking_only' as const, label: WEIGHT_MODE_LABELS.tracking_only },
              { value: 'draw_only' as const, label: WEIGHT_MODE_LABELS.draw_only },
              { value: 'score_only' as const, label: WEIGHT_MODE_LABELS.score_only },
              { value: 'draw_and_score' as const, label: WEIGHT_MODE_LABELS.draw_and_score },
            ]}
          />
        </>
      );

    case 'weightAuthor':
      return (
        <>
          <Prompt>Who should set the category weights?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.weightAuthor}
            onChange={(v) => patch({ weightAuthor: v })}
            options={[
              { value: 'user' as const, label: "I'll set them" },
              { value: 'ai' as const, label: 'Let my AI recommend them' },
            ]}
          />
        </>
      );

    case 'weightEditor':
      return <CategoryEditor bp={bp} patch={patch} theme={theme} mode="weights" />;

    case 'explanations':
      return (
        <>
          <Prompt>How should answer explanations work?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.explanationMode}
            onChange={(v) => patch({ explanationMode: v })}
            options={[
              { value: 'always' as const, label: EXPLANATION_LABELS.always },
              { value: 'on_incorrect' as const, label: EXPLANATION_LABELS.on_incorrect },
              { value: 'none' as const, label: EXPLANATION_LABELS.none },
            ]}
          />
        </>
      );

    case 'flashcards':
      return (
        <>
          <Prompt>Include flashcards?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.includeFlashcards}
            onChange={(v) => patch(v ? { includeFlashcards: true } : { includeFlashcards: false, flashcardFocus: null })}
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ]}
          />
        </>
      );

    case 'flashcardFocus':
      return (
        <>
          <Prompt>What should the flashcards focus on?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.flashcardFocus}
            onChange={(v) => patch({ flashcardFocus: v })}
            options={[
              { value: 'key_terms' as const, label: FOCUS_LABELS.key_terms },
              { value: 'concepts' as const, label: FOCUS_LABELS.concepts },
              { value: 'formulas' as const, label: FOCUS_LABELS.formulas },
              { value: 'mix' as const, label: FOCUS_LABELS.mix },
              { value: 'ai_choice' as const, label: FOCUS_LABELS.ai_choice },
            ]}
          />
        </>
      );

    case 'presentation':
      return (
        <>
          <Prompt>Include a study guide or presentation?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.includePresentation}
            onChange={(v) =>
              patch(
                v
                  ? { includePresentation: true }
                  : { includePresentation: false, presentationSource: null, includeLessons: null },
              )
            }
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ]}
          />
        </>
      );

    case 'presentationSource':
      return (
        <>
          <Prompt>How should the presentation be created?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.presentationSource}
            onChange={(v) => patch({ presentationSource: v })}
            options={[
              { value: 'ai_draft' as const, label: PRESENTATION_LABELS.ai_draft },
              { value: 'upload' as const, label: PRESENTATION_LABELS.upload },
              { value: 'both' as const, label: PRESENTATION_LABELS.both },
            ]}
          />
        </>
      );

    case 'lessons':
      return (
        <>
          <Prompt>Organize the presentation into lessons?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.includeLessons}
            onChange={(v) => patch({ includeLessons: v })}
            options={[
              { value: true, label: 'Yes' },
              { value: false, label: 'No' },
            ]}
          />
        </>
      );

    case 'aiProvider':
      return (
        <>
          <Prompt>Which AI will you use?</Prompt>
          <ChoiceGroup
            theme={theme}
            value={bp.aiProvider}
            onChange={(v) => patch({ aiProvider: v })}
            options={[
              { value: 'chatgpt' as const, label: PROVIDER_LABELS.chatgpt },
              { value: 'claude' as const, label: PROVIDER_LABELS.claude },
              { value: 'other' as const, label: PROVIDER_LABELS.other },
            ]}
          />
        </>
      );

    case 'aiOnboarding':
      return <AiOnboarding theme={theme} provider={provider} />;

    case 'review':
      return <Review bp={bp} theme={theme} onEdit={onEdit} />;
  }
}

// ---- The category editor ----
//
// One component for both cards: naming the categories, and weighting them. The
// rows are the same rows, and splitting them into two components is how the two
// come to disagree about what a category is.
/**
 * How many practice questions.
 *
 * `custom` is LOCAL state rather than something derived from the number, and
 * that is the whole point of it: read back off the value, the box vanishes the
 * moment what is typed happens to equal a preset — start typing 50 and the
 * field you are standing in disappears at "5"… "50". Reported by the owner,
 * 2026-08, on the study-game maker's own count box.
 */
function QuestionCountStep({ theme, bp, patch }: { theme: Theme; bp: StudyPackageBlueprint; patch: Patch }) {
  const presets = [25, 50, 100];
  const [custom, setCustom] = useState(
    () => bp.questionCountMode === 'fixed' && (bp.questionCount == null || !presets.includes(bp.questionCount)),
  );
  return (
    <>
      <Prompt>How many practice questions do you want?</Prompt>
      <ChoiceGroup
        theme={theme}
        value={
          bp.questionCountMode === 'ai_recommend'
            ? 'ai'
            : custom
              ? 'custom'
              : bp.questionCount != null && presets.includes(bp.questionCount)
                ? String(bp.questionCount)
                : null
        }
        onChange={(v) => {
          if (v === 'ai') {
            setCustom(false);
            patch({ questionCountMode: 'ai_recommend', questionCount: null });
          } else if (v === 'custom') {
            setCustom(true);
            patch({ questionCountMode: 'fixed', questionCount: null });
          } else {
            setCustom(false);
            patch({ questionCountMode: 'fixed', questionCount: Number(v) });
          }
        }}
        options={[
          { value: 'ai', label: 'Let my AI recommend' },
          ...presets.map((n) => ({ value: String(n), label: String(n) })),
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {custom && (
        <div style={{ marginTop: 12 }}>
          <NumberField
            value={bp.questionCount == null ? '' : String(bp.questionCount)}
            onChange={(v) => patch({ questionCount: v === '' ? null : Number(v) })}
            min={1}
            max={MAX_QUESTIONS}
            autoFocus
          />
        </div>
      )}
    </>
  );
}

function CategoryEditor({
  bp,
  patch,
  theme,
  mode,
}: {
  bp: StudyPackageBlueprint;
  patch: Patch;
  theme: Theme;
  mode: 'names' | 'weights';
}) {
  const rows = bp.categories;
  const total = rows.reduce((sum, c) => sum + (c.weight ?? 0), 0);

  const setRow = (id: string, next: Partial<{ name: string; weight: number | null }>) =>
    patch({ categories: rows.map((c) => (c.id === id ? { ...c, ...next } : c)) });

  return (
    <>
      {mode === 'names' ? (
        <Prompt>Name your categories</Prompt>
      ) : (
        <Prompt sub="They do not have to add up to 100 — the shares are worked out from whatever you enter.">
          Set the category weights
        </Prompt>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={c.name}
              onChange={(e) => setRow(c.id, { name: e.target.value })}
              placeholder="Category name"
              disabled={mode === 'weights'}
              style={{ ...fieldStyle, flex: 1, minWidth: 0, opacity: mode === 'weights' ? 0.75 : 1 }}
            />
            {mode === 'weights' && (
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={c.weight == null ? '' : String(c.weight)}
                onChange={(e) =>
                  setRow(c.id, { weight: e.target.value === '' ? null : Number(e.target.value) })
                }
                style={{ ...fieldStyle, width: 88, flex: 'none' }}
              />
            )}
            {mode === 'names' && (
              <button
                type="button"
                aria-label={`Remove ${c.name || 'category'}`}
                onClick={() => patch({ categories: rows.filter((r) => r.id !== c.id) })}
                style={{
                  flex: 'none',
                  background: 'rgba(255,255,255,.04)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '9px 10px',
                  cursor: 'pointer',
                  color: MUTED,
                }}
              >
                <Icon name="trash-2" size={14} color={MUTED} />
              </button>
            )}
          </div>
        ))}
      </div>

      {mode === 'names' && (
        <button
          type="button"
          onClick={() =>
            // A brand new id, kept for the life of the row. Renaming afterwards
            // edits the name and never the identity.
            patch({ categories: [...rows, { id: newCategoryId(), name: '', weight: null }] })
          }
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
          Add a category
        </button>
      )}

      {mode === 'weights' && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: MUTED }}>
          Total: <strong style={{ color: TEXT }}>{Math.round(total * 10) / 10}</strong>
        </div>
      )}
    </>
  );
}

// ---- First-time AI onboarding ----
//
// A deliberate exception to the terminal's standing rule against how-to copy
// (owner instruction): somebody who has never used an AI chat cannot be expected
// to work out the paste-and-return loop from a button label. Shown once.
export function AiOnboarding({ theme, provider }: { theme: Theme; provider: string }) {
  const steps = [
    `Open ${provider}, or create an account.`,
    'Start a new chat.',
    'Copy the VTS handoff.',
    'Paste it into the AI.',
    'Answer its questions one at a time.',
    'When it finishes, copy or download the study package it made.',
    'Come back here and import it.',
  ];
  return (
    <>
      <Prompt>{`Here's how it works`}</Prompt>
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
        {steps.map((s, i) => (
          <li key={s} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <span
              style={{
                flex: 'none',
                width: 21,
                height: 21,
                borderRadius: 999,
                background: `${theme.accent}22`,
                color: theme.accent,
                fontSize: 11.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.5 }}>{s}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

// ---- Review ----

function Review({
  bp,
  theme,
  onEdit,
}: {
  bp: StudyPackageBlueprint;
  theme: Theme;
  onEdit: (s: StepId) => void;
}) {
  const rows: { step: StepId; label: string; value: ReactNode }[] = [
    { step: 'subject', label: 'Subject', value: bp.subject || '—' },
    { step: 'name', label: 'Name', value: bp.packageName || '—' },
    { step: 'audience', label: 'For', value: bp.audience ? AUDIENCE_LABELS[bp.audience] : '—' },
    { step: 'depth', label: 'Depth', value: bp.depth ? DEPTH_LABELS[bp.depth] : '—' },
    { step: 'questionCount', label: 'Questions', value: questionCountLabel(bp) },
    { step: 'questionMethod', label: 'Written by', value: bp.questionMethod ? METHOD_LABELS[bp.questionMethod] : '—' },
  ];
  if (questionsUseAi(bp)) {
    rows.push({
      step: 'sourceMaterial',
      label: 'Source material',
      value: bp.sourceMaterial ? SOURCE_LABELS[bp.sourceMaterial] : '—',
    });
  }
  rows.push({
    step: 'categoriesEnabled',
    label: 'Categories',
    value: bp.categoriesEnabled
      ? bp.categoryAuthor === 'ai'
        ? 'My AI recommends them'
        : bp.categories
            .map((c) => c.name.trim())
            .filter(Boolean)
            .join(', ') || '—'
      : 'Not tracked',
  });
  if (bp.categoriesEnabled) {
    rows.push({
      step: 'categoryBehavior',
      label: 'Categories count for',
      value: bp.categoryWeightMode ? WEIGHT_MODE_LABELS[bp.categoryWeightMode] : '—',
    });
    if (weightsAreUsed(bp.categoryWeightMode)) {
      rows.push({
        step: 'weightAuthor',
        label: 'Weights',
        value:
          bp.weightAuthor === 'ai'
            ? 'My AI recommends them'
            : bp.categories
                .filter((c) => c.name.trim())
                .map((c) => `${c.name.trim()} ${c.weight ?? 0}`)
                .join(' · ') || '—',
      });
    }
  }
  rows.push({
    step: 'explanations',
    label: 'Explanations',
    value: bp.explanationMode ? EXPLANATION_LABELS[bp.explanationMode] : '—',
  });
  rows.push({
    step: 'flashcards',
    label: 'Flashcards',
    value: bp.includeFlashcards ? (bp.flashcardFocus ? FOCUS_LABELS[bp.flashcardFocus] : 'Yes') : 'No',
  });
  rows.push({
    step: 'presentation',
    label: 'Presentation',
    value: bp.includePresentation
      ? bp.presentationSource
        ? PRESENTATION_LABELS[bp.presentationSource]
        : 'Yes'
      : 'No',
  });
  if (bp.includePresentation) {
    rows.push({ step: 'lessons', label: 'Lessons', value: bp.includeLessons ? 'Yes' : 'No' });
  }
  if (needsExternalAi(bp)) {
    rows.push({
      step: 'aiProvider',
      label: 'My AI',
      value: bp.aiProvider ? PROVIDER_LABELS[bp.aiProvider] : '—',
    });
  }

  return (
    <>
      <Prompt>Review your study package</Prompt>
      <div style={{ display: 'grid', gap: 1, background: BORDER, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((r) => (
          <div
            key={`${r.step}-${r.label}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '10px 12px',
              background: '#0b1329',
            }}
          >
            <span style={{ flex: 'none', width: 128, fontSize: 12, color: FAINT, paddingTop: 1 }}>{r.label}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: TEXT, lineHeight: 1.5, wordBreak: 'break-word' }}>
              {r.value}
            </span>
            <button
              type="button"
              onClick={() => onEdit(r.step)}
              style={{
                flex: 'none',
                fontSize: 12,
                fontWeight: 600,
                color: theme.accent,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
              }}
            >
              Edit
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
