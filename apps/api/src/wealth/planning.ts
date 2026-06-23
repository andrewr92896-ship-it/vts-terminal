import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { wealthPlans, type WealthPlanRow } from '../db/schema.js';

// Retirement projection scenarios. Inputs are stored; the projection is
// computed on read so edits stay cheap and the math lives in one place.
//
// Approach: grow current savings + annual contributions at the nominal return
// to a balance at retirement, then express everything in today's dollars and
// compute a level (inflation-adjusted) sustainable income that draws the
// balance down to zero across retirement. The income goal is entered in
// today's dollars, so we compare against it directly.

export interface PlanProjection {
  yearsToRetirement: number;
  yearsInRetirement: number;
  balanceAtRetirement: number; // nominal dollars at retirement
  realBalanceAtRetirement: number; // today's dollars
  sustainableIncome: number; // level real annual income (today's dollars)
  fourPctIncome: number; // 4% rule on the real balance (today's dollars)
  incomeGoal: number; // today's dollars (as entered)
  gap: number; // sustainableIncome - incomeGoal
  onTrack: boolean;
  series: { age: number; balance: number }[]; // nominal balance by age, start -> retirement
}

export interface Plan {
  id: string;
  name: string;
  clientId: string | null;
  currentAge: number;
  retirementAge: number;
  endAge: number;
  currentSavings: number;
  annualContribution: number;
  returnBp: number;
  inflationBp: number;
  incomeGoal: number;
  projection: PlanProjection;
  createdAt: number;
  updatedAt: number;
}

export interface PlansData {
  plans: Plan[];
}

// Future value of a present sum plus an annuity of yearly contributions.
function futureValue(present: number, contribution: number, rate: number, years: number): number {
  if (years <= 0) return present;
  const growth = Math.pow(1 + rate, years);
  if (Math.abs(rate) < 1e-9) return present + contribution * years;
  return present * growth + contribution * ((growth - 1) / rate);
}

// Level annual payment that draws `balance` to zero over `years` at `rate`.
function annuityPayment(balance: number, rate: number, years: number): number {
  if (years <= 0) return 0;
  if (Math.abs(rate) < 1e-9) return balance / years;
  return (balance * rate) / (1 - Math.pow(1 + rate, -years));
}

function project(row: WealthPlanRow): PlanProjection {
  const r = row.returnBp / 10000;
  const inf = row.inflationBp / 10000;
  const realRate = (1 + r) / (1 + inf) - 1;

  const yearsToRetirement = Math.max(0, row.retirementAge - row.currentAge);
  const yearsInRetirement = Math.max(0, row.endAge - row.retirementAge);

  const balanceAtRetirement = futureValue(row.currentSavings, row.annualContribution, r, yearsToRetirement);
  const realBalanceAtRetirement = balanceAtRetirement / Math.pow(1 + inf, yearsToRetirement);

  const sustainableIncome = Math.round(annuityPayment(realBalanceAtRetirement, realRate, yearsInRetirement));
  const fourPctIncome = Math.round(realBalanceAtRetirement * 0.04);
  const gap = sustainableIncome - row.incomeGoal;

  // Nominal balance by age up to retirement (capped point count for the chart).
  const series: { age: number; balance: number }[] = [];
  const step = yearsToRetirement > 40 ? 2 : 1;
  for (let y = 0; y <= yearsToRetirement; y += step) {
    series.push({ age: row.currentAge + y, balance: Math.round(futureValue(row.currentSavings, row.annualContribution, r, y)) });
  }
  if (series.length && series[series.length - 1].age !== row.retirementAge) {
    series.push({ age: row.retirementAge, balance: Math.round(balanceAtRetirement) });
  }

  return {
    yearsToRetirement,
    yearsInRetirement,
    balanceAtRetirement: Math.round(balanceAtRetirement),
    realBalanceAtRetirement: Math.round(realBalanceAtRetirement),
    sustainableIncome,
    fourPctIncome,
    incomeGoal: row.incomeGoal,
    gap,
    onTrack: gap >= 0,
    series,
  };
}

