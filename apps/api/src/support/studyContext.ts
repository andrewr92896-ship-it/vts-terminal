import { z } from 'zod';

// Technical context attached to a bug report from Studies.
//
// THE POINT IS THAT THE USER DOES NOT HAVE TO EXPLAIN ANY OF THIS. Somebody
// whose package import failed knows the screen said no; they do not know the
// wizard step id, the schema version, which validation codes fired, or whether
// they pasted or uploaded. Those are the facts that make a report actionable, so
// the client collects them and the report carries them.
//
// THE RULE THAT SHAPES THE WHOLE FILE: none of this is study CONTENT. A bug in
// the importer must not become a reason to ship somebody's question bank, their
// uploaded source material, their presentation or their lesson text to an
// administrator. So the schema below is a closed list of short scalars — ids,
// versions, counts, codes — and there is no field a package could arrive in.
//
// The ONE exception is `sample`, which exists because some faults genuinely
// cannot be diagnosed without seeing the shape of what broke. It is only ever
// filled by an explicit press of "include a small sample", and the server clamps
// it hard: the client's gesture is the consent, and this cap is what bounds the
// damage if that gesture is ever wired up carelessly. Widening either is a
// privacy decision, not a convenience.

/** The most sample text that can ever ride on a report, however it was asked for. */
export const MAX_SAMPLE = 2000;

// `.catch()` on the scalars deliberately: a bug report must never be REFUSED
// because its diagnostic context was malformed. The report is the thing that
// matters; a field the client got wrong is dropped, not fatal.
const short = (max: number) => z.string().trim().max(max).optional().catch(undefined);

export const studyContextSchema = z
  .object({
    /** Where in Studies this happened — the section key, e.g. `st_decks`. */
    screen: short(60),
    /** The wizard step the creator was on, e.g. `categories`. */
    step: short(60),
    /** Which part of the package was being processed when it failed. */
    component: short(40),
    /** The wizard blueprint's own schema version. */
    blueprintVersion: z.number().int().min(0).max(9999).optional().catch(undefined),
    /** The import format version this build reads. */
    formatVersion: z.number().int().min(0).max(9999).optional().catch(undefined),
    /** The draft or package id — an opaque identifier, never content. */
    draftId: short(80),
    packageId: short(80),
    /** How the package arrived. */
    source: z.enum(['upload', 'paste', 'fixture']).optional().catch(undefined),
    /** Multipart assembly, as the validator saw it. */
    parts: z.number().int().min(0).max(64).optional().catch(undefined),
    expectedParts: z.number().int().min(0).max(64).optional().catch(undefined),
    missingParts: z.array(z.number().int().min(0).max(64)).max(64).optional().catch(undefined),
    /** The deterministic validation codes that fired, e.g. `wrong_version`. */
    errorCodes: z.array(z.string().trim().max(60)).max(40).optional().catch(undefined),
    /** The first few plain-language messages, which name the thing that is wrong. */
    errorMessages: z.array(z.string().trim().max(300)).max(10).optional().catch(undefined),
    /** Whatever error identifier the surface already had. */
    errorId: short(120),
    /** The HTTP status the browser saw, when a request was involved. */
    apiStatus: z.number().int().min(0).max(999).optional().catch(undefined),
    /** Build identifier, so a report can be tied to what was deployed. */
    appVersion: short(40),
    /** Entitlement and account state, as the client understood it. */
    tier: short(20),
    isDemo: z.boolean().optional().catch(undefined),
    previewAs: short(20),
    /** Anything else switched on that changes this surface's behaviour. */
    flags: z.array(z.string().trim().max(40)).max(20).optional().catch(undefined),
    /**
     * A short fragment the user explicitly chose to include. See the note at the
     * top: consent is the client gesture, this cap is the bound.
     */
    sample: z.string().max(MAX_SAMPLE).optional().catch(undefined),
    sampleLabel: short(80),
  })
  .strip();

export type StudyBugContext = z.infer<typeof studyContextSchema>;

/**
 * Render the context as the block an administrator reads in the bug thread.
 *
 * Plain text rather than JSON, because a human opens this: the admin Bug Reports
 * screen renders message bodies as text, and a wall of braces is worse to read
 * than a list of labelled lines. Empty fields are dropped entirely — a report
 * full of "unknown" reads as broken instrumentation rather than as a bug about
 * something else.
 */
export function formatStudyContext(ctx: StudyBugContext): string {
  const lines: string[] = [];
  const add = (label: string, value: string | number | boolean | undefined | null) => {
    if (value === undefined || value === null || value === '') return;
    lines.push(`${label}: ${value}`);
  };

  add('Screen', ctx.screen);
  add('Wizard step', ctx.step);
  add('Component', ctx.component);
  add('Input', ctx.source);
  if (ctx.parts != null) {
    const missing = ctx.missingParts?.length ? `, missing ${ctx.missingParts.join(', ')}` : '';
    add('Parts', `${ctx.parts}${ctx.expectedParts != null ? ` of ${ctx.expectedParts}` : ''}${missing}`);
  }
  if (ctx.errorCodes?.length) add('Validation codes', ctx.errorCodes.join(', '));
  for (const m of ctx.errorMessages ?? []) lines.push(`  · ${m}`);
  add('Error id', ctx.errorId);
  add('API status', ctx.apiStatus);
  add('Draft', ctx.draftId);
  add('Package', ctx.packageId);
  add('Blueprint version', ctx.blueprintVersion);
  add('Package format version', ctx.formatVersion);
  add('App version', ctx.appVersion);
  add('Membership', ctx.tier);
  if (ctx.previewAs) add('Previewing as', ctx.previewAs);
  if (ctx.isDemo) add('Demo account', 'yes');
  if (ctx.flags?.length) add('Flags', ctx.flags.join(', '));

  if (!lines.length && !ctx.sample) return '';

  const out = [`Technical details (collected automatically)`, ...lines];
  if (ctx.sample) {
    out.push('', `Sample the reporter chose to include${ctx.sampleLabel ? ` — ${ctx.sampleLabel}` : ''}:`, ctx.sample.slice(0, MAX_SAMPLE));
  }
  return out.join('\n');
}
