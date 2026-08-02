import type { InvestmentAssetClass } from '../db/schema.js';

// Pure portfolio math for the Investments workspace. No database, no network,
// no clock — everything here takes its inputs and returns a result, so it can be
// checked against hand-computed figures (see verifyInvestments.ts).
//
// The rule that shapes all of it: a holding with no price is NOT worth zero. It
// is worth an unknown amount, and every total below reports how much of the
// portfolio it could not see. Treating unpriced as zero silently understates a
// portfolio — the single most misleading thing a tracker can do.

export type PriceSource = 'live' | 'manual' | 'none';

export interface PricedHolding {
  id: string;
  accountId: string;
  symbol: string | null;
  name: string;
  assetClass: InvestmentAssetClass;
  quantity: number;
  costBasis: number | null;
  price: number | null;
  priceSource: PriceSource;
  /** Previous close, when the quote carried one. Only then is a day move real. */
  previousClose: number | null;
  sector: string | null;
  region: string | null;
}

export interface HoldingValue extends PricedHolding {
  /** quantity x price, or null when there is no price at all. */
  value: number | null;
  /** value - costBasis, or null when either side is unknown. */
  gain: number | null;
  gainPct: number | null;
  /** Today's move in dollars, only where the quote carried a previous close. */
  dayChange: number | null;
  dayChangePct: number | null;
}

export function valueHolding(h: PricedHolding): HoldingValue {
  const value = h.price == null ? null : h.quantity * h.price;
  const gain = value == null || h.costBasis == null ? null : value - h.costBasis;
  const gainPct =
    gain == null || h.costBasis == null || h.costBasis === 0 ? null : (gain / h.costBasis) * 100;

  let dayChange: number | null = null;
  let dayChangePct: number | null = null;
  if (h.price != null && h.previousClose != null && h.previousClose > 0) {
    dayChange = (h.price - h.previousClose) * h.quantity;
    dayChangePct = ((h.price - h.previousClose) / h.previousClose) * 100;
  }

  return { ...h, value, gain, gainPct, dayChange, dayChangePct };
}

export interface PortfolioTotals {
  /** Sum of every holding that could be priced, plus account cash. */
  value: number;
  /** Cash across accounts (always known — it is a number the user typed). */
  cash: number;
  /** Cost basis over holdings that have one. */
  costBasis: number;
  /** value - costBasis, over the holdings where both are known. */
  gain: number;
  gainPct: number | null;
  /** Today's move, over the holdings whose quote carried a previous close. */
  dayChange: number;
  /**
   * The share of holding value the day move actually covers, 0..1. The Overview
   * needs this to decide whether a day figure is worth showing at all: a move
   * computed over 8% of a portfolio is not that portfolio's day.
   */
  dayChangeCoverage: number;
  /** How many holdings have no price from any source. */
  unpricedCount: number;
  /** How many are priced from a figure the user typed rather than a live quote. */
  manualCount: number;
  livePricedCount: number;
}

export function totalPortfolio(holdings: HoldingValue[], cash: number): PortfolioTotals {
  let value = 0;
  let costBasis = 0;
  let gain = 0;
  let dayChange = 0;
  let dayCovered = 0;
  let unpricedCount = 0;
  let manualCount = 0;
  let livePricedCount = 0;

  for (const h of holdings) {
    if (h.value == null) {
      unpricedCount++;
      continue;
    }
    value += h.value;
    if (h.priceSource === 'manual') manualCount++;
    if (h.priceSource === 'live') livePricedCount++;
    if (h.costBasis != null) {
      costBasis += h.costBasis;
      if (h.gain != null) gain += h.gain;
    }
    if (h.dayChange != null) {
      dayChange += h.dayChange;
      dayCovered += h.value;
    }
  }

  const holdingsValue = value;
  return {
    value: value + cash,
    cash,
    costBasis,
    gain,
    gainPct: costBasis > 0 ? (gain / costBasis) * 100 : null,
    dayChange,
    dayChangeCoverage: holdingsValue > 0 ? dayCovered / holdingsValue : 0,
    unpricedCount,
    manualCount,
    livePricedCount,
  };
}

// ---- Allocation ----

export interface AllocationBucket {
  key: string;
  label: string;
  value: number;
  pct: number;
}

