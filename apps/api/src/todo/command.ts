import { addItem, getTodo, removeItem, toggleItem, type DecoratedSection } from './service.js';
import { askClaude, extractJson } from '../ai/claude.js';

// Natural-language / shorthand command bar for the To Do list. Claude (Sonnet)
// turns a line like "add to Finance: call the vet · done 7.3 · remove 1.2" into
// structured actions, which the server resolves against the user's *current*
// list and applies through the normal todo services. Item references are
// resolved against a single snapshot so codes can't drift mid-apply.

const MAX_ACTIONS = 25;

interface AddAction {
  type: 'add';
  section?: string;
  text?: string;
}
interface ItemAction {
  type: 'check' | 'uncheck' | 'remove';
  code?: string;
}
type ParsedAction = AddAction | ItemAction;

export interface CommandResult {
  sections: DecoratedSection[];
  applied: string[]; // human-readable summary of what was done
  skipped: string[]; // things that couldn't be resolved
  reply: string; // Claude's one-line summary
}

function buildContext(sections: DecoratedSection[]): string {
  const secLines = sections
    .map((s) => `${s.n}. ${s.title} (${s.type})`)
    .join('\n');
  const itemLines = sections
    .flatMap((s) =>
      s.items.map((i) => {
        const box = i.checkable ? (i.done ? '[x]' : '[ ]') : '[-]';
        return `${i.code} ${box} ${i.text}`;
      }),
    )
    .join('\n');
  return `SECTIONS (use the exact title or its number for "add"):\n${secLines || '(none)'}\n\nITEMS (use the code for check/uncheck/remove):\n${itemLines || '(none)'}`;
}

const SYSTEM = [
  'You convert a user\'s short to-do command into structured JSON actions for their list.',
  'You are given the current SECTIONS and ITEMS. Respond with ONLY a JSON object, no prose, of the form:',
  '{"actions":[...],"reply":"<one short sentence>"}',
  'Allowed actions:',
  '- {"type":"add","section":"<section title or number>","text":"<task text>"} — add a new task. If no section is clear, use "Priority".',
  '- {"type":"check","code":"<item code like 7.3>"} — mark an existing task done.',
  '- {"type":"uncheck","code":"<item code>"} — mark an existing task not done.',
  '- {"type":"remove","code":"<item code>"} — delete an existing task.',
  'Only reference codes that appear in ITEMS. Resolve a task the user describes in words to its code. If you cannot tell what they mean, return an empty actions array and explain in "reply".',
  'A single command may contain several actions separated by commas, "and", "·", or newlines. Keep "reply" to one short sentence describing what you did.',
].join('\n');

function isAddAction(a: ParsedAction): a is AddAction {
  return a.type === 'add';
}

export async function runCommand(userId: string, command: string): Promise<CommandResult> {
  const text = command.trim();
  const sections = await getTodo(userId);

  if (!text) {
    return { sections, applied: [], skipped: [], reply: 'Type a command and I’ll update your list.' };
  }

  const context = buildContext(sections);
  const raw = await askClaude(`${context}\n\nCOMMAND: ${text}`, SYSTEM);
  const parsed = extractJson(raw) as { actions?: unknown; reply?: unknown } | null;

  const reply = typeof parsed?.reply === 'string' ? parsed.reply.slice(0, 300) : '';
  const actions = Array.isArray(parsed?.actions) ? (parsed!.actions as ParsedAction[]) : [];

  if (actions.length === 0) {
    return {
      sections,
      applied: [],
      skipped: [],
      reply: reply || 'I couldn’t tell what to change — try “add to Finance: pay rent” or “done 1.2”.',
    };
  }

  // Resolve every action against the single snapshot before applying anything.
  const byCode = new Map<string, { id: string; text: string; done: boolean; checkable: boolean }>();
  for (const s of sections) {
    for (const i of s.items) {
      byCode.set(i.code, { id: i.id, text: i.text, done: i.done, checkable: i.checkable });
    }
  }
  const findSection = (ref: string | undefined) => {
    if (!ref) return undefined;
    const r = ref.trim().toLowerCase();
    return (
      sections.find((s) => s.title.toLowerCase() === r) ??
      sections.find((s) => String(s.n) === r) ??
      sections.find((s) => `${s.n}. ${s.title}`.toLowerCase() === r) ??
      sections.find((s) => s.title.toLowerCase().includes(r))
    );
  };

  type Op =
    | { kind: 'add'; sectionId: string; text: string; label: string }
    | { kind: 'toggle'; id: string; label: string }
    | { kind: 'remove'; id: string; label: string };

  const ops: Op[] = [];
  const skipped: string[] = [];

  for (const a of actions.slice(0, MAX_ACTIONS)) {
    if (isAddAction(a)) {
      const taskText = (a.text ?? '').trim();
      if (!taskText) {
        skipped.push('Add with no task text');
        continue;
      }
      const sec = findSection(a.section) ?? sections.find((s) => s.title === 'Priority') ?? sections[0];
      if (!sec) {
        skipped.push(`Add “${taskText}” (no section found)`);
        continue;
      }
      ops.push({ kind: 'add', sectionId: sec.id, text: taskText.slice(0, 500), label: `Added “${taskText}” to ${sec.title}` });
    } else if (a.type === 'check' || a.type === 'uncheck' || a.type === 'remove') {
      const item = a.code ? byCode.get(a.code.trim()) : undefined;
      if (!item) {
        skipped.push(`${a.type} ${a.code ?? '?'} (no matching task)`);
        continue;
      }
      if (a.type === 'remove') {
        ops.push({ kind: 'remove', id: item.id, label: `Removed “${item.text}”` });
      } else if (!item.checkable) {
        skipped.push(`${a.type} “${item.text}” (not checkable)`);
      } else {
        const wantDone = a.type === 'check';
        if (item.done === wantDone) {
          skipped.push(`“${item.text}” already ${wantDone ? 'done' : 'not done'}`);
        } else {
          ops.push({ kind: 'toggle', id: item.id, label: `${wantDone ? 'Checked' : 'Unchecked'} “${item.text}”` });
        }
      }
    } else {
      skipped.push(`Unknown action`);
    }
  }

  const applied: string[] = [];
  for (const op of ops) {
    try {
      if (op.kind === 'add') await addItem(userId, op.sectionId, op.text);
      else if (op.kind === 'toggle') await toggleItem(userId, op.id);
      else await removeItem(userId, op.id);
      applied.push(op.label);
    } catch (err) {
      skipped.push(`${op.label} — failed${err instanceof Error ? `: ${err.message}` : ''}`);
    }
  }

  return {
    sections: await getTodo(userId),
    applied,
    skipped,
    reply: reply || (applied.length ? 'Done.' : 'Nothing was changed.'),
  };
}
