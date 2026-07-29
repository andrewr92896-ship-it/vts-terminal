import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { marketDataLayout, type MarketDataLayoutRow } from '../db/schema.js';
import {
  DEFAULT_PINNED_SERIES,
  MARKET_GROUP_KEYS,
  isKnownSeriesId,
  type MarketGroupKey,
} from './marketData.js';

// How one trader has arranged their Market Data board. Personal, never shared —
// two traders on the same desk see the same series catalog arranged their own
// way. A user with no stored row falls back to the default pinned set.

// A metric the trader typed in themselves, for anything the feeds don't carry.
// Always rendered as `manual` freshness; its changes are a single value the
// trader entered, padded out so the five-period grid still lines up.
export interface CustomMetric {
  id: string;
  group: MarketGroupKey;
  label: string;
  value: string;
  unit: string;
  asOf: string;
  delta: string;
}

export interface MarketDataLayout {
  pinned: string[];
  hidden: string[];
  custom: CustomMetric[];
}

const MAX_CUSTOM = 40;
const MAX_TEXT = 60;

export function defaultMarketDataLayout(): MarketDataLayout {
  return { pinned: [...DEFAULT_PINNED_SERIES], hidden: [], custom: [] };
}

function parseIds(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function parseCustom(raw: string): CustomMetric[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.flatMap((x) => {
      if (!x || typeof x !== 'object') return [];
      const o = x as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : '';
      const label = typeof o.label === 'string' ? o.label : '';
      if (!id || !label) return [];
      const group: MarketGroupKey = MARKET_GROUP_KEYS.includes(o.group as MarketGroupKey)
        ? (o.group as MarketGroupKey)
        : 'policy';
      return [
        {
          id,
          group,
          label,
          value: typeof o.value === 'string' ? o.value : '',
          unit: typeof o.unit === 'string' ? o.unit : '',
          asOf: typeof o.asOf === 'string' ? o.asOf : 'entered by you',
          delta: typeof o.delta === 'string' ? o.delta : '',
        },
      ];
    });
  } catch {
    return [];
  }
}

// Drop ids the catalog no longer has (a series renamed or retired) while
// keeping every custom metric — those exist only in this row, so a stale-looking
// id there is the real thing rather than a leftover.
function sanitize(layout: MarketDataLayout): MarketDataLayout {
  const custom = layout.custom.slice(0, MAX_CUSTOM).map((c) => ({
    id: c.id.slice(0, MAX_TEXT),
    group: c.group,
    label: c.label.trim().slice(0, MAX_TEXT),
    value: c.value.trim().slice(0, MAX_TEXT),
    unit: c.unit.trim().slice(0, 16),
    asOf: c.asOf.trim().slice(0, MAX_TEXT) || 'entered by you',
    delta: c.delta.trim().slice(0, 24),
  }));
  const customIds = new Set(custom.map((c) => c.id));
  const known = (id: string) => isKnownSeriesId(id) || customIds.has(id);
  const dedupe = (ids: string[]) => [...new Set(ids.filter(known))];
  return { pinned: dedupe(layout.pinned), hidden: dedupe(layout.hidden), custom };
}

function rowToLayout(row: MarketDataLayoutRow): MarketDataLayout {
  return sanitize({
    pinned: parseIds(row.pinned),
    hidden: parseIds(row.hidden),
    custom: parseCustom(row.custom),
  });
}

export async function getMarketDataLayout(userId: string): Promise<MarketDataLayout> {
  const row = (
    await db.select().from(marketDataLayout).where(eq(marketDataLayout.userId, userId)).limit(1)
  )[0];
  return row ? rowToLayout(row) : defaultMarketDataLayout();
}

export async function setMarketDataLayout(
  userId: string,
  layout: MarketDataLayout,
): Promise<MarketDataLayout> {
  const clean = sanitize(layout);
  const now = new Date();
  const values = {
    pinned: JSON.stringify(clean.pinned),
    hidden: JSON.stringify(clean.hidden),
    custom: JSON.stringify(clean.custom),
  };
  await db
    .insert(marketDataLayout)
    .values({ id: crypto.randomUUID(), userId, ...values, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: marketDataLayout.userId,
      set: { ...values, updatedAt: now },
    });
  return clean;
}
