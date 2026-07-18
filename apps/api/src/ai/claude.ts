import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

// Single place every Claude call goes through. The site default is Sonnet 4.6;
// trade screenshot analysis uses Opus 4.8 with vision. The API key lives only
// here (backend) — it never reaches the browser. When the key is absent, AI
// features report "not configured" instead of throwing.

export function aiConfigured(): boolean {
  return !!config.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) throw new Error('AI is not configured');
  if (!client) client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return client;
}

// Pull the concatenated text out of a Messages response (skips thinking blocks).
function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// Best-effort JSON extraction: strip code fences and grab the first {...} block.
export function extractJson(raw: string): unknown | null {
  const fenced = raw.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type AlertContext = {
  instrument?: string | null;
  side?: string | null;
  price?: number | null;
  strategy?: string | null;
  timeframe?: string | null;
  message?: string | null;
};

export interface TradeAnalysis {
  instrument: string | null;
  side: 'long' | 'short' | 'unknown';
  plannedEntry: number | null;
  actualFill: number | null;
  exit: number | null;
  slippage: string;
  setupQuality: string;
  risk: string;
  verdict: 'good' | 'acceptable' | 'poor' | 'unclear';
  summary: string;
}

export interface AnalyzeResult {
  raw: string; // the model's full text response
  parsed: TradeAnalysis | null; // structured form, when JSON parsed cleanly
  model: string;
}

const ANALYSIS_SYSTEM = `You are a senior trading coach reviewing a single funded-account (prop) trade from a chart screenshot. The trader fired a TradingView alert and then captured the chart at/after entry. Judge execution against the alert: did the fill match the planned price, was the setup valid, what is the risk.

Respond with ONLY a JSON object (no prose, no code fences) of exactly this shape:
{
  "instrument": string | null,
  "side": "long" | "short" | "unknown",
  "plannedEntry": number | null,
  "actualFill": number | null,
  "exit": number | null,
  "slippage": string,        // short assessment of fill vs. planned/alert price
  "setupQuality": string,    // brief read on whether the setup was valid
  "risk": string,            // stop placement / risk observations
  "verdict": "good" | "acceptable" | "poor" | "unclear",
  "summary": string          // 1-2 sentence plain-English takeaway
}
Use null for any price you cannot read. Keep each string under 240 characters.`;

function alertText(alert: AlertContext): string {
  const bits = [
    alert.instrument && `Instrument: ${alert.instrument}`,
    alert.side && `Side: ${alert.side}`,
    alert.price != null && `Alert price: ${alert.price}`,
    alert.strategy && `Strategy: ${alert.strategy}`,
    alert.timeframe && `Timeframe: ${alert.timeframe}`,
    alert.message && `Alert message: ${alert.message}`,
  ].filter(Boolean);
  return bits.length
    ? `The TradingView alert was:\n${bits.join('\n')}\n\nAnalyze the attached screenshot.`
    : 'Analyze the attached trade screenshot.';
}

// Opus 4.8 vision: analyze a pasted chart screenshot against the alert.
export async function analyzeTradeScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
  alert: AlertContext,
): Promise<AnalyzeResult> {
  const model = config.ANTHROPIC_MODEL_ANALYSIS;
  const message = await getClient().messages.create({
    model,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system: ANALYSIS_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: alertText(alert) },
        ],
      },
    ],
  });

  const raw = textOf(message);
  const json = extractJson(raw) as Partial<TradeAnalysis> | null;
  const parsed: TradeAnalysis | null = json
    ? {
        instrument: typeof json.instrument === 'string' ? json.instrument : alert.instrument ?? null,
        side: json.side === 'long' || json.side === 'short' ? json.side : 'unknown',
        plannedEntry: typeof json.plannedEntry === 'number' ? json.plannedEntry : null,
        actualFill: typeof json.actualFill === 'number' ? json.actualFill : null,
        exit: typeof json.exit === 'number' ? json.exit : null,
        slippage: typeof json.slippage === 'string' ? json.slippage : '',
        setupQuality: typeof json.setupQuality === 'string' ? json.setupQuality : '',
        risk: typeof json.risk === 'string' ? json.risk : '',
        verdict:
          json.verdict === 'good' || json.verdict === 'acceptable' || json.verdict === 'poor'
            ? json.verdict
            : 'unclear',
        summary: typeof json.summary === 'string' ? json.summary : raw.slice(0, 500),
      }
    : null;

  return { raw, parsed, model };
}

// The open position read off a broker order/positions screenshot, used to
// create a manual Live Wall position when the account has no API (a funded
// account where API trading is disallowed). Every numeric field is null when it
// cannot be read with confidence; the caller validates that an entry exists.
export interface ParsedPosition {
  instrument: string | null;
  side: 'long' | 'short' | 'unknown';
  units: number | null;
  entryPrice: number | null;
  currentPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  summary: string;
}

