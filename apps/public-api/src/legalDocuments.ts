import { createHash } from 'node:crypto';

// WHAT SOMEBODY HAS TO AGREE TO BEFORE THEY CAN USE THE PUBLIC TERMINAL.
//
// This is the clickwrap's half of the record. The distinction it exists to make
// is between a BROWSEWRAP — a "Terms" link in the footer, and a claim that using
// the site meant agreeing — and a CLICKWRAP, where there was a specific moment,
// a specific act, and a row saying so. Only the second is worth anything, and
// only if what was on the screen at that moment can still be produced later.
//
// SO THE SERVER HOLDS THE VERSION AND A HASH, NOT THE TEXT. The documents
// themselves live in the public terminal's bundle
// (`apps/public-terminal/src/adapters/publicLegal.ts`) and are rendered from
// there; this service is a different deployment and may not import from it.
// What it holds instead is, per document, an identifier, a version, an
// effective date and the SHA-256 of the canonical rendering of that exact text.
// `npm run verify:legal-hashes` recomputes those hashes from the deployed
// documents and fails when they disagree.
//
// THE PROPERTY THAT BUYS IS THE ONE WORTH PROTECTING: the terms cannot be
// quietly changed underneath somebody who already agreed. Editing a word fails
// CI until the version and the hash are updated, and updating the version
// re-prompts every account. There is no path where the stored row says a person
// agreed to text they were never shown.

export type LegalDocumentId='terms'|'privacy'|'acknowledgement';

export type LegalDocument={
  id:LegalDocumentId;
  title:string;
  version:string;
  effectiveDate:string;
  sha256:string;
};

// ---- the canonical rendering ------------------------------------------------
//
// The hash is of THIS rendering rather than of the source file, so a comment or
// a reformat does not force a version bump and re-prompt everybody for nothing,
// while a changed word does.
//
// It lives HERE, in the service that stores the hashes, rather than in the
// script that checks them: reconstructing what somebody agreed to means taking
// the document at its version and re-deriving the hash, and the definition of
// how that is derived belongs beside the records it explains. Nothing in the
// request path calls it — the verify script and this module's own tests do.
export type LegalBlock={p:string}|{ul:string[]}|{note:string};
export type LegalSection={heading:string;blocks:LegalBlock[]};
export type LegalDocSource={title:string;intro:string;sections:LegalSection[]};

export function canonicalLegalText(doc:LegalDocSource):string{
  const lines:string[]=[doc.title.trim(),'',doc.intro.trim()];
  for(const section of doc.sections){
    lines.push('',`## ${section.heading.trim()}`);
    for(const block of section.blocks){
      if('p' in block)lines.push(block.p.trim());
      else if('note' in block)lines.push(`! ${block.note.trim()}`);
      else for(const item of block.ul)lines.push(`- ${item.trim()}`);
    }
  }
  // Normalized to \n and stripped of trailing blanks, so a checkout with CRLF
  // line endings hashes the same as one without — otherwise the hash would
  // depend on which machine ran the check.
  return `${lines.join('\n').replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'').trim()}\n`;
}

export const sha256Hex=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');

// ---- the acknowledgement ----------------------------------------------------
//
// THE SUBSTANTIVE HALF, and deliberately separate from the two documents.
//
// The public terminal's Terms and Privacy Policy are still PRE-RELEASE
// SUMMARIES — they say so at the top, and they say outright that they create no
// obligations. Presenting those under "I agree to be bound" would be a claim the
// documents themselves contradict, and a clickwrap whose own text is untrue is
// worse than none.
//
// What IS true today, and stands whatever state the documents are in, is these
// three statements. They are the ones that matter for a product that must not
// read as investment advice, so they are what is affirmatively agreed to, and
// the documents are acknowledged as read alongside them.
//
// When the operative documents are published this file changes in one place:
// the statements become an agreement to be bound, ACKNOWLEDGEMENT_VERSION goes
// to '2', and every account is re-prompted because the version they hold is no
// longer the current one. Nothing else in the mechanism moves.
export const ACKNOWLEDGEMENT_VERSION='1';
export const ACKNOWLEDGEMENT_EFFECTIVE_DATE='August 30, 2026';
export const ACKNOWLEDGEMENT_TITLE='Before you start';
export const ACKNOWLEDGEMENT_STATEMENTS=[
  'VTS Public Terminal is informational and educational software. Nothing in it is financial, investment, legal, tax or trading advice, and nothing in it is a recommendation, solicitation or offer to buy or sell anything.',
  'Trading foreign exchange, derivatives, crypto-assets and securities carries a high level of risk and is not suitable for everybody. You can lose more than you deposit, and past performance does not indicate future results.',
  'Vitalis Trading Systems LLC is not a broker, an exchange, an investment adviser or a custodian. The public terminal holds no money, places no orders, and connects to no brokerage account.',
  'Figures shown here are informational. Your broker’s and custodian’s own records are the authority on your account.',
] as const;
export const ACKNOWLEDGEMENT_CONFIRM='I have read the Terms of Service and the Privacy Policy, and I understand the four statements above.';

