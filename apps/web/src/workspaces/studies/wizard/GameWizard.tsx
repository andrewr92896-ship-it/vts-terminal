import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../../components/Icon';
import { useResponsive } from '../../../hooks/useMediaQuery';
import type { Theme } from '../../../theme/themes';
import { api } from '../../../api/client';
import type { DeckQuestion, TeamDeck } from '../../../api/types';
import { downloadCsv, parseQuestionsCsv, questionTemplateCsv } from '../studyCsv';
import { errorText } from '../studyErrors';
import {
  BORDER,
  ChoiceGroup,
  ErrorLine,
  FAINT,
  MUTED,
  NumberField,
  PAGE,
  Progress,
  Prompt,
  TEXT,
  TextField,
  fieldStyle,
  primaryBtn,
  secondaryBtn,
} from './wizardUi';

// The study-game maker, as a wizard.
//
// It asks one thing per card and reviews the answers before it does anything —
// the same shape as the package wizard next door, and built from the same
// `wizardUi` controls so the two cannot drift into two different-looking
// workflows for what a creator reads as one job (owner instruction, 2026-08).
// It replaced a single stacked form with three mode tabs, where every field for
// every mode was on screen at once whether or not it applied.
//
// What it is NOT is a second package wizard. That one describes the SHAPE of a
// package and writes nothing, handing the blueprint to the creator's own AI;
// this one builds one standalone study game and calls VTS AI to do it. Same
// format, different job — which is why the plan below is its own small type
// rather than a `StudyPackageBlueprint`.

const MAX_FILE_CHARS = 100_000;

// The ceiling the server accepts for one game, and the same one the package
// blueprint uses. There is deliberately no cap below it on the AI generation:
// a game is as long as the exam behind it, and a number the terminal made up is
// not a reason to refuse one (owner instruction, 2026-08).
export const MAX_GAME_QUESTIONS = 1000;

// Past roughly this many, one generation is long enough to be worth warning
// about — see the note on the count card. Not a limit, and nothing enforces it.
const LONG_GENERATION = 150;

type Method = 'ai' | 'file' | 'csv';

type StepId = 'method' | 'name' | 'topic' | 'count' | 'instructions' | 'file' | 'csv' | 'review';

interface GamePlan {
  method: Method | null;
  name: string;
  topic: string;
  instructions: string;
  /** Null until a number is chosen. Never defaulted — an unset count is unset. */
  count: number | null;
  fileName: string | null;
  fileText: string;
  /** Parsed on the spot when a CSV is picked; no AI is involved in that path. */
  csvQuestions: DeckQuestion[] | null;
  csvSkipped: string[];
}

const emptyPlan = (): GamePlan => ({
  method: null,
  name: '',
  topic: '',
  instructions: '',
  count: null,
  fileName: null,
  fileText: '',
  csvQuestions: null,
  csvSkipped: [],
});

/**
 * The path through the cards, recomputed from the answers.
 *
 * Add a question by adding a `StepId` and a case, never by threading a
 * conditional through the shell — the same rule the package wizard follows.
 */
function stepsFor(plan: GamePlan): StepId[] {
  if (!plan.method) return ['method'];
  if (plan.method === 'ai') return ['method', 'name', 'topic', 'count', 'instructions', 'review'];
  if (plan.method === 'file') return ['method', 'name', 'file', 'instructions', 'review'];
  return ['method', 'name', 'csv', 'review'];
}

/** A plain-language problem with the answer on this card, or null. */
function stepError(plan: GamePlan, step: StepId): string | null {
  switch (step) {
    case 'method':
      return plan.method ? null : 'Pick how you want to build the questions.';
    case 'name':
      return plan.name.trim() ? null : 'Give the study game a name.';
    case 'topic':
      return plan.topic.trim() ? null : 'Say what the questions should be about.';
    case 'count':
      if (plan.count == null) return 'Say how many questions you want.';
      if (!Number.isInteger(plan.count) || plan.count < 1) return 'Use a whole number, 1 or more.';
      if (plan.count > MAX_GAME_QUESTIONS) return `The most a study game can hold is ${MAX_GAME_QUESTIONS}.`;
      return null;
    case 'instructions':
      return null;
    case 'file':
      return plan.fileText.trim() ? null : 'Choose a file to build the questions from.';
    case 'csv':
      return plan.csvQuestions && plan.csvQuestions.length > 0 ? null : 'Choose a CSV with at least one question in it.';
    case 'review':
      return null;
  }
}

