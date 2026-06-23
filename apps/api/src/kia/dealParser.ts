import { addDeal, getDashboard, type KiaDashboardData } from './service.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Plain-English deal logger for the Kia tracker (sibling of the to-do command
// bar). Claude (Sonnet) extracts structured fields from a sales note; the
// server validates and logs the deal through the normal addDeal service.

export interface DealParseResult {
  dashboard: KiaDashboardData | null; // refreshed dashboard when a deal was logged
  logged: boolean;
  reply: string;
}

interface ParsedDeal {
  customer?: string;
  model?: string;
  type?: string;
  profit?: number;
  frontProfit?: number;
  backProfit?: number;
  soldAt?: string;
}

function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,]/g, ''));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return undefined;
}

const SYSTEM = (today: string) =>
  [
    'You extract a single car-sale deal from a salesperson\'s short note and return ONLY a JSON object.',
    'Shape: {"deal":{"customer":string,"model":string,"type":"New"|"Used","profit":number,"frontProfit":number,"backProfit":number,"soldAt":"YYYY-MM-DD"},"reply":string}',
    'Rules: "model" is the Kia model (e.g. Telluride, K5, Sportage, EV9). "type" is New or Used — infer from words like "used", "pre-owned", "CPO" (Used) else New.',
    'Profit is in whole US dollars; if the note gives front and back (or "F&I"/"backend") amounts, set frontProfit and backProfit and omit profit. Otherwise set profit to the single/total number.',
    `Resolve relative dates against today = ${today} (America/New_York); omit soldAt if none is mentioned.`,
    'If no Kia model is identifiable, return {"deal":null,"reply":"<ask for the model>"}. Keep "reply" to one short sentence describing what you logged.',
  ].join('\n');

export async function parseDeal(userId: string, note: string): Promise<DealParseResult> {
  const text = note.trim();
  if (!text) return { dashboard: null, logged: false, reply: 'Type a deal to log.' };

  const raw = await askClaude(`NOTE: ${text}`, SYSTEM(etToday()));
  const parsed = extractJson(raw) as { deal?: ParsedDeal | null; reply?: unknown } | null;
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 300) : '';

  const deal = parsed?.deal;
  const model = deal && typeof deal.model === 'string' ? deal.model.trim() : '';
  if (!deal || !model) {
    return { dashboard: null, logged: false, reply: reply || 'Which Kia model was it? Try "Sold a Telluride, $2,500 profit".' };
  }

  const type: 'New' | 'Used' = deal.type === 'Used' ? 'Used' : 'New';
  const front = num(deal.frontProfit);
  const back = num(deal.backProfit);
  const profit = num(deal.profit);
  const soldAt = typeof deal.soldAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deal.soldAt) ? deal.soldAt : undefined;

  await addDeal(userId, {
    customer: typeof deal.customer === 'string' ? deal.customer : undefined,
    model,
    type,
    profit,
    frontProfit: front,
    backProfit: back,
    soldAt,
  });

  const total = front != null || back != null ? (front ?? 0) + (back ?? 0) : profit ?? 0;
  const summary = `Logged ${type} ${model}${total ? ` · $${total.toLocaleString('en-US')}` : ''}.`;
  return { dashboard: await getDashboard(userId), logged: true, reply: reply || summary };
}