// Hashed from its own content, by the same function, so the acknowledgement is
// pinned exactly as the documents are — a reworded statement changes the hash
// and cannot be stored under the version people already accepted.
const ACKNOWLEDGEMENT_SOURCE:LegalDocSource={
  title:ACKNOWLEDGEMENT_TITLE,
  intro:ACKNOWLEDGEMENT_CONFIRM,
  sections:[{heading:'Acknowledgement',blocks:[{ul:[...ACKNOWLEDGEMENT_STATEMENTS]}]}],
};

// ---- the registry -----------------------------------------------------------
//
// THE SET A CURRENT ACCOUNT MUST HOLD. An account is gated until it has an
// acceptance row for every id here at exactly the version here — so adding an
// entry, or bumping a version, re-prompts everybody, which is the whole point.
//
// The two document hashes are checked against the deployed text by
// `npm run verify:legal-hashes`. DO NOT edit one by hand to make that check
// pass: the check exists to force the version bump that goes with the edit.
export const REQUIRED_DOCUMENTS:readonly LegalDocument[]=[
  {
    id:'acknowledgement',
    title:ACKNOWLEDGEMENT_TITLE,
    version:ACKNOWLEDGEMENT_VERSION,
    effectiveDate:ACKNOWLEDGEMENT_EFFECTIVE_DATE,
    sha256:sha256Hex(canonicalLegalText(ACKNOWLEDGEMENT_SOURCE)),
  },
  {
    id:'terms',
    title:'Terms of Service',
    version:'2026-08-28.1',
    effectiveDate:'August 28, 2026',
    sha256:'8faedfcca228159c068ec5be095977e3dcaa3860778a937f9b9db1e72720f946',
  },
  {
    id:'privacy',
    title:'Privacy Policy',
    version:'2026-08-28.1',
    effectiveDate:'August 28, 2026',
    sha256:'96cdb63d2238e2f74e6bbaa04ae94667d53be863b775f047ea6e7e9ad5e2905d',
  },
];

// The whole current set as store rows. Used by `acceptLegal` for the
// outstanding subset, and by anything that has to seed an already-accepted
// account — the test fixtures and the live-suite seed.
//
// DELIBERATELY NOT CALLED BY `admitAccount`. An operator letting somebody in
// cannot tick the box on their behalf; if admission wrote these rows the gate
// would exist and nobody would ever see it, which is the one way this feature
// could be worth nothing while appearing to work.
export const acceptanceEntries=(required:readonly LegalDocument[]=REQUIRED_DOCUMENTS)=>required.map((doc)=>({document:doc.id,version:doc.version,sha256:doc.sha256}));

// Which of the required documents this account is missing or holds at an old
// version. Empty means current; anything else means the gate.
//
// THE REQUIRED SET IS A PARAMETER, not read from the module. The one transition
// this whole feature exists to handle — the documents change, everybody is
// re-prompted, and the earlier acceptances are kept — could otherwise not be
// exercised until the day somebody actually bumped a version in production.
export function outstandingDocuments(
  required:readonly LegalDocument[],
  accepted:ReadonlyArray<{document:string;version:string}>,
):LegalDocument[]{
  const held=new Set(accepted.map((row)=>`${row.document}@${row.version}`));
  return required.filter((doc)=>!held.has(`${doc.id}@${doc.version}`));
}
