import crypto from 'node:crypto';
import { desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingNews, truthPosts, type TruthPostRow } from '../db/schema.js';
import { config } from '../config.js';
import { resolveOwnerId } from './alerts.js';

// Two best-effort scheduled pollers that populate the Market News area:
//   1. Finnhub market-news headlines (needs FINNHUB_API_KEY).
//   2. A free, unofficial Truth Social feed of a single public account.
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
    void ingestTruth().catch((err) => console.error('Truth poll error:', err));
  };

  // Run once shortly after boot, then on a fixed interval.
  setTimeout(runAll, 15 * 1000);
  const timer = setInterval(runAll, FEED_INTERVAL_MS);
  // Do not keep the process alive solely for the poller.
  timer.unref?.();
}
