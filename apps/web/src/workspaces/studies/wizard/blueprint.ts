// The Study Package Blueprint — what the creation wizard is building.
//
// The wizard asks one structural question at a time and produces this object.
// It describes the SHAPE of a study package (how many questions, which
// categories, whether there are flashcards) and never its educational content:
// the questions themselves come from the user's own third-party AI, or are
// typed in by hand. Nothing here calls VTS AI, and nothing here is persisted as
// study content — the blueprint is handed on to the AI handoff or to the manual
// entry path, and only those create anything.

export const DRAFT_VERSION = 1;

// The ceiling matches what the deck editor already accepts, so a package cannot
// be blueprinted at a size that could never be saved. Deliberately NOT the old
// 50-question cap: that bounded one VTS AI generation call, and this workflow
// does not use it.
export const MAX_QUESTIONS = 1000;
export const MAX_CATEGORIES = 60;

export type Audience = 'me' | 'another_learner' | 'students_or_staff' | 'other';
export type Depth = 'quick_review' | 'standard' | 'comprehensive' | 'exam_prep';
export type QuestionMethod = 'ai_create' | 'ai_format_existing' | 'manual';
export type SourceMaterial = 'topic_and_instructions' | 'own_materials' | 'both';
/** Who decides a thing — the person, or the AI they hand the package to. */
export type Author = 'user' | 'ai';
export type CategoryWeightMode = 'tracking_only' | 'draw_only' | 'score_only' | 'draw_and_score';
export type ExplanationMode = 'always' | 'on_incorrect' | 'none';
export type FlashcardFocus = 'key_terms' | 'concepts' | 'formulas' | 'mix' | 'ai_choice';
export type PresentationSource = 'ai_draft' | 'upload' | 'both';
export type AiProvider = 'chatgpt' | 'claude' | 'other';

/**
 * A category while the wizard runs.
 *
 * The `id` is assigned when the row is added and never changes, so renaming a
 * category before import is a rename rather than a delete and an add. That is
 * the same rule the stored package categories follow, and the reason it matters
 * is the same: a name-keyed category loses everything recorded against it the
 * moment somebody edits the name.
 */
export interface DraftCategory {
  id: string;
  name: string;
  /** Its share of the paper, when weighting is on. Null = no weight stated. */
  weight: number | null;
}

export interface StudyPackageBlueprint {
  draftVersion: typeof DRAFT_VERSION;
  subject: string;
  packageName: string;
  audience: Audience | null;
  depth: Depth | null;
  // Two fields rather than one, so "let my AI pick a number" is a stated answer
  // instead of an absent one.
  questionCountMode: 'ai_recommend' | 'fixed' | null;
  questionCount: number | null;
  questionMethod: QuestionMethod | null;
  sourceMaterial: SourceMaterial | null;
  categoriesEnabled: boolean | null;
  categoryAuthor: Author | null;
  categories: DraftCategory[];
  categoryWeightMode: CategoryWeightMode | null;
  weightAuthor: Author | null;
  explanationMode: ExplanationMode | null;
  includeFlashcards: boolean | null;
  flashcardFocus: FlashcardFocus | null;
  includePresentation: boolean | null;
  presentationSource: PresentationSource | null;
  includeLessons: boolean | null;
  // Workflow preference, not package content — which AI the person is going to
  // paste the handoff into. Deliberately not carried onto the created package.
  aiProvider: AiProvider | null;
}

export function emptyBlueprint(): StudyPackageBlueprint {
  return {
    draftVersion: DRAFT_VERSION,
    subject: '',
    packageName: '',
    audience: null,
    depth: null,
    questionCountMode: null,
    questionCount: null,
    questionMethod: null,
    sourceMaterial: null,
    categoriesEnabled: null,
    categoryAuthor: null,
    categories: [],
    categoryWeightMode: null,
    weightAuthor: null,
    explanationMode: null,
    includeFlashcards: null,
    flashcardFocus: null,
    includePresentation: null,
    presentationSource: null,
    includeLessons: null,
    aiProvider: null,
  };
}

// ---- Branching ----

export type StepId =
  | 'subject'
  | 'name'
  | 'audience'
  | 'depth'
  | 'questionCount'
  | 'questionMethod'
  | 'sourceMaterial'
  | 'categoriesEnabled'
  | 'categoryAuthor'
  | 'categoryEditor'
  | 'categoryBehavior'
  | 'weightAuthor'
  | 'weightEditor'
  | 'explanations'
  | 'flashcards'
  | 'flashcardFocus'
  | 'presentation'
  | 'presentationSource'
  | 'lessons'
  | 'aiProvider'
  | 'aiOnboarding'
  | 'review';

