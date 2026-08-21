import type { DeckQuestion } from '../../../api/types';
import { RIGHTS_BLOCK } from './handoffPrompt';

// What one study game can hold. The server refuses more on the create route, so
// catching it here is what turns a raw 400 into a sentence naming the number.
export const MAX_GAME_QUESTIONS = 1000;

// The handoff a creator takes to their OWN AI to have a study game written or
// formatted, and the reader for what comes back.
//
// Composed here, locally, from fixed sections plus the plan's values — no VTS AI
// call to write it and none to read the result. That is the same economics the
// package handoff runs on: the terminal defines the structure and checks the
// answer, somebody else's model does the writing.
//
// It is deliberately NOT the package handoff. That one describes a whole study
// package — categories, flashcards, slides, lessons — and commits through the
// package importer. This one asks for one thing, a list of questions, and the
// answer lands on the wizard's own "Check the questions" screen and is created
// as an ordinary study game. Somebody in the study-game maker asked for a study
// game; handing them a package instead would be answering a question they did
// not ask. What the two share is `RIGHTS_BLOCK`, because the terminal's position
// on what it is asking an outside model to do is one position.

export const GAME_FILE_NAME = 'vts-study-game.json';
export const GAME_SCHEMA_VERSION = 1;
export const GAME_FORMAT = 'vts-study-game';
export const GAME_PART_FORMAT = 'vts-study-game-part';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
type Letter = (typeof LETTERS)[number];

export interface GameHandoffPlan {
  name: string;
  subject: string;
  /** Null when the creator said "however many my material has". */
  count: number | null;
  instructions: string;
  /** True when they already hold the questions and want them formatted. */
  formatExisting: boolean;
  explanations: boolean;
  topics: boolean;
}

function countLine(plan: GameHandoffPlan): string {
  if (plan.count != null) return `exactly ${plan.count}`;
  return plan.formatExisting
    ? 'as many as the material I give you contains — do not drop any of them, and do not pad it out'
    : 'YOU CHOOSE — pick a number appropriate to the subject, and produce that many';
}

/**
 * The whole handoff, ready to copy.
 *
 * `gameId` is the draft's own id and comes back on the file. It is import
 * identity only: nothing stores it, and a file carrying a different one is a
 * WARNING rather than a refusal — the same rule the package importer settled
 * on, because everything that establishes the CONTENT is checked on the content
 * itself, and refusing on the id alone only ever punished somebody whose saved
 * plan had gone.
 */
export function buildGameHandoff(plan: GameHandoffPlan, gameId: string): string {
  const source = plan.formatExisting
    ? [
        'SOURCE MATERIAL',
        'I will paste or attach questions I already have in this chat.',
        '- Structure, validate and normalize them into the format below.',
        '- Do NOT rewrite a sound question merely to make it different — preserve what each one is testing.',
        '- Where a question has fewer than four options, write the missing distractors so that exactly one option is still correct.',
        '- Where a question has more than four, keep the correct one and the three strongest distractors.',
        '- If a question is ambiguous or its answer looks wrong, tell me about that one rather than guessing.',
        '',
      ].join('\n')
    : ['SOURCE MATERIAL', 'Work from the subject above and whatever instructions I give you in this chat.', ''].join('\n');

  return `VTS STUDY GAME HANDOFF

You are helping me ${plan.formatExisting ? 'format questions I already have' : 'write practice questions'} that I will import into VTS Terminal as a study game.

IMPORTANT WORKFLOW
- Ask me only ONE question at a time.
- Wait for my answer before asking the next question.
- Do not give me a long list of questions to answer.
- Ask only what you still need in order to produce the game below.
- Treat the VTS plan as locked unless a field says you may choose it.
- Before producing the final file, give me a short plain-language summary of what you are about to produce.

LOCKED VTS PLAN
Game ID: ${gameId}
Game name: ${plan.name || plan.subject}
Subject: ${plan.subject}
Mode: ${plan.formatExisting ? 'format questions I already have' : 'write new questions'}
Question count: ${countLine(plan)}
Explanations: ${plan.explanations ? 'required on EVERY question' : 'optional — you may leave explanation null'}
Topic labels: ${plan.topics ? 'required — reuse a small set of 2-8 short topic labels across the whole game' : 'not needed — leave topic null'}
${plan.instructions.trim() ? `\nMY INSTRUCTIONS\n${plan.instructions.trim()}\n` : ''}
${source}
CONTENT RULES
- Every question has exactly FOUR answer options, labelled A, B, C and D.
- Exactly one option is correct, and "answer" names its label.
- No option is blank, and no two options on one question are the same.
- Avoid duplicate or near-duplicate questions.
- Questions should test understanding, not trivial wording changes.
- ${plan.explanations ? 'Give a concise, useful explanation for every question — one or two sentences.' : 'Explanations are optional for this game.'}

${RIGHTS_BLOCK}

FINAL OUTPUT
When all necessary questions have been answered:
1. Produce a VTS Study Game conforming exactly to schemaVersion ${GAME_SCHEMA_VERSION}.
2. Use Game ID ${gameId}.
3. Return valid UTF-8 JSON matching the schema below, and nothing else.
4. Do not add commentary inside the JSON.
5. If your tool can create files, create a file named ${GAME_FILE_NAME}.
6. If it cannot, return the JSON in ONE code block so I can copy it.
7. If the game will not fit in one response, use the multipart schema below exactly and produce ONE numbered part at a time. Wait for me to tell you to continue before producing the next part.

VTS SCHEMA
{
  "format": "${GAME_FORMAT}",
  "schemaVersion": ${GAME_SCHEMA_VERSION},
  "gameId": "${gameId}",
  "name": "string",
  "questions": [
    {
      "stem": "string",
      "options": [ {"label":"A","text":"string"}, {"label":"B","text":"string"}, {"label":"C","text":"string"}, {"label":"D","text":"string"} ],
      "answer": "A",
      "topic": ${plan.topics ? '"string"' : 'null'},
      "explanation": ${plan.explanations ? '"string"' : 'null'}
    }
  ]
}

VTS MULTIPART SCHEMA (only if the game will not fit in one response)
{
  "format": "${GAME_PART_FORMAT}",
  "schemaVersion": ${GAME_SCHEMA_VERSION},
  "gameId": "${gameId}",
  "partIndex": 1,
  "partCount": 3,
  "questions": [ "…the same question objects as above, this part's share of them…" ]
}
`;
}

