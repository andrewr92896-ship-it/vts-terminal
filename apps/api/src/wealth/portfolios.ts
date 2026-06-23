import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  wealthPortfolios,
  wealthAllocations,
  PORTFOLIO_RISKS,
  ASSET_CLASSES,
  type PortfolioRisk,
  type AssetClass,
  type WealthPortfolioRow,
  type WealthAllocationRow,
} from '../db/schema.js';

// Model portfolios are per-advisor named target allocations. Each allocation
// (sleeve) carries a target weight in basis points (10000 = 100%). Mirrors the
// wealth client patterns: scoped by userId, empty is the absence of rows.

export interface Allocation {
  id: string;
  name: string;
  assetClass: AssetClass;
  targetBp: number;
  position: number;
}

export interface ClassWeight {
  assetClass: AssetClass;
  bp: number;
}

export interface Portfolio {
  id: string;
  name: string;
  risk: PortfolioRisk;
  notes: string | null;
  allocations: Allocation[];
  totalBp: number; // sum of allocation weights
  balanced: boolean; // totalBp === 10000
  byClass: ClassWeight[]; // weight per asset class, descending
  createdAt: number;
  updatedAt: number;
}

export interface PortfoliosData {
  portfolios: Portfolio[];
}

function isRisk(v: unknown): v is PortfolioRisk {
  return typeof v === 'string' && (PORTFOLIO_RISKS as readonly string[]).includes(v);
}
function isAssetClass(v: unknown): v is AssetClass {
  return typeof v === 'string' && (ASSET_CLASSES as readonly string[]).includes(v);
}
function clean(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
// Clamp a basis-point weight into the valid 0..10000 range.
function cleanBp(v: number | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.min(10000, Math.max(0, Math.round(v)));
}

function toAllocation(row: WealthAllocationRow): Allocation {
  return {
    id: row.id,
    name: row.name,
    assetClass: isAssetClass(row.assetClass) ? row.assetClass : 'other',
    targetBp: row.targetBp,
    position: row.position,
  };
}

function assemble(p: WealthPortfolioRow, allocs: WealthAllocationRow[]): Portfolio {
  const allocations = allocs
    .map(toAllocation)
    .sort((a, b) => a.position - b.position || b.targetBp - a.targetBp);

  const totalBp = allocations.reduce((sum, a) => sum + a.targetBp, 0);

  const classMap = new Map<AssetClass, number>();
  for (const a of allocations) {
    classMap.set(a.assetClass, (classMap.get(a.assetClass) ?? 0) + a.targetBp);
  }
  const byClass: ClassWeight[] = [...classMap.entries()]
    .map(([assetClass, bp]) => ({ assetClass, bp }))
    .sort((a, b) => b.bp - a.bp);

  return {
    id: p.id,
    name: p.name,
    risk: isRisk(p.risk) ? p.risk : 'moderate',
    notes: p.notes,
    allocations,
    totalBp,
    balanced: totalBp === 10000,
    byClass,
    createdAt: p.createdAt.getTime(),
    updatedAt: p.updatedAt.getTime(),
  };
}

const RISK_RANK: Record<PortfolioRisk, number> = {
  conservative: 0,
  moderate_conservative: 1,
  moderate: 2,
  moderate_aggressive: 3,
  aggressive: 4,
};

export async function getPortfolios(userId: string): Promise<PortfoliosData> {
  const ports = await db.select().from(wealthPortfolios).where(eq(wealthPortfolios.userId, userId));
  const allocs = await db.select().from(wealthAllocations).where(eq(wealthAllocations.userId, userId));
  const byPortfolio = new Map<string, WealthAllocationRow[]>();
  for (const a of allocs) {
    const list = byPortfolio.get(a.portfolioId) ?? [];
    list.push(a);
    byPortfolio.set(a.portfolioId, list);
  }
  const portfolios = ports
    .map((p) => assemble(p, byPortfolio.get(p.id) ?? []))
    .sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk] || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { portfolios };
}

export interface PortfolioInput {
  name?: string;
  risk?: PortfolioRisk;
  notes?: string | null;
}

export async function addPortfolio(userId: string, input: PortfolioInput): Promise<PortfoliosData> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('A portfolio name is required');
  const now = new Date();
  await db.insert(wealthPortfolios).values({
    id: crypto.randomUUID(),
    userId,
    name: name.slice(0, 120),
    risk: isRisk(input.risk) ? input.risk : 'moderate',
    notes: clean(input.notes, 2000),
    createdAt: now,
    updatedAt: now,
  });
  return getPortfolios(userId);
}

