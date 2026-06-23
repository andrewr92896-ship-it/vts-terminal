import { addClient, getPracticeOverview, type PracticeOverview } from './service.js';
import { addPortfolio, addAllocation, getPortfolios } from './portfolios.js';
import { addPlan } from './planning.js';
import { addItem as addComplianceItem } from './compliance.js';
import {
  WEALTH_CLIENT_STATUSES,
  PORTFOLIO_RISKS,
  ASSET_CLASSES,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_STATUSES,
  type WealthClientStatus,
  type PortfolioRisk,
  type AssetClass,
  type ComplianceCategory,
  type ComplianceStatus,
} from '../db/schema.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Plain-English "add things" for the Vitalis wealth practice. Claude (Sonnet)
// turns a note into a list of actions — clients, model portfolios + sleeves,
// planning scenarios, compliance items — applied through the existing services.

export interface WealthCommandResult {
  overview: PracticeOverview | null; // refreshed when anything changed
  applied: string[];
  skipped: string[];
  reply: string;
}

interface ParsedAction {
  type?: string;
  [k: string]: unknown;
}

const MAX_ACTIONS = 25;

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,%]/g, '').trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function pickEnum<T extends string>(v: unknown, allowed: readonly string[]): T | undefined {
  return typeof v === 'string' && allowed.includes(v) ? (v as T) : undefined;
}
// Convert YYYY-MM-DD to a UTC-noon ms timestamp (stable across zones).
function dateMs(v: unknown): number | undefined {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return Date.UTC(y, m - 1, d, 12);
  }
  return undefined;
}

function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

const SYSTEM = (today: string) =>
  [
    'You turn a wealth-advisor practice-management note into a JSON list of actions and return ONLY a JSON object.',
    'Shape: {"actions":[ACTION,...],"reply":string}. Each ACTION is one of:',
    '  {"type":"client","name":string,"status":"prospect"|"onboarding"|"active"|"inactive"?,"accountValue":number?,"email":string?,"phone":string?,"notes":string?}',
    '  {"type":"portfolio","name":string,"risk":"conservative"|"moderate_conservative"|"moderate"|"moderate_aggressive"|"aggressive"?,"notes":string?}',
    '  {"type":"allocation","portfolio":string,"name":string,"assetClass":"us_equity"|"intl_equity"|"fixed_income"|"real_assets"|"cash"|"alternative"|"other"?,"targetPct":number?}  — add a sleeve to an existing portfolio (match by name).',
    '  {"type":"plan","name":string,"currentAge":number?,"retirementAge":number?,"endAge":number?,"currentSavings":number?,"annualContribution":number?,"returnPct":number?,"inflationPct":number?,"incomeGoal":number?}',
    '  {"type":"compliance","title":string,"category":"filing"|"disclosure"|"policy"|"client_doc"|"review"|"other"?,"status":"not_started"|"in_progress"|"complete"?,"dueDate":"YYYY-MM-DD"?,"notes":string?}',
    'Dollar amounts are whole numbers (strip "$" and commas). Percentages are plain numbers (e.g. 60 for 60%).',
    `Resolve relative dates against today = ${today} (America/New_York).`,
    'Omit any field you cannot determine, and omit an action entirely if its required name/title is missing rather than guessing. Keep "reply" to one short sentence.',
    'Return {"actions":[],"reply":"<ask for what is missing>"} if nothing is actionable.',
  ].join('\n');

export async function runWealthCommand(userId: string, note: string): Promise<WealthCommandResult> {
  const text = note.trim();
  if (!text) return { overview: null, applied: [], skipped: [], reply: 'Type something to add.' };

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
      if (type === 'client') {
        const name = str(a.name);
        if (!name) {
          skipped.push('client — needs a name');
          continue;
        }
        await addClient(userId, {
          name,
          email: str(a.email),
          phone: str(a.phone),
          accountValue: num(a.accountValue),
          status: pickEnum<WealthClientStatus>(a.status, WEALTH_CLIENT_STATUSES),
          notes: str(a.notes),
        });
        applied.push(`Client: ${name}`);
        changed = true;
      } else if (type === 'portfolio') {
        const name = str(a.name);
        if (!name) {
          skipped.push('portfolio — needs a name');
          continue;
        }
        await addPortfolio(userId, { name, risk: pickEnum<PortfolioRisk>(a.risk, PORTFOLIO_RISKS), notes: str(a.notes) });
        applied.push(`Portfolio: ${name}`);
        changed = true;
      } else if (type === 'allocation') {
        const name = str(a.name);
        const pname = str(a.portfolio);
        if (!name || !pname) {
          skipped.push('sleeve — needs a name and a portfolio');
          continue;
        }
        const { portfolios } = await getPortfolios(userId);
        const target = portfolios.find((p) => p.name.toLowerCase() === pname.toLowerCase());
        if (!target) {
          skipped.push(`sleeve "${name}" — no portfolio named "${pname}"`);
          continue;
        }
        const pct = num(a.targetPct);
        await addAllocation(userId, target.id, {
          name,
          assetClass: pickEnum<AssetClass>(a.assetClass, ASSET_CLASSES),
          targetBp: pct != null ? Math.round(pct * 100) : undefined,
        });
        applied.push(`Sleeve: ${name}${pct != null ? ` ${pct}%` : ''} → ${target.name}`);
        changed = true;
      } else if (type === 'plan') {
        const name = str(a.name);
        if (!name) {
          skipped.push('plan — needs a name');
          continue;
        }
        const ret = num(a.returnPct);
        const infl = num(a.inflationPct);
        await addPlan(userId, {
          name,
          currentAge: num(a.currentAge),
          retirementAge: num(a.retirementAge),
          endAge: num(a.endAge),
          currentSavings: num(a.currentSavings),
          annualContribution: num(a.annualContribution),
          returnBp: ret != null ? Math.round(ret * 100) : undefined,
          inflationBp: infl != null ? Math.round(infl * 100) : undefined,
          incomeGoal: num(a.incomeGoal),
        });
        applied.push(`Plan: ${name}`);
        changed = true;
      } else if (type === 'compliance') {
        const title = str(a.title);
        if (!title) {
          skipped.push('compliance — needs a title');
          continue;
        }
        await addComplianceItem(userId, {
          title,
          category: pickEnum<ComplianceCategory>(a.category, COMPLIANCE_CATEGORIES),
          status: pickEnum<ComplianceStatus>(a.status, COMPLIANCE_STATUSES),
          dueAt: dateMs(a.dueDate),
          notes: str(a.notes),
        });
        applied.push(`Compliance: ${title}`);
        changed = true;
      } else {
        skipped.push(`${type || 'item'} — unrecognized`);
      }
    } catch (err) {
      skipped.push(`${str(a.name) ?? str(a.title) ?? (type || 'item')} — ${err instanceof Error ? err.message : 'could not add'}`);
    }
  }

  const fallback = applied.length
    ? `Added ${applied.length} item${applied.length === 1 ? '' : 's'}.`
    : 'Nothing to add — try "Add client Jane Doe, active, $250k".';

  return {
    overview: changed ? await getPracticeOverview(userId) : null,
    applied,
    skipped,
    reply: reply || fallback,
  };
}
