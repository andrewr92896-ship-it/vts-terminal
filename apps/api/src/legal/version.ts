// Single source of truth (server side) for the currently-effective version of
// the terminal's legal documents — the Terms of Service and Privacy Policy.
//
// `toPublicUser` compares each user's stored `termsAcceptedVersion` against this
// value to decide `mustAcceptTerms`; the acceptance route stamps this value onto
// the user when they accept. Bumping this string re-prompts EVERY user to review
// and accept the updated documents before they can operate the terminal again, so
// only change it when the Terms or Privacy Policy substantively change — and keep
// it in step with the web copy in apps/web/src/legal/content.ts (LEGAL_VERSION).
export const LEGAL_VERSION = '2026-08-04.1';
