import {
  addItem,
  addSection,
  getTodo,
  moveItem,
  removeItem,
  toggleItem,
  type DecoratedSection,
  type MoveTarget,
} from './service.js';
import { askClaude, extractJson } from '../ai/claude.js';
import type { SectionType } from '../db/schema.js';

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
interface AddSectionAction {
  type: 'add_section';
  title?: string;
  sectionType?: string;
  icon?: string;
}
interface ItemAction {
  type: 'check' | 'uncheck' | 'remove';
  code?: string;
}
interface MoveAction {
  type: 'move';
  code?: string;
  to?: string; // 'top' | 'bottom'
  direction?: string; // 'up' | 'down'
  by?: number;
}
type ParsedAction = AddAction | AddSectionAction | ItemAction | MoveAction;

// Section types a user may create through the command bar. Recurring-interval
// types are excluded (no per-item interval is configured for new sections).
const CREATABLE_TYPES: SectionType[] = ['one', 'daily', 'note'];

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
  '- {"type":"add_section","title":"<new section name>","sectionType":"one|daily|note"} — create a NEW section/category. Use "one" (a checklist of tasks) unless the user clearly wants a daily-reset reference list ("daily") or free-form notes ("note"). Default to "one". You may add tasks into a section you create in the same command by referencing its title in an "add" action.',
  '- {"type":"check","code":"<item code like 7.3>"} — mark an existing task done.',
  '- {"type":"uncheck","code":"<item code>"} — mark an existing task not done.',
  '- {"type":"remove","code":"<item code>"} — delete an existing task.',
  '- {"type":"move","code":"<item code>","to":"top"|"bottom"} — move a task to the top or bottom of its section.',
  '- {"type":"move","code":"<item code>","direction":"up"|"down","by":<number>} — move a task up or down by N places within its section (default by 1).',
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

  const applied: string[] = [];
  const skipped: string[] = [];
  const acts = actions.slice(0, MAX_ACTIONS);

  // Sections created by this command, so a later "add" action in the same
  // command can target one of them by title or number.
  const created: { id: string; n: number; title: string }[] = [];
  const sectionExists = (title: string) => {
    const r = title.toLowerCase();
    return (
      sections.some((s) => s.title.toLowerCase() === r) ||
      created.some((s) => s.title.toLowerCase() === r)
    );
  };
  const findSection = (ref: string | undefined) => {
    if (!ref) return undefined;
    const r = ref.trim().toLowerCase();
    const pool = [
      ...sections.map((s) => ({ id: s.id, n: s.n, title: s.title })),
      ...created,
    ];
    return (
      pool.find((s) => s.title.toLowerCase() === r) ??
      pool.find((s) => String(s.n) === r) ??
      pool.find((s) => `${s.n}. ${s.title}`.toLowerCase() === r) ??
      pool.find((s) => s.title.toLowerCase().includes(r))
    );
  };

  // Pass 1: create any new sections up front, so tasks can be added into them
  // in the same command.
  for (const a of acts) {
    if (a.type !== 'add_section') continue;
    const title = (a.title ?? '').trim().slice(0, 80);
    if (!title) {
      skipped.push('New section with no name');
      continue;
    }
    if (sectionExists(title)) {
      skipped.push(`Section “${title}” already exists`);
      continue;
    }
    const type: SectionType =
      typeof a.sectionType === 'string' && CREATABLE_TYPES.includes(a.sectionType as SectionType)
        ? (a.sectionType as SectionType)
        : 'one';
    try {
      const { id, n } = await addSection(
        userId,
        title,
        type,
        typeof a.icon === 'string' ? a.icon : undefined,
      );
      created.push({ id, n, title });
      applied.push(`Added section “${title}”`);
    } catch (err) {
      skipped.push(`Add section “${title}” — failed${err instanceof Error ? `: ${err.message}` : ''}`);
    }
  }

  type Op =
    | { kind: 'add'; sectionId: string; text: string; label: string }
    | { kind: 'toggle'; id: string; label: string }
    | { kind: 'remove'; id: string; label: string }
    | { kind: 'move'; id: string; target: MoveTarget; label: string };

  const ops: Op[] = [];

  // Pass 2: resolve the remaining actions against the snapshot (+ new sections).
  for (const a of acts) {
    if (a.type === 'add_section') continue; // handled in pass 1
    if (isAddAction(a)) {
      const taskText = (a.text ?? '').trim();
      if (!taskText) {
        skipped.push('Add with no task text');
        continue;
      }
      const sec = findSection(a.section) ?? findSection('Priority') ?? sections[0] ?? created[0];
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
    } else if (a.type === 'move') {
      const item = a.code ? byCode.get(a.code.trim()) : undefined;
      if (!item) {
        skipped.push(`move ${a.code ?? '?'} (no matching task)`);
        continue;
      }
      const to = typeof a.to === 'string' ? a.to.toLowerCase() : '';
      const dir = typeof a.direction === 'string' ? a.direction.toLowerCase() : '';
      const by = Math.max(1, Math.floor(typeof a.by === 'number' ? a.by : 1));
      let target: MoveTarget | null = null;
      let how = '';
      if (to === 'top') {
        target = { kind: 'top' };
        how = 'to the top';
      } else if (to === 'bottom') {
        target = { kind: 'bottom' };
        how = 'to the bottom';
      } else if (dir === 'up') {
        target = { kind: 'up', by };
        how = `up ${by}`;
      } else if (dir === 'down') {
        target = { kind: 'down', by };
        how = `down ${by}`;
      }
      if (!target) {
        skipped.push(`move “${item.text}” (unclear direction)`);
        continue;
      }
      ops.push({ kind: 'move', id: item.id, target, label: `Moved “${item.text}” ${how}` });
    } else {
      skipped.push(`Unknown action`);
    }
  }

  for (const op of ops) {
    try {
      if (op.kind === 'add') await addItem(userId, op.sectionId, op.text);
      else if (op.kind === 'toggle') await toggleItem(userId, op.id);
      else if (op.kind === 'move') await moveItem(userId, op.id, op.target);
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
