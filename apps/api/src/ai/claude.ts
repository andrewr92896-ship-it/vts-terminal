import { completeText, completeVision, textModel } from './provider.js';

// The terminal's AI flows: what to ask, and how to read the answer. WHICH
// provider serves them, and the request shape it wants, lives in provider.ts —
// so everything below is about prompts and parsing rather than about a vendor.
//
// The file is still called claude.ts: nineteen modules import from it, and the
// name is an internal identifier rather than anything a user reads. Renaming it
// is a rename of nineteen imports for no behavioural gain.

export { aiConfigured } from './provider.js';

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

// Vision: analyze a pasted chart screenshot against the alert.
export async function analyzeTradeScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
  alert: AlertContext,
): Promise<AnalyzeResult> {
  const { text: raw, model } = await completeVision({
    imageBase64, mediaType, system: ANALYSIS_SYSTEM, prompt: alertText(alert),
    maxTokens: 2000, thinking: true, json: true,
  });
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

// Vision: read an open position off a broker/platform screenshot so it can be
// saved as a manual Live Wall position.
export async function parsePositionScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
): Promise<{ parsed: ParsedPosition; raw: string; model: string }> {
  const { text: raw, model } = await completeVision({
    imageBase64, mediaType, system: POSITION_SYSTEM,
    prompt: 'Extract the open position from this screenshot.',
    maxTokens: 1500, thinking: true, json: true,
  });
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

// Vision: read the balance/equity off a funded-account screenshot.
export async function parseAccountScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
): Promise<{ parsed: ParsedAccount; raw: string; model: string }> {
  const { text: raw, model } = await completeVision({
    imageBase64, mediaType, system: ACCOUNT_SYSTEM,
    prompt: 'Read the account balance and equity from this screenshot.',
    maxTokens: 1000, thinking: true, json: true,
  });
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

// Vision: read every trade off a trade-history screenshot.
export async function parseTradeHistoryScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
): Promise<{ parsed: ParsedHistory; raw: string; model: string }> {
  const { text: raw, model } = await completeVision({
    imageBase64, mediaType, system: HISTORY_SYSTEM,
    prompt: 'Extract every trade from this trade-history screenshot.',
    maxTokens: 3000, thinking: true, json: true,
  });
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

// The site-wide assistant (Ask VTS AI, product knowledge, parsing).
// maxTokens defaults to 4000; question-generation passes a larger budget since a
// batch of four-option questions with explanations is a big response.
export async function askClaude(prompt: string, system?: string, maxTokens = 4000): Promise<string> {
  return completeText({ turns: [{ role: 'user', content: prompt }], system, maxTokens });
}

// ---- Market-hours lookup (fills a Strategy Session's weekly schedule) ----
// Given a trading instrument's symbol, work out its regular cash/most-active
// trading hours in Eastern Time for each weekday, so a session can be set to run
// during the whole time the market is open. Forex and crypto trade nearly
// around the clock (respecting the daily 5pm ET rollover / Fri close); equities
// and index/commodity futures have defined RTH windows. Returns per-weekday
// windows plus a short human note.

export interface MarketHoursDay {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  open: string; // ET 'HH:MM'
  close: string; // ET 'HH:MM'
}
export interface MarketHoursResult {
  days: MarketHoursDay[];
  note: string;
  model: string;
}

const MARKET_HOURS_SYSTEM = `You are a market-hours reference. Given a trading instrument's symbol or name, return the hours it is normally open for trading, expressed in US Eastern Time (America/New_York), for EVERY day of the week it trades — including the Sunday-evening open when the market has one. The trading week does not start at Monday 00:00 for instruments that open Sunday evening.

Each day carries a SINGLE open→close window. A market's ~6-minute daily rollover/maintenance break is negligible for this purpose: treat a continuously-open weekday as 00:00–23:59 ET rather than splitting it into two windows.

Guidance by asset class (return exactly these days/windows unless the symbol clearly differs):
- US stocks / ETFs (e.g. SPY, NVDA): regular session 09:30–16:00 ET, Mon–Fri only. No weekend, no Sunday.
- Spot forex (e.g. EUR/USD, GBP/USD): opens Sunday evening and runs continuously to Friday afternoon ET. Return sun 17:00–23:59; mon, tue, wed, thu each 00:00–23:59; fri 00:00–17:00. No Saturday.
- Index & commodity futures (e.g. Nasdaq/NQ, S&P/ES, Gold/GC): opens Sunday evening and runs nearly 24h to Friday afternoon ET. Return sun 18:00–23:59; mon, tue, wed, thu each 00:00–23:59; fri 00:00–17:00. No Saturday.
- Crypto (e.g. BTC, ETH): trades 24/7; return all seven days (sun,mon,tue,wed,thu,fri,sat) as 00:00–23:59 ET.
Pick the interpretation that best matches the symbol. Use 24-hour HH:MM. If a day is closed, omit it.

Respond with ONLY a JSON object of exactly this shape and nothing else (no prose or code fences):
{"days":[{"day":"sun","open":"17:00","close":"23:59"}, ...],"note":"one short sentence naming the asset class and its hours"}
Include one entry per open day using the lowercase 3-letter day key (sun,mon,tue,wed,thu,fri,sat). Keep the note under 160 characters.`;

const HHMM_RE = /^\d{1,2}:\d{2}$/;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// Resolve an instrument's weekly market hours in ET. Structural
// validation only — the model's hours are trusted, but shapes are coerced and
// any malformed day is dropped so the caller always gets clean windows.
export async function analyzeMarketHours(symbol: string): Promise<MarketHoursResult> {
  const model = textModel();
  const raw = await askClaude(
    `Instrument: ${symbol.trim().slice(0, 60)}\n\nReturn its weekly market hours in Eastern Time.`,
    MARKET_HOURS_SYSTEM,
    800,
  );
  const parsed = extractJson(raw) as { days?: unknown; note?: unknown } | null;
  const rawDays = Array.isArray(parsed?.days) ? (parsed!.days as unknown[]) : [];
  const seen = new Set<string>();
  const days: MarketHoursDay[] = [];
  for (const d of rawDays) {
    const o = (d ?? {}) as Record<string, unknown>;
    const day = typeof o.day === 'string' ? o.day.trim().toLowerCase() : '';
    const open = typeof o.open === 'string' ? o.open.trim() : '';
    const close = typeof o.close === 'string' ? o.close.trim() : '';
    if (!(DAY_KEYS as readonly string[]).includes(day) || seen.has(day)) continue;
    if (!HHMM_RE.test(open) || !HHMM_RE.test(close)) continue;
    seen.add(day);
    days.push({ day: day as MarketHoursDay['day'], open, close });
  }
  const note = typeof parsed?.note === 'string' ? parsed.note.trim().slice(0, 160) : '';
  return { days, note, model };
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

// Multi-turn chat — powers the global Ask VTS AI panel. maxTokens
// defaults to 4000; the study-guide builder passes a larger budget since a draft
// of many slides is a big JSON response.
export async function chatClaude(messages: ChatMessage[], system?: string, maxTokens = 4000): Promise<string> {
  return completeText({ turns: messages, system, maxTokens });
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

// ---- Auto-categorize a study game's questions ----
// Given a game's questions, sort each into a category. Either constrained to a
// category list the author supplies, or (when none is given) into a small set of
// categories the model proposes from the questions themselves. A custom prompt
// can steer how the model groups them. Returns one {id, topic} per input id,
// filtered to ids that were actually supplied.

// Ask the model to propose a small set of categories from a sample of stems.
async function proposeCategories(stems: string[], instructions?: string): Promise<string[]> {
  const sample = stems.slice(0, 120).map((s, i) => `${i + 1}. ${s.slice(0, 200)}`).join('\n');
  const prompt = [
    'Below is a list of quiz questions. Propose a small set of 3 to 8 concise category names that together cover them well.',
    instructions ? `Follow this guidance on how to group them: ${instructions}` : '',
    'Each category name should be 1–4 words. Respond with ONLY a JSON object of the form {"categories":["...","..."]} and nothing else.',
    '',
    'QUESTIONS:',
    sample,
  ]
    .filter(Boolean)
    .join('\n');
  const raw = await askClaude(prompt);
  const parsed = extractJson(raw) as { categories?: unknown } | null;
  const list = Array.isArray(parsed?.categories) ? (parsed!.categories as unknown[]) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (typeof c !== 'string') continue;
    const t = c.trim().slice(0, 40);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.length ? out : ['General'];
}

// Assign one chunk of questions to the given categories.
async function assignChunk(
  questions: ClassifyQuestion[],
  categories: string[],
  instructions?: string,
): Promise<{ id: number; topic: string }[]> {
  const list = questions.map((q) => `${q.id}\t${q.stem.slice(0, 240)}`).join('\n');
  const prompt = [
    'Assign each numbered question below to exactly ONE of these categories:',
    categories.map((c) => `- ${c}`).join('\n'),
    instructions ? `Extra guidance: ${instructions}` : '',
    'Each line is: id<TAB>question stem. Use the category name verbatim.',
    'Respond with ONLY a JSON object of the form {"assignments":[{"id":1,"topic":"..."}]} and nothing else.',
    '',
    'QUESTIONS:',
    list,
  ]
    .filter(Boolean)
    .join('\n');
  const raw = await askClaude(prompt, undefined, 6000);
  const parsed = extractJson(raw) as { assignments?: unknown } | null;
  const rows = Array.isArray(parsed?.assignments) ? (parsed!.assignments as unknown[]) : [];
  const valid = new Set(questions.map((q) => q.id));
  const byLower = new Map(categories.map((c) => [c.toLowerCase(), c]));
  const out: { id: number; topic: string }[] = [];
  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = typeof o.id === 'number' ? o.id : Number(o.id);
    if (!Number.isInteger(id) || !valid.has(id)) continue;
    const rawTopic = typeof o.topic === 'string' ? o.topic.trim() : '';
    const topic = byLower.get(rawTopic.toLowerCase()) ?? categories[0];
    out.push({ id, topic });
  }
  return out;
}

export async function categorizeQuestions(input: {
  questions: ClassifyQuestion[];
  categories?: string[];
  instructions?: string;
}): Promise<{ id: number; topic: string }[]> {
  const questions = input.questions;
  if (questions.length === 0) return [];
  const provided = (input.categories ?? []).map((c) => c.trim()).filter(Boolean);
  const categories = provided.length ? provided : await proposeCategories(questions.map((q) => q.stem), input.instructions);

  // Assign in chunks so a large game stays within one call's budget, constrained
  // to the (shared) category list so groupings are consistent across chunks.
  const chunks: ClassifyQuestion[][] = [];
  for (let i = 0; i < questions.length; i += 60) chunks.push(questions.slice(i, i + 60));
  const perChunk = await mapLimit(chunks, 6, (c) => assignChunk(c, categories, input.instructions));

  // Every id gets an assignment; ids the model missed fall back to the first
  // category so no question is left uncategorized.
  const map = new Map<number, string>();
  for (const a of perChunk.flat()) map.set(a.id, a.topic);
  return questions.map((q) => ({ id: q.id, topic: map.get(q.id) ?? categories[0] }));
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

// The most questions one study game can hold — the same ceiling the deck routes
// and the package blueprint use, so a game cannot be generated at a size that
// could never be saved.
export const MAX_DECK_QUESTIONS = 1000;

// How the work is split. Small batches keep every model call short enough to
// finish well inside the hosting gateway's request timeout; the concurrency is
// what decides how long a LARGE deck takes overall, since a big game is simply
// many of these. Eight at a time is ~64 questions per wave.
const DECK_BATCH_SIZE = 8;
const DECK_BATCH_CONCURRENCY = 8;

// A generous token budget for a deck: ~200 tokens per question plus overhead.
function deckMaxTokens(count: number): number {
  return Math.min(16000, 1200 + count * 220);
}

const DECK_FORMAT = [
  'Respond with ONLY a JSON object of exactly this shape and nothing else:',
  '{"questions":[{"stem":"...","options":[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],"answer":"A","topic":"...","explanation":"..."}]}',
  'Rules: every question has EXACTLY four options labelled A, B, C, and D; exactly one is correct and named in "answer"; "explanation" is ONE short sentence saying why the answer is right; "topic" is a short category label — reuse a small set of 2–5 topics across the whole set. No prose or code fences outside the JSON.',
].join('\n');

// Split a total question count into bounded batches. A single model call for a
// large deck runs long enough to hit the hosting gateway's request timeout (a
// 524); batching keeps every call short so they finish and run in parallel.
function splitCount(total: number, batchSize: number): number[] {
  const batches: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const n = Math.min(batchSize, remaining);
    batches.push(n);
    remaining -= n;
  }
  return batches;
}

// AI-generate a fresh quiz from a topic the team named (plus optional extra
// instructions). Returns validated questions; the caller stores them. The set
// is generated in small parallel batches — one giant call for a large deck runs
// long enough to hit the gateway's request timeout (a 524); short parallel calls
// each finish quickly and the whole set still comes back. Results are combined
// and de-duped by stem.
export async function generateDeckQuestions(input: {
  topic: string;
  instructions?: string;
  count: number;
}): Promise<GeneratedQuestion[]> {
  // The ceiling is what a deck can hold, not what one model call can produce —
  // the batching below is what makes a large number affordable. The old 50 was
  // the single-call bound and outlived the single call by a long way.
  const count = Math.max(1, Math.min(MAX_DECK_QUESTIONS, Math.floor(input.count) || 0));
  const fallbackTopic = input.topic.trim().slice(0, 40) || 'General';
  const system = `You are an expert exam-question author. Write clear, self-contained multiple-choice practice questions that test real understanding of the subject the user names. Vary difficulty. Do not repeat questions. ${DECK_FORMAT}`;

  const batches = splitCount(count, DECK_BATCH_SIZE);
  const perBatch = await mapLimit(batches, DECK_BATCH_CONCURRENCY, async (batchCount, i) => {
    const prompt = [
      `Write ${batchCount} multiple-choice questions about: ${input.topic}.`,
      input.instructions ? `Additional instructions from the author: ${input.instructions}` : '',
      batches.length > 1
        ? `This is set ${i + 1} of ${batches.length} for the same topic — cover different sub-areas and avoid questions likely to appear in the other sets.`
        : '',
      `Produce exactly ${batchCount} questions.`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const raw = await askClaude(prompt, system, deckMaxTokens(batchCount));
      return parseGeneratedQuestions(raw, batchCount, [], fallbackTopic);
    } catch {
      // One batch failing (e.g. a transient rate limit or timeout) shouldn't
      // sink the whole request — return what the other batches produced.
      return [] as GeneratedQuestion[];
    }
  });

  const out: GeneratedQuestion[] = [];
  const seen = new Set<string>();
  for (const q of perBatch.flat()) {
    const key = q.stem.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= count) break;
  }
  return out;
}

// ---- Correct-answer audit ----
// Review a team's study-game questions for problems — above all a wrong answer
// key (the marked answer isn't actually the single best option), plus
// no-correct-option, multiple-correct-options, ambiguous/unanswerable wording,
// duplicated options, and clear factual errors. Returns ONLY the flagged
// questions, so a clean game returns []. The model reasons per question; ids are
// validated against the input so it can't invent references, and every field is
// clamped. Chunked + run in parallel like the other deck AI so a large game
// stays within each call's budget.

export interface AuditQuestion {
  id: number;
  stem: string;
  options: { label: QLetter; text: string }[];
  answer: QLetter;
  explanation?: string | null;
}

export interface QuestionAudit {
  id: number;
  severity: 'high' | 'low';
  problem: string;
  suggestedAnswer: QLetter | null;
}

const AUDIT_SYSTEM =
  'You are a meticulous exam-question reviewer. For each multiple-choice question you are given, decide whether it has a real problem. The most important check: is the MARKED correct answer actually correct and the single best option? Also flag when no option is correct, more than one option is correct, the question is ambiguous or unanswerable as written, two options mean the same thing, or there is a clear factual error. Be strict about the answer key, but do NOT invent problems — a sound question should not be flagged.';

async function auditChunk(questions: AuditQuestion[]): Promise<QuestionAudit[]> {
  const block = questions
    .map((q) =>
      [
        `#${q.id}`,
        `Q: ${q.stem}`,
        q.options.map((o) => `  ${o.label}) ${o.text}`).join('\n'),
        `Marked correct answer: ${q.answer}`,
        q.explanation ? `Author explanation: ${q.explanation}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
  const prompt = [
    'Review each question below by its # id. Return ONLY the ones that have a problem.',
    'For each flagged question give:',
    '- "severity": "high" for a wrong / missing / ambiguous answer key, or no/multiple correct options; "low" for wording, clarity, or minor factual issues that do not change which option is correct.',
    '- "problem": one concise sentence naming the issue.',
    '- "suggestedAnswer": the single letter (A, B, C, or D) you believe is actually correct, or null if none is or you are unsure.',
    'Respond with ONLY JSON of the form {"issues":[{"id":1,"severity":"high","problem":"...","suggestedAnswer":"C"}]} and nothing else. If every question is fine, return {"issues":[]}.',
    '',
    'QUESTIONS:',
    block,
  ].join('\n');
  const raw = await askClaude(prompt, AUDIT_SYSTEM, 4000);
  const parsed = extractJson(raw) as { issues?: unknown } | null;
  const rows = Array.isArray(parsed?.issues) ? (parsed!.issues as unknown[]) : [];
  const valid = new Set(questions.map((q) => q.id));
  const out: QuestionAudit[] = [];
  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = typeof o.id === 'number' ? o.id : Number(o.id);
    if (!Number.isInteger(id) || !valid.has(id)) continue;
    const problem = typeof o.problem === 'string' ? o.problem.trim().slice(0, 300) : '';
    if (!problem) continue;
    const severity = o.severity === 'low' ? 'low' : 'high';
    const sa = typeof o.suggestedAnswer === 'string' ? o.suggestedAnswer.trim().toUpperCase() : '';
    const suggestedAnswer = (LETTERS as readonly string[]).includes(sa) ? (sa as QLetter) : null;
    out.push({ id, severity, problem, suggestedAnswer });
  }
  return out;
}

export async function auditDeckQuestions(questions: AuditQuestion[]): Promise<QuestionAudit[]> {
  if (questions.length === 0) return [];
  const chunks: AuditQuestion[][] = [];
  for (let i = 0; i < questions.length; i += 20) chunks.push(questions.slice(i, i + 20));
  const perChunk = await mapLimit(chunks, 4, async (c) => {
    try {
      return await auditChunk(c);
    } catch {
      // One chunk failing (transient rate limit/timeout) shouldn't sink the
      // whole audit — return no findings for it rather than erroring out.
      return [] as QuestionAudit[];
    }
  });
  // Keep input order; a question only appears in one chunk, but de-dupe by id.
  const byId = new Map<number, QuestionAudit>();
  for (const a of perChunk.flat()) if (!byId.has(a.id)) byId.set(a.id, a);
  return questions.map((q) => byId.get(q.id)).filter((x): x is QuestionAudit => !!x);
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
// `style` is the terminal-wide response style (ai/prompts.ts) — passed in rather
// than read here so this module stays free of the settings/DB layer.
export async function chatStudyGuide(messages: ChatMessage[], style?: string): Promise<GuideChatResult> {
  const system = style?.trim() ? `${GUIDE_SYSTEM}\n\n${style.trim()}` : GUIDE_SYSTEM;
  const raw = await chatClaude(messages, system, 8000);
  return parseGuideChat(raw);
}
