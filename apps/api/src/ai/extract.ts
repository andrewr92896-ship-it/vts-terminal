import type { WorkspaceKey } from '../auth/rbac.js';
import { extractFromInput, extractJson, type ImageMediaType } from './claude.js';

// "Fill this form with AI" — a single extractor that, given a free-text note
// and/or a screenshot, returns the fields for one of the app's manual-entry
// forms. Each entry KIND declares its target workspace (for access control),
// the fields to pull out, and how to validate them. The same field list builds
// both the model's instructions and the server-side coercion, so they can't
// drift apart. The model never auto-submits — it only fills the form for the
// user to review.

type Field =
  | { key: string; type: 'string'; desc: string; max?: number }
  | { key: string; type: 'number'; desc: string }
  | { key: string; type: 'int'; desc: string; min: number; max: number }
  | { key: string; type: 'date'; desc: string }
  | { key: string; type: 'enum'; desc: string; values: readonly string[] };

interface EntrySpec {
  workspace: WorkspaceKey;
  entity: string; // human label, e.g. "car deal"
  guide?: string; // extra context for the model
  fields: Field[];
}

// ---- value coercion -------------------------------------------------------

function asNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function coerceField(field: Field, value: unknown): unknown {
  if (value == null) return undefined;
  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') return undefined;
      const s = value.trim();
      return s ? s.slice(0, field.max ?? 500) : undefined;
    }
    case 'number': {
      const n = asNum(value);
      return n == null ? undefined : n;
    }
    case 'int': {
      const n = asNum(value);
      return n == null ? undefined : Math.min(field.max, Math.max(field.min, Math.round(n)));
    }
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
        ? value.trim()
        : undefined;
    case 'enum':
      return typeof value === 'string' && field.values.includes(value) ? value : undefined;
  }
}

// The JSON type hint shown to the model for each field.
function hint(field: Field): string {
  switch (field.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'int':
      return 'integer';
    case 'date':
      return '"YYYY-MM-DD"';
    case 'enum':
      return field.values.map((v) => `"${v}"`).join(' | ');
  }
}