function toPlan(row: WealthPlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    currentAge: row.currentAge,
    retirementAge: row.retirementAge,
    endAge: row.endAge,
    currentSavings: row.currentSavings,
    annualContribution: row.annualContribution,
    returnBp: row.returnBp,
    inflationBp: row.inflationBp,
    incomeGoal: row.incomeGoal,
    projection: project(row),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function getPlans(userId: string): Promise<PlansData> {
  const rows = await db.select().from(wealthPlans).where(eq(wealthPlans.userId, userId));
  const plans = rows
    .map(toPlan)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { plans };
}

// --- input normalization ---
const age = (v: number | undefined, fallback: number) =>
  v == null || !Number.isFinite(v) ? fallback : Math.min(120, Math.max(0, Math.round(v)));
const dollars = (v: number | undefined, fallback: number) =>
  v == null || !Number.isFinite(v) ? fallback : Math.min(1_000_000_000, Math.max(0, Math.round(v)));
const rateBp = (v: number | undefined, fallback: number) =>
  v == null || !Number.isFinite(v) ? fallback : Math.min(5000, Math.max(0, Math.round(v))); // cap 50%
const cleanClient = (v: string | null | undefined) => {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, 64) : null;
};

export interface PlanInput {
  name?: string;
  clientId?: string | null;
  currentAge?: number;
  retirementAge?: number;
  endAge?: number;
  currentSavings?: number;
  annualContribution?: number;
  returnBp?: number;
  inflationBp?: number;
  incomeGoal?: number;
}

export async function addPlan(userId: string, input: PlanInput): Promise<PlansData> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('A scenario name is required');
  const now = new Date();
  await db.insert(wealthPlans).values({
    id: crypto.randomUUID(),
    userId,
    name: name.slice(0, 120),
    clientId: cleanClient(input.clientId),
    currentAge: age(input.currentAge, 35),
    retirementAge: age(input.retirementAge, 65),
    endAge: age(input.endAge, 90),
    currentSavings: dollars(input.currentSavings, 0),
    annualContribution: dollars(input.annualContribution, 0),
    returnBp: rateBp(input.returnBp, 600),
    inflationBp: rateBp(input.inflationBp, 250),
    incomeGoal: dollars(input.incomeGoal, 60000),
    createdAt: now,
    updatedAt: now,
  });
  return getPlans(userId);
}

export async function updatePlan(userId: string, id: string, input: PlanInput): Promise<PlansData> {
  const existing = (
    await db.select().from(wealthPlans).where(and(eq(wealthPlans.id, id), eq(wealthPlans.userId, userId))).limit(1)
  )[0];
  if (!existing) throw new Error('Scenario not found');

  const patch: Partial<typeof wealthPlans.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('A scenario name is required');
    patch.name = n.slice(0, 120);
  }
  if (input.clientId !== undefined) patch.clientId = cleanClient(input.clientId);
  if (input.currentAge !== undefined) patch.currentAge = age(input.currentAge, existing.currentAge);
  if (input.retirementAge !== undefined) patch.retirementAge = age(input.retirementAge, existing.retirementAge);
  if (input.endAge !== undefined) patch.endAge = age(input.endAge, existing.endAge);
  if (input.currentSavings !== undefined) patch.currentSavings = dollars(input.currentSavings, existing.currentSavings);
  if (input.annualContribution !== undefined) patch.annualContribution = dollars(input.annualContribution, existing.annualContribution);
  if (input.returnBp !== undefined) patch.returnBp = rateBp(input.returnBp, existing.returnBp);
  if (input.inflationBp !== undefined) patch.inflationBp = rateBp(input.inflationBp, existing.inflationBp);
  if (input.incomeGoal !== undefined) patch.incomeGoal = dollars(input.incomeGoal, existing.incomeGoal);
  await db.update(wealthPlans).set(patch).where(and(eq(wealthPlans.id, id), eq(wealthPlans.userId, userId)));
  return getPlans(userId);
}

export async function removePlan(userId: string, id: string): Promise<PlansData> {
  await db.delete(wealthPlans).where(and(eq(wealthPlans.id, id), eq(wealthPlans.userId, userId)));
  return getPlans(userId);
}