const POSITION_SYSTEM = `You read a single OPEN trade position from a broker or trading-platform screenshot (an order ticket, positions blotter, or filled-order confirmation). Extract the position so it can be tracked on a live wall.

Respond with ONLY a JSON object (no prose, no code fences) of exactly this shape:
{
  "instrument": string | null,   // e.g. "EUR/USD", "XAU/USD", "US30", "NVDA". Normalize forex to BASE/QUOTE with a slash.
  "side": "long" | "short" | "unknown",   // buy = long, sell = short
  "units": number | null,        // position size in units/contracts/shares/lots as shown (a raw number)
  "entryPrice": number | null,   // the average fill / entry / open price
  "currentPrice": number | null, // the current/market price if shown, else null
  "takeProfit": number | null,
  "stopLoss": number | null,
  "summary": string              // 1 sentence describing what you read
}
Read prices exactly as shown, preserving decimals. Use null for anything you cannot read with confidence. Keep the summary under 200 characters.`;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Opus 4.8 vision: read an open position off a broker/platform screenshot so it
// can be saved as a manual Live Wall position.
export async function parsePositionScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
): Promise<{ parsed: ParsedPosition; raw: string; model: string }> {
  const model = config.ANTHROPIC_MODEL_ANALYSIS;
  const message = await getClient().messages.create({
    model,
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    system: POSITION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extract the open position from this screenshot.' },
        ],
      },
    ],
  });

  const raw = textOf(message);
  const json = (extractJson(raw) ?? {}) as Partial<ParsedPosition>;
  const parsed: ParsedPosition = {
    instrument: typeof json.instrument === 'string' && json.instrument.trim() ? json.instrument.trim() : null,
    side: json.side === 'long' || json.side === 'short' ? json.side : 'unknown',
    units: num(json.units),
    entryPrice: num(json.entryPrice),
    currentPrice: num(json.currentPrice),
    takeProfit: num(json.takeProfit),
    stopLoss: num(json.stopLoss),
    summary: typeof json.summary === 'string' ? json.summary.slice(0, 200) : raw.slice(0, 200),
  };
  return { parsed, raw, model };
}

// The account balance/equity read off a prop-firm dashboard screenshot, used to
// keep the Account Metrics challenge equity current (FTP has no API). Fields are
// null when they cannot be read with confidence.
export interface ParsedAccount {
  balance: number | null; // cash/account balance
  equity: number | null; // balance + open P/L, when shown
  summary: string;
}

const ACCOUNT_SYSTEM = `You read the current ACCOUNT BALANCE and EQUITY from a prop-firm / funded-account dashboard screenshot (e.g. FTP / Match-Trader, a broker account summary).

Respond with ONLY a JSON object (no prose, no code fences) of exactly this shape:
{
  "balance": number | null,   // the account balance / cash, as a plain number (no currency symbol or thousands separators)
  "equity": number | null,    // the account equity (balance + open P/L) if shown separately, else null
  "summary": string           // 1 sentence describing what you read
}
Strip currency symbols and commas: "$201,450.50" becomes 201450.5. Use null for anything you cannot read with confidence. Keep the summary under 160 characters.`;

// Opus 4.8 vision: read the balance/equity off a funded-account screenshot.
export async function parseAccountScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
): Promise<{ parsed: ParsedAccount; raw: string; model: string }> {
  const model = config.ANTHROPIC_MODEL_ANALYSIS;
  const message = await getClient().messages.create({
    model,
    max_tokens: 1000,
    thinking: { type: 'adaptive' },
    system: ACCOUNT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Read the account balance and equity from this screenshot.' },
        ],
      },
    ],
  });
  const raw = textOf(message);
  const json = (extractJson(raw) ?? {}) as Partial<ParsedAccount>;
  const parsed: ParsedAccount = {
    balance: num(json.balance),
    equity: num(json.equity),
    summary: typeof json.summary === 'string' ? json.summary.slice(0, 160) : raw.slice(0, 160),
  };
  return { parsed, raw, model };
}

// One closed/open trade read off a funded-account trade-history screenshot.
export interface ParsedHistoryTrade {
  instrument: string | null;
  side: 'long' | 'short' | 'unknown';
  units: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  realizedPl: number | null;
  openedAt: string | null; // a date/time string as shown, parsed leniently by the caller
  closedAt: string | null;
}
export interface ParsedHistory {
  trades: ParsedHistoryTrade[];
  balance: number | null; // account balance, if the screenshot shows one
  equity: number | null; // account equity (balance + open P/L), if shown
  summary: string;
}