function buildSystem(spec: EntrySpec): string {
  const shape = spec.fields.map((f) => `  "${f.key}": ${hint(f)} | null,  // ${f.desc}`).join('\n');
  return [
    `You extract the fields of a ${spec.entity} from the user's note and/or an attached screenshot, to pre-fill a form.`,
    spec.guide ?? '',
    'Respond with ONLY a JSON object (no prose, no code fences) of this shape:',
    '{',
    shape,
    '}',
    'Include only fields you can actually determine from the input. Use null (or omit the key) for anything not present — never guess or invent values.',
    'Amounts and prices are plain numbers with no currency symbols, commas, or units. Percentages are plain numbers (e.g. 6.5 means 6.5%).',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---- the registry ---------------------------------------------------------

const SPECS: Record<string, EntrySpec> = {
  kia_deal: {
    workspace: 'kia',
    entity: 'car sale (deal)',
    guide:
      'This is a single vehicle sale logged by a salesperson. "front" is front-end gross, "back" is back-end (F&I) gross; profit is the total when no split is given.',
    fields: [
      { key: 'customer', type: 'string', desc: "customer name, or 'Walk-in'", max: 120 },
      { key: 'model', type: 'string', desc: 'vehicle model/trim, e.g. "Sportage LX"', max: 120 },
      { key: 'type', type: 'enum', desc: 'New or Used', values: ['New', 'Used'] },
      { key: 'profit', type: 'number', desc: 'total profit (only if no front/back split given)' },
      { key: 'frontProfit', type: 'number', desc: 'front-end gross profit' },
      { key: 'backProfit', type: 'number', desc: 'back-end (F&I) gross profit' },
      { key: 'soldAt', type: 'date', desc: 'date of sale' },
    ],
  },
  trade: {
    workspace: 'trading',
    entity: 'trade (from a broker/platform screenshot or note)',
    guide:
      'A single executed or open trade. Prices are numbers. side is direction; status is whether the trade is still open or already closed. realizedPl is profit/loss in account currency (negative for a loss).',
    fields: [
      { key: 'broker', type: 'enum', desc: 'broker if identifiable', values: ['ftp', 'oanda', 'kraken', 'tradestation'] },
      { key: 'instrument', type: 'string', desc: 'ticker/instrument, e.g. "ES", "EUR/USD"', max: 40 },
      { key: 'side', type: 'enum', desc: 'long or short', values: ['long', 'short'] },
      { key: 'status', type: 'enum', desc: 'open or closed', values: ['open', 'closed'] },
      { key: 'plannedEntry', type: 'number', desc: 'planned entry price' },
      { key: 'entryPrice', type: 'number', desc: 'actual entry/fill price' },
      { key: 'exitPrice', type: 'number', desc: 'exit price (if closed)' },
      { key: 'takeProfit', type: 'number', desc: 'take-profit price' },
      { key: 'stopLoss', type: 'number', desc: 'stop-loss price' },
      { key: 'units', type: 'number', desc: 'position size / contracts' },
      { key: 'realizedPl', type: 'number', desc: 'realized profit/loss (negative for a loss)' },
      { key: 'strategy', type: 'string', desc: 'strategy/setup name', max: 80 },
      { key: 'timeframe', type: 'string', desc: 'chart timeframe, e.g. "5m"', max: 20 },
      { key: 'openedAt', type: 'date', desc: 'date the trade was opened' },
      { key: 'notes', type: 'string', desc: 'any notes', max: 500 },
    ],
  },
  expense: {
    workspace: 'finance',
    entity: 'recurring monthly expense / bill',
    fields: [
      { key: 'label', type: 'string', desc: 'name of the expense/bill', max: 80 },
      { key: 'amount', type: 'number', desc: 'monthly amount' },
      { key: 'dayOfMonth', type: 'int', desc: 'day of month it is due (1-31)', min: 1, max: 31 },
      { key: 'category', type: 'string', desc: 'category, e.g. "Housing", "Utilities"', max: 40 },
    ],
  },
  networth: {
    workspace: 'finance',
    entity: 'net-worth line item',
    guide: 'An asset (something owned) or a liability (something owed).',
    fields: [
      { key: 'label', type: 'string', desc: 'name of the asset or liability', max: 80 },
      { key: 'amount', type: 'number', desc: 'current value (positive number)' },
      { key: 'kind', type: 'enum', desc: 'asset or liability', values: ['asset', 'liability'] },
    ],
  },
  wealth_client: {
    workspace: 'wealth',
    entity: 'advisory client record',
    fields: [
      { key: 'name', type: 'string', desc: 'client full name', max: 120 },
      { key: 'email', type: 'string', desc: 'email address', max: 160 },
      { key: 'phone', type: 'string', desc: 'phone number', max: 40 },
      { key: 'accountValue', type: 'number', desc: 'account/portfolio value' },
      {
        key: 'status',
        type: 'enum',
        desc: 'relationship status',
        values: ['prospect', 'onboarding', 'active', 'inactive'],
      },
      { key: 'notes', type: 'string', desc: 'notes', max: 500 },
    ],
  },
  wealth_portfolio: {
    workspace: 'wealth',
    entity: 'model portfolio',
    fields: [
      { key: 'name', type: 'string', desc: 'portfolio name', max: 120 },
      {
        key: 'risk',
        type: 'enum',
        desc: 'risk profile',
        values: ['conservative', 'moderate_conservative', 'moderate', 'moderate_aggressive', 'aggressive'],
      },
      { key: 'notes', type: 'string', desc: 'notes', max: 500 },
    ],
  },
  wealth_allocation: {
    workspace: 'wealth',
    entity: 'portfolio allocation sleeve',
    guide: 'One holding/sleeve in a model portfolio. targetPct is its target weight as a percentage.',
    fields: [
      { key: 'name', type: 'string', desc: 'sleeve name or ticker, e.g. "US Large Cap" or "VTI"', max: 120 },
      {
        key: 'assetClass',
        type: 'enum',
        desc: 'asset class',
        values: ['us_equity', 'intl_equity', 'fixed_income', 'real_assets', 'cash', 'alternative', 'other'],
      },
      { key: 'targetPct', type: 'number', desc: 'target weight as a percent (0-100)' },
    ],
  },
  wealth_compliance: {
    workspace: 'wealth',
    entity: 'RIA compliance item / task',
    fields: [
      { key: 'title', type: 'string', desc: 'item title, e.g. "Form ADV annual amendment"', max: 160 },
      {
        key: 'category',
        type: 'enum',
        desc: 'category',
        values: ['filing', 'disclosure', 'policy', 'client_doc', 'review', 'other'],
      },
      {
        key: 'status',
        type: 'enum',
        desc: 'progress',
        values: ['not_started', 'in_progress', 'complete'],
      },
      { key: 'dueAt', type: 'date', desc: 'due date' },
      { key: 'notes', type: 'string', desc: 'notes', max: 500 },
    ],
  },
  trading_session: {
    workspace: 'trading',
    entity: 'trading session plan',
    guide:
      'A recurring session/window the trader plans around (e.g. London Open). openTime/closeTime are 24-hour HH:MM.',
    fields: [
      { key: 'name', type: 'string', desc: 'session name, e.g. "London Open"', max: 80 },
      { key: 'instrument', type: 'string', desc: 'instrument traded', max: 40 },
      { key: 'openTime', type: 'string', desc: 'session start, 24-hour "HH:MM"', max: 5 },
      { key: 'closeTime', type: 'string', desc: 'session end, 24-hour "HH:MM"', max: 5 },
      { key: 'timeframe', type: 'string', desc: 'chart timeframe, e.g. "M15"', max: 20 },
      { key: 'bias', type: 'enum', desc: 'directional bias', values: ['bull', 'bear', 'both', 'neutral'] },
      { key: 'bullPlan', type: 'string', desc: 'the bull-case playbook', max: 500 },
      { key: 'bearPlan', type: 'string', desc: 'the bear-case playbook', max: 500 },
      { key: 'notes', type: 'string', desc: 'notes', max: 500 },
    ],
  },
  trading_news: {
    workspace: 'trading',
    entity: 'market news headline',
    guide: 'A single news headline, often from an article or post screenshot.',
    fields: [
      { key: 'title', type: 'string', desc: 'the headline', max: 200 },
      { key: 'body', type: 'string', desc: 'detail/context', max: 1000 },
      { key: 'source', type: 'string', desc: 'source, e.g. "Reuters"', max: 80 },
      { key: 'url', type: 'string', desc: 'link to the article, if shown', max: 400 },
      {
        key: 'category',
        type: 'enum',
        desc: 'category',
        values: ['markets', 'geopolitical', 'economic', 'crypto', 'other'],
      },
      { key: 'impact', type: 'enum', desc: 'market impact', values: ['high', 'medium', 'low'] },
      { key: 'bias', type: 'enum', desc: 'directional read', values: ['bullish', 'bearish', 'neutral'] },
    ],
  },
  wealth_plan: {
    workspace: 'wealth',
    entity: 'retirement plan scenario',
    guide: 'returnPct and inflationPct are annual percentages (plain numbers, e.g. 6 or 2.5).',
    fields: [
      { key: 'name', type: 'string', desc: 'plan name', max: 120 },
      { key: 'currentAge', type: 'int', desc: 'current age', min: 0, max: 120 },
      { key: 'retirementAge', type: 'int', desc: 'retirement age', min: 0, max: 120 },
      { key: 'endAge', type: 'int', desc: 'plan end / life expectancy age', min: 0, max: 120 },
      { key: 'currentSavings', type: 'number', desc: 'current saved/invested balance' },
      { key: 'annualContribution', type: 'number', desc: 'annual contribution' },
      { key: 'returnPct', type: 'number', desc: 'assumed annual return %' },
      { key: 'inflationPct', type: 'number', desc: 'assumed annual inflation %' },
      { key: 'incomeGoal', type: 'number', desc: 'desired annual retirement income' },
    ],
  },
  todo: {
    workspace: 'todo',
    entity: 'to-do task',
    guide: 'Return one concise task. If the input lists several, pick the single most important one.',
    fields: [{ key: 'text', type: 'string', desc: 'the task text', max: 200 }],
  },
};

export function extractKinds(): string[] {
  return Object.keys(SPECS);
}

export function specForKind(kind: string): EntrySpec | undefined {
  return SPECS[kind];
}

export interface ExtractResult {
  fields: Record<string, unknown>;
  raw: string;
  model: string;
}

// Run the extraction for a known kind. The caller is responsible for verifying
// the user can access spec.workspace and for enforcing AI usage limits.
export async function extractEntry(
  kind: string,
  input: { note?: string; imageBase64?: string; mediaType?: ImageMediaType },
): Promise<ExtractResult> {
  const spec = SPECS[kind];
  if (!spec) throw new Error('Unknown entry type');

  const { raw, model } = await extractFromInput(buildSystem(spec), input);
  const json = (extractJson(raw) ?? {}) as Record<string, unknown>;

  const fields: Record<string, unknown> = {};
  for (const field of spec.fields) {
    const v = coerceField(field, json[field.key]);
    if (v !== undefined) fields[field.key] = v;
  }
  return { fields, raw, model };
}
