import crypto from 'node:crypto';
import { desc, eq, gte } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  tradingNews,
  tradingCalendar,
  NEWS_IMPACTS,
  NEWS_BIASES,
  NEWS_CATEGORIES,
  type NewsImpact,
  type NewsBias,
  type NewsCategory,
  type TradingNewsRow,
  type TradingCalendarRow,
} from '../db/schema.js';

// A shared market-news desk feed: free-form headlines (with impact/bias/category
// tags) and an economic calendar. Shared across all traders — not per user.

export interface NewsItem {
  id: string;
  title: string;
  body: string | null;
  source: string | null;
  url: string | null;
  category: NewsCategory;
  impact: NewsImpact;
  bias: NewsBias;
  publishedAt: number; // ms epoch
}

export interface CalendarEvent {
  id: string;
  title: string;
  country: string | null;
  impact: NewsImpact;
  eventTime: number; // ms epoch
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

export interface MarketNewsData {
  headlines: NewsItem[];
  calendar: CalendarEvent[];
}

function isImpact(v: unknown): v is NewsImpact {
  return typeof v === 'string' && (NEWS_IMPACTS as readonly string[]).includes(v);
}
function isBias(v: unknown): v is NewsBias {
  return typeof v === 'string' && (NEWS_BIASES as readonly string[]).includes(v);
}
function isCategory(v: unknown): v is NewsCategory {
  return typeof v === 'string' && (NEWS_CATEGORIES as readonly string[]).includes(v);
}
function clean(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
// Keep stored URLs to safe http(s) links only.
function cleanUrl(v: string | null | undefined): string | null {
  const t = clean(v, 500);
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : null;
}

function toNews(row: TradingNewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    source: row.source,
    url: row.url,
    category: isCategory(row.category) ? row.category : 'markets',
    impact: isImpact(row.impact) ? row.impact : 'medium',
    bias: isBias(row.bias) ? row.bias : 'neutral',
    publishedAt: row.publishedAt.getTime(),
  };
}

function toEvent(row: TradingCalendarRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    impact: isImpact(row.impact) ? row.impact : 'medium',
    eventTime: row.eventTime.getTime(),
    forecast: row.forecast,
    previous: row.previous,
    actual: row.actual,
  };
}

export async function getMarketNews(): Promise<MarketNewsData> {
  // The calendar is forward-looking, and the Forex Factory poller keeps it
  // densely populated, so window it to the last week plus everything upcoming —
  // ordered earliest-first — rather than letting old events crowd out the cap.
  const calWindowStart = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [headRows, calRows] = await Promise.all([
    db.select().from(tradingNews).orderBy(desc(tradingNews.publishedAt)).limit(200),
    db
      .select()
      .from(tradingCalendar)
      .where(gte(tradingCalendar.eventTime, calWindowStart))
      .orderBy(tradingCalendar.eventTime)
      .limit(400),
  ]);
  return { headlines: headRows.map(toNews), calendar: calRows.map(toEvent) };
}

// Timestamp (ms) of the most recently published headline, or 0 when there are
// none. Used by the hub's activity poll to flag and toast "new market news".
export async function latestNewsAt(): Promise<number> {
  const rows = await db
    .select({ publishedAt: tradingNews.publishedAt })
    .from(tradingNews)
    .orderBy(desc(tradingNews.publishedAt))
    .limit(1);
  return rows[0]?.publishedAt ? rows[0].publishedAt.getTime() : 0;
}

export interface NewsInput {
  title?: string;
  body?: string | null;
  source?: string | null;
  url?: string | null;
  category?: NewsCategory;
  impact?: NewsImpact;
  bias?: NewsBias;
  publishedAt?: number;
}

export async function addNews(authorId: string, input: NewsInput): Promise<MarketNewsData> {
  const title = (input.title ?? '').trim();
  if (!title) throw new Error('A headline is required');
  const now = new Date();
  await db.insert(tradingNews).values({
    id: crypto.randomUUID(),
    authorId,
    title: title.slice(0, 240),
    body: clean(input.body, 4000),
    source: clean(input.source, 80),
    url: cleanUrl(input.url),
    category: isCategory(input.category) ? input.category : 'markets',
    impact: isImpact(input.impact) ? input.impact : 'medium',
    bias: isBias(input.bias) ? input.bias : 'neutral',
    publishedAt: input.publishedAt ? new Date(input.publishedAt) : now,
    createdAt: now,
    updatedAt: now,
  });
  return getMarketNews();
}

export async function updateNews(id: string, input: NewsInput): Promise<MarketNewsData> {
  const patch: Partial<typeof tradingNews.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error('A headline is required');
    patch.title = t.slice(0, 240);
  }
  if (input.body !== undefined) patch.body = clean(input.body, 4000);
  if (input.source !== undefined) patch.source = clean(input.source, 80);
  if (input.url !== undefined) patch.url = cleanUrl(input.url);
  if (input.category !== undefined && isCategory(input.category)) patch.category = input.category;
  if (input.impact !== undefined && isImpact(input.impact)) patch.impact = input.impact;
  if (input.bias !== undefined && isBias(input.bias)) patch.bias = input.bias;
  if (input.publishedAt !== undefined) patch.publishedAt = new Date(input.publishedAt);
  await db.update(tradingNews).set(patch).where(eq(tradingNews.id, id));
  return getMarketNews();
}

export async function removeNews(id: string): Promise<MarketNewsData> {
  await db.delete(tradingNews).where(eq(tradingNews.id, id));
  return getMarketNews();
}

export interface EventInput {
  title?: string;
  country?: string | null;
  impact?: NewsImpact;
  eventTime?: number;
  forecast?: string | null;
  previous?: string | null;
  actual?: string | null;
}

export async function addEvent(authorId: string, input: EventInput): Promise<MarketNewsData> {
  const title = (input.title ?? '').trim();
  if (!title) throw new Error('An event name is required');
  if (!input.eventTime) throw new Error('An event time is required');
  const now = new Date();
  await db.insert(tradingCalendar).values({
    id: crypto.randomUUID(),
    authorId,
    title: title.slice(0, 160),
    country: clean(input.country, 40),
    impact: isImpact(input.impact) ? input.impact : 'medium',
    eventTime: new Date(input.eventTime),
    forecast: clean(input.forecast, 40),
    previous: clean(input.previous, 40),
    actual: clean(input.actual, 40),
    createdAt: now,
    updatedAt: now,
  });
  return getMarketNews();
}

export async function updateEvent(id: string, input: EventInput): Promise<MarketNewsData> {
  const patch: Partial<typeof tradingCalendar.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error('An event name is required');
    patch.title = t.slice(0, 160);
  }
  if (input.country !== undefined) patch.country = clean(input.country, 40);
  if (input.impact !== undefined && isImpact(input.impact)) patch.impact = input.impact;
  if (input.eventTime !== undefined) patch.eventTime = new Date(input.eventTime);
  if (input.forecast !== undefined) patch.forecast = clean(input.forecast, 40);
  if (input.previous !== undefined) patch.previous = clean(input.previous, 40);
  if (input.actual !== undefined) patch.actual = clean(input.actual, 40);
  await db.update(tradingCalendar).set(patch).where(eq(tradingCalendar.id, id));
  return getMarketNews();
}

export async function removeEvent(id: string): Promise<MarketNewsData> {
  await db.delete(tradingCalendar).where(eq(tradingCalendar.id, id));
  return getMarketNews();
}