/** Whether the question component is being handed to the user's own AI. */
export function questionsUseAi(bp: StudyPackageBlueprint): boolean {
  return bp.questionMethod === 'ai_create' || bp.questionMethod === 'ai_format_existing';
}

/** Whether the weight mode makes weights actually do something. */
export function weightsAreUsed(mode: CategoryWeightMode | null): boolean {
  return mode === 'draw_only' || mode === 'score_only' || mode === 'draw_and_score';
}

/**
 * Whether anything the user has chosen needs their third-party AI.
 *
 * This is what decides whether they are asked to pick a provider at all — a
 * manual-only creator must be able to finish without one.
 */
export function needsExternalAi(bp: StudyPackageBlueprint): boolean {
  if (questionsUseAi(bp)) return true;
  if (bp.categoriesEnabled && bp.categoryAuthor === 'ai') return true;
  if (weightsAreUsed(bp.categoryWeightMode) && bp.weightAuthor === 'ai') return true;
  // Flashcards and lessons are authored by the AI when they are included: the
  // wizard offers no hand-written variant of either (the standalone flashcard
  // maker remains the alternate path for that).
  if (bp.includeFlashcards) return true;
  if (bp.includeLessons) return true;
  if (bp.includePresentation && (bp.presentationSource === 'ai_draft' || bp.presentationSource === 'both')) {
    return true;
  }
  return false;
}

/**
 * The path through the wizard for the answers so far.
 *
 * Recomputed on every change, which is what makes the branching work: a step
 * only exists while its condition holds, so answering "no categories" removes
 * three cards from the path rather than skipping over them.
 *
 * `sourceMaterial` keys off the QUESTION method alone, deliberately. It is asked
 * at position seven, before flashcards or a presentation have been chosen, so
 * the question method is the only AI use that can be known by then; asking
 * again later would be a second card about the same thing.
 */
export function stepsFor(bp: StudyPackageBlueprint, opts: { aiOnboarded: boolean }): StepId[] {
  const steps: StepId[] = ['subject', 'name', 'audience', 'depth', 'questionCount', 'questionMethod'];
  if (questionsUseAi(bp)) steps.push('sourceMaterial');
  steps.push('categoriesEnabled');
  if (bp.categoriesEnabled) {
    steps.push('categoryAuthor');
    if (bp.categoryAuthor === 'user') steps.push('categoryEditor');
    steps.push('categoryBehavior');
    if (weightsAreUsed(bp.categoryWeightMode)) {
      steps.push('weightAuthor');
      if (bp.weightAuthor === 'user') steps.push('weightEditor');
    }
  }
  steps.push('explanations', 'flashcards');
  if (bp.includeFlashcards) steps.push('flashcardFocus');
  steps.push('presentation');
  if (bp.includePresentation) steps.push('presentationSource', 'lessons');
  if (needsExternalAi(bp)) {
    steps.push('aiProvider');
    if (bp.aiProvider && !opts.aiOnboarded) steps.push('aiOnboarding');
  }
  steps.push('review');
  return steps;
}

// ---- Validation ----
//
// Plain language, and local to the card being answered. Nothing here calls the
// server, and nothing calls VTS AI.

