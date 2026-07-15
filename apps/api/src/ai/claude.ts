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
export async function askClaude(prompt: string, system?: string): Promise<string> {
  const message = await getClient().messages.create({
    model: config.ANTHROPIC_MODEL_DEFAULT,
    max_tokens: 4000,
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

// Sonnet 4.6 multi-turn chat — powers the global Ask Claude panel.
export async function chatClaude(messages: ChatMessage[], system?: string): Promise<string> {
  const message = await getClient().messages.create({
    model: config.ANTHROPIC_MODEL_DEFAULT,
    max_tokens: 4000,
    ...(system ? { system } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return textOf(message);
}

// The four Series 65 topics, mirrored from the web client (series65Questions.ts)
// so a generated card lands under the same filters the built-in deck uses.
export const SERIES65_TOPICS = [
  'Economics',
  'Investments',
  'Client Management',
  'Regulations & Ethics',
] as const;
export type Series65Topic = (typeof SERIES65_TOPICS)[number];

export interface Series65Definition {
  def: string;
  topic: Series65Topic;
}

// Generate a flashcard definition for a user-supplied Series 65 term: a concise
// exam-style definition plus the topic it belongs to. Used when the learner adds
// their own word to the flashcard deck.
export async function defineSeries65Term(term: string): Promise<Series65Definition> {
  const prompt = [
    `Define the term "${term}" as it applies to the Series 65 (Uniform Investment Adviser Law Exam).`,
    'Write a clear, exam-accurate definition of one to three sentences, the way a flashcard would phrase it.',
    `Also classify the term into exactly one of these four topics: ${SERIES65_TOPICS.join(', ')}.`,
    'Respond with ONLY a JSON object of the form {"def": "...", "topic": "..."} and nothing else.',
    'If the term is not a real finance or securities concept, still give your best concise definition and pick the closest topic.',
  ].join(' ');

  const raw = await askClaude(prompt);
  const parsed = extractJson(raw) as { def?: unknown; topic?: unknown } | null;

  const def = parsed && typeof parsed.def === 'string' ? parsed.def.trim() : '';
  if (!def) throw new Error('Could not generate a definition for that term');

  const topicRaw = parsed && typeof parsed.topic === 'string' ? parsed.topic.trim() : '';
  const topic =
    (SERIES65_TOPICS as readonly string[]).find((t) => t.toLowerCase() === topicRaw.toLowerCase()) ??
    'Investments';

  return { def: def.slice(0, 1000), topic: topic as Series65Topic };
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
    `A learner preparing for the Series 65 exam wants a focused practice subsection called "${name}".`,
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
