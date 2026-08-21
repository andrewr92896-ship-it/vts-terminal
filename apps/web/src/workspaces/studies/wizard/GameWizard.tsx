import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '../../../components/Icon';
import { useResponsive } from '../../../hooks/useMediaQuery';
import type { Theme } from '../../../theme/themes';
import { api } from '../../../api/client';
import type { DeckQuestion, TeamDeck } from '../../../api/types';
import { downloadCsv, parseQuestionsCsv, questionTemplateCsv } from '../studyCsv';
import { errorText } from '../studyErrors';
import { RightsNote } from '../StudyDisclaimer';
import { AiOnboarding } from './steps';
import { PROVIDER_LABELS, type AiProvider } from './blueprint';
import { loadProvider, saveProvider } from './draft';
import { clearGameDraft, loadGameDraft, newGameId, saveGameDraft, type GameStage } from './gameDraft';
import {
  GAME_FILE_NAME,
  MAX_GAME_QUESTIONS,
  buildGameHandoff,
  buildGameRepairPrompt,
  readGameDocs,
} from './gameHandoff';
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
// whole package — categories, flashcards, slides, lessons — and commits through
// the package importer. This one produces one standalone study game. Same
// format, different job, which is why the plan below is its own small type
// rather than a `StudyPackageBlueprint`.
//
// It has FOUR routes, and one of them writes nothing and calls no VTS AI: the
// `handoff` route composes a prompt for the creator's OWN AI (`gameHandoff.ts`)
// and reads the file it produces. That is the route somebody with a question
// bank of their own wants — they had to go to the package wizard for it, and
// came here instead, which is where they were looking for it (owner report,
// 2026-08). All four routes land on the same "Check the questions" screen and
// create an ordinary study game.

const MAX_FILE_CHARS = 100_000;

// A question bank formatted by an outside AI is much bigger than a page of
// notes — a thousand questions with explanations runs to a few hundred KB — so
// this is its own, larger bound. Nothing is sent to VTS until the questions have
// been read out of it, so the cost of a generous limit is local memory only.
const MAX_HANDOFF_CHARS = 2_000_000;

// The ceiling the server accepts for one game lives in `gameHandoff.ts`, which
// is where a file coming back is checked against it. There is deliberately no
// cap below it on the AI generation: a game is as long as the exam behind it,
// and a number the terminal made up is not a reason to refuse one (owner
// instruction, 2026-08).

// Past roughly this many, one generation is long enough to be worth warning
// about — see the note on the count card. Not a limit, and nothing enforces it.
const LONG_GENERATION = 150;

type Method = 'ai' | 'handoff' | 'file' | 'csv';

type StepId =
  | 'method'
  | 'provider'
  | 'source'
  | 'name'
  | 'topic'
  | 'count'
  | 'explanations'
  | 'instructions'
  | 'file'
  | 'csv'
  | 'review';

interface GamePlan {
  method: Method | null;
  name: string;
  topic: string;
  instructions: string;
  /**
   * Null until a number is chosen. Never defaulted — an unset count is unset,
   * and on the handoff route it is a real answer meaning "however many my own
   * material has", which is the ordinary case for somebody formatting a bank
   * they already hold.
   */
  count: number | null;
  /** Which AI the handoff is addressed to. Display only — the rules are identical. */
  provider: AiProvider | null;
  /** Handoff route: they already hold the questions and want them formatted. */
  formatExisting: boolean | null;
  /** Handoff route: ask for an explanation on every question. */
  explanations: boolean;
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
  provider: null,
  formatExisting: null,
  explanations: true,
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
  if (plan.method === 'handoff') {
    return ['method', 'provider', 'source', 'name', 'topic', 'count', 'explanations', 'instructions', 'review'];
  }
  if (plan.method === 'file') return ['method', 'name', 'file', 'instructions', 'review'];
  return ['method', 'name', 'csv', 'review'];
}

