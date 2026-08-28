// IRS annual contribution limits — a VERBATIM MIRROR of
// apps/api/src/investments/limits.ts from the line after this header down.
//
// The public API is its own service and may not import from the private one
// (`verify:public-api-boundary`), and this catalog is pure data with no
// dependency on either side's database. So it is copied rather than shared, and
// `verify:limits-mirror` compares the two files line for line below their
// headers — a limit that drifted between them would be a figure somebody could
// over-contribute on the strength of, and it would look right on both screens.
//
// EDIT THE PRIVATE FILE AND COPY IT HERE. Do not edit only one. The single
// line that differs is the private file's import of the account-kind type,
// which is declared here instead and is excluded from the comparison.
export const INVESTMENT_ACCOUNT_KINDS = [
  '401k',
  'roth_401k',
  '403b',
  'ira',
  'roth_ira',
  'sep_ira',
  'simple_ira',
  'hsa',
  'esa',
  '529',
  'brokerage',
  'other',
] as const;
export type InvestmentAccountKind = (typeof INVESTMENT_ACCOUNT_KINDS)[number];

// ---- mirrored from apps/api/src/investments/limits.ts ----------------------

// IRS annual contribution limits, by tax year and account kind.
//
// This is a hand-entered catalog in code — the same shape as the FOMC meeting
// list in trading/marketData.ts — because no free API publishes it and the
// figures change once a year. Two rules keep it honest:
//
//   1. A tax year that is not in this table reports NO limit rather than the
//      nearest year's. A stale limit shown as this year's is worse than none:
//      somebody could over-contribute on the strength of it.
//   2. Catch-up contributions (50+, and the higher 60–63 band on workplace
//      plans) are reported SEPARATELY and never folded into the headline
//      figure. The terminal does not know anyone's age — it has no birthdate —
//      so applying an age-based limit automatically would be inventing a fact
//      about the user.
//
// UPDATE THIS EVERY YEAR. The IRS publishes the following year's figures in
// late October/November.
//
// Every figure below was checked against the IRS announcements on 2026-08-02:
// Notice 2025-67 (2026 retirement plan limits), the equivalent notices for 2025
// and 2024, and the Revenue Procedures carrying the HSA amounts. One entry was
// wrong when checked — the 2026 SIMPLE catch-up — and is flagged at its entry.
//
// Anything shown from here carries an "informational only — verify against
// irs.gov" line on the Contributions screen, because a contribution limit is the
// one number in this workspace where being out of date has a real cost.

export interface ContributionLimit {
  /** The elective-deferral / annual contribution cap for this kind. */
  limit: number;
  /** Additional amount allowed once catch-up age is reached, or null if none. */
  catchUp: number | null;
  /**
   * The age catch-up starts at. **This is not always 50.** An HSA's extra
   * $1,000 begins at 55, and a screen that says "age 50+" beside it tells a
   * 52-year-old they have a thousand dollars of room they do not have. The
   * field exists because that mislabelling shipped once.
   */
  catchUpFromAge: number | null;
  /**
   * SECURE 2.0's higher catch-up for ages 60–63, from tax year 2025 onward.
   * It REPLACES the ordinary catch-up for those four years rather than adding
   * to it, which is why the screen must never show the two summed. Null where
   * the year or the plan kind has none.
   */
  catchUp60to63?: number | null;
  /** Note shown beside the figure — the family/self split for an HSA, etc. */
  note?: string;
}

// Which kinds share a single limit. Workplace plans (401k/403b) share the
// elective-deferral cap ACROSS accounts — the cap is per person per year, not
// per account — and the same is true of the IRA/Roth IRA pair. The grouping is
// what makes that scoring correct.
export const LIMIT_GROUPS = {
  workplace: ['401k', 'roth_401k', '403b'] as InvestmentAccountKind[],
  ira: ['ira', 'roth_ira'] as InvestmentAccountKind[],
  sep: ['sep_ira'] as InvestmentAccountKind[],
  simple: ['simple_ira'] as InvestmentAccountKind[],
  hsa: ['hsa'] as InvestmentAccountKind[],
  esa: ['esa'] as InvestmentAccountKind[],
} as const;

export type LimitGroup = keyof typeof LIMIT_GROUPS;

export const LIMIT_GROUP_LABELS: Record<LimitGroup, string> = {
  workplace: '401(k) / 403(b) elective deferral',
  ira: 'IRA + Roth IRA combined',
  sep: 'SEP IRA',
  simple: 'SIMPLE IRA',
  hsa: 'HSA',
  esa: 'Coverdell ESA',
};