const HISTORY_SYSTEM = `You read a funded-account screenshot. It may show a list of TRADES (a blotter, closed-positions table, or statement) and/or the account BALANCE/EQUITY. Extract every trade row you can see, plus the account balance/equity if shown.

Respond with ONLY a JSON object (no prose, no code fences) of exactly this shape:
{
  "trades": [
    {
      "instrument": string | null,   // e.g. "EUR/USD", "XAU/USD", "US30", "NVDA". Normalize forex to BASE/QUOTE with a slash.
      "side": "long" | "short" | "unknown",   // buy = long, sell = short
      "units": number | null,        // size in lots/contracts/shares as shown
      "entryPrice": number | null,
      "exitPrice": number | null,
      "realizedPl": number | null,   // profit/loss for the trade, a plain number (negative for a loss)
      "openedAt": string | null,     // open date/time exactly as shown, else null
      "closedAt": string | null      // close date/time exactly as shown, else null
    }
  ],
  "balance": number | null,          // account balance / cash, if shown, else null
  "equity": number | null,           // account equity (balance + open P/L), if shown separately, else null
  "summary": string                  // 1 sentence: how many trades you read
}
Strip currency symbols and commas from numbers ("$201,450.50" -> 201450.5). Use null for any field you cannot read. Return an empty trades array if you can read none. Keep the summary under 160 characters.`;

function parseSide(v: unknown): 'long' | 'short' | 'unknown' {
  return v === 'long' || v === 'short' ? v : 'unknown';
}

// Opus 4.8 vision: read every trade off a trade-history screenshot.
export async function parseTradeHistoryScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
): Promise<{ parsed: ParsedHistory; raw: string; model: string }> {
  const model = config.ANTHROPIC_MODEL_ANALYSIS;
  const message = await getClient().messages.create({
    model,
    max_tokens: 3000,
    thinking: { type: 'adaptive' },
    system: HISTORY_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extract every trade from this trade-history screenshot.' },
        ],
      },
    ],
  });
  const raw = textOf(message);
  const json = (extractJson(raw) ?? {}) as { trades?: unknown; balance?: unknown; equity?: unknown; summary?: unknown };
  const rawTrades = Array.isArray(json.trades) ? json.trades : [];
  const trades: ParsedHistoryTrade[] = rawTrades.map((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    return {
      instrument: typeof o.instrument === 'string' && o.instrument.trim() ? o.instrument.trim() : null,
      side: parseSide(o.side),
      units: num(o.units),
      entryPrice: num(o.entryPrice),
      exitPrice: num(o.exitPrice),
      realizedPl: num(o.realizedPl),
      openedAt: typeof o.openedAt === 'string' ? o.openedAt.slice(0, 40) : null,
      closedAt: typeof o.closedAt === 'string' ? o.closedAt.slice(0, 40) : null,
    };
  });
  const parsed: ParsedHistory = {
    trades,
    balance: num(json.balance),
    equity: num(json.equity),
    summary: typeof json.summary === 'string' ? json.summary.slice(0, 160) : raw.slice(0, 160),
  };
  return { parsed, raw, model };
}

