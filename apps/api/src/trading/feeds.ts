import crypto from 'node:crypto';
import { desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingNews, tradingCalendar, truthPosts, type NewsImpact, type TruthPostRow } from '../db/schema.js';
import { config } from '../config.js';
import { resolveOwnerId } from './alerts.js';

// Three best-effort scheduled pollers that populate the Market News area:
//   1. Finnhub market-news headlines (needs FINNHUB_API_KEY).
//   2. The Forex Factory economic calendar (free weekly JSON feed, no key).
//   3. A free, unofficial Truth Social feed of a single public account.
// External calls cannot be tested in this environment, so the fetch+normalize
// functions are pure and exported; all network and DB work is wrapped in
// try/catch so a failure can never crash the server.

// ---- Finnhub market news ----

export interface FinnhubNewsItem {
  title: string;
  body: string | null;
  source: string | null;
  url: string | null;
  publishedAt: number; // ms epoch
}

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// Pure normalizer for the Finnhub /news response. Drops items without a
// headline or url, newest first, capped at 20. Exported for unit testing.
export function mapFinnhubNews(json: unknown): FinnhubNewsItem[] {
  if (!Array.isArray(json)) return [];
  const items: FinnhubNewsItem[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = str(r.headline, 240);
    const url = str(r.url, 500);
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    const dt = typeof r.datetime === 'number' ? r.datetime : Number(r.datetime);
    const publishedAt = Number.isFinite(dt) && dt > 0 ? Math.round(dt * 1000) : Date.now();
    items.push({
      title,
      body: str(r.summary, 4000),
      source: str(r.source, 80),
      url,
      publishedAt,
    });
  }
  // Newest first, capped at ~20.
  items.sort((a, b) => b.publishedAt - a.publishedAt);
  return items.slice(0, 20);
}

const FINNHUB_URL = 'https://finnhub.io/api/v1/news?category=general&token=';