export function stepError(bp: StudyPackageBlueprint, step: StepId): string | null {
  switch (step) {
    case 'subject':
      return bp.subject.trim() ? null : 'Type what you are studying.';
    case 'name':
      return bp.packageName.trim() ? null : 'Give this study package a name.';
    case 'audience':
      return bp.audience ? null : 'Pick who it is for.';
    case 'depth':
      return bp.depth ? null : 'Pick how comprehensive it should be.';
    case 'questionCount':
      if (!bp.questionCountMode) return 'Pick how many questions you want.';
      if (bp.questionCountMode === 'ai_recommend') return null;
      if (bp.questionCount == null || !Number.isFinite(bp.questionCount)) return 'Type a number of questions.';
      if (!Number.isInteger(bp.questionCount) || bp.questionCount < 1) return 'Use a whole number, 1 or more.';
      if (bp.questionCount > MAX_QUESTIONS) return `The most a study game can hold is ${MAX_QUESTIONS}.`;
      return null;
    case 'questionMethod':
      return bp.questionMethod ? null : 'Pick how the questions get made.';
    case 'sourceMaterial':
      return bp.sourceMaterial ? null : 'Pick what your AI should work from.';
    case 'categoriesEnabled':
      return bp.categoriesEnabled == null ? 'Pick yes or no.' : null;
    case 'categoryAuthor':
      return bp.categoryAuthor ? null : 'Pick who chooses the categories.';
    case 'categoryEditor': {
      const named = bp.categories.filter((c) => c.name.trim());
      if (named.length < 1) return 'Add at least one category.';
      if (named.length > MAX_CATEGORIES) return `Use up to ${MAX_CATEGORIES} categories.`;
      const seen = new Set<string>();
      for (const c of named) {
        const key = c.name.trim().toLowerCase();
        if (seen.has(key)) return `You have two categories called “${c.name.trim()}”.`;
        seen.add(key);
      }
      return null;
    }
    case 'categoryBehavior':
      return bp.categoryWeightMode ? null : 'Pick how categories should count.';
    case 'weightAuthor':
      return bp.weightAuthor ? null : 'Pick who sets the weights.';
    case 'weightEditor': {
      // Deliberately NOT a "must total 100" rule. A total the author has not
      // finished typing must not block them, and weights are normalized wherever
      // they are read. What is refused is a weight that is not a number.
      for (const c of bp.categories) {
        if (c.weight != null && (!Number.isFinite(c.weight) || c.weight < 0)) {
          return `“${c.name.trim() || 'A category'}” needs a weight of 0 or more.`;
        }
      }
      return bp.categories.some((c) => (c.weight ?? 0) > 0) ? null : 'Give at least one category a weight above zero.';
    }
    case 'explanations':
      return bp.explanationMode ? null : 'Pick how explanations should work.';
    case 'flashcards':
      return bp.includeFlashcards == null ? 'Pick yes or no.' : null;
    case 'flashcardFocus':
      return bp.flashcardFocus ? null : 'Pick what the flashcards should focus on.';
    case 'presentation':
      return bp.includePresentation == null ? 'Pick yes or no.' : null;
    case 'presentationSource':
      return bp.presentationSource ? null : 'Pick how the presentation gets made.';
    case 'lessons':
      return bp.includeLessons == null ? 'Pick yes or no.' : null;
    case 'aiProvider':
      return bp.aiProvider ? null : 'Pick which AI you will use.';
    case 'aiOnboarding':
    case 'review':
      return null;
  }
}

/** Where Continue goes from here — and it can never land on Review early. */
export function nextStep(steps: StepId[], current: StepId, bp: StudyPackageBlueprint): StepId {
  const i = steps.indexOf(current);
  const candidate = steps[Math.min(i + 1, steps.length - 1)];
  if (candidate !== 'review') return candidate;
  // A step can become relevant after the user has already walked past its place
  // in the path — choosing flashcards can bring back a question asked earlier in
  // the order. Sweep for anything still unanswered before opening Review, so the
  // review screen is never the thing that discovers a hole.
  const unanswered = steps.find((s) => s !== 'review' && stepError(bp, s) !== null);
  return unanswered ?? 'review';
}

// ---- Labels, for the review screen ----

export const AUDIENCE_LABELS: Record<Audience, string> = {
  me: 'Me',
  another_learner: 'Another learner',
  students_or_staff: 'Students or staff',
  other: 'Other',
};
export const DEPTH_LABELS: Record<Depth, string> = {
  quick_review: 'Quick review',
  standard: 'Standard',
  comprehensive: 'Comprehensive',
  exam_prep: 'Exam prep',
};
// One string per value, used by the question card AND the review row. Two
// wordings for one answer is how a summary comes to describe something other
// than what was picked.
export const METHOD_LABELS: Record<QuestionMethod, string> = {
  ai_create: 'Have my AI create them',
  ai_format_existing: 'I already have questions for my AI to format',
  manual: "I'll enter the questions myself",
};
export const SOURCE_LABELS: Record<SourceMaterial, string> = {
  topic_and_instructions: 'The topic and my instructions',
  own_materials: 'My own study materials',
  both: 'Both',
};
export const WEIGHT_MODE_LABELS: Record<CategoryWeightMode, string> = {
  tracking_only: 'Track my scores by category',
  draw_only: 'Use category weights for the question mix',
  score_only: 'Use category weights for scoring',
  draw_and_score: 'Use weights for both question mix and scoring',
};
export const EXPLANATION_LABELS: Record<ExplanationMode, string> = {
  always: 'Show an explanation after every question',
  on_incorrect: 'Show explanations only after an incorrect answer',
  none: "Don't include explanations",
};
export const FOCUS_LABELS: Record<FlashcardFocus, string> = {
  key_terms: 'Key terms',
  concepts: 'Concepts',
  formulas: 'Formulas or procedures',
  mix: 'A mix',
  ai_choice: 'Let my AI decide',
};
export const PRESENTATION_LABELS: Record<PresentationSource, string> = {
  ai_draft: 'Have my AI draft it',
  upload: "I'll upload a presentation",
  both: 'Use both',
};
export const PROVIDER_LABELS: Record<AiProvider, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  other: 'Other',
};

/** How many questions the blueprint asks for, in words. */
export function questionCountLabel(bp: StudyPackageBlueprint): string {
  if (bp.questionCountMode === 'ai_recommend') return 'However many my AI recommends';
  return bp.questionCount != null ? `${bp.questionCount}` : '—';
}
