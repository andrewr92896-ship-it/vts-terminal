// The Study Package transport format — what a creator's own AI produces, and
// what VTS reads back.
//
// JSON rather than CSV because one package carries metadata, categories,
// weights, questions, flashcards, slides, lessons and settings at once, and a
// flat table cannot express that. CSV stays exactly as it is for the existing
// question and flashcard workflows.
//
// The contract is VERSIONED AND EXPLICIT. A file states what it is and which
// schema it was written to, so a package produced against a later format is
// refused with a sentence saying so rather than half-read.

export const PACKAGE_FORMAT = 'vts-study-package';
export const PACKAGE_PART_FORMAT = 'vts-study-package-part';
export const PACKAGE_SCHEMA_VERSION = 1;
export const PACKAGE_FILE_NAME = 'vts-study-package.json';

// Ceilings, matched to what the live model actually stores. A package that
// passes validation must be persistable — a stem the deck cannot hold is a
// failure the creator should meet here, with the question number, rather than
// as a silently truncated question later.
export const LIMITS = {
  packageName: 120,
  subject: 120,
  description: 2000,
  categoryName: 60,
  categories: 60,
  questions: 1000,
  stem: 600,
  option: 400,
  explanation: 400,
  flashcards: 400,
  term: 300,
  definition: 2000,
  slides: 40,
  slideTitle: 200,
  slideBody: 4000,
  lessons: 100,
  lessonTitle: 200,
  lessonObjective: 1000,
  lessonBody: 20_000,
} as const;

export const LETTERS = ['A', 'B', 'C', 'D'] as const;
export type Letter = (typeof LETTERS)[number];

export type PartType = 'manifest' | 'questions' | 'flashcards' | 'presentation' | 'lessons';
export const PART_TYPES: PartType[] = ['manifest', 'questions', 'flashcards', 'presentation', 'lessons'];

// ---- The shapes a package carries ----

export interface ImportedCategory {
  id: string;
  name: string;
  weight: number | null;
  questionTarget: number | null;
}

export interface ImportedQuestion {
  id: string;
  categoryId: string | null;
  stem: string;
  options: { label: Letter; text: string }[];
  answer: Letter;
  explanation: string | null;
}

export interface ImportedFlashcard {
  id: string;
  categoryId: string | null;
  term: string;
  definition: string;
}

export interface ImportedSlide {
  id: string;
  title: string;
  body: string;
}

export interface ImportedPresentation {
  title: string;
  slides: ImportedSlide[];
}

export interface ImportedLesson {
  id: string;
  title: string;
  objective: string | null;
  body: string | null;
  slideIds: string[];
}

export interface ImportedPackage {
  blueprintId: string;
  name: string;
  subject: string;
  description: string | null;
  audience: string | null;
  depth: string | null;
  explanationMode: string | null;
  categoryWeightMode: string | null;
  categories: ImportedCategory[];
  questions: ImportedQuestion[];
  flashcards: ImportedFlashcard[];
  presentation: ImportedPresentation | null;
  lessons: ImportedLesson[];
}

/**
 * What the package is being checked AGAINST — the plan the wizard produced.
 *
 * The targets are computed once, on the client, and used both to write the
 * handoff and to check what came back. One allocation, used twice: a second
 * implementation here is how the prompt and the validator come to disagree
 * about how many questions Economics was supposed to get.
 */
export interface ImportBlueprint {
  blueprintId: string;
  /** The user fixed the categories, so the AI had to use these ids exactly. */
  categoriesLocked: boolean;
  categories: { id: string; name: string; weight: number | null }[];
  /** categoryId → exact question count, when the mix is weighted. */
  questionTargets: Record<string, number> | null;
  /** The exact total asked for, or null when the AI was told to choose. */
  totalQuestions: number | null;
  explanationsRequired: boolean;
  wantQuestions: boolean;
  wantFlashcards: boolean;
  wantPresentation: boolean;
  wantLessons: boolean;
}

export interface ValidationIssue {
  /** Stable machine key — what the repair prompt groups on. */
  code: string;
  /** Plain language, naming where the problem is. */
  message: string;
  /** The import ids involved, for the repair prompt. */
  ids?: string[];
}

export interface PackagePreview {
  name: string;
  subject: string;
  questionCount: number;
  categories: { id: string; name: string; weight: number | null; target: number | null; found: number }[];
  categoryWeightMode: string | null;
  explanationMode: string | null;
  flashcardCount: number;
  slideCount: number;
  lessonCount: number;
}

export interface ValidationResult {
  ok: boolean;
  /** Named checks that came back clean — the "what passed" half of the report. */
  passed: string[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  preview: PackagePreview | null;
  /** The questions, for the reviewer to read before committing. */
  questions: ImportedQuestion[];
}

// ---- Small helpers ----

export function stripFence(raw: string): string {
  let text = raw.trim();
  // A single surrounding markdown code fence, which is how most chat interfaces
  // hand back JSON. Deliberately nothing more: no fuzzy repair, no brace
  // hunting, no quote fixing. A file that is not JSON gets told so.
  const fence = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/;
  const m = text.match(fence);
  if (m) text = m[1].trim();
  return text;
}

export function normalizeStem(stem: string): string {
  return stem.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
}

export function isLetter(v: unknown): v is Letter {
  return typeof v === 'string' && (LETTERS as readonly string[]).includes(v);
}

export function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}