/**
 * Instructions for fixing a file that would not read.
 *
 * Names the schema and the problems and deliberately not the whole game — it is
 * often enormous and is already in the AI's own conversation.
 */
export function buildGameRepairPrompt(gameId: string, problems: string[]): string {
  return `VTS STUDY GAME — CORRECTIONS NEEDED

The study game you produced did not pass checking in VTS Terminal.

Game ID: ${gameId}
Schema version: ${GAME_SCHEMA_VERSION}

PROBLEMS FOUND
${problems.map((p) => `- ${p}`).join('\n')}

WHAT TO DO
- Fix exactly these problems in the game you already produced.
- Change nothing else. Keep every other question exactly as it is.
- Keep the same Game ID.
- Return the corrected game as valid JSON only, with no commentary outside it.
- If you produced it in numbered parts, return only the corrected parts, each with its original partIndex and partCount.

${RIGHTS_BLOCK}
`;
}

// ---- Reading what came back ----

export interface GameReadResult {
  questions: DeckQuestion[];
  /** Blocking problems, in the creator's language. Empty means it can be used. */
  errors: string[];
  /** Worth saying, but not a refusal. */
  warnings: string[];
  /** The name the AI gave the game, when it gave one. */
  name: string | null;
}

/** Strip ONE surrounding code fence and nothing else. No brace hunting, no
 *  quote repair — a file that needs guessing at is a file to send back. */
