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
