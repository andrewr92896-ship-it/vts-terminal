import type { InvestmentAccountKind } from '../db/schema.js';

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
// late October/November. Anything shown from here carries an "informational
// only — verify against irs.gov" line on the Contributions screen, because a
// contribution limit is the one number in this workspace where being out of
// date has a real cost.

export interface ContributionLimit {
  /** The elective-deferral / annual contribution cap for this kind. */
  limit: number;
  /** Additional amount allowed at 50+, or null where the kind has no catch-up. */
  catchUp50: number | null;
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

// Figures by tax year. SEP is a percentage-of-compensation cap in practice, so
// only its dollar ceiling is stored and the note says what it is.
const LIMITS: Record<number, Partial<Record<LimitGroup, ContributionLimit>>> = {
  2024: {
    workplace: { limit: 23000, catchUp50: 7500 },
    ira: { limit: 7000, catchUp50: 1000 },
    sep: { limit: 69000, catchUp50: null, note: 'or 25% of compensation, whichever is less' },
    simple: { limit: 16000, catchUp50: 3500 },
    hsa: { limit: 4150, catchUp50: 1000, note: 'self-only; $8,300 for family coverage' },
    esa: { limit: 2000, catchUp50: null, note: 'per beneficiary, per year' },
  },
  2025: {
    workplace: { limit: 23500, catchUp50: 7500 },
    ira: { limit: 7000, catchUp50: 1000 },
    sep: { limit: 70000, catchUp50: null, note: 'or 25% of compensation, whichever is less' },
    simple: { limit: 16500, catchUp50: 3500 },
    hsa: { limit: 4300, catchUp50: 1000, note: 'self-only; $8,550 for family coverage' },
    esa: { limit: 2000, catchUp50: null, note: 'per beneficiary, per year' },
  },
  2026: {
    workplace: { limit: 24500, catchUp50: 8000 },
    ira: { limit: 7500, catchUp50: 1100 },
    sep: { limit: 72000, catchUp50: null, note: 'or 25% of compensation, whichever is less' },
    simple: { limit: 17000, catchUp50: 3500 },
    hsa: { limit: 4400, catchUp50: 1000, note: 'self-only; $8,750 for family coverage' },
    esa: { limit: 2000, catchUp50: null, note: 'per beneficiary, per year' },
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
