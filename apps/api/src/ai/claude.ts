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
  summary: string;
}

const HISTORY_SYSTEM = `You read a list of TRADES from a funded-account trade-history / order-history screenshot (a blotter, closed-positions table, or statement). Extract every trade row you can see.

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
  "summary": string                  // 1 sentence: how many trades you read
}
Strip currency symbols and commas from numbers. Use null for any field you cannot read. Return an empty trades array if you can read none. Keep the summary under 160 characters.`;

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
  const json = (extractJson(raw) ?? {}) as { trades?: unknown; summary?: unknown };
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
