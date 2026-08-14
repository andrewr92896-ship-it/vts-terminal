import type { ImportBlueprintPayload } from '../../../api/types';
import { needsExternalAi, questionsUseAi, type StudyPackageBlueprint } from './blueprint';
import { questionTargets } from './handoffPrompt';

// Flattening the wizard's blueprint into what the server checks a package
// against.
//
// One converter, used by the handoff generator and by the importer, so the
// targets written into the prompt and the targets the package is measured
// against are the same numbers by construction rather than by coincidence.

/** Whether the imported file itself should contain questions. */
export function importWantsQuestions(bp: StudyPackageBlueprint): boolean {
  return questionsUseAi(bp);
}

/**
 * Whether the creator still owes hand-typed questions after the import.
 *
 * True for the one hybrid the wizard allows: questions typed in by hand while
 * the AI writes the flashcards or the slides. Those questions are collected in
 * the import screen and committed in the SAME transaction as the imported
 * content, so the package is never created with half of itself.
 */
export function needsManualQuestions(bp: StudyPackageBlueprint): boolean {
  return needsExternalAi(bp) && bp.questionMethod === 'manual';
}

export function toImportBlueprint(bp: StudyPackageBlueprint, blueprintId: string): ImportBlueprintPayload {
  const named = bp.categories.filter((c) => c.name.trim());
  return {
    blueprintId,
    categoriesLocked: !!bp.categoriesEnabled && bp.categoryAuthor === 'user',
    categories: named.map((c) => ({ id: c.id, name: c.name.trim(), weight: c.weight })),
    questionTargets: questionTargets(bp),
    totalQuestions: bp.questionCountMode === 'fixed' ? bp.questionCount : null,
    explanationsRequired: bp.explanationMode === 'always' || bp.explanationMode === 'on_incorrect',
    wantQuestions: importWantsQuestions(bp),
    wantFlashcards: !!bp.includeFlashcards,
    // An uploaded presentation is not something the AI produces, so the imported
    // file is not expected to carry slides for it.
    wantPresentation: !!bp.includePresentation && bp.presentationSource !== 'upload',
    wantLessons: !!bp.includeLessons,
    name: bp.packageName.trim() || bp.subject.trim(),
    subject: bp.subject.trim(),
    audience: bp.audience,
    depth: bp.depth,
    categoryWeightMode: bp.categoryWeightMode,
    explanationMode: bp.explanationMode,
  };
}
