import { NEWS_CATEGORIES, NEWS_IMPACTS, NEWS_BIASES, type NewsCategory, type NewsImpact, type NewsBias } from '../db/schema.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Turn a pasted blurb / article title into a structured headline draft for the
// shared Market News feed. Claude (Sonnet) classifies category, impact, and
// directional bias and tightens the headline. The draft is returned for the
// user to review and post — it is NOT auto-published to the shared feed.

export interface NewsDraft {
  title: string;
  body: string | null;
  source: string | null;
  url: string | null;
  category: NewsCategory;
  impact: NewsImpact;
  bias: NewsBias;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function pickEnum<T extends string>(v: unknown, allowed: readonly string[], fallback: T): T {
  return typeof v === 'string' && allowed.includes(v) ? (v as T) : fallback;
}

const SYSTEM = [
  'You are a markets desk editor. Turn a pasted blurb, article title, or note into ONE structured news headline and return ONLY a JSON object.',
  'Shape: {"title":string,"body":string|null,"source":string|null,"url":string|null,"category":"markets"|"geopolitical"|"economic"|"crypto"|"other","impact":"high"|"medium"|"low","bias":"bullish"|"bearish"|"neutral"}',
  'title is a tight, factual headline (<= 140 chars). body is a one-sentence context line or null. source is the outlet if identifiable (e.g. Reuters), else null. url only if a real link is present in the input, else null.',
  'category: economic = data/central banks; markets = equities/rates/FX/commodities; geopolitical = conflict/policy/elections; crypto = digital assets; other otherwise.',
  'impact = likely market impact. bias = directional lean for risk assets implied by the news (neutral if unclear). Do not invent a source or url.',
].join('\n');

export async function draftNews(blurb: string): Promise<NewsDraft> {
  const raw = await askClaude(`INPUT: ${blurb.trim()}`, SYSTEM);
  const p = (extractJson(raw) ?? {}) as Record<string, unknown>;
  const title = str(p.title) ?? blurb.trim().slice(0, 140);
  return {
    title: title.slice(0, 240),
    body: str(p.body) ?? null,
    source: str(p.source) ?? null,
    url: str(p.url) ?? null,
    category: pickEnum<NewsCategory>(p.category, NEWS_CATEGORIES, 'markets'),
    impact: pickEnum<NewsImpact>(p.impact, NEWS_IMPACTS, 'medium'),
    bias: pickEnum<NewsBias>(p.bias, NEWS_BIASES, 'neutral'),
  };
}