function unfence(text: string): string {
  const t = text.trim();
  const m = /^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n?```$/.exec(t);
  return m ? m[1].trim() : t;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

interface ParsedDoc {
  gameId: string | null;
  name: string | null;
  partIndex: number | null;
  partCount: number | null;
  raw: unknown[];
}

/**
 * Read one or more documents into a set of questions.
 *
 * Every problem names the thing — "Question 47 has no option D", not "invalid
 * JSON" — because a creator can act on the first and not on the second. It
 * reports what it could not use rather than silently dropping it: a game
 * quietly two questions short is worse than one that refuses.
 */
export function readGameDocs(texts: string[], expectedGameId: string): GameReadResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const docs: ParsedDoc[] = [];

  texts.forEach((text, i) => {
    const label = texts.length > 1 ? `File ${i + 1}: ` : '';
    let json: unknown;
    try {
      json = JSON.parse(unfence(text));
    } catch {
      errors.push(`${label}that is not valid JSON. Copy the whole code block your AI produced, including the opening { and the closing }.`);
      return;
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      errors.push(`${label}the file should be one JSON object, not ${Array.isArray(json) ? 'a list' : 'a bare value'}.`);
      return;
    }
    const o = json as Record<string, unknown>;
    const format = asString(o.format);
    if (format && format !== GAME_FORMAT && format !== GAME_PART_FORMAT) {
      errors.push(`${label}this is a "${format}" file, not a study game. Ask your AI for the VTS study game format.`);
      return;
    }
    const version = typeof o.schemaVersion === 'number' ? o.schemaVersion : null;
    if (version != null && version !== GAME_SCHEMA_VERSION) {
      errors.push(`${label}this file is schema version ${version}; this terminal reads version ${GAME_SCHEMA_VERSION}.`);
      return;
    }
    if (!Array.isArray(o.questions)) {
      errors.push(`${label}the file has no "questions" list.`);
      return;
    }
    docs.push({
      gameId: asString(o.gameId) || null,
      name: asString(o.name) || null,
      partIndex: typeof o.partIndex === 'number' ? o.partIndex : null,
      partCount: typeof o.partCount === 'number' ? o.partCount : null,
      raw: o.questions,
    });
  });

  if (errors.length > 0) return { questions: [], errors, warnings, name: null };
  if (docs.length === 0) return { questions: [], errors: ['Add the file your AI produced, or paste its JSON.'], warnings, name: null };

  // A set of parts must belong to ONE game, and must be complete. Mixing two
  // games' parts produces something neither of them was.
  const ids = new Set(docs.map((d) => d.gameId).filter((v): v is string => !!v));
  if (ids.size > 1) {
    return { questions: [], errors: ['These files come from two different handoffs. Add the parts of one game at a time.'], warnings, name: null };
  }
  const fileId = docs.find((d) => d.gameId)?.gameId ?? null;
  if (fileId && fileId !== expectedGameId) {
    // Import identity only — everything that establishes the content is checked
    // on the content, so this says so and carries on.
    warnings.push('This file was built from a different handoff than the one on screen. Checking it on what is in it.');
  }

  const partCount = docs.find((d) => d.partCount != null)?.partCount ?? null;
  if (partCount != null && partCount > 1) {
    const have = new Set(docs.map((d) => d.partIndex).filter((v): v is number => v != null));
    const missing: number[] = [];
    for (let i = 1; i <= partCount; i += 1) if (!have.has(i)) missing.push(i);
    if (missing.length > 0) {
      return {
        questions: [],
        errors: [`This game comes in ${partCount} parts and ${missing.length} ${missing.length === 1 ? 'is' : 'are'} still missing — part ${missing.join(', part ')}. Ask your AI for the rest and add them here.`],
        warnings,
        name: null,
      };
    }
  }

  // Parts in the order the AI numbered them, so the questions keep their run.
  const ordered = [...docs].sort((a, b) => (a.partIndex ?? 1) - (b.partIndex ?? 1));

  const questions: DeckQuestion[] = [];
  const seen = new Map<string, number>();
  let n = 0;
  for (const doc of ordered) {
    for (const item of doc.raw) {
      n += 1;
      const where = `Question ${n}`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`${where} is not a question object.`);
        continue;
      }
      const q = item as Record<string, unknown>;
      const stem = asString(q.stem) || asString(q.question);
      if (!stem) {
        errors.push(`${where} has no question text.`);
        continue;
      }
      const opts = Array.isArray(q.options) ? q.options : [];
      const byLabel = new Map<Letter, string>();
      for (const o of opts) {
        if (!o || typeof o !== 'object') continue;
        const rec = o as Record<string, unknown>;
        const label = asString(rec.label).toUpperCase();
        const text = asString(rec.text);
        if ((LETTERS as readonly string[]).includes(label) && text) byLabel.set(label as Letter, text);
      }
      const missing = LETTERS.filter((l) => !byLabel.has(l));
      if (missing.length > 0) {
        errors.push(`${where} is missing option ${missing.join(', option ')} — every question needs exactly four, A to D, each with text.`);
        continue;
      }
      const answer = asString(q.answer).toUpperCase();
      if (!(LETTERS as readonly string[]).includes(answer)) {
        errors.push(`${where} does not name its correct answer as A, B, C or D.`);
        continue;
      }
      const texts = LETTERS.map((l) => byLabel.get(l)!.toLowerCase());
      if (new Set(texts).size !== texts.length) {
        errors.push(`${where} has two options with the same text.`);
        continue;
      }
      const key = stem.toLowerCase().replace(/\s+/g, ' ');
      const first = seen.get(key);
      if (first != null) {
        warnings.push(`${where} asks the same thing as question ${first}. Both were kept — remove one in the editor if it is a duplicate.`);
      } else {
        seen.set(key, n);
      }
      questions.push({
        seq: questions.length + 1,
        topic: (asString(q.topic) || 'General').slice(0, 60),
        stem: stem.slice(0, 600),
        options: LETTERS.map((l) => ({ label: l, text: byLabel.get(l)!.slice(0, 400) })),
        answer: answer as Letter,
        explanation: asString(q.explanation).slice(0, 400) || null,
      });
    }
  }

  if (errors.length === 0 && questions.length === 0) {
    errors.push('That file has no questions in it.');
  }
  if (questions.length > MAX_GAME_QUESTIONS) {
    errors.push(
      `That is ${questions.length} questions and one study game holds ${MAX_GAME_QUESTIONS}. Split it into two games.`,
    );
  }
  return { questions, errors, warnings, name: docs.find((d) => d.name)?.name ?? null };
}
