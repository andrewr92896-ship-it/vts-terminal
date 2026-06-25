import {
  addDeal,
  getDashboard,
  removeDeal,
  updateDeal,
  updateSettings,
  type KiaDashboardData,
  type KiaDeal,
} from './service.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Natural-language command bar for the Sales (Kia) dashboard — the sibling of
// the To Do command bar. Claude (Sonnet) turns a line like
// "add deal Sportage LX 1850 for Reyes · set goal 12 · set reviews 60%"
// into structured actions, which the server resolves against the user's
// *current* dashboard snapshot and applies through the normal Kia services.
// Existing deals are referenced by short codes (d1, d2, …) assigned from the
// snapshot so references can't drift mid-apply.

const MAX_ACTIONS = 25;

interface AddDealAction {
  type: 'add_deal';
  customer?: string;
  model?: string;
  dealType?: string;
  profit?: number | string;
  frontProfit?: number | string;
  backProfit?: number | string;
  soldAt?: string;
}
interface EditDealAction {
  type: 'edit_deal';
  ref?: string;
  customer?: string;
  model?: string;
  dealType?: string;
  profit?: number | string;
  frontProfit?: number | string;
  backProfit?: number | string;
  soldAt?: string;
}
interface RemoveDealAction {
  type: 'remove_deal';
  ref?: string;
}
interface SetGoalAction {
  type: 'set_goal';
  goalUnits?: number | string;
}
interface SetReviewsAction {
  type: 'set_reviews';
  reviewCount?: number | string;
  reviewPct?: number | string;
}
interface SummaryAction {
  type: 'summary';
}
type ParsedAction =
  | AddDealAction
  | EditDealAction
  | RemoveDealAction
  | SetGoalAction
  | SetReviewsAction
  | SummaryAction;

export interface KiaCommandResult {
  dashboard: KiaDashboardData; // refreshed dashboard after applying the command
  applied: string[]; // human-readable summary of what was done
  skipped: string[]; // things that couldn't be resolved or applied
  reply: string; // Claude's one-line summary
}

function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

// Coerce a model-supplied value to a non-negative whole-dollar integer.
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,%\s]/g, ''));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return undefined;
}

const usd = (n: number) => '$' + n.toLocaleString('en-US');

// Compact view of the current dashboard so Claude can resolve references and
// summarize without guessing. Deals are labeled d1, d2, … in display order.
function buildContext(dash: KiaDashboardData, codeOf: Map<string, KiaDeal>): string {
  const dealLines =
    dash.deals
      .map((d, i) => {
        const code = `d${i + 1}`;
        codeOf.set(code, d);
        const split =
          d.frontProfit != null || d.backProfit != null
            ? ` (front ${usd(d.frontProfit ?? 0)} / back ${usd(d.backProfit ?? 0)})`
            : '';
        return `${code} · ${d.type} ${d.model} · ${d.customer} · ${usd(d.profit)}${split} · ${d.dateLabel}`;
      })
      .join('\n') || '(no deals yet)';

  const m = dash.metrics;
  const current = [
    `month ${dash.month}`,
    `${m.units} units (goal ${m.goalUnits})`,
    `total profit ${usd(m.totalProfit)}`,
    `commission ${usd(m.commission)}`,
    `${m.reviewCount} of ${m.units} reviews (${m.reviewPct}%${m.reviewRequired ? `, need ${m.reviewReq}%` : ', not required'})`,
  ].join(' · ');

  return `DEALS (use the code to edit or remove):\n${dealLines}\n\nCURRENT: ${current}`;
}

const SYSTEM = (today: string) =>
  [
    "You convert a Kia salesperson's short command into structured JSON actions for their sales dashboard.",
    'You are given the current DEALS and CURRENT figures. Respond with ONLY a JSON object, no prose, of the form:',
    '{"actions":[...],"reply":"<one short sentence>"}',
    'Allowed actions:',
    '- {"type":"add_deal","customer":string,"model":string,"dealType":"New"|"Used","profit":number,"frontProfit":number,"backProfit":number,"soldAt":"YYYY-MM-DD"} — log a new deal. "model" is the Kia model (e.g. Telluride, K5, Sportage, EV9). Infer dealType from words like "used"/"pre-owned"/"CPO" (Used) else New. If the note gives front and back (or "F&I"/"backend") amounts, set frontProfit and backProfit and omit profit; otherwise set profit to the single/total number. customer is optional.',
    '- {"type":"edit_deal","ref":"<code like d2>","model":string,"customer":string,"dealType":"New"|"Used","profit":number,"frontProfit":number,"backProfit":number,"soldAt":"YYYY-MM-DD"} — change an existing deal. Include only the fields that change.',
    '- {"type":"remove_deal","ref":"<code like d2>"} — delete an existing deal.',
    '- {"type":"set_goal","goalUnits":number} — set this month\'s unit goal.',
    '- {"type":"set_reviews","reviewCount":number} — set the Google review count. If the user gives a percentage, set "reviewPct":number instead and the server converts it against the unit count.',
    '- {"type":"summary"} — the user just wants a read-out of how the month is going; put the summary in "reply" and add no other actions.',
    'Only reference deal codes that appear in DEALS. Resolve a deal the user describes in words (by customer or model) to its code. If you cannot tell what they mean, return an empty actions array and explain in "reply".',
    `Resolve relative dates against today = ${today} (America/New_York); omit soldAt when none is mentioned. Dollars are whole US dollars.`,
    'A single command may contain several actions separated by commas, "and", "·", or newlines. Keep "reply" to one short sentence describing what you did.',
  ].join('\n');