export async function updatePortfolio(userId: string, id: string, input: PortfolioInput): Promise<PortfoliosData> {
  const patch: Partial<typeof wealthPortfolios.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('A portfolio name is required');
    patch.name = n.slice(0, 120);
  }
  if (input.risk !== undefined && isRisk(input.risk)) patch.risk = input.risk;
  if (input.notes !== undefined) patch.notes = clean(input.notes, 2000);
  await db
    .update(wealthPortfolios)
    .set(patch)
    .where(and(eq(wealthPortfolios.id, id), eq(wealthPortfolios.userId, userId)));
  return getPortfolios(userId);
}

export async function removePortfolio(userId: string, id: string): Promise<PortfoliosData> {
  // Allocation rows cascade via the FK, but pragma foreign_keys may be off, so
  // delete them explicitly first.
  await db.delete(wealthAllocations).where(and(eq(wealthAllocations.portfolioId, id), eq(wealthAllocations.userId, userId)));
  await db.delete(wealthPortfolios).where(and(eq(wealthPortfolios.id, id), eq(wealthPortfolios.userId, userId)));
  return getPortfolios(userId);
}

export interface AllocationInput {
  name?: string;
  assetClass?: AssetClass;
  targetBp?: number;
}

async function assertOwnsPortfolio(userId: string, portfolioId: string): Promise<void> {
  const p = (
    await db
      .select({ id: wealthPortfolios.id })
      .from(wealthPortfolios)
      .where(and(eq(wealthPortfolios.id, portfolioId), eq(wealthPortfolios.userId, userId)))
      .limit(1)
  )[0];
  if (!p) throw new Error('Portfolio not found');
}

export async function addAllocation(userId: string, portfolioId: string, input: AllocationInput): Promise<PortfoliosData> {
  await assertOwnsPortfolio(userId, portfolioId);
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('A sleeve name is required');
  await db.insert(wealthAllocations).values({
    id: crypto.randomUUID(),
    userId,
    portfolioId,
    name: name.slice(0, 120),
    assetClass: isAssetClass(input.assetClass) ? input.assetClass : 'other',
    targetBp: cleanBp(input.targetBp),
    position: Date.now() % 2_000_000_000,
    createdAt: new Date(),
  });
  await touchPortfolio(userId, portfolioId);
  return getPortfolios(userId);
}

export async function updateAllocation(userId: string, id: string, input: AllocationInput): Promise<PortfoliosData> {
  const existing = (
    await db
      .select()
      .from(wealthAllocations)
      .where(and(eq(wealthAllocations.id, id), eq(wealthAllocations.userId, userId)))
      .limit(1)
  )[0];
  if (!existing) throw new Error('Allocation not found');

  const patch: Partial<typeof wealthAllocations.$inferInsert> = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error('A sleeve name is required');
    patch.name = n.slice(0, 120);
  }
  if (input.assetClass !== undefined && isAssetClass(input.assetClass)) patch.assetClass = input.assetClass;
  if (input.targetBp !== undefined) patch.targetBp = cleanBp(input.targetBp);
  await db.update(wealthAllocations).set(patch).where(and(eq(wealthAllocations.id, id), eq(wealthAllocations.userId, userId)));
  await touchPortfolio(userId, existing.portfolioId);
  return getPortfolios(userId);
}

export async function removeAllocation(userId: string, id: string): Promise<PortfoliosData> {
  const existing = (
    await db
      .select({ portfolioId: wealthAllocations.portfolioId })
      .from(wealthAllocations)
      .where(and(eq(wealthAllocations.id, id), eq(wealthAllocations.userId, userId)))
      .limit(1)
  )[0];
  await db.delete(wealthAllocations).where(and(eq(wealthAllocations.id, id), eq(wealthAllocations.userId, userId)));
  if (existing) await touchPortfolio(userId, existing.portfolioId);
  return getPortfolios(userId);
}

async function touchPortfolio(userId: string, portfolioId: string): Promise<void> {
  await db
    .update(wealthPortfolios)
    .set({ updatedAt: new Date() })
    .where(and(eq(wealthPortfolios.id, portfolioId), eq(wealthPortfolios.userId, userId)));
}
