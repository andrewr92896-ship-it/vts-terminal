// Every client-facing compliance sentence in Studies, in one place.
//
// The rule this module exists to enforce is not "say more", it is "say it once,
// where it matters". A wall of disclaimers is worse than a short notice at the
// point of risk: people stop reading it, and it makes an educational product
// look like a legal one. So there are four strings here and four places they
// appear, and nothing repeats a paragraph the reader has already met.
//
// Centralized so a compliance review can read the terminal's whole position in
// one screen, and so changing it is one edit rather than a search. The other
// half — the ATTESTATION a creator agrees to before asking VTS to publish — is
// deliberately NOT here: it lives server-side in studies/packageLibrary.ts,
// versioned, because it is recorded against a submission rather than merely
// displayed, and what was agreed to has to survive the wording changing.
//
// None of this is legal advice, and none of it is a claim that the product has
// been reviewed. Keeping the copy in one file is what makes that review easy
// when it happens.

/**
 * The educational boundary. The terminal's standing position on what Study
 * content is, drawn at the foot of the study surfaces by `StudyDisclaimer`.
 */
export const EDUCATIONAL_NOTICE =
  'Educational content only — informational, not financial, investment, legal, or tax advice.';

/**
 * The second half of the same strip: study content may teach *about* a third
 * party without being connected to them.
 */
export const AFFILIATION_NOTICE =
  'Study games may name third-party methods, brands, or people to teach about them, and are not affiliated with or endorsed by anyone they reference.';

/**
 * Rights. Shown where a creator is about to put material into somebody else's
 * AI, or bring material of their own in — the two points where the question
 * "am I allowed to use this?" actually arises.
 *
 * Deliberately one sentence. The full set of rules is in the handoff the
 * creator's AI receives (`RIGHTS_BLOCK` in wizard/handoffPrompt.ts), which is
 * where it does the work; this is the human-facing reminder.
 */
export const RIGHTS_NOTICE =
  'Use material you have the right to use. The handoff asks your AI for original questions rather than copies of a question bank, book or course.';

/**
 * What a score is not.
 *
 * Drawn on the leaderboard, and only there. A ranked list of people is the one
 * place in Studies where somebody could read a number as a statement about
 * investment ability, so the correction belongs there and nowhere else —
 * putting it on every screen would be the wall this module exists to avoid.
 */
export const SCORE_NOTICE =
  'A study score measures practice on this material. It is not a measure of investment skill or professional competence.';
