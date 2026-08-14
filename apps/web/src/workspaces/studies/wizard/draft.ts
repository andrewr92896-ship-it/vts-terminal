import { DRAFT_VERSION, emptyBlueprint, type AiProvider, type StepId, type StudyPackageBlueprint } from './blueprint';

// Keeping an unfinished study package on the device.
//
// The terminal's navigation is state-based, not URL-based, so opening another
// sidebar section unmounts whatever you were doing and a refresh starts from
// nothing. For a creator seven questions into a package that is not a small
// annoyance — it is the whole thing gone, silently, which is what makes it a
// fault rather than a limitation.
//
// Only the answers are stored. Source material a person hands to their own AI
// never comes near VTS, and nothing here writes a file into localStorage.

const KEY_PREFIX = 'vts_study_package_draft_';
const PROVIDER_KEY_PREFIX = 'vts_study_ai_provider_';
const ONBOARDED_KEY_PREFIX = 'vts_study_ai_onboarded_';

export interface StoredDraft {
  v: number;
  /** This draft's own identity, so a later import can be tied back to it. */
  draftId: string;
  stepId: StepId;
  blueprint: StudyPackageBlueprint;
  savedAt: number;
}

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Older Safari has no randomUUID outside a secure context. The id only has
    // to be unique on this device, so a timestamped random suffix is enough.
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function newDraftId(): string {
  return newId();
}

/** A stable id for a category row the user just added. */
export function newCategoryId(): string {
  return newId();
}

/**
 * Read the saved draft, or null.
 *
 * Anything that is not a draft of THIS version is discarded rather than
 * repaired: replaying half-understood answers into a changed set of questions
 * would produce a package the person never described. A future version bump is
 * therefore safe to make without a migration.
 */
export function loadDraft(userId: string): StoredDraft | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (!parsed || parsed.v !== DRAFT_VERSION) return clearDraft(userId), null;
    const bp = parsed.blueprint;
    if (!bp || typeof bp !== 'object' || bp.draftVersion !== DRAFT_VERSION) return clearDraft(userId), null;
    if (typeof parsed.stepId !== 'string') return clearDraft(userId), null;
    return {
      v: DRAFT_VERSION,
      draftId: typeof parsed.draftId === 'string' ? parsed.draftId : newId(),
      stepId: parsed.stepId as StepId,
      // Merged over a fresh blueprint so a field added since the draft was
      // written is present and null rather than undefined.
      blueprint: { ...emptyBlueprint(), ...bp, draftVersion: DRAFT_VERSION },
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    clearDraft(userId);
    return null;
  }
}

export function saveDraft(userId: string, draft: Omit<StoredDraft, 'v' | 'savedAt'>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key(userId), JSON.stringify({ ...draft, v: DRAFT_VERSION, savedAt: Date.now() }));
  } catch {
    // A full or disabled store is not worth interrupting the wizard over — the
    // answers on screen are still there; they just will not survive a refresh.
  }
}

export function clearDraft(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* nothing to do */
  }
}

// ---- Per-user AI workflow preferences ----
//
// Which AI they use and whether they have been walked through it once. Device
// preferences rather than package content, so they live here and never travel
// onto a created package.

export function loadProvider(userId: string): AiProvider | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(`${PROVIDER_KEY_PREFIX}${userId}`);
    return v === 'chatgpt' || v === 'claude' || v === 'other' ? v : null;
  } catch {
    return null;
  }
}

export function saveProvider(userId: string, provider: AiProvider): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${PROVIDER_KEY_PREFIX}${userId}`, provider);
  } catch {
    /* nothing to do */
  }
}

export function loadAiOnboarded(userId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(`${ONBOARDED_KEY_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

export function saveAiOnboarded(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${ONBOARDED_KEY_PREFIX}${userId}`, '1');
  } catch {
    /* nothing to do */
  }
}