// Sonnet 4.6: the site-wide assistant (Ask Claude, product knowledge, parsing).
// maxTokens defaults to 4000; question-generation passes a larger budget since a
// deck of up to 50 four-option questions with explanations is a big response.
export async function askClaude(prompt: string, system?: string, maxTokens = 4000): Promise<string> {
  const message = await getClient().messages.create({
    model: config.ANTHROPIC_MODEL_DEFAULT,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  return textOf(message);
}

// ---- Market-news read (bias + impact + trade-impact note) ----

// One headline handed to the summarizer.
export interface NewsForRead {
  title: string;
  source: string | null;
  category: string;
}

// Claude's read of a single headline for this desk: a directional bias, a market
// impact level, and one concrete sentence on how it could affect the desk's
// trading. Aligned by index to the input list.
export interface NewsRead {
  bias: 'bullish' | 'bearish' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  summary: string;
}

const NEWS_READ_SYSTEM = `You are a trading-desk analyst. The desk trades ONLY these instruments: EUR/USD (forex), Bitcoin, gold (futures), Nasdaq-100 (futures), and the S&P 500 (SPY ETF + futures). The trader is also an investment adviser. For EACH numbered headline, judge it FROM THE DESK'S PERSPECTIVE:
- "bias": the directional lean for the desk — "bullish", "bearish", or "neutral". If the headline is about one of the desk's instruments, judge that instrument. If it is broad macro/rates/risk news, judge risk assets (Nasdaq, S&P, Bitcoin). If it is about something the desk does NOT trade (e.g. a single stock, another country), judge only the read-through to the desk's markets; if there is no meaningful read-through, use "neutral". Use "neutral" when genuinely two-sided or unclear.
- "impact": how much it could move the DESK'S markets specifically — "high", "medium", or "low". Use "low" when it barely touches the desk's instruments.
- "note": ONE sentence, written TO THIS TRADER, on the read-through to the desk's positions — name the specific desk instrument(s) it bears on (EUR/USD, Bitcoin, gold, Nasdaq, or S&P) and the likely direction. Do NOT just restate or summarize the headline; connect it to what the desk trades. If it has little bearing on the desk, say so plainly (e.g. "Little direct read-through to our books; a single-name story."). Under 200 characters, plain text.

Respond with ONLY a JSON object of exactly this shape and nothing else:
{"reads":[{"i":<the headline number>,"bias":"bullish|bearish|neutral","impact":"high|medium|low","note":"..."}]}
Return one entry per headline using its number as "i". No prose or code fences outside the JSON.`;

function isBiasWord(v: unknown): v is NewsRead['bias'] {
  return v === 'bullish' || v === 'bearish' || v === 'neutral';
}
function isImpactWord(v: unknown): v is NewsRead['impact'] {
  return v === 'high' || v === 'medium' || v === 'low';
}

// Sonnet: read a batch of headlines in a single call and return a bias/impact/
// trade-note for each, aligned to the input order. Any headline the model omits
// (or the whole call, if it fails to parse) falls back to a neutral/medium read
// with an empty note, so the caller can always map 1:1 over its input.
export async function summarizeNewsItems(items: NewsForRead[]): Promise<NewsRead[]> {
  const fallback: NewsRead[] = items.map(() => ({ bias: 'neutral', impact: 'medium', summary: '' }));
  if (items.length === 0) return fallback;

  const list = items
    .map((it, i) => `${i}. [${it.category}${it.source ? ` · ${it.source}` : ''}] ${it.title}`)
    .join('\n');
  const raw = await askClaude(`Headlines:\n${list}`, NEWS_READ_SYSTEM);
  const parsed = extractJson(raw) as { reads?: unknown } | null;
  const reads = Array.isArray(parsed?.reads) ? (parsed!.reads as unknown[]) : [];

  const out = [...fallback];
  for (const r of reads) {
    const o = (r ?? {}) as Record<string, unknown>;
    const i = typeof o.i === 'number' ? o.i : Number(o.i);
    if (!Number.isInteger(i) || i < 0 || i >= out.length) continue;
    out[i] = {
      bias: isBiasWord(o.bias) ? o.bias : 'neutral',
      impact: isImpactWord(o.impact) ? o.impact : 'medium',
      summary: typeof o.note === 'string' ? o.note.trim().slice(0, 400) : '',
    };
  }
  return out;
}

// ---- Economic-calendar explainers (plain-language "what is this release?") ----

const CAL_EXPLAIN_SYSTEM = `You explain economic-calendar releases to a non-expert. For EACH numbered release title, write ONE clear, plain-language sentence a layman can understand: what the release measures and why traders watch it (its market effect). Avoid jargon; if a term is unavoidable, gloss it in a few words. Under 200 characters.

Respond with ONLY a JSON object of exactly this shape and nothing else:
{"items":[{"i":<the title number>,"text":"..."}]}
Return one entry per title using its number as "i". No prose or code fences outside the JSON.`;

// Sonnet: explain a batch of economic-calendar release titles in one call.
// Returns explanations aligned to the input order; any title the model omits
// (or the whole call, on a parse failure) falls back to an empty string.
export async function explainCalendarTitles(titles: string[]): Promise<string[]> {
  const fallback = titles.map(() => '');
  if (titles.length === 0) return fallback;

  const list = titles.map((t, i) => `${i}. ${t}`).join('\n');
  const raw = await askClaude(`Release titles:\n${list}`, CAL_EXPLAIN_SYSTEM);
  const parsed = extractJson(raw) as { items?: unknown } | null;
  const items = Array.isArray(parsed?.items) ? (parsed!.items as unknown[]) : [];

  const out = [...fallback];
  for (const it of items) {
    const o = (it ?? {}) as Record<string, unknown>;
    const i = typeof o.i === 'number' ? o.i : Number(o.i);
    if (!Number.isInteger(i) || i < 0 || i >= out.length) continue;
    out[i] = typeof o.text === 'string' ? o.text.trim().slice(0, 400) : '';
  }
  return out;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Sonnet 4.6 multi-turn chat — powers the global Ask Claude panel. maxTokens
// defaults to 4000; the study-guide builder passes a larger budget since a draft
// of many slides is a big JSON response.
export async function chatClaude(messages: ChatMessage[], system?: string, maxTokens = 4000): Promise<string> {
  const message = await getClient().messages.create({
    model: config.ANTHROPIC_MODEL_DEFAULT,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return textOf(message);
}

export interface TermDefinition {
  def: string;
  topic: string;
}

// Generate a flashcard definition for a user-supplied term: a concise definition
// plus a short topic label VTS AI picks. Used when a learner adds their own word
// to their personal flashcard deck without typing a definition.
export async function defineTerm(term: string): Promise<TermDefinition> {
  const prompt = [
    `Define the term "${term}" concisely, the way a study flashcard would phrase it.`,
    'Write a clear, accurate definition of one to three sentences.',
    'Also give a short topic label (one to three words) for the subject area the term belongs to.',
    'Respond with ONLY a JSON object of the form {"def": "...", "topic": "..."} and nothing else.',
    'If the term is obscure, still give your best concise definition and closest topic label.',
  ].join(' ');

  const raw = await askClaude(prompt);
  const parsed = extractJson(raw) as { def?: unknown; topic?: unknown } | null;

  const def = parsed && typeof parsed.def === 'string' ? parsed.def.trim() : '';
  if (!def) throw new Error('Could not generate a definition for that term');

  const topicRaw = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : '';
  const topic = (topicRaw || 'General').slice(0, 60);

  return { def: def.slice(0, 1000), topic };
}

// One question, condensed to what Claude needs to judge topical fit.
export interface ClassifyQuestion {
  id: number;
  stem: string;
  topic?: string;
}

// Build a custom Study Game subsection: given a learner-chosen name (e.g.
// "Bonds", "Compliance") and the question bank, ask Claude which questions
// belong in that subsection. Returns the matching ids, filtered to ones that
// were actually in the supplied bank so the model can't invent references.
export async function classifyQuestionsIntoSection(
  name: string,
  questions: ClassifyQuestion[],
): Promise<number[]> {
  const list = questions
    .map((q) => `${q.id}\t${q.topic ? `[${q.topic}] ` : ''}${q.stem}`)
    .join('\n');
  const prompt = [
    `A learner wants a focused practice subsection called "${name}".`,
    `From the numbered question bank below, choose the id of EVERY question whose subject matter fits "${name}".`,
    'Include closely related concepts, but exclude questions that are clearly about something else.',
    'Each line is: id<TAB>[broad topic] question stem.',
    'Respond with ONLY a JSON object of the form {"ids":[1,2,3]} listing the matching ids, and nothing else. If none fit, return {"ids":[]}.',
    '',
    'QUESTION BANK:',
    list,
  ].join('\n');

  const raw = await askClaude(prompt);
  const parsed = extractJson(raw) as { ids?: unknown } | null;
  const rawIds = Array.isArray(parsed?.ids) ? (parsed!.ids as unknown[]) : [];

  const valid = new Set(questions.map((q) => q.id));
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isInteger(n) && valid.has(n) && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

// ---- Team study-deck question generation ----
// A team builds its own quiz: either AI-generated from a topic, or authored by
// Claude from an uploaded text file (their own questions, or source notes). Both
// paths produce the same structured multiple-choice shape. Answer-key
// correctness is the model's; we validate STRUCTURE only (exactly four labelled
// options, one valid answer, a non-empty stem) and assign question numbers/ids
// server-side (see deckStore) — the model can never inject those.

const LETTERS = ['A', 'B', 'C', 'D'] as const;
type QLetter = (typeof LETTERS)[number];

export interface GeneratedQuestion {
  stem: string;
  options: { label: QLetter; text: string }[];
  answer: QLetter;
  topic: string; // a short category label (grouped into 2–5 across the set)
  explanation: string;
}

// Coerce a raw model question into our shape, or null if it is structurally
// unusable. `categories`, when non-empty, constrains the topic; otherwise the
// model's own short label is kept (falling back to `fallbackTopic`).
function coerceQuestion(
  raw: unknown,
  categories: string[],
  fallbackTopic: string,
): GeneratedQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const stem = typeof o.stem === 'string' ? o.stem.trim() : '';
  if (!stem) return null;

  const rawOpts = Array.isArray(o.options) ? o.options : [];
  const byLabel = new Map<QLetter, string>();
  for (const opt of rawOpts) {
    const oo = (opt ?? {}) as Record<string, unknown>;
    const label = typeof oo.label === 'string' ? (oo.label.trim().toUpperCase() as string) : '';
    const text = typeof oo.text === 'string' ? oo.text.trim() : '';
    if ((LETTERS as readonly string[]).includes(label) && text && !byLabel.has(label as QLetter)) {
      byLabel.set(label as QLetter, text);
    }
  }
  // Require exactly the four labelled options A–D.
  if (LETTERS.some((l) => !byLabel.has(l))) return null;
  const options = LETTERS.map((l) => ({ label: l, text: byLabel.get(l)! }));

  const answer = typeof o.answer === 'string' ? (o.answer.trim().toUpperCase() as string) : '';
  if (!(LETTERS as readonly string[]).includes(answer)) return null;

  const rawTopic = typeof o.topic === 'string' ? o.topic.trim() : '';
  let topic = rawTopic || fallbackTopic;
  if (categories.length) {
    const hit = categories.find((c) => c.toLowerCase() === rawTopic.toLowerCase());
    topic = hit ?? categories[0];
  }
  topic = topic.slice(0, 40) || fallbackTopic;

  const explanation = typeof o.explanation === 'string' ? o.explanation.trim().slice(0, 400) : '';
  return { stem: stem.slice(0, 600), options, answer: answer as QLetter, topic, explanation };
}

// Parse + validate the model's {"questions":[...]} response into clean questions,
// deduped by normalized stem and capped at `count`. Exported so the structural
// contract can be unit-tested without a live model call.
export function parseGeneratedQuestions(
  raw: string,
  count: number,
  categories: string[] = [],
  fallbackTopic = 'General',
): GeneratedQuestion[] {
  const parsed = extractJson(raw) as { questions?: unknown } | null;
  const list = Array.isArray(parsed?.questions) ? (parsed!.questions as unknown[]) : [];
  const out: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const q = coerceQuestion(item, categories, fallbackTopic);
    if (!q) continue;
    const key = q.stem.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= count) break;
  }
  return out;
}

// A generous token budget for a deck: ~200 tokens per question plus overhead.
function deckMaxTokens(count: number): number {
  return Math.min(16000, 1200 + count * 220);
}

const DECK_FORMAT = [
  'Respond with ONLY a JSON object of exactly this shape and nothing else:',
  '{"questions":[{"stem":"...","options":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],"answer":"A","topic":"...","explanation":"..."}]}',
  'Rules: every question has EXACTLY four options labelled A, B, C, and D; exactly one is correct and named in "answer"; "explanation" is ONE short sentence saying why the answer is right; "topic" is a short category label — reuse a small set of 2–5 topics across the whole set. No prose or code fences outside the JSON.',
].join('\n');

// AI-generate a fresh quiz from a topic the team named (plus optional extra
// instructions). Returns validated questions; the caller stores them.
export async function generateDeckQuestions(input: {
  topic: string;
  instructions?: string;
  count: number;
}): Promise<GeneratedQuestion[]> {
  const count = Math.max(1, Math.min(50, Math.floor(input.count) || 0));
  const system = `You are an expert exam-question author. Write clear, self-contained multiple-choice practice questions that test real understanding of the subject the user names. Vary difficulty. Do not repeat questions. ${DECK_FORMAT}`;
  const prompt = [
    `Write ${count} multiple-choice questions about: ${input.topic}.`,
    input.instructions ? `Additional instructions from the author: ${input.instructions}` : '',
    `Produce exactly ${count} questions.`,
  ]
    .filter(Boolean)
    .join('\n');
  const raw = await askClaude(prompt, system, deckMaxTokens(count));
  return parseGeneratedQuestions(raw, count, [], input.topic.trim().slice(0, 40) || 'General');
}

// Split a big blob of study text into bounded chunks so each is parsed by its
// own (fast) model call. Breaks on blank lines first — usually the gap between
// questions — then hard-splits any single piece that is still oversized.
function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];
  const pieces: string[] = [];
  for (const para of trimmed.split(/\n\s*\n/)) {
    let p = para;
    while (p.length > maxChars) {
      pieces.push(p.slice(0, maxChars));
      p = p.slice(maxChars);
    }
    if (p.trim()) pieces.push(p);
  }
  const chunks: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (cur && cur.length + piece.length + 2 > maxChars) {
      chunks.push(cur);
      cur = piece;
    } else {
      cur = cur ? `${cur}\n\n${piece}` : piece;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

// Run an async fn over items with a cap on how many run at once (keeps us under
// the model's concurrency/rate ceiling while still parsing chunks in parallel).
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// Build a quiz from an uploaded text file: either parse questions already in the
// text, or author questions from the source material / instructions it contains.
// A big file is split into bounded chunks parsed in parallel — one giant model
// call on the whole file runs long enough to hit the gateway's request timeout
// (a 524), and it also lets a full question bank come through instead of being
// capped at a single call's worth. Results are combined and de-duped by stem.
export async function parseDeckFromText(input: {
  text: string;
  instructions?: string;
  count?: number;
}): Promise<GeneratedQuestion[]> {
  const overallCap = Math.max(1, Math.min(200, Math.floor(input.count ?? 200) || 200));
  const system = `You are an expert exam-question author. You are given a text file (or a section of one) from a study author. It may ALREADY contain questions (with or without answers) — in that case, parse them faithfully and preserve their wording and intended answers. Or it may be source notes, an outline, or instructions — in that case, author questions from that material. Include EVERY question present in the material; do not skip any and do not add extras. Do not invent facts beyond the supplied material. ${DECK_FORMAT}`;
  const chunks = chunkText(input.text, 6000);
  const perChunk = await mapLimit(chunks, 6, async (chunk) => {
    const prompt = [
      'Turn the following material into multiple-choice questions — one per question found in it.',
      input.instructions ? `Additional instructions from the author: ${input.instructions}` : '',
      '',
      'MATERIAL:',
      chunk,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const raw = await askClaude(prompt, system, 6000);
      return parseGeneratedQuestions(raw, 100, [], 'General');
    } catch {
      // A single chunk failing (e.g. a transient rate limit) shouldn't sink the
      // whole upload — the author reviews the result and can regenerate.
      return [] as GeneratedQuestion[];
    }
  });

  const out: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  for (const q of perChunk.flat()) {
    const key = q.stem.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= overallCap) break;
  }
  return out;
}

// ---- Team flashcard-set generation ----
// A team builds its own flashcard set: either AI-generated from a topic, or
// authored by Claude from an uploaded text file (a glossary, notes, or a list
// of term/definition pairs). Both paths produce the same {term, def, topic}
// shape. As with decks we validate STRUCTURE only (a non-empty term and
// definition) and assign card numbers/ids server-side (see flashcardStore).

export interface GeneratedFlashcard {
  term: string;
  def: string;
  topic: string | null; // a short optional category label
}

function coerceFlashcard(raw: unknown): GeneratedFlashcard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const term = typeof o.term === 'string' ? o.term.trim() : '';
  const def = typeof o.def === 'string' ? o.def.trim() : '';
  if (!term || !def) return null;
  const rawTopic = typeof o.topic === 'string' ? o.topic.trim() : '';
  return { term: term.slice(0, 300), def: def.slice(0, 2000), topic: rawTopic ? rawTopic.slice(0, 60) : null };
}

// Parse + validate the model's {"cards":[...]} response into clean flashcards,
// deduped by normalized term and capped at `cap`. Exported so the structural
// contract can be unit-tested without a live model call.
export function parseGeneratedFlashcards(raw: string, cap: number): GeneratedFlashcard[] {
  const parsed = extractJson(raw) as { cards?: unknown } | null;
  const list = Array.isArray(parsed?.cards) ? (parsed!.cards as unknown[]) : [];
  const out: GeneratedFlashcard[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const c = coerceFlashcard(item);
    if (!c) continue;
    const key = c.term.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}

const FLASHCARD_FORMAT = [
  'Respond with ONLY a JSON object of exactly this shape and nothing else:',
  '{"cards":[{"term":"...","def":"...","topic":"..."}]}',
  'Rules: "term" is a short word or phrase; "def" is a clear, concise definition of one to three sentences; "topic" is a short optional category label — reuse a small set of 2–5 topics across the whole set (use "" if there is no natural topic). No prose or code fences outside the JSON.',
].join('\n');

// AI-generate a fresh flashcard set from a topic the team named (plus optional
// extra instructions). Returns validated cards; the caller stores them.
export async function generateFlashcards(input: {
  topic: string;
  instructions?: string;
  count: number;
}): Promise<GeneratedFlashcard[]> {
  const count = Math.max(1, Math.min(60, Math.floor(input.count) || 0));
  const system = `You are an expert study-material author. Write clear, self-contained flashcards (a term and its definition) that teach real understanding of the subject the user names. Vary difficulty. Do not repeat terms. ${FLASHCARD_FORMAT}`;
  const prompt = [
    `Write ${count} flashcards about: ${input.topic}.`,
    input.instructions ? `Additional instructions from the author: ${input.instructions}` : '',
    `Produce exactly ${count} cards.`,
  ]
    .filter(Boolean)
    .join('\n');
  const raw = await askClaude(prompt, system, Math.min(16000, 1000 + count * 160));
  return parseGeneratedFlashcards(raw, count);
}

// Build a flashcard set from an uploaded text file: parse term/definition pairs
// already present (a glossary, "term - definition" lines, etc.), or author cards
// from source notes. A big file is split into bounded chunks parsed in parallel
// (same reasoning as parseDeckFromText — avoids a single long call timing out and
// lets a full glossary come through). Results are combined and de-duped by term.
export async function parseFlashcardsFromText(input: {
  text: string;
  instructions?: string;
  cap?: number;
}): Promise<GeneratedFlashcard[]> {
  const overallCap = Math.max(1, Math.min(400, Math.floor(input.cap ?? 400) || 400));
  const system = `You are an expert study-material author. You are given a text file (or a section of one) from a study author. It may ALREADY contain term/definition pairs (a glossary, "term - definition" lines, or similar) — in that case, parse them faithfully and preserve their wording. Or it may be source notes or an outline — in that case, pull out the key terms and write a concise definition for each. Include EVERY term present in the material; do not skip any and do not invent facts beyond the supplied material. ${FLASHCARD_FORMAT}`;
  const chunks = chunkText(input.text, 6000);
  const perChunk = await mapLimit(chunks, 6, async (chunk) => {
    const prompt = [
      'Turn the following material into flashcards — one per term found in it.',
      input.instructions ? `Additional instructions from the author: ${input.instructions}` : '',
      '',
      'MATERIAL:',
      chunk,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const raw = await askClaude(prompt, system, 6000);
      return parseGeneratedFlashcards(raw, 200);
    } catch {
      // A single chunk failing shouldn't sink the whole upload — the author
      // reviews the result and can regenerate.
      return [] as GeneratedFlashcard[];
    }
  });

  const out: GeneratedFlashcard[] = [];
  const seen = new Set<string>();
  for (const c of perChunk.flat()) {
    const key = c.term.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= overallCap) break;
  }
  return out;
}

// ---- Team study-guide builder (a slide presentation, built by conversation) ----
// A team builds a study guide — a presentation of titled slides, each with a
// short body — through a back-and-forth chat. Claude drafts and revises the
// slide TEXT; the author attaches screenshots to slides themselves (the model
// never sees or emits images). On every turn the model returns BOTH a
// conversational reply and the complete current slide draft, so the client can
// show the chat and a live preview that survives edits.

// One slide as the model returns it. `id` echoes an id from the previous draft
// (so the client can preserve a screenshot the author attached to that slide) or
// is the literal "new" for a slide the model just created.
export interface GuideDraftSlide {
  id: string;
  title: string;
  body: string;
}

export interface GuideChatResult {
  reply: string;
  slides: GuideDraftSlide[];
}

const GUIDE_SYSTEM = [
  'You help a user build a STUDY GUIDE presentation — an ordered slideshow of slides, each with a short title and a body — through a back-and-forth conversation. You write and revise the slide TEXT only; the user attaches any screenshots themselves, so never mention adding images yourself.',
  'On EVERY turn respond with ONLY a JSON object of exactly this shape and nothing else (no prose or code fences outside it):',
  '{"reply":"a short, friendly message to the user about what you changed or a question back to them","slides":[{"id":"s1","title":"...","body":"..."}]}',
  'Rules:',
  '- "slides" is the COMPLETE current draft in presentation order every time — never a partial list of just the changes.',
  '- Preserve the "id" of any slide you keep from the previous draft (the previous draft is shown in your last message). For a brand-new slide, set "id" to "new".',
  '- Keep each "body" concise enough for one slide — a few short sentences or a handful of bullet lines. Use "\\n" for line breaks; do not use markdown headings.',
  '- The user may ask you to add, remove, reorder, rewrite, split, or merge slides — reflect all of it in the returned array.',
  '- Aim for a clear teaching flow: an opening/overview slide, focused topic slides, and a short recap. Only produce slides the material supports.',
].join('\n');

function coerceDraftSlides(raw: unknown): GuideDraftSlide[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: GuideDraftSlide[] = [];
  for (const item of list) {
    const o = (item ?? {}) as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 200) : '';
    const body = typeof o.body === 'string' ? o.body.trim().slice(0, 4000) : '';
    if (!title && !body) continue;
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 40) : 'new';
    out.push({ id, title, body });
    if (out.length >= 40) break;
  }
  return out;
}

// Parse the model's {"reply":...,"slides":[...]} turn. Exported so the structural
// contract can be unit-tested without a live model call.
export function parseGuideChat(raw: string): GuideChatResult {
  const parsed = extractJson(raw) as { reply?: unknown; slides?: unknown } | null;
  const reply =
    parsed && typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim().slice(0, 2000)
      : 'Here is the updated draft.';
  return { reply, slides: coerceDraftSlides(parsed?.slides) };
}

// Run one turn of the study-guide builder conversation. `messages` is the running
// transcript; the assistant turns carry the model's own prior JSON (so it sees
// the previous slide draft and its ids). Returns the reply plus the full draft.
export async function chatStudyGuide(messages: ChatMessage[]): Promise<GuideChatResult> {
  const raw = await chatClaude(messages, GUIDE_SYSTEM, 8000);
  return parseGuideChat(raw);
}
