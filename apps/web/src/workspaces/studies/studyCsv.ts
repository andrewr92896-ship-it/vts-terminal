import type { DeckQuestion, Flashcard, FlashcardInput } from '../../api/types';

// CSV import/export for Study Creation. Study games and flashcard sets can be
// imported from a spreadsheet-style CSV (parsed here on the client, no AI) and
// exported back to one, so a team can edit its content in Excel/Sheets and
// round-trip it. A header row names the columns, so exports re-import cleanly.

type Letter = 'A' | 'B' | 'C' | 'D';
const LETTERS: Letter[] = ['A', 'B', 'C', 'D'];

// ---- Generic RFC-4180-ish CSV ----

// Parse CSV text into a grid of rows. Handles quoted fields (with embedded
// commas, newlines, and "" escaped quotes) and CRLF or LF line endings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, ''); // strip a leading BOM (Excel writes one)
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);
  // Drop a single trailing empty row produced by a final newline.
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function stringifyCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Trigger a browser download of CSV text. Prepends a BOM so Excel opens UTF-8
// correctly, and sanitizes the filename.
export function downloadCsv(name: string, csv: string): void {
  const file = `${name.replace(/[^\w.-]+/g, '_').replace(/\.csv$/i, '') || 'export'}.csv`;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Find the index of the first header cell matching any of `names` (case- and
// whitespace-insensitive), or -1.
function headerIndex(header: string[], names: string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

// ---- Study-game questions ----

export const QUESTION_CSV_HEADERS = ['Topic', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Explanation'];

// A tiny sample file the author can download, fill in, and re-import.
export function questionTemplateCsv(): string {
  return stringifyCsv([
    QUESTION_CSV_HEADERS,
    ['Basics', 'What is 2 + 2?', '3', '4', '5', '22', 'B', 'Two plus two is four.'],
  ]);
}

export function questionsToCsv(questions: DeckQuestion[]): string {
  const rows: string[][] = [QUESTION_CSV_HEADERS];
  for (const q of questions) {
    const opt = (l: Letter) => q.options.find((o) => o.label === l)?.text ?? '';
    rows.push([q.topic ?? '', q.stem, opt('A'), opt('B'), opt('C'), opt('D'), q.answer, q.explanation ?? '']);
  }
  return stringifyCsv(rows);
}

export interface ParsedQuestionsCsv {
  questions: DeckQuestion[];
  error: string | null; // blocking: nothing usable was parsed
  skipped: string[]; // per-row problems for rows that were dropped
}

export function parseQuestionsCsv(text: string): ParsedQuestionsCsv {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length === 0) return { questions: [], error: 'The CSV file is empty.', skipped: [] };
  const header = rows[0];
  const iStem = headerIndex(header, ['question', 'stem', 'prompt']);
  const iA = headerIndex(header, ['option a', 'a', 'optiona']);
  const iB = headerIndex(header, ['option b', 'b', 'optionb']);
  const iC = headerIndex(header, ['option c', 'c', 'optionc']);
  const iD = headerIndex(header, ['option d', 'd', 'optiond']);
  const iAns = headerIndex(header, ['answer', 'correct', 'correct answer', 'key']);
  const iTopic = headerIndex(header, ['topic', 'category']);
  const iExp = headerIndex(header, ['explanation', 'why', 'rationale']);
  if (iStem === -1 || iA === -1 || iB === -1 || iC === -1 || iD === -1 || iAns === -1) {
    return {
      questions: [],
      error: 'The CSV needs a header row with columns: Question, Option A, Option B, Option C, Option D, Answer (Topic and Explanation are optional).',
      skipped: [],
    };
  }
  const out: DeckQuestion[] = [];
  const skipped: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i].trim() : '');
    const stem = cell(iStem);
    const opts: Record<Letter, string> = { A: cell(iA), B: cell(iB), C: cell(iC), D: cell(iD) };
    if (!stem && LETTERS.every((l) => !opts[l])) continue; // wholly blank line
    const rowNum = r + 1;
    if (!stem) {
      skipped.push(`Row ${rowNum}: missing the question text.`);
      continue;
    }
    if (LETTERS.some((l) => !opts[l])) {
      skipped.push(`Row ${rowNum}: needs all four options A–D filled in.`);
      continue;
    }
    // Resolve the answer to a letter: accept "B", "Option B", or the full text
    // of the correct option.
    const rawAns = cell(iAns);
    const up = rawAns.toUpperCase();
    let ans: Letter | null = null;
    if ((LETTERS as string[]).includes(up)) ans = up as Letter;
    else {
      const m = up.match(/\b([ABCD])\b/);
      if (m) ans = m[1] as Letter;
      else {
        const hit = LETTERS.find((l) => opts[l].toLowerCase() === rawAns.toLowerCase());
        if (hit) ans = hit;
      }
    }
    if (!ans) {
      skipped.push(`Row ${rowNum}: Answer must be A, B, C, or D.`);
      continue;
    }
    out.push({
      seq: out.length + 1,
      topic: cell(iTopic).slice(0, 60) || 'General',
      stem: stem.slice(0, 600),
      options: LETTERS.map((l) => ({ label: l, text: opts[l].slice(0, 400) })),
      answer: ans,
      explanation: cell(iExp).slice(0, 400) || null,
      sourceName: null,
    });
  }
  if (out.length === 0) {
    return { questions: [], error: skipped[0] ?? 'No valid questions were found in the CSV.', skipped };
  }
  return { questions: out, error: null, skipped };
}

// ---- Flashcard sets ----

export const CARD_CSV_HEADERS = ['Term', 'Definition', 'Topic'];

export function cardTemplateCsv(): string {
  return stringifyCsv([CARD_CSV_HEADERS, ['Delta', 'The rate of change of an option’s price per $1 move in the underlying.', 'Greeks']]);
}

export function cardsToCsv(cards: Flashcard[]): string {
  const rows: string[][] = [CARD_CSV_HEADERS];
  for (const c of cards) rows.push([c.term, c.def, c.topic ?? '']);
  return stringifyCsv(rows);
}

export interface ParsedCardsCsv {
  cards: FlashcardInput[];
  error: string | null;
  skipped: string[];
}

export function parseCardsCsv(text: string): ParsedCardsCsv {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length === 0) return { cards: [], error: 'The CSV file is empty.', skipped: [] };
  const header = rows[0];
  const iTerm = headerIndex(header, ['term', 'word', 'front']);
  const iDef = headerIndex(header, ['definition', 'def', 'meaning', 'back']);
  const iTopic = headerIndex(header, ['topic', 'category']);
  if (iTerm === -1 || iDef === -1) {
    return { cards: [], error: 'The CSV needs a header row with columns: Term, Definition (Topic is optional).', skipped: [] };
  }
  const out: FlashcardInput[] = [];
  const skipped: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i].trim() : '');
    const term = cell(iTerm);
    const def = cell(iDef);
    if (!term && !def) continue;
    const rowNum = r + 1;
    if (!term || !def) {
      skipped.push(`Row ${rowNum}: needs both a term and a definition.`);
      continue;
    }
    out.push({ term: term.slice(0, 300), def: def.slice(0, 2000), topic: cell(iTopic).slice(0, 60) || null });
  }
  if (out.length === 0) return { cards: [], error: skipped[0] ?? 'No valid cards were found in the CSV.', skipped };
  return { cards: out, error: null, skipped };
}
