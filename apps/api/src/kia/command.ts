import { addDeal, updateSettings, getDashboard, type KiaDashboardData } from './service.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Plain-English command bar for the Kia sales dashboard. Claude (Sonnet) turns
// a note into a list of actions — log deals, set the monthly unit goal, set the
// review count — which the server validates and applies through the normal
// services. Several can be combined in one line (separated by "·" or "and").

export interface KiaCommandResult {
  dashboard: KiaDashboardData | null; // refreshed when anything changed
  applied: string[];
  skipped: string[];
  reply: string;
}

interface ParsedAction {
  type?: string;
  customer?: unknown;
  model?: unknown;
  dealType?: unknown;
  profit?: unknown;
  frontProfit?: unknown;
  backProfit?: unknown;
  soldAt?: unknown;
  units?: unknown;
  count?: unknown;
}

const MAX_ACTIONS = 25;

function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,]/g, '').trim());
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

const SYSTEM = (today: string) =>
  [
    'You turn a Kia salesperson\'s short note into a JSON list of actions and return ONLY a JSON object.',
    'Shape: {"actions":[ACTION,...],"reply":string}. Each ACTION is one of:',
    '  {"type":"deal","customer":string?,"model":string,"dealType":"New"|"Used","profit":number,"frontProfit":number?,"backProfit":number?,"soldAt":"YYYY-MM-DD"?}  — log a car sale.',
    '  {"type":"goal","units":number}  — set this month\'s unit sales goal.',
    '  {"type":"reviews","count":number}  — set this month\'s Google review count.',
    'For a deal: "model" is the Kia model (Telluride, K5, Sportage, EV9, etc.). "dealType" is New unless words like used/pre-owned/CPO appear. If the note gives front and back (F&I/backend) amounts, set frontProfit and backProfit and omit profit; otherwise set profit to the single total.',
    `Profit/goal/count are whole numbers (strip "$" and commas). Resolve relative dates against today = ${today} (America/New_York); omit soldAt if none is mentioned.`,
    'Omit any action whose required number cannot be determined rather than guessing. Keep "reply" to one short sentence describing what you did.',
    'Return {"actions":[],"reply":"<ask for what is missing>"} if nothing is actionable.',
  ].join('\n');

export async function runKiaCommand(userId: string, note: string): Promise<KiaCommandResult> {
  const text = note.trim();
  if (!text) return { dashboard: null, applied: [], skipped: [], reply: 'Type a command, e.g. "Sold a Telluride $2,500".' };

  const raw = await askClaude(`NOTE: ${text}`, SYSTEM(etToday()));
  const parsed = extractJson(raw) as { actions?: unknown; reply?: unknown } | null;
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 300) : '';
  const actions = Array.isArray(parsed?.actions) ? (parsed!.actions as ParsedAction[]).slice(0, MAX_ACTIONS) : [];

  const applied: string[] = [];
  const skipped: string[] = [];
  let changed = false;

  for (const a of actions) {
    const type = typeof a?.type === 'string' ? a.type.toLowerCase() : '';
    try {
      if (type === 'deal') {
        const model = str(a.model);
        if (!model) {
          skipped.push('deal — which Kia model?');
          continue;
        }
        const dealType: 'New' | 'Used' = a.dealType === 'Used' ? 'Used' : 'New';
        const front = num(a.frontProfit);
        const back = num(a.backProfit);
        const profit = num(a.profit);
        if (front == null && back == null && profit == null) {
          skipped.push(`${model} — needs a profit amount`);
          continue;
        }
        const soldAt = typeof a.soldAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.soldAt) ? a.soldAt : undefined;
        await addDeal(userId, { customer: str(a.customer), model, type: dealType, profit, frontProfit: front, backProfit: back, soldAt });
        const total = front != null || back != null ? (front ?? 0) + (back ?? 0) : (profit ?? 0);
        applied.push(`Deal: ${dealType} ${model}${total ? ` · $${total.toLocaleString('en-US')}` : ''}`);
        changed = true;
      } else if (type === 'goal') {
        const units = num(a.units);
        if (units == null || units < 1) {
          skipped.push('goal — needs a unit number');
          continue;
        }
        await updateSettings(userId, undefined, { goalUnits: units });
        applied.push(`Goal: ${units} units`);
        changed = true;
      } else if (type === 'reviews') {
        const count = num(a.count);
        if (count == null) {
          skipped.push('reviews — needs a number');
          continue;
        }
        await updateSettings(userId, undefined, { reviewCount: count });
        applied.push(`Reviews: ${count}`);
        changed = true;
      } else {
        skipped.push(`${type || 'item'} — unrecognized`);
      }
    } catch (err) {
      skipped.push(`${type || 'item'} — ${err instanceof Error ? err.message : 'could not apply'}`);
    }
  }

  const fallback = applied.length
    ? `Done — ${applied.length} change${applied.length === 1 ? '' : 's'}.`
    : 'Nothing to apply — try "Sold a used Sportage $1,800 front $700 back" or "set goal 12".';

  return {
    dashboard: changed ? await getDashboard(userId) : null,
    applied,
    skipped,
    reply: reply || fallback,
  };
}