// Fetch the latest Finnhub general-market headlines and insert any new ones
// (deduped by url) into the shared tradingNews feed. No key -> no-op.
export async function ingestFinnhubNews(): Promise<void> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return;
  try {
    const res = await fetch(`${FINNHUB_URL}${encodeURIComponent(key)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`Finnhub news responded ${res.status}`);
      return;
    }
    const json = (await res.json()) as unknown;
    const items = mapFinnhubNews(json);
    if (items.length === 0) return;

    const authorId = await resolveOwnerId();
    if (!authorId) return;

    // Dedupe by url against the most recent rows so re-polling does not
    // duplicate headlines.
    const recent = await db
      .select({ url: tradingNews.url })
      .from(tradingNews)
      .orderBy(desc(tradingNews.publishedAt))
      .limit(500);
    const seen = new Set(recent.map((r) => r.url).filter((u): u is string => !!u));

    const now = new Date();
    for (const item of items) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      await db.insert(tradingNews).values({
        id: crypto.randomUUID(),
        authorId,
        title: item.title,
        body: item.body,
        source: item.source,
        url: item.url,
        category: 'markets',
        impact: 'medium',
        bias: 'neutral',
        publishedAt: new Date(item.publishedAt),
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.error('Finnhub news ingest failed:', err);
  }
}

// ---- Forex Factory economic calendar ----

export interface ForexFactoryEvent {
  title: string;
  country: string | null; // a currency/country code, e.g. "USD"
  impact: NewsImpact;
  eventTime: number; // ms epoch
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

// Map Forex Factory's impact words ("High"/"Medium"/"Low"/"Holiday") onto our
// three-level scale. Holidays and any non-economic / unknown level collapse to
// low so they still appear, just de-emphasised.
function ffImpact(v: unknown): NewsImpact {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('high')) return 'high';
  if (s.includes('medium') || s.includes('moderate')) return 'medium';
  return 'low';
}

// Pure normalizer for a Forex Factory weekly calendar JSON feed
// (nfs.faireconomy.media ff_calendar_*.json). Each entry carries a title, a
// currency/country code, an ISO date (with timezone offset), an impact word and
// forecast/previous/actual strings — actual is filled in once an event goes
// live. Drops entries without a title or a parseable time. Exported for testing.
export function mapForexFactoryCalendar(json: unknown): ForexFactoryEvent[] {
  if (!Array.isArray(json)) return [];
  const items: ForexFactoryEvent[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = str(r.title, 160);
    if (!title) continue;
    // The current feed uses a single ISO `date`; older variants split it into
    // `date` + `time`, so fall back to joining them when `date` alone fails.
    const rawDate = typeof r.date === 'string' ? r.date : '';
    let ms = Date.parse(rawDate);
    if (!Number.isFinite(ms) && rawDate && typeof r.time === 'string') {
      ms = Date.parse(`${rawDate} ${r.time}`);
    }
    if (!Number.isFinite(ms)) continue;
    items.push({
      title,
      country: str(r.country, 40),
      impact: ffImpact(r.impact),
      eventTime: ms,
      forecast: str(r.forecast, 40),
      previous: str(r.previous, 40),
      actual: str(r.actual, 40),
    });
  }
  return items;
}

const FOREX_FACTORY_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

function forexFactoryEnabled(): boolean {
  // On by default (it needs no API key); only an explicit 'false' disables it.
  return process.env.FOREX_FACTORY_ENABLED !== 'false';
}

// Natural dedupe key for a calendar event: the same currency + title at the
// same minute is the same release across polls. The calendar table has no
// upstream id column, so we key on content (mirroring how the Finnhub news feed
// dedupes by url).
function calKey(country: string | null, title: string, eventTimeMs: number): string {
  return `${(country ?? '').toLowerCase()}|${title.toLowerCase()}|${Math.round(eventTimeMs / 60000)}`;
}

// Fetch the this-week and next-week Forex Factory calendars and upsert them into
// the shared tradingCalendar feed: brand-new releases are inserted, and ones
// already present are updated in place so forecast/previous/actual values land
// as each event goes live. Best-effort — every failure is caught and logged.
export async function ingestForexFactory(): Promise<void> {
  if (!forexFactoryEnabled()) return;
  try {
    const events: ForexFactoryEvent[] = [];
    for (const url of FOREX_FACTORY_URLS) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': TRUTH_USER_AGENT, Accept: 'application/json' },
        });
        if (!res.ok) {
          console.error(`Forex Factory calendar responded ${res.status}`);
          continue;
        }
        events.push(...mapForexFactoryCalendar(await res.json()));
      } catch (err) {
        console.error('Forex Factory fetch failed:', err);
      }
    }
    if (events.length === 0) return;

    const authorId = await resolveOwnerId();
    if (!authorId) return;

    // Existing rows in the window the feeds cover (this week reaches a few days
    // back), keyed for dedupe/upsert.
    const windowStart = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const existing = await db
      .select({
        id: tradingCalendar.id,
        country: tradingCalendar.country,
        title: tradingCalendar.title,
        eventTime: tradingCalendar.eventTime,
        impact: tradingCalendar.impact,
        forecast: tradingCalendar.forecast,
        previous: tradingCalendar.previous,
        actual: tradingCalendar.actual,
      })
      .from(tradingCalendar)
      .where(gte(tradingCalendar.eventTime, windowStart));
    const byKey = new Map(existing.map((r) => [calKey(r.country, r.title, r.eventTime.getTime()), r]));

    const now = new Date();
    for (const ev of events) {
      const key = calKey(ev.country, ev.title, ev.eventTime);
      const prior = byKey.get(key);
      if (prior) {
        // Only write when an upstream value actually changed (e.g. the actual
        // just posted) to avoid pointless updates on every poll.
        if (
          prior.impact !== ev.impact ||
          prior.forecast !== ev.forecast ||
          prior.previous !== ev.previous ||
          prior.actual !== ev.actual
        ) {
          await db
            .update(tradingCalendar)
            .set({ impact: ev.impact, forecast: ev.forecast, previous: ev.previous, actual: ev.actual, updatedAt: now })
            .where(eq(tradingCalendar.id, prior.id));
        }
        continue;
      }
      const inserted = {
        id: crypto.randomUUID(),
        country: ev.country,
        title: ev.title,
        eventTime: new Date(ev.eventTime),
        impact: ev.impact,
        forecast: ev.forecast,
        previous: ev.previous,
        actual: ev.actual,
      };
      await db.insert(tradingCalendar).values({ ...inserted, authorId, createdAt: now, updatedAt: now });
      // Record it so the this-week / next-week overlap doesn't double-insert.
      byKey.set(key, inserted);
    }
  } catch (err) {
    console.error('Forex Factory ingest failed:', err);
  }
}

// ---- Truth Social ----

export interface TruthStatusItem {
  externalId: string;
  content: string; // plain text, HTML stripped
  url: string | null;
  postedAt: number; // ms epoch
}

export interface TruthPostView {
  id: string;
  author: string;
  content: string;
  url: string | null;
  postedAt: number; // ms epoch
}

// Strip HTML tags and decode a few common entities to plain text.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

// Pure normalizer for the Truth Social account statuses response. Strips HTML
// to plain text, caps length, drops empty items. Exported for unit testing.
export function mapTruthStatuses(json: unknown): TruthStatusItem[] {
  if (!Array.isArray(json)) return [];
  const items: TruthStatusItem[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const externalId = str(r.id, 80);
    if (!externalId) continue;
    const content = htmlToText(typeof r.content === 'string' ? r.content : '').slice(0, 2000);
    if (!content) continue;
    const rawUrl = str(r.url, 500);
    const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
    const created = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
    const postedAt = Number.isFinite(created) ? created : Date.now();
    items.push({ externalId, content, url, postedAt });
  }
  return items;
}

const TRUTH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

function truthAccountId(): string {
  return process.env.TRUTH_ACCOUNT_ID || '107780257626128497';
}

function truthEnabled(): boolean {
  // On by default; only an explicit 'false' disables it.
  return process.env.TRUTH_ENABLED !== 'false';
}

// Fetch the latest public statuses for the configured account and insert any
// new ones (deduped by externalId). The endpoint may 403/block; that is
// expected and is caught silently.
export async function ingestTruth(): Promise<void> {
  if (!truthEnabled()) return;
  try {
    const id = truthAccountId();
    const url = `https://truthsocial.com/api/v1/accounts/${encodeURIComponent(id)}/statuses?exclude_replies=true&limit=20`;
    const res = await fetch(url, {
      headers: { 'User-Agent': TRUTH_USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      // 403/blocked is expected for this free, unofficial feed; no-op.
      return;
    }
    const json = (await res.json()) as unknown;
    const items = mapTruthStatuses(json);
    if (items.length === 0) return;

    const ids = items.map((i) => i.externalId);
    const existing = await db
      .select({ externalId: truthPosts.externalId })
      .from(truthPosts)
      .where(inArray(truthPosts.externalId, ids));
    const seen = new Set(existing.map((r) => r.externalId));

    const now = new Date();
    for (const item of items) {
      if (seen.has(item.externalId)) continue;
      seen.add(item.externalId);
      await db.insert(truthPosts).values({
        id: crypto.randomUUID(),
        externalId: item.externalId,
        author: 'Donald Trump',
        content: item.content,
        url: item.url,
        postedAt: new Date(item.postedAt),
        createdAt: now,
      });
    }
  } catch (err) {
    console.error('Truth Social ingest failed:', err);
  }
}

function toView(row: TruthPostRow): TruthPostView {
  return {
    id: row.id,
    author: row.author,
    content: row.content,
    url: row.url,
    postedAt: row.postedAt.getTime(),
  };
}

// Newest-first list of mirrored Truth Social posts.
export async function listTruthPosts(limit = 50): Promise<TruthPostView[]> {
  const rows = await db
    .select()
    .from(truthPosts)
    .orderBy(desc(truthPosts.postedAt))
    .limit(limit);
  return rows.map(toView);
}

// Timestamp (ms) of the most recent post, or 0 when there are none. Used by the
// hub's activity poll to flag and toast a new post.
export async function latestTruthAt(): Promise<number> {
  const rows = await db
    .select({ postedAt: truthPosts.postedAt })
    .from(truthPosts)
    .orderBy(desc(truthPosts.postedAt))
    .limit(1);
  return rows[0]?.postedAt ? rows[0].postedAt.getTime() : 0;
}

// ---- Scheduler ----

const FEED_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// Start the background pollers. Only runs in production. Each poll is fired
// independently and is internally try/caught, so one feed failing never affects
// the other or the server. Does not block startup.
export function startFeeds(): void {
  if (!config.isProd) return;

  const runAll = () => {
    void ingestFinnhubNews().catch((err) => console.error('Finnhub poll error:', err));
    void ingestForexFactory().catch((err) => console.error('Forex Factory poll error:', err));
    void ingestTruth().catch((err) => console.error('Truth poll error:', err));
  };

  // Run once shortly after boot, then on a fixed interval.
  setTimeout(runAll, 15 * 1000);
  const timer = setInterval(runAll, FEED_INTERVAL_MS);
  // Do not keep the process alive solely for the poller.
  timer.unref?.();
}