// Kinds with no personal annual cap to score against (a taxable brokerage has
// none; a 529's limit is a state-by-state lifetime figure this cannot know).
const UNCAPPED: InvestmentAccountKind[] = ['brokerage', '529', 'other'];

export function limitGroupFor(kind: InvestmentAccountKind): LimitGroup | null {
  if (UNCAPPED.includes(kind)) return null;
  for (const [group, kinds] of Object.entries(LIMIT_GROUPS)) {
    if ((kinds as InvestmentAccountKind[]).includes(kind)) return group as LimitGroup;
  }
  return null;
}

// A SIMPLE plan at an employer with 25 or fewer employees can run a higher
// limit under SECURE 2.0, and some larger employers may elect it. The stored
// figure is the standard one, so the note tells anyone at a small employer to
// check rather than trust it.
const SIMPLE_NOTE = 'standard limit; a small employer may allow a higher one';

// Figures by tax year. SEP is a percentage-of-compensation cap in practice, so
// only its dollar ceiling is stored and the note says what it is.
const LIMITS: Record<number, Partial<Record<LimitGroup, ContributionLimit>>> = {
  2024: {
    // No 60-63 band in 2024 — SECURE 2.0's higher catch-up starts in 2025.
    workplace: { limit: 23000, catchUp: 7500, catchUpFromAge: 50 },
    ira: { limit: 7000, catchUp: 1000, catchUpFromAge: 50 },
    sep: { limit: 69000, catchUp: null, catchUpFromAge: null, note: 'or 25% of compensation, whichever is less' },
    simple: { limit: 16000, catchUp: 3500, catchUpFromAge: 50, note: SIMPLE_NOTE },
    hsa: { limit: 4150, catchUp: 1000, catchUpFromAge: 55, note: 'self-only; $8,300 for family coverage' },
    esa: { limit: 2000, catchUp: null, catchUpFromAge: null, note: 'per beneficiary, per year' },
  },
  2025: {
    workplace: { limit: 23500, catchUp: 7500, catchUpFromAge: 50, catchUp60to63: 11250 },
    ira: { limit: 7000, catchUp: 1000, catchUpFromAge: 50 },
    sep: { limit: 70000, catchUp: null, catchUpFromAge: null, note: 'or 25% of compensation, whichever is less' },
    simple: { limit: 16500, catchUp: 3500, catchUpFromAge: 50, catchUp60to63: 5250, note: SIMPLE_NOTE },
    hsa: { limit: 4300, catchUp: 1000, catchUpFromAge: 55, note: 'self-only; $8,550 for family coverage' },
    esa: { limit: 2000, catchUp: null, catchUpFromAge: null, note: 'per beneficiary, per year' },
  },
  2026: {
    workplace: { limit: 24500, catchUp: 8000, catchUpFromAge: 50, catchUp60to63: 11250 },
    ira: { limit: 7500, catchUp: 1100, catchUpFromAge: 50 },
    sep: { limit: 72000, catchUp: null, catchUpFromAge: null, note: 'or 25% of compensation, whichever is less' },
    // The SIMPLE catch-up rose to $4,000 for 2026. It was stored as $3,500 —
    // 2025's figure — until the whole table was checked against Notice 2025-67.
    simple: { limit: 17000, catchUp: 4000, catchUpFromAge: 50, catchUp60to63: 5250, note: SIMPLE_NOTE },
    hsa: { limit: 4400, catchUp: 1000, catchUpFromAge: 55, note: 'self-only; $8,750 for family coverage' },
    esa: { limit: 2000, catchUp: null, catchUpFromAge: null, note: 'per beneficiary, per year' },
  },
};

// The most recent tax year this catalog knows. Surfaced to the client so the
// Contributions screen can say plainly that a later year has no stored figures
// instead of silently showing an empty progress bar.
export const LATEST_LIMIT_YEAR = Math.max(...Object.keys(LIMITS).map(Number));

/** The limit for a group in a tax year, or null when that year is not stored. */
export function contributionLimit(group: LimitGroup, taxYear: number): ContributionLimit | null {
  return LIMITS[taxYear]?.[group] ?? null;
}

export function hasLimitsFor(taxYear: number): boolean {
  return LIMITS[taxYear] !== undefined;
}