export const ASSET_CLASS_LABELS: Record<InvestmentAssetClass, string> = {
  us_stock: 'US stocks',
  intl_stock: 'International stocks',
  bond: 'Bonds',
  cash: 'Cash',
  real_estate: 'Real estate',
  commodity: 'Commodities',
  crypto: 'Crypto',
  target_date: 'Target-date funds',
  other: 'Other',
};

/**
 * Group priced holdings into buckets by a chosen dimension. Unpriced holdings
 * are excluded — they have no value to allocate — which is why the caller must
 * report `unpricedCount` alongside any allocation it renders.
 *
 * `cash` is passed in so account cash lands in the Cash bucket rather than
 * disappearing from a chart that claims to cover the whole portfolio.
 */
export function allocateBy(
  holdings: HoldingValue[],
  dimension: 'assetClass' | 'sector' | 'region',
  cash = 0,
): AllocationBucket[] {
  const sums = new Map<string, { label: string; value: number }>();

  const add = (key: string, label: string, value: number) => {
    const cur = sums.get(key);
    if (cur) cur.value += value;
    else sums.set(key, { label, value });
  };

  for (const h of holdings) {
    if (h.value == null) continue;
    if (dimension === 'assetClass') {
      add(h.assetClass, ASSET_CLASS_LABELS[h.assetClass] ?? 'Other', h.value);
    } else {
      // Sector and region are optional, user-stated fields. A holding that has
      // not been categorised is bucketed as "Not set" rather than guessed at —
      // the tracker has no data source that could classify it.
      const raw = (dimension === 'sector' ? h.sector : h.region)?.trim();
      const key = raw && raw.length > 0 ? raw.toLowerCase() : '__unset';
      add(key, raw && raw.length > 0 ? raw : 'Not set', h.value);
    }
  }

  if (cash > 0) add('cash', 'Cash', cash);

  const total = [...sums.values()].reduce((s, b) => s + b.value, 0);
  return [...sums.entries()]
    .map(([key, b]) => ({ key, label: b.label, value: b.value, pct: total > 0 ? (b.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface ConcentrationFlag {
  severity: 'note' | 'watch';
  text: string;
}

/**
 * Plain-English observations about how concentrated a portfolio is.
 *
 * These are deliberately STATEMENTS OF FACT, never recommendations — "68% of
 * your portfolio sits in one holding", not "you should trim this". The
 * difference is the whole regulatory posture of the workspace: describing a
 * portfolio is education, telling someone what to buy or sell is advice.
 * Keep every string here descriptive.
 */
export function concentrationFlags(
  holdings: HoldingValue[],
  byClass: AllocationBucket[],
  totalValue: number,
): ConcentrationFlag[] {
  const flags: ConcentrationFlag[] = [];
  if (totalValue <= 0) return flags;

  const priced = holdings.filter((h) => h.value != null) as (HoldingValue & { value: number })[];

  const biggest = [...priced].sort((a, b) => b.value - a.value)[0];
  if (biggest) {
    const pct = (biggest.value / totalValue) * 100;
    // A fixed "flag anything over 25%" threshold is wrong, and wrong in the
    // direction that makes the feature worthless: a perfectly even four-holding
    // portfolio has every position at 25%, so it would flag every time and the
    // user would learn to ignore the panel.
    //
    // So a position is called concentrated when it is either large in absolute
    // terms — 40% of everything is worth stating however few holdings you own —
    // or large RELATIVE to an even split across the positions actually held.
    const evenWeight = 100 / priced.length;
    const disproportionate = pct >= 25 && pct >= evenWeight * 1.5;
    if (pct >= 40 || disproportionate) {
      flags.push({
        severity: pct >= 50 ? 'watch' : 'note',
        text: `${pct.toFixed(0)}% of your portfolio is in a single holding — ${biggest.name}.`,
      });
    }
  }

  const topClass = byClass[0];
  if (topClass && topClass.pct >= 80 && byClass.length > 1) {
    flags.push({
      severity: 'note',
      text: `${topClass.pct.toFixed(0)}% sits in one asset class — ${topClass.label}.`,
    });
  }

  if (byClass.length === 1 && priced.length > 1) {
    flags.push({
      severity: 'note',
      text: `Every holding you have priced is in one asset class — ${byClass[0].label}.`,
    });
  }

  const cashBucket = byClass.find((b) => b.key === 'cash');
  if (cashBucket && cashBucket.pct >= 30) {
    flags.push({
      severity: 'note',
      text: `${cashBucket.pct.toFixed(0)}% of the total is uninvested cash.`,
    });
  }

  return flags;
}

// ---- Performance ----

export interface SnapshotPoint {
  onDate: string; // "YYYY-MM-DD" (ET)
  value: number;
  contributedToDate: number | null;
}

export interface PerformanceSummary {
  startValue: number;
  endValue: number;
  /** Money added (contributions + employer match - withdrawals) inside the window. */
  contributed: number;
  /** endValue - startValue - contributed. What the market actually did. */
  marketGain: number;
  /**
   * Market gain as a percentage of the money that was at work — the starting
   * value plus what was added. Not a time-weighted return: with one reading a
   * day and no external cash-flow timing, a money-weighted approximation is the
   * honest thing to report, and it is labelled as such on the screen.
   */
  marketGainPct: number | null;
  days: number;
}

/**
 * Decompose a change in portfolio value into "what you put in" and "what the
 * market did". Without the contribution figure a rising line cannot be told
 * from a line that rose only because money was added — which is the single most
 * common way a portfolio tracker misleads.
 */
export function summarizePerformance(
  points: SnapshotPoint[],
  contributedInWindow: number,
): PerformanceSummary | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const marketGain = last.value - first.value - contributedInWindow;
  const base = first.value + Math.max(contributedInWindow, 0);
  const days = Math.max(1, Math.round((Date.parse(last.onDate) - Date.parse(first.onDate)) / 86400000));
  return {
    startValue: first.value,
    endValue: last.value,
    contributed: contributedInWindow,
    marketGain,
    marketGainPct: base > 0 ? (marketGain / base) * 100 : null,
    days,
  };
}

// ---- Income months ----

/**
 * The last 12 ET month keys ("YYYY-MM"), oldest first, ending with the month
 * `todayEt` falls in.
 *
 * Takes the ET date as a string rather than reading a clock, because the obvious
 * implementation is wrong on any server that is not already in Eastern Time.
 * Building the months with `new Date(y, m - i, 1)` constructs midnight LOCAL,
 * and midnight UTC on the 1st is still the previous month in ET — so on a UTC
 * host (which is every deploy of this app) every bucket shifted back one month,
 * the current month was absent entirely, and this month's dividends silently
 * vanished from the chart, the trailing total and therefore the yield.
 *
 * So the arithmetic is done on the ET year and month numbers directly, and never
 * round-trips through a local-time Date.
 */
export function last12MonthKeys(todayEt: string): string[] {
  const year = Number(todayEt.slice(0, 4));
  const month = Number(todayEt.slice(5, 7)); // 1-12
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    // Shift to a 0-based absolute month count so the year rolls over correctly.
    const abs = year * 12 + (month - 1) - i;
    const y = Math.floor(abs / 12);
    const m = (abs % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

// ---- Projections ----

export interface ProjectionPoint {
  year: number; // years from now (0 = today)
  value: number;
  contributed: number; // cumulative added since today
}

/**
 * A compound-growth curve: start with what you have, add a fixed amount every
 * month, grow at a constant annual rate compounded monthly.
 *
 * This is arithmetic, not a forecast. Markets do not return a constant rate, and
 * nothing here models volatility, sequence-of-returns risk, fees, taxes or
 * inflation. The screen labels it an estimate and carries the informational-only
 * line; do not let this grow into anything that reads as a prediction or as
 * advice about what someone should do.
 */
export function project(
  startValue: number,
  monthlyContribution: number,
  annualRatePct: number,
  years: number,
): ProjectionPoint[] {
  const out: ProjectionPoint[] = [{ year: 0, value: startValue, contributed: 0 }];
  const monthlyRate = annualRatePct / 100 / 12;
  let value = startValue;
  let contributed = 0;
  const totalMonths = Math.max(0, Math.round(years * 12));

  for (let m = 1; m <= totalMonths; m++) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    contributed += monthlyContribution;
    if (m % 12 === 0) out.push({ year: m / 12, value, contributed });
  }
  return out;
}
