import {
  addDeal,
  getDashboard,
  removeDeal,
  updateDeal,
  updatePayPlan,
  updateSettings,
  type KiaDashboardData,
} from './service.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Free-text command bar for the Kia tracker ("Ask Claude to change details") —
// the sibling of the To Do command bar. One line like
//   "add deal Sportage LX 1850 for Reyes · set goal 12 · set reviews 60% · summary"
// is turned by Claude (Sonnet) into structured actions, which the server
// resolves against the *viewed* month's dashboard and applies through the
// normal Kia services. Deal references are resolved against a single snapshot so
// numbers can't drift mid-apply.

const MAX_ACTIONS = 25;

interface AddDealAction {
  type: 'add_deal';
  customer?: string;
  model?: string;
  saleType?: string;
  profit?: number;
  frontProfit?: number;
  backProfit?: number;
  spiff?: number;
  soldAt?: string;
}
interface UpdateDealAction {
  type: 'update_deal';
  ref?: number | string;
  customer?: string;
  model?: string;
  saleType?: string;
  profit?: number;
  frontProfit?: number;
  backProfit?: number;
  spiff?: number;
  soldAt?: string;
}
interface RemoveDealAction {
  type: 'remove_deal';
  ref?: number | string;
}
interface SetGoalAction {
  type: 'set_goal';
  goalUnits?: number;
}
interface SetReviewsAction {
  type: 'set_reviews';
  reviewCount?: number;
  reviewPct?: number;
}
interface SetCommissionAction {
  type: 'set_commission';
  commissionPct?: number;
}
interface SetMiniAction {
  type: 'set_mini';
  miniAmount?: number;
}
interface SummaryAction {
  type: 'summary';
}
type ParsedAction =
  | AddDealAction
  | UpdateDealAction
  | RemoveDealAction
  | SetGoalAction
  | SetReviewsAction
  | SetCommissionAction
  | SetMiniAction
  | SummaryAction;