const METHOD_LABELS: Record<Method, string> = {
  ai: 'Have VTS AI write them',
  file: 'Build them from a file of mine',
  csv: 'Import a CSV I already have',
};

export function GameWizard({
  theme,
  onClose,
  onCreated,
}: {
  theme: Theme;
  onClose: () => void;
  onCreated: (decks: TeamDeck[], newId: string) => void;
}) {
  const { isPhone } = useResponsive();
  const [plan, setPlan] = useState<GamePlan>(emptyPlan);
  const [stepId, setStepId] = useState<StepId>('method');
  const [showError, setShowError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The questions waiting on the author's eye — AI-formatted from their file, or
  // parsed from their CSV. Null while the plan is still being answered.
  const [preview, setPreview] = useState<DeckQuestion[] | null>(null);

  const steps = useMemo(() => stepsFor(plan), [plan]);
  const index = steps.indexOf(stepId);
  const safeStep: StepId = index >= 0 ? stepId : steps[Math.max(0, steps.length - 1)];
  const safeIndex = Math.max(0, steps.indexOf(safeStep));
  const error = stepError(plan, safeStep);
  const onReview = safeStep === 'review';

  const patch = useCallback((p: Partial<GamePlan>) => {
    setShowError(false);
    setFailure(null);
    setPlan((b) => ({ ...b, ...p }));
  }, []);

  const goNext = useCallback(() => {
    if (error) {
      setShowError(true);
      return;
    }
    setShowError(false);
    setStepId(steps[Math.min(steps.length - 1, safeIndex + 1)]);
  }, [error, steps, safeIndex]);

  const goBack = useCallback(() => {
    setShowError(false);
    setFailure(null);
    if (preview) {
      setPreview(null);
      return;
    }
    if (safeIndex <= 0) {
      onClose();
      return;
    }
    setStepId(steps[safeIndex - 1]);
  }, [safeIndex, steps, onClose, preview]);

  // Escape closes, except while something is being built — a request is already
  // in flight and closing would leave the author unable to see how it went.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // ---- The three things the review card's button can do ----

  async function buildWithAi() {
    if (plan.count == null) return;
    setBusy('Writing your questions…');
    setFailure(null);
    try {
      const res = await api.generateStudyDeck({
        name: plan.name.trim(),
        topic: plan.topic.trim(),
        instructions: plan.instructions.trim() || undefined,
        count: plan.count,
      });
      onCreated(res.decks, res.deck.id);
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function readMyFile() {
    setBusy('Reading your file…');
    setFailure(null);
    try {
      const res = await api.previewStudyDeck({
        text: plan.fileText,
        instructions: plan.instructions.trim() || undefined,
      });
      setPreview(res.questions);
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function createFromPreview() {
    if (!preview || preview.length === 0) return;
    setBusy('Creating the study game…');
    setFailure(null);
    try {
      const res = await api.confirmStudyDeck({ name: plan.name.trim(), questions: preview });
      onCreated(res.decks, res.deck.id);
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const finishLabel =
    plan.method === 'ai' ? '✦ Build with AI' : plan.method === 'file' ? '✦ Read my file' : 'Review the questions';

  const finish = () => {
    if (plan.method === 'ai') return void buildWithAi();
    if (plan.method === 'file') return void readMyFile();
    setPreview(plan.csvQuestions);
  };

  return (
    <>
      <div
        onClick={() => !busy && onClose()}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60, animation: 'fadeIn .2s ease' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New study game"
        style={{
          position: 'fixed',
          top: isPhone ? 0 : 'calc(7 * var(--vh))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: isPhone ? '100%' : 'min(560px, calc(94 * var(--vw)))',
          height: isPhone ? '100%' : 'auto',
          maxHeight: isPhone ? '100%' : 'calc(86 * var(--vh))',
          display: 'flex',
          flexDirection: 'column',
          background: PAGE,
          border: isPhone ? 'none' : `1px solid ${BORDER}`,
          borderRadius: isPhone ? 0 : 14,
          boxShadow: '0 24px 60px rgba(0,0,0,.55)',
          zIndex: 61,
          animation: 'popIn .25s ease',
          color: TEXT,
        }}
      >
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${BORDER}`, flex: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
            <Icon name="gamepad-2" size={16} color={theme.accent} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#fff' }}>{'New study game'}</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => !busy && onClose()}
              style={{ background: 'transparent', border: 'none', cursor: busy ? 'default' : 'pointer', padding: 2, lineHeight: 0 }}
            >
              <Icon name="x-circle" size={18} color={MUTED} />
            </button>
          </div>
          <Progress
            theme={theme}
            fraction={preview ? 1 : steps.length > 1 ? safeIndex / (steps.length - 1) : 0}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 20px' }}>
          {preview ? (
            <QuestionReview theme={theme} plan={plan} questions={preview} onName={(v) => patch({ name: v })} />
          ) : (
            <StepCard step={safeStep} plan={plan} patch={patch} theme={theme} onAdvance={goNext} />
          )}
          {showError && error && !preview && <ErrorLine>{error}</ErrorLine>}
          {failure && <ErrorLine>{failure}</ErrorLine>}
        </div>

        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 16px',
            paddingBottom: isPhone ? 'calc(12px + env(safe-area-inset-bottom))' : 12,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <button type="button" onClick={goBack} disabled={!!busy} style={secondaryBtn(theme)}>
            {preview ? 'Back' : safeIndex <= 0 ? 'Cancel' : 'Back'}
          </button>
          <div style={{ flex: 1 }} />
          {busy && <span style={{ fontSize: 12.5, color: MUTED }}>{busy}</span>}
          {preview ? (
            <button
              type="button"
              onClick={createFromPreview}
              disabled={!!busy || !plan.name.trim() || preview.length === 0}
              style={primaryBtn(theme, !!busy || !plan.name.trim() || preview.length === 0)}
            >
              {'Create study game'}
            </button>
          ) : onReview ? (
            <button type="button" onClick={finish} disabled={!!busy} style={primaryBtn(theme, !!busy)}>
              {finishLabel}
            </button>
          ) : (
            <button type="button" onClick={goNext} style={primaryBtn(theme)}>
              {'Continue'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ---- The cards ----

function StepCard({
  step,
  plan,
  patch,
  theme,
  onAdvance,
}: {
  step: StepId;
  plan: GamePlan;
  patch: (p: Partial<GamePlan>) => void;
  theme: Theme;
  onAdvance: () => void;
}) {
  switch (step) {
    case 'method':
      return (
        <>
          <Prompt>{'How do you want to build the questions?'}</Prompt>
          <ChoiceGroup
            theme={theme}
            value={plan.method}
            onChange={(v) => patch({ method: v, csvQuestions: null, csvSkipped: [], fileText: '', fileName: null })}
            options={[
              { value: 'ai' as const, label: METHOD_LABELS.ai, note: 'You name the topic and VTS AI writes the questions and the answer key.' },
              { value: 'file' as const, label: METHOD_LABELS.file, note: 'Upload notes or a question list and VTS AI formats it into a game.' },
              { value: 'csv' as const, label: METHOD_LABELS.csv, note: 'No AI involved — your rows become the questions.' },
            ]}
          />
        </>
      );

    case 'name':
      return (
        <>
          <Prompt>{'What is this study game called?'}</Prompt>
          <TextField
            value={plan.name}
            onChange={(v) => patch({ name: v })}
            placeholder="e.g. Chart Patterns"
            autoFocus
            onEnter={onAdvance}
          />
        </>
      );

    case 'topic':
      return (
        <>
          <Prompt>{'What should the questions be about?'}</Prompt>
          <TextField
            value={plan.topic}
            onChange={(v) => patch({ topic: v })}
            placeholder="e.g. Candlestick reversal patterns"
            autoFocus
            onEnter={onAdvance}
          />
        </>
      );

    case 'count':
      return <CountCard theme={theme} plan={plan} patch={patch} />;

    case 'instructions':
      return (
        <>
          <Prompt sub="Optional — difficulty, focus areas, the style of question you want.">
            {'Anything else VTS AI should know?'}
          </Prompt>
          <textarea
            value={plan.instructions}
            onChange={(e) => patch({ instructions: e.target.value })}
            maxLength={2000}
            rows={4}
            placeholder="e.g. Exam-level difficulty, weight it toward reversal patterns."
            style={{ ...fieldStyle, resize: 'vertical', minHeight: 96 }}
          />
        </>
      );

    case 'file':
      return <FileCard theme={theme} plan={plan} patch={patch} />;

    case 'csv':
      return <CsvCard theme={theme} plan={plan} patch={patch} />;

    case 'review':
      return <ReviewCard plan={plan} />;
  }
}

/**
 * How many questions.
 *
 * `custom` is LOCAL state rather than something read back off the number, and
 * that is the whole point of it: derived from the value, the box vanishes the
 * moment what is typed happens to equal a preset — type 5, then 0, and the
 * field you are standing in disappears at "50". Reported by the owner, 2026-08.
 */
function CountCard({ theme, plan, patch }: { theme: Theme; plan: GamePlan; patch: (p: Partial<GamePlan>) => void }) {
  const presets = [15, 25, 50, 100];
  const [custom, setCustom] = useState(() => plan.count != null && !presets.includes(plan.count));
  return (
    <>
      <Prompt>{'How many questions do you want?'}</Prompt>
      <ChoiceGroup
        theme={theme}
        value={custom ? 'custom' : plan.count != null && presets.includes(plan.count) ? String(plan.count) : null}
        onChange={(v) => {
          if (v === 'custom') {
            setCustom(true);
            patch({ count: null });
          } else {
            setCustom(false);
            patch({ count: Number(v) });
          }
        }}
        options={[
          ...presets.map((n) => ({ value: String(n), label: String(n) })),
          { value: 'custom', label: 'A number of my own' },
        ]}
      />
      {custom && (
        <div style={{ marginTop: 12 }}>
          <NumberField
            value={plan.count == null ? '' : String(plan.count)}
            onChange={(v) => patch({ count: v === '' ? null : Number(v) })}
            min={1}
            max={MAX_GAME_QUESTIONS}
            autoFocus
          />
        </div>
      )}
      {plan.count != null && plan.count > LONG_GENERATION && (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: '#e0a23a', lineHeight: 1.55 }}>
          {`A game this long takes a few minutes to write, and the request can time out before it finishes. If it does, build it in a couple of shorter goes — or use Create a study package, where your own AI writes the whole thing.`}
        </p>
      )}
    </>
  );
}

function FileCard({ theme, plan, patch }: { theme: Theme; plan: GamePlan; patch: (p: Partial<GamePlan>) => void }) {
  return (
    <>
      <Prompt sub="A text file of your own questions, or notes to build them from.">{'Choose your file'}</Prompt>
      <label style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
        {plan.fileName ? 'Choose a different file' : 'Choose a text file'}
        <input
          type="file"
          accept=".txt,.md,text/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const raw = typeof reader.result === 'string' ? reader.result : '';
              patch({
                fileName: file.name,
                fileText: raw.slice(0, MAX_FILE_CHARS),
                ...(plan.name.trim() ? {} : { name: file.name.replace(/\.[^.]+$/, '') }),
              });
            };
            reader.readAsText(file);
            e.target.value = '';
          }}
        />
      </label>
      {plan.fileName && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: MUTED }}>
          {plan.fileName} · {plan.fileText.length.toLocaleString()} characters
        </p>
      )}
    </>
  );
}

function CsvCard({ theme, plan, patch }: { theme: Theme; plan: GamePlan; patch: (p: Partial<GamePlan>) => void }) {
  const [parseError, setParseError] = useState<string | null>(null);
  return (
    <>
      <Prompt>{'Choose your CSV'}</Prompt>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <label style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          {plan.csvQuestions ? 'Choose a different CSV' : 'Choose a CSV file'}
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setParseError(null);
              const reader = new FileReader();
              reader.onload = () => {
                const raw = typeof reader.result === 'string' ? reader.result : '';
                const { questions, error, skipped } = parseQuestionsCsv(raw.slice(0, MAX_FILE_CHARS));
                if (error) {
                  setParseError(error);
                  patch({ csvQuestions: null, csvSkipped: [] });
                  return;
                }
                patch({
                  csvQuestions: questions,
                  csvSkipped: skipped,
                  fileName: file.name,
                  ...(plan.name.trim() ? {} : { name: file.name.replace(/\.[^.]+$/, '') }),
                });
              };
              reader.readAsText(file);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => downloadCsv('study-game-template', questionTemplateCsv())}
          style={secondaryBtn(theme)}
        >
          {'⭳ Download template'}
        </button>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: FAINT, lineHeight: 1.55 }}>
        {'Columns: Question, Option A, Option B, Option C, Option D, Answer, and optional Topic and Explanation.'}
      </p>
      {parseError && <ErrorLine>{parseError}</ErrorLine>}
      {plan.csvQuestions && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: MUTED }}>
          {`Read ${plan.csvQuestions.length} question${plan.csvQuestions.length === 1 ? '' : 's'}.`}
          {plan.csvSkipped.length > 0
            ? ` Skipped ${plan.csvSkipped.length} row${plan.csvSkipped.length === 1 ? '' : 's'}.`
            : ''}
        </p>
      )}
    </>
  );
}

function ReviewCard({ plan }: { plan: GamePlan }) {
  const rows: [string, string][] = [
    ['Name', plan.name.trim() || '—'],
    ['Built from', plan.method ? METHOD_LABELS[plan.method] : '—'],
  ];
  if (plan.method === 'ai') {
    rows.push(['Topic', plan.topic.trim() || '—']);
    rows.push(['Questions', plan.count == null ? '—' : String(plan.count)]);
  }
  if (plan.method === 'file') rows.push(['File', plan.fileName ?? '—']);
  if (plan.method === 'csv') {
    rows.push(['File', plan.fileName ?? '—']);
    rows.push(['Questions', String(plan.csvQuestions?.length ?? 0)]);
  }
  if (plan.method !== 'csv' && plan.instructions.trim()) rows.push(['Instructions', plan.instructions.trim()]);

  return (
    <>
      <Prompt
        sub={
          plan.method === 'ai'
            ? 'The questions and the answer key are written by AI — check them in the editor before anyone relies on them.'
            : 'You review every question before the game is created.'
        }
      >
        {'Ready to build'}
      </Prompt>
      <div style={{ display: 'grid', gap: 1, background: BORDER, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 12, padding: '11px 13px', background: PAGE }}>
            <span style={{ flex: 'none', width: 96, fontSize: 12, color: FAINT }}>{label}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: TEXT, wordBreak: 'break-word' }}>{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function QuestionReview({
  theme,
  plan,
  questions,
  onName,
}: {
  theme: Theme;
  plan: GamePlan;
  questions: DeckQuestion[];
  onName: (v: string) => void;
}) {
  return (
    <>
      <Prompt
        sub={`${questions.length} question${questions.length === 1 ? '' : 's'} ready. The correct answer is highlighted.`}
      >
        {'Check the questions'}
      </Prompt>
      {plan.csvSkipped.length > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#e0a23a', lineHeight: 1.5 }}>
          {`Skipped ${plan.csvSkipped.length} row${plan.csvSkipped.length === 1 ? '' : 's'}: `}
          {plan.csvSkipped.slice(0, 3).join(' ')}
          {plan.csvSkipped.length > 3 ? ' …' : ''}
        </p>
      )}
      <div style={{ marginBottom: 12 }}>
        <TextField value={plan.name} onChange={onName} placeholder="Study game name" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {questions.map((q) => (
          <PreviewQuestion key={q.seq} q={q} theme={theme} />
        ))}
      </div>
    </>
  );
}

/** One formatted question, with the correct answer marked so the answer key
 *  can be checked at a glance before the game is created. */
function PreviewQuestion({ q, theme }: { q: DeckQuestion; theme: Theme }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: '11px 13px', background: 'rgba(10,8,26,.4)' }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
          color: theme.accent,
          marginBottom: 4,
        }}
      >
        {q.seq}. {q.topic}
      </div>
      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, lineHeight: 1.4, marginBottom: 7 }}>{q.stem}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {q.options.map((o) => {
          const correct = o.label === q.answer;
          return (
            <div
              key={o.label}
              style={{ fontSize: 12.5, lineHeight: 1.4, color: correct ? '#fff' : '#d7ccff', fontWeight: correct ? 700 : 400 }}
            >
              <span style={{ color: correct ? theme.accent : MUTED }}>{o.label}.</span> {o.text}
              {correct && <span style={{ color: theme.accent }}> ✓</span>}
            </div>
          );
        })}
      </div>
      {q.explanation && (
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 7, lineHeight: 1.45 }}>Why: {q.explanation}</div>
      )}
    </div>
  );
}