export async function runKiaCommand(
  userId: string,
  command: string,
  month?: string,
): Promise<KiaCommandResult> {
  const text = command.trim();
  const dash = await getDashboard(userId, month);

  if (!text) {
    return { dashboard: dash, applied: [], skipped: [], reply: 'Type a command and I’ll update your dashboard.' };
  }

  const codeOf = new Map<string, KiaDeal>();
  const context = buildContext(dash, codeOf);
  const raw = await askClaude(`${context}\n\nCOMMAND: ${text}`, SYSTEM(etToday()));
  const parsed = extractJson(raw) as { actions?: unknown; reply?: unknown } | null;

  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 300) : '';
  const actions = Array.isArray(parsed?.actions) ? (parsed!.actions as ParsedAction[]) : [];

  if (actions.length === 0) {
    return {
      dashboard: dash,
      applied: [],
      skipped: [],
      reply:
        reply ||
        'I couldn’t tell what to change — try “add deal Sportage 1850 for Reyes”, “set goal 12”, or “summary”.',
    };
  }

  const units = dash.metrics.units;
  const applied: string[] = [];
  const skipped: string[] = [];

  // Apply actions in order against the snapshot codes. Service calls are
  // sequential so each sees the prior write.
  for (const a of actions.slice(0, MAX_ACTIONS)) {
    try {
      if (a.type === 'add_deal') {
        const model = typeof a.model === 'string' ? a.model.trim() : '';
        if (!model) {
          skipped.push('Add deal (no Kia model given)');
          continue;
        }
        const dealType: 'New' | 'Used' = a.dealType === 'Used' ? 'Used' : 'New';
        const front = num(a.frontProfit);
        const back = num(a.backProfit);
        const profit = num(a.profit);
        const soldAt =
          typeof a.soldAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.soldAt) ? a.soldAt : undefined;
        await addDeal(userId, {
          customer: typeof a.customer === 'string' ? a.customer : undefined,
          model,
          type: dealType,
          profit,
          frontProfit: front,
          backProfit: back,
          soldAt,
        });
        const total = front != null || back != null ? (front ?? 0) + (back ?? 0) : profit ?? 0;
        applied.push(`Added ${dealType} ${model}${total ? ` · ${usd(total)}` : ''}`);
      } else if (a.type === 'edit_deal') {
        const deal = a.ref ? codeOf.get(a.ref.trim()) : undefined;
        if (!deal) {
          skipped.push(`Edit ${a.ref ?? '?'} (no matching deal)`);
          continue;
        }
        const patch: {
          customer?: string;
          model?: string;
          type?: 'New' | 'Used';
          profit?: number;
          frontProfit?: number;
          backProfit?: number;
          soldAt?: string;
        } = {};
        if (typeof a.customer === 'string') patch.customer = a.customer;
        if (typeof a.model === 'string' && a.model.trim()) patch.model = a.model.trim();
        if (a.dealType === 'New' || a.dealType === 'Used') patch.type = a.dealType;
        const front = num(a.frontProfit);
        const back = num(a.backProfit);
        const profit = num(a.profit);
        if (front != null || back != null) {
          if (front != null) patch.frontProfit = front;
          if (back != null) patch.backProfit = back;
        } else if (profit != null) {
          patch.profit = profit;
        }
        if (typeof a.soldAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.soldAt)) patch.soldAt = a.soldAt;
        if (Object.keys(patch).length === 0) {
          skipped.push(`Edit ${deal.type} ${deal.model} (nothing to change)`);
          continue;
        }
        await updateDeal(userId, deal.id, patch);
        applied.push(`Updated ${deal.type} ${deal.model} · ${deal.customer}`);
      } else if (a.type === 'remove_deal') {
        const deal = a.ref ? codeOf.get(a.ref.trim()) : undefined;
        if (!deal) {
          skipped.push(`Remove ${a.ref ?? '?'} (no matching deal)`);
          continue;
        }
        const removed = await removeDeal(userId, deal.id);
        if (removed) applied.push(`Removed ${deal.type} ${deal.model} · ${deal.customer}`);
        else skipped.push(`Remove ${deal.type} ${deal.model} (already gone)`);
      } else if (a.type === 'set_goal') {
        const goalUnits = num(a.goalUnits);
        if (goalUnits == null || goalUnits < 1) {
          skipped.push('Set goal (need a number ≥ 1)');
          continue;
        }
        await updateSettings(userId, month, { goalUnits });
        applied.push(`Set unit goal to ${goalUnits}`);
      } else if (a.type === 'set_reviews') {
        let reviewCount = num(a.reviewCount);
        // A percentage is converted against the current unit count.
        if (reviewCount == null && a.reviewPct != null) {
          const pct = num(a.reviewPct);
          if (pct != null) reviewCount = Math.round((pct / 100) * units);
        }
        if (reviewCount == null) {
          skipped.push('Set reviews (need a count or percentage)');
          continue;
        }
        await updateSettings(userId, month, { reviewCount });
        applied.push(`Set reviews to ${reviewCount}`);
      } else if (a.type === 'summary') {
        // Read-only: the summary is carried in Claude's reply.
      } else {
        skipped.push('Unknown action');
      }
    } catch (err) {
      const label = 'type' in a ? a.type.replace('_', ' ') : 'action';
      skipped.push(`${label} — failed${err instanceof Error ? `: ${err.message}` : ''}`);
    }
  }

  return {
    dashboard: await getDashboard(userId, month),
    applied,
    skipped,
    reply: reply || (applied.length ? 'Done.' : 'Nothing was changed.'),
  };
}