/** A plain-language problem with the answer on this card, or null. */
function stepError(plan: GamePlan, step: StepId): string | null {
  switch (step) {
    case 'method':
      return plan.method ? null : 'Pick how you want to build the questions.';
    case 'provider':
      return plan.provider ? null : 'Pick which AI you are taking this to.';
    case 'source':
      return plan.formatExisting == null ? 'Say whether you already have the questions.' : null;
    case 'explanations':
      return null;
    case 'name':
      return plan.name.trim() ? null : 'Give the study game a name.';
    case 'topic':
      return plan.topic.trim() ? null : 'Say what the questions should be about.';
    case 'count':
      // On the handoff route "however many my material has" is a stated answer
      // rather than a missing one, and it is the ordinary case for a bank
      // somebody already holds — so null is only a problem where a number has
      // to reach VTS AI.
      if (plan.count == null) return plan.method === 'handoff' ? null : 'Say how many questions you want.';
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
  handoff: 'Use my own AI (ChatGPT, Claude, …)',
  file: 'Have VTS AI format a file of mine',
  csv: 'Import a CSV I already have',
};

export function GameWizard({
  theme,
  userId,
  onClose,
  onCreated,
}: {
  theme: Theme;
  /** Whose draft this is. The wizard is per person, on this device. */
  userId: string;
  onClose: () => void;
  onCreated: (decks: TeamDeck[], newId: string) => void;
}) {
  const { isPhone } = useResponsive();
  // Restored once, in a lazy initializer — a starting point, not something that
  // yanks the wizard back on every re-render.
  const [restored] = useState(() => loadGameDraft(userId, emptyPlan()));
  const [gameId, setGameId] = useState(() => restored?.gameId ?? newGameId());
  const [plan, setPlan] = useState<GamePlan>(
    // No draft: open the provider card on the AI they chose last time, which the
    // package wizard already remembers. One preference, one store.
    () => restored?.plan ?? { ...emptyPlan(), provider: loadProvider(userId) },
  );
  const [stepId, setStepId] = useState<StepId>(() => (restored?.stepId as StepId) ?? 'method');
  const [stage, setStage] = useState<GameStage>(() => restored?.stage ?? 'wizard');
  const [showError, setShowError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The questions waiting on the author's eye — AI-formatted from their file,
  // parsed from their CSV, or read out of what their own AI produced. Null
  // while the plan is still being answered.
  const [preview, setPreview] = useState<DeckQuestion[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  // What came back from the creator's own AI. Lifted out of the handoff card so
  // that "Check the questions" can sit in the footer with every other primary
  // action — under a full-height paste box it scrolled out of sight, leaving a
  // footer that read as a dead end.
  const [docs, setDocs] = useState<HandoffDoc[]>([]);
  const [paste, setPaste] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

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
    // Backing out of the handoff returns to the questions and touches nothing
    // else: the answers stay, and so does the Game ID the creator's file is
    // stamped with, so they are not trapped on a handoff they have finished
    // with and have not lost what the file is checked against.
    if (stage === 'handoff') {
      setStage('wizard');
      setStepId('review');
      return;
    }
    if (safeIndex <= 0) {
      onClose();
      return;
    }
    setStepId(steps[safeIndex - 1]);
  }, [safeIndex, steps, onClose, preview, stage]);

  const handoffTexts = useMemo(
    () => [...docs.map((d) => d.text), ...(paste.trim() ? [paste] : [])],
    [docs, paste],
  );

  const checkHandoff = useCallback(() => {
    const r = readGameDocs(handoffTexts, gameId);
    if (r.errors.length > 0) {
      setProblems(r.errors);
      return;
    }
    setProblems([]);
    setWarnings(r.warnings);
    if (r.name) setPlan((b) => (b.name.trim() ? b : { ...b, name: r.name! }));
    setPreview(r.questions);
  }, [handoffTexts, gameId]);

  const startOver = useCallback(() => {
    clearGameDraft(userId);
    setDocs([]);
    setPaste('');
    setProblems([]);
    setPlan(emptyPlan());
    setGameId(newGameId());
    setStepId('method');
    setStage('wizard');
    setPreview(null);
    setWarnings([]);
    setShowError(false);
    setFailure(null);
  }, [userId]);

  // ---- Draft persistence ----
  //
  // Debounced, because typing a name fires this per keystroke, and written on
  // every change of stage because the handoff is the screen a creator LEAVES:
  // they take the prompt to their own AI and come back, and re-answering the
  // questions would mint a new Game ID for a file built against the old one.
  useEffect(() => {
    const t = window.setTimeout(() => saveGameDraft(userId, { gameId, stepId: safeStep, plan, stage }), 400);
    return () => window.clearTimeout(t);
  }, [userId, gameId, safeStep, plan, stage]);

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
      clearGameDraft(userId);
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
      clearGameDraft(userId);
      onCreated(res.decks, res.deck.id);
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const finishLabel =
    plan.method === 'ai'
      ? '✦ Build with AI'
      : plan.method === 'handoff'
        ? 'Create the handoff'
        : plan.method === 'file'
          ? '✦ Read my file'
          : 'Review the questions';

  const finish = () => {
    if (plan.method === 'ai') return void buildWithAi();
    if (plan.method === 'handoff') {
      if (plan.provider) saveProvider(userId, plan.provider);
      setStage('handoff');
      return;
    }
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
          width: isPhone ? '100%' : `min(${stage === 'handoff' || preview ? 760 : 560}px, calc(94 * var(--vw)))`,
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
            fraction={preview || stage === 'handoff' ? 1 : steps.length > 1 ? safeIndex / (steps.length - 1) : 0}
          />
        </div>

        {restored && (stage === 'handoff' || safeIndex > 0) && (
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 12.5,
              color: MUTED,
            }}
          >
            <Icon name="file-clock" size={13} color={MUTED} />
            <span style={{ flex: 1 }}>{'Picked up where you left off.'}</span>
            <button
              type="button"
              onClick={startOver}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.accent,
                fontWeight: 600,
                fontSize: 12.5,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
              }}
            >
              {'Start over'}
            </button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 20px' }}>
          {preview ? (
            <QuestionReview theme={theme} plan={plan} questions={preview} warnings={warnings} onName={(v) => patch({ name: v })} />
          ) : stage === 'handoff' ? (
            <HandoffCard
              theme={theme}
              plan={plan}
              gameId={gameId}
              docs={docs}
              setDocs={setDocs}
              paste={paste}
              setPaste={setPaste}
              problems={problems}
              clearProblems={() => setProblems([])}
            />
          ) : (
            <StepCard step={safeStep} plan={plan} patch={patch} theme={theme} onAdvance={goNext} />
          )}
          {showError && error && !preview && stage !== 'handoff' && <ErrorLine>{error}</ErrorLine>}
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
            {preview || stage === 'handoff' ? 'Back' : safeIndex <= 0 ? 'Cancel' : 'Back'}
          </button>
          <div style={{ flex: 1 }} />
          {busy && <span style={{ fontSize: 12.5, color: MUTED }}>{busy}</span>}
          {stage === 'handoff' ? (
            <button
              type="button"
              onClick={checkHandoff}
              disabled={handoffTexts.length === 0}
              style={primaryBtn(theme, handoffTexts.length === 0)}
            >
              {'Check the questions'}
            </button>
          ) : preview ? (
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

interface HandoffDoc {
  key: string;
  label: string;
  text: string;
}

const monoBox: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 12,
  borderRadius: 9,
  border: `1px solid ${BORDER}`,
  background: '#0d1630',
  color: TEXT,
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11.5,
  lineHeight: 1.5,
  resize: 'vertical',
};

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
              {
                value: 'handoff' as const,
                label: METHOD_LABELS.handoff,
                note: 'You get a prompt to paste into your own AI. It asks you what it needs, produces a file, and you bring that back here.',
              },
              { value: 'file' as const, label: METHOD_LABELS.file, note: 'Upload notes or a question list and VTS AI formats it into a game.' },
              { value: 'csv' as const, label: METHOD_LABELS.csv, note: 'No AI involved — your rows become the questions.' },
            ]}
          />
        </>
      );

    case 'provider':
      return (
        <>
          <Prompt sub="Only the wording changes — the rules in the handoff are identical whichever you use.">
            {'Which AI are you taking this to?'}
          </Prompt>
          <ChoiceGroup
            theme={theme}
            value={plan.provider}
            onChange={(v) => patch({ provider: v })}
            options={[
              { value: 'chatgpt' as const, label: PROVIDER_LABELS.chatgpt },
              { value: 'claude' as const, label: PROVIDER_LABELS.claude },
              { value: 'other' as const, label: PROVIDER_LABELS.other },
            ]}
          />
        </>
      );

    case 'source':
      return (
        <>
          <Prompt>{'Do you already have the questions?'}</Prompt>
          <ChoiceGroup
            theme={theme}
            value={plan.formatExisting}
            onChange={(v) => patch({ formatExisting: v })}
            options={[
              {
                value: true,
                label: 'Yes — I have them, format them for me',
                note: 'Your AI keeps what each question is testing and puts it into the shape this terminal reads.',
              },
              { value: false, label: 'No — write them from the subject' },
            ]}
          />
        </>
      );

    case 'explanations':
      return (
        <>
          <Prompt sub="Shown after an answer, so the learner finds out why.">
            {'Should every question come with an explanation?'}
          </Prompt>
          <ChoiceGroup
            theme={theme}
            value={plan.explanations}
            onChange={(v) => patch({ explanations: v })}
            options={[
              { value: true, label: 'Yes, on every question' },
              { value: false, label: 'No, leave them out' },
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
          <Prompt
            sub={plan.formatExisting ? 'It goes in the handoff so your AI knows what it is looking at.' : undefined}
          >
            {plan.formatExisting ? 'What is the subject?' : 'What should the questions be about?'}
          </Prompt>
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
            {plan.method === 'handoff' ? 'Anything else your AI should know?' : 'Anything else VTS AI should know?'}
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
  // On the handoff route, "however many my material has" is the ordinary answer
  // for somebody formatting a bank they already hold — and it is a stated
  // answer, not a missing one, which is why null is valid there.
  const theirs = plan.method === 'handoff';
  const [custom, setCustom] = useState(() => plan.count != null && !presets.includes(plan.count));
  const [asMany, setAsMany] = useState(() => theirs && plan.count == null);
  return (
    <>
      <Prompt>{'How many questions do you want?'}</Prompt>
      <ChoiceGroup
        theme={theme}
        value={
          asMany ? 'theirs' : custom ? 'custom' : plan.count != null && presets.includes(plan.count) ? String(plan.count) : null
        }
        onChange={(v) => {
          setAsMany(v === 'theirs');
          setCustom(v === 'custom');
          patch({ count: v === 'theirs' || v === 'custom' ? null : Number(v) });
        }}
        options={[
          ...(theirs
            ? [
                {
                  value: 'theirs',
                  label: plan.formatExisting ? 'However many my material has' : 'Let my AI decide',
                  note: plan.formatExisting ? 'Every question you give it, none dropped and none padded out.' : undefined,
                },
              ]
            : []),
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
      {plan.method === 'ai' && plan.count != null && plan.count > LONG_GENERATION && (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: '#e0a23a', lineHeight: 1.55 }}>
          {'A game this long takes a few minutes to write, and the request can time out before it finishes. If it does, build it in a couple of shorter goes — or have your own AI write it, which has no such limit.'}
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
  if (plan.method === 'handoff') {
    rows.push(['Your AI', plan.provider ? PROVIDER_LABELS[plan.provider] : '—']);
    rows.push(['Subject', plan.topic.trim() || '—']);
    rows.push(['Mode', plan.formatExisting ? 'Format questions I already have' : 'Write new questions']);
    rows.push([
      'Questions',
      plan.count != null
        ? String(plan.count)
        : plan.formatExisting
          ? 'However many my material has'
          : 'My AI decides',
    ]);
    rows.push(['Explanations', plan.explanations ? 'On every question' : 'Not required']);
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
          plan.method === 'handoff'
            ? 'Next you get a prompt to take to your AI. Nothing is created until you bring its file back and check the questions.'
            : plan.method === 'ai'
              ? 'The questions and the answer key are written by AI — check them in the editor before anyone relies on them.'
              : 'You review every question before the game is created.'
        }
      >
        {plan.method === 'handoff' ? 'Ready for your AI' : 'Ready to build'}
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

/**
 * The screen a creator is MEANT to walk away from.
 *
 * Copy the prompt, take it to their own AI, come back with the file. Both
 * halves are on one card deliberately: somebody returning the next day opens
 * the wizard, is put straight back here by the draft, and the box they need is
 * the one already in front of them.
 *
 * No VTS AI call is made to write the prompt and none to read the answer — the
 * terminal's part is the structure and the checking.
 */
function HandoffCard({
  theme,
  plan,
  gameId,
  docs,
  setDocs,
  paste,
  setPaste,
  problems,
  clearProblems,
}: {
  theme: Theme;
  plan: GamePlan;
  gameId: string;
  docs: HandoffDoc[];
  setDocs: (fn: (d: HandoffDoc[]) => HandoffDoc[]) => void;
  paste: string;
  setPaste: (v: string) => void;
  problems: string[];
  clearProblems: () => void;
}) {
  const provider = plan.provider ? PROVIDER_LABELS[plan.provider] : 'your AI';
  const handoff = useMemo(
    () =>
      buildGameHandoff(
        {
          name: plan.name.trim(),
          subject: plan.topic.trim(),
          count: plan.count,
          instructions: plan.instructions,
          formatExisting: plan.formatExisting === true,
          explanations: plan.explanations,
          topics: true,
        },
        gameId,
      ),
    [plan, gameId],
  );

  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [repairCopied, setRepairCopied] = useState(false);

  const copy = async (text: string, mark: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      mark(true);
      window.setTimeout(() => mark(false), 2200);
    } catch {
      // A denied clipboard is not a dead end — the text is on the page.
      setShowText(true);
    }
  };

  const download = () => {
    const blob = new Blob([handoff], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vts-study-game-handoff.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Prompt
        sub={`Paste this into ${provider}. It will ask you what it needs, then produce a file called ${GAME_FILE_NAME} — bring that back below.`}
      >
        {plan.name.trim() || 'Your study game'}
      </Prompt>

      {/* Rights, at the one point in this route where it arises: the creator is
          about to put a brief — and possibly their own material — into somebody
          else's model. The handoff itself carries the full rules for the AI;
          this is the line for the person. */}
      <RightsNote theme={theme} style={{ marginTop: 0, marginBottom: 14 }} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void copy(handoff, setCopied)} style={primaryBtn(theme)}>
          {copied ? 'Copied' : 'Copy the handoff'}
        </button>
        <button type="button" onClick={download} style={secondaryBtn(theme)}>
          {'Download it'}
        </button>
        <button type="button" onClick={() => setShowText((v) => !v)} style={secondaryBtn(theme)}>
          {showText ? 'Hide it' : 'Show it'}
        </button>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <Icon name="life-buoy" size={14} color="#dfe7fa" />
          {'How do I use this?'}
        </button>
      </div>

      {showText && (
        <textarea
          readOnly
          value={handoff}
          rows={12}
          onFocus={(e) => e.currentTarget.select()}
          style={{ ...monoBox, marginTop: 12 }}
        />
      )}

      {showHelp && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
          <AiOnboarding theme={theme} provider={provider} />
          <p style={{ margin: '12px 0 0', fontSize: 12, color: FAINT, lineHeight: 1.55 }}>
            {`If ${provider} says the game is too long for one reply, ask it for one numbered part at a time and add each part here.`}
          </p>
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
        <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#fff' }}>
          {'Bring back what it made'}
        </h4>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
          {'Add the file, or paste the JSON. A game that came in several parts is added one part at a time.'}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...secondaryBtn(theme), display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            {'Add a file'}
            <input
              type="file"
              accept=".json,.txt,application/json,text/plain"
              multiple
              style={{ display: 'none' }}
              onChange={async (e) => {
                const files = e.target.files;
                if (files) {
                  for (const f of Array.from(files)) {
                    const text = (await f.text()).slice(0, MAX_HANDOFF_CHARS);
                    clearProblems();
                    setDocs((d) => [...d, { key: `${f.name}_${Date.now()}_${d.length}`, label: f.name, text }]);
                  }
                }
                e.target.value = '';
              }}
            />
          </label>
          {docs.map((d) => (
            <span
              key={d.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: MUTED,
                border: `1px solid ${BORDER}`,
                borderRadius: 999,
                padding: '5px 10px',
              }}
            >
              {d.label}
              <button
                type="button"
                aria-label={`Remove ${d.label}`}
                onClick={() => {
                  clearProblems();
                  setDocs((list) => list.filter((x) => x.key !== d.key));
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}
              >
                <Icon name="x-circle" size={13} color={MUTED} />
              </button>
            </span>
          ))}
        </div>

        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            clearProblems();
          }}
          rows={5}
          placeholder="…or paste the JSON here"
          style={{ ...monoBox, marginTop: 10 }}
        />

        {problems.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {problems.map((p) => (
              <ErrorLine key={p}>{p}</ErrorLine>
            ))}
            {/* The fix goes back to the AI that made it, so what it needs is the
                problems and the schema — deliberately not the whole game, which
                is enormous and is already in its own conversation. */}
            <button
              type="button"
              onClick={() => void copy(buildGameRepairPrompt(gameId, problems), setRepairCopied)}
              style={{ ...secondaryBtn(theme), marginTop: 12 }}
            >
              {repairCopied ? 'Copied' : `Copy the fix for ${provider}`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function QuestionReview({
  theme,
  plan,
  questions,
  warnings,
  onName,
}: {
  theme: Theme;
  plan: GamePlan;
  questions: DeckQuestion[];
  /** Things worth saying about what was read, which are not refusals. */
  warnings: string[];
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
      {warnings.length > 0 && (
        <div style={{ margin: '0 0 12px' }}>
          {warnings.slice(0, 6).map((w) => (
            <p key={w} style={{ margin: '0 0 5px', fontSize: 12, color: '#e0a23a', lineHeight: 1.5 }}>
              {w}
            </p>
          ))}
          {warnings.length > 6 && (
            <p style={{ margin: 0, fontSize: 12, color: '#e0a23a' }}>{`…and ${warnings.length - 6} more.`}</p>
          )}
        </div>
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