export interface KiaCommandResult {
  dashboard: KiaDashboardData; // refreshed dashboard for the viewed month
  applied: string[]; // human-readable summary of what changed
  skipped: string[]; // things that couldn't be resolved
  reply: string; // Claude's one-line summary (or a requested performance summary)
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,%\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

// A compact snapshot of the viewed month so Claude can resolve "remove the
// Sportage" to a deal number and ground a summary in real figures.
function buildContext(dash: KiaDashboardData): string {
  const m = dash.metrics;
  const monthLabel = dash.months.find((mo) => mo.key === dash.month)?.label ?? dash.month;
  const dealLines = dash.deals.length
    ? dash.deals
        .map((d, i) => `${i + 1}. ${d.model} (${d.type}) — ${d.customer} · ${usd(d.profit)}${d.spiff ? ` (+${usd(d.spiff)} spiff)` : ''} · ${d.dateLabel}`)
        .join('\n')
    : '(no deals yet)';
  const metrics = [
    `${m.units} of ${m.goalUnits} units (pace ${m.paceUnits})`,
    `${usd(m.totalProfit)} total profit`,
    `${usd(m.commission)} commission`,
    `reviews ${m.reviewPct}% (${m.reviewCount} of ${m.units}${m.reviewRequired ? `, need ${m.reviewReq}%` : ', not required'})`,
    m.bonusEarned > 0 ? `${usd(m.bonusEarned)} unit bonus earned` : 'no unit bonus yet',
  ].join(' · ');
  return [
    `VIEWED MONTH: ${monthLabel} (${dash.month})`,
    `METRICS: ${metrics}`,
    `PAY PLAN: ${(dash.payPlan.commissionRate * 100).toFixed(2)}% commission, ${usd(dash.payPlan.miniAmount)} mini`,
    `DEALS (use the number for remove_deal / update_deal):\n${dealLines}`,
  ].join('\n');
}

const SYSTEM = (today: string) =>
  [
    "You turn a car salesperson's short command into structured JSON actions for their Kia sales dashboard.",
    'You are given the VIEWED MONTH context (metrics + numbered DEALS). Respond with ONLY a JSON object, no prose:',
    '{"actions":[...],"reply":"<one short sentence, or the requested summary>"}',
    'Allowed actions:',
    '- {"type":"add_deal","customer":string,"model":string,"saleType":"New"|"Used","profit":number,"frontProfit":number,"backProfit":number,"spiff":number,"soldAt":"YYYY-MM-DD"} — log a new deal. "model" is the Kia model (Telluride, K5, Sportage, EV9…). "saleType" is New unless words like "used"/"pre-owned"/"CPO" appear. Use frontProfit+backProfit (omit profit) when a front/back or F&I split is given, else set profit. "spiff" is extra dealership money paid on top of profit — set it only when a spiff/incentive is mentioned. Whole US dollars.',
    '- {"type":"update_deal","ref":<deal number>,"...any add_deal field...} — change an existing deal (including "spiff"). Only include fields that change.',
    '- {"type":"remove_deal","ref":<deal number>} — delete an existing deal.',
    '- {"type":"set_goal","goalUnits":number} — set this month\'s unit goal.',
    '- {"type":"set_reviews","reviewCount":number} OR {"type":"set_reviews","reviewPct":number} — set Google reviews. Use reviewPct only when the user gives a percentage.',
    '- {"type":"set_commission","commissionPct":number} — set the commission rate (e.g. 15 for 15%).',
    '- {"type":"set_mini","miniAmount":number} — set the per-deal minimum commission (the "mini"), whole dollars.',
    '- {"type":"summary"} — the user wants a read on the month. Put the summary in "reply", grounded in the METRICS you were given.',
    'Only reference deal numbers that appear in DEALS. A single command may contain several actions separated by commas, "and", "·", or newlines.',
    `Resolve relative dates against today = ${today} (America/New_York); omit soldAt when none is mentioned.`,
    'If you cannot tell what is meant, return an empty actions array and explain in "reply". Keep "reply" to one or two short sentences (the summary may be a touch longer).',
  ].join('\n');

function saleType(v: unknown): 'New' | 'Used' {
  return typeof v === 'string' && v.toLowerCase().startsWith('u') ? 'Used' : 'New';
}

function dealRef(ref: unknown, deals: KiaDashboardData['deals']): { id: string; label: string } | undefined {
  const n = num(ref);
  if (n == null) return undefined;
  const deal = deals[Math.round(n) - 1];
  return deal ? { id: deal.id, label: `${deal.model} · ${deal.customer}` } : undefined;
}

function isoDate(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

// Build the add/update profit fields, honoring a front/back split when present.
function profitFields(a: AddDealAction | UpdateDealAction): {
  profit?: number;
  frontProfit?: number;
  backProfit?: number;
} {
  const front = num(a.frontProfit);
  const back = num(a.backProfit);
  if (front != null || back != null) {
    return { frontProfit: Math.max(0, front ?? 0), backProfit: Math.max(0, back ?? 0) };
  }
  const profit = num(a.profit);
  return profit != null ? { profit: Math.max(0, profit) } : {};
}

export async function runKiaCommand(
  userId: string,
  command: string,
  month?: string,
): Promise<KiaCommandResult> {
  const text = command.trim();
  const dashboard = await getDashboard(userId, month);

  if (!text) {
    return { dashboard, applied: [], skipped: [], reply: 'Type a command and I’ll update your month.' };
  }

  const context = buildContext(dashboard);
  const raw = await askClaude(`${context}\n\nCOMMAND: ${text}`, SYSTEM(etToday()));
  const parsed = extractJson(raw) as { actions?: unknown; reply?: unknown } | null;

  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 600) : '';
  const actions = Array.isArray(parsed?.actions) ? (parsed!.actions as ParsedAction[]) : [];

  // The month settings (goal/reviews) should land on the month being viewed.
  const viewedMonth = dashboard.month;
  const deals = dashboard.deals;

  const applied: string[] = [];
  const skipped: string[] = [];
  let touched = false; // any data change → refetch the dashboard at the end

  for (const a of actions.slice(0, MAX_ACTIONS)) {
    try {
      switch (a.type) {
        case 'add_deal': {
          const model = typeof a.model === 'string' ? a.model.trim() : '';
          if (!model) {
            skipped.push('Add deal (no Kia model given)');
            break;
          }
          const fields = profitFields(a);
          const spiff = num(a.spiff);
          await addDeal(userId, {
            customer: typeof a.customer === 'string' ? a.customer : undefined,
            model,
            type: saleType(a.saleType),
            ...fields,
            spiff: spiff != null ? Math.max(0, spiff) : undefined,
            soldAt: isoDate(a.soldAt),
          });
          const total =
            fields.profit ?? (fields.frontProfit ?? 0) + (fields.backProfit ?? 0);
          const spiffNote = spiff ? ` (+${usd(spiff)} spiff)` : '';
          applied.push(`Logged ${saleType(a.saleType)} ${model}${total ? ` · ${usd(total)}` : ''}${spiffNote}`);
          touched = true;
          break;
        }
        case 'update_deal': {
          const target = dealRef(a.ref, deals);
          if (!target) {
            skipped.push(`Update deal #${a.ref ?? '?'} (no matching deal)`);
            break;
          }
          const patch: Parameters<typeof updateDeal>[2] = { ...profitFields(a) };
          if (typeof a.customer === 'string') patch.customer = a.customer;
          if (typeof a.model === 'string' && a.model.trim()) patch.model = a.model.trim();
          if (a.saleType != null) patch.type = saleType(a.saleType);
          if (a.spiff != null) {
            const spiff = num(a.spiff);
            if (spiff != null) patch.spiff = Math.max(0, spiff);
          }
          if (isoDate(a.soldAt)) patch.soldAt = isoDate(a.soldAt);
          if (Object.keys(patch).length === 0) {
            skipped.push(`Update ${target.label} (nothing to change)`);
            break;
          }
          await updateDeal(userId, target.id, patch);
          applied.push(`Updated ${target.label}`);
          touched = true;
          break;
        }
        case 'remove_deal': {
          const target = dealRef(a.ref, deals);
          if (!target) {
            skipped.push(`Remove deal #${a.ref ?? '?'} (no matching deal)`);
            break;
          }
          await removeDeal(userId, target.id);
          applied.push(`Removed ${target.label}`);
          touched = true;
          break;
        }
        case 'set_goal': {
          const goal = num(a.goalUnits);
          if (goal == null || goal < 1) {
            skipped.push('Set goal (need a number ≥ 1)');
            break;
          }
          await updateSettings(userId, viewedMonth, { goalUnits: Math.round(goal) });
          applied.push(`Set unit goal to ${Math.round(goal)}`);
          touched = true;
          break;
        }
        case 'set_reviews': {
          const fresh = await getDashboard(userId, viewedMonth);
          const units = fresh.metrics.units;
          let count = num(a.reviewCount);
          if (count == null) {
            const pct = num(a.reviewPct);
            if (pct != null) count = Math.round((Math.max(0, pct) / 100) * units);
          }
          if (count == null) {
            skipped.push('Set reviews (need a count or percentage)');
            break;
          }
          count = Math.max(0, Math.round(count));
          await updateSettings(userId, viewedMonth, { reviewCount: count });
          applied.push(`Set reviews to ${count}${units ? ` of ${units}` : ''}`);
          touched = true;
          break;
        }
        case 'set_commission': {
          const pct = num(a.commissionPct);
          if (pct == null || pct < 0 || pct > 100) {
            skipped.push('Set commission (need a percent 0–100)');
            break;
          }
          await updatePayPlan(userId, { commissionMode: 'total', commissionPct: pct });
          applied.push(`Set commission to ${+pct.toFixed(2)}%`);
          touched = true;
          break;
        }
        case 'set_mini': {
          const mini = num(a.miniAmount);
          if (mini == null || mini < 0) {
            skipped.push('Set mini (need a dollar amount)');
            break;
          }
          await updatePayPlan(userId, { miniAmount: Math.round(mini) });
          applied.push(`Set mini to ${usd(mini)}`);
          touched = true;
          break;
        }
        case 'summary':
          // Handled in the reply; no data change.
          break;
        default:
          skipped.push('Unknown action');
      }
    } catch (err) {
      skipped.push(`Action failed${err instanceof Error ? `: ${err.message}` : ''}`);
    }
  }

  const finalDash = touched ? await getDashboard(userId, viewedMonth) : dashboard;

  if (actions.length === 0) {
    return {
      dashboard: finalDash,
      applied,
      skipped,
      reply:
        reply ||
        'I couldn’t tell what to change — try “add deal Sportage 1850 for Reyes · set goal 12 · summary”.',
    };
  }

  return {
    dashboard: finalDash,
    applied,
    skipped,
    reply: reply || (applied.length ? 'Done.' : 'Nothing was changed.'),
  };
}
