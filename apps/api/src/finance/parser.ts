import {
  addExpense,
  addNetWorth,
  updateSettings,
  getOverview,
  listExpenses,
  getNetWorth,
  type FinanceOverview,
  type Expense,
  type NetWorthData,
} from './service.js';
import { FTP_PHASES, NET_WORTH_KINDS, type FtpPhase, type NetWorthKind } from '../db/schema.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Plain-English finance logger for Personal Finance (sibling of the Kia deal
// parser and the to-do command bar). Claude (Sonnet) turns a short note into a
// list of structured actions; the server validates each and applies it through
// the normal finance services. Several things can be added in one line.

export interface FinanceCommandResult {
  overview: FinanceOverview | null; // refreshed when anything changed
  expenses: Expense[] | null;
  networth: NetWorthData | null;
  applied: string[];
  skipped: string[];
  reply: string;
}

interface ParsedAction {
  type?: string;
  label?: unknown;
  amount?: unknown;
  dayOfMonth?: unknown;
  category?: unknown;
  kind?: unknown;
  ftpPhase?: unknown;
  ftpDivisor?: unknown;
  ftpPayoutPct?: unknown;
}

const MAX_ACTIONS = 25;

function etToday(): { day: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', day: '2-digit' });
  return { day: +fmt.format(new Date()) };
}

// Coerce numbers that may arrive as "$1,200" style strings.
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,]/g, '').trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

const SYSTEM = (today: number) =>
  [
    'You turn a short personal-finance note into a JSON list of actions and return ONLY a JSON object.',
    'Shape: {"actions":[ACTION,...],"reply":string}. Each ACTION is one of:',
    '  {"type":"expense","label":string,"amount":number,"dayOfMonth":1-31,"category":string?}  — a recurring monthly bill.',
    '  {"type":"networth","label":string,"amount":number,"kind":"asset"|"liability"}  — a net-worth account, asset, or debt.',
    '  {"type":"settings","ftpPhase":"testing"|"funded"?,"ftpDivisor":number?,"ftpPayoutPct":number?}  — Funded Trading Plus scaling settings.',
    'Amounts are whole US dollars (strip "$" and commas). For an expense, dayOfMonth is the day of the month it leaves the bank; default to today\'s day (' +
      today +
      ') if none is given.',
    'Decide expense vs net-worth from the words: bills/subscriptions/rent/payments are expenses; things you own (car, savings, 401k, house) are assets; debts you owe (loan, credit card, mortgage balance) are liabilities.',
    'Only include a "settings" action when the note clearly asks to change FTP phase, divisor, or payout percentage.',
    'If a number cannot be determined for an item, omit that action rather than guessing. Keep "reply" to one short sentence describing what you logged.',
    'Return {"actions":[],"reply":"<ask for what is missing>"} if nothing is actionable.',
  ].join('\n');

export async function runFinanceCommand(userId: string, note: string): Promise<FinanceCommandResult> {
  const text = note.trim();
  if (!text) return { overview: null, expenses: null, networth: null, applied: [], skipped: [], reply: 'Type something to add.' };

  const raw = await askClaude(`NOTE: ${text}`, SYSTEM(etToday().day));
  const parsed = extractJson(raw) as { actions?: unknown; reply?: unknown } | null;
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 300) : '';
  const actions = Array.isArray(parsed?.actions) ? (parsed!.actions as ParsedAction[]).slice(0, MAX_ACTIONS) : [];

  const applied: string[] = [];
  const skipped: string[] = [];
  let changedExpenses = false;
  let changedNetworth = false;
  let changedSettings = false;

  const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

  for (const a of actions) {
    const type = typeof a?.type === 'string' ? a.type.toLowerCase() : '';
    try {
      if (type === 'expense') {
        const label = str(a.label);
        const amount = num(a.amount);
        if (!label || amount == null) {
          skipped.push(`${label ?? 'expense'} — needs a label and amount`);
          continue;
        }
        const day = num(a.dayOfMonth);
        await addExpense(userId, {
          label,
          amount,
          dayOfMonth: day ?? etToday().day,
          category: str(a.category) ?? null,
        });
        changedExpenses = true;
        applied.push(`Expense: ${label} ${usd(amount)} (day ${day ?? etToday().day})`);
      } else if (type === 'networth' || type === 'asset' || type === 'liability') {
        const label = str(a.label);
        const amount = num(a.amount);
        const kind: NetWorthKind = (NET_WORTH_KINDS as readonly string[]).includes(String(a.kind))
          ? (a.kind as NetWorthKind)
          : type === 'liability'
            ? 'liability'
            : 'asset';
        if (!label || amount == null) {
          skipped.push(`${label ?? 'item'} — needs a label and amount`);
          continue;
        }
        await addNetWorth(userId, { label, amount, kind });
        changedNetworth = true;
        applied.push(`${kind === 'liability' ? 'Liability' : 'Asset'}: ${label} ${usd(amount)}`);
      } else if (type === 'settings') {
        const patch: { ftpPhase?: FtpPhase; ftpDivisor?: number; ftpPayoutPct?: number } = {};
        if (typeof a.ftpPhase === 'string' && (FTP_PHASES as readonly string[]).includes(a.ftpPhase)) patch.ftpPhase = a.ftpPhase as FtpPhase;
        const div = num(a.ftpDivisor);
        if (div != null && div > 0) patch.ftpDivisor = div;
        const pct = num(a.ftpPayoutPct);
        if (pct != null) patch.ftpPayoutPct = pct;
        if (!Object.keys(patch).length) {
          skipped.push('settings — nothing recognizable to change');
          continue;
        }
        await updateSettings(userId, patch);
        changedSettings = true;
        const bits = [
          patch.ftpPhase && `phase ${patch.ftpPhase}`,
          patch.ftpDivisor != null && `÷${patch.ftpDivisor}`,
          patch.ftpPayoutPct != null && `${patch.ftpPayoutPct}% payout`,
        ].filter(Boolean);
        applied.push(`FTP: ${bits.join(', ')}`);
      } else {
        skipped.push(`${type || 'item'} — unrecognized`);
      }
    } catch (err) {
      skipped.push(`${str(a.label) ?? (type || 'item')} — ${err instanceof Error ? err.message : 'could not add'}`);
    }
  }

  const anything = changedExpenses || changedNetworth || changedSettings;
  const fallback = applied.length
    ? `Added ${applied.length} item${applied.length === 1 ? '' : 's'}.`
    : 'Nothing to add — try "Add a $120 phone bill on the 15th".';

  return {
    overview: anything ? await getOverview(userId) : null,
    expenses: changedExpenses ? await listExpenses(userId) : null,
    networth: changedNetworth ? await getNetWorth(userId) : null,
    applied,
    skipped,
    reply: reply || fallback,
  };
}
