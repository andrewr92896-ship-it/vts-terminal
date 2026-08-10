import { allocateDraw } from '../examWeights';
import {
  AUDIENCE_LABELS,
  DEPTH_LABELS,
  FOCUS_LABELS,
  PROVIDER_LABELS,
  SOURCE_LABELS,
  WEIGHT_MODE_LABELS,
  questionsUseAi,
  weightsAreUsed,
  type StudyPackageBlueprint,
} from './blueprint';

// The handoff a creator pastes into their own AI.
//
// Composed here, locally, from fixed sections plus the blueprint's values. No
// VTS AI call is made to write it and none is made to read the result back —
// that is the whole economic point of the workflow: the terminal defines the
// structure and validates the answer, and somebody else's model does the
// writing.
//
// The behavioral contract is identical for every provider. Only a heading and
// one line of onboarding wording change, because a package produced against
// ChatGPT must import exactly as one produced against Claude.

export const PACKAGE_FILE_NAME = 'vts-study-package.json';
export const SCHEMA_VERSION = 1;

/**
 * The exact number of questions each category should get.
 *
 * Computed with the same highest-averages allocator a weighted practice test
 * already draws with, so the handoff asks for a split the terminal itself would
 * produce. Null whenever the blueprint does not fix it — the AI was told to
 * choose the count or the weights, so there is nothing to be exact about, and
 * inventing a target would contradict the permission just given.
 */
export function questionTargets(bp: StudyPackageBlueprint): Record<string, number> | null {
  if (!bp.categoriesEnabled || bp.categoryAuthor !== 'user') return null;
  if (!weightsAreUsed(bp.categoryWeightMode)) return null;
  if (bp.categoryWeightMode === 'score_only') return null; // weights score, they do not compose the paper
  if (bp.weightAuthor !== 'user') return null;
  if (bp.questionCountMode !== 'fixed' || !bp.questionCount) return null;

  const named = bp.categories.filter((c) => c.name.trim());
  const entries = named.map((c) => ({ name: c.id, weight: c.weight ?? 0, available: bp.questionCount! }));
  if (!entries.some((e) => e.weight > 0)) return null;
  return Object.fromEntries(allocateDraw(entries, bp.questionCount));
}

/** Whether the AI is being asked to write the questions at all. */
function wantsQuestions(bp: StudyPackageBlueprint): boolean {
  return questionsUseAi(bp);
}

function yesNo(v: boolean | null): string {
  return v ? 'Yes' : 'No';
}

function countLine(bp: StudyPackageBlueprint): string {
  if (bp.questionCountMode === 'ai_recommend') {
    return 'YOU CHOOSE — pick a number appropriate to the subject and depth, and report it in the package';
  }
  return bp.questionCount != null ? `exactly ${bp.questionCount}` : 'not stated';
}

function categoryBlock(bp: StudyPackageBlueprint, targets: Record<string, number> | null): string {
  if (!bp.categoriesEnabled) {
    return 'Categories are not tracked for this package. Do not invent categories; leave the category list empty and set every question\'s categoryId to null.';
  }
  if (bp.categoryAuthor === 'ai') {
    return [
      'YOU CHOOSE the categories. Return them in the package with unique ids of the form cat_01, cat_02, and so on,',
      'and put every question in one of them.',
      weightsAreUsed(bp.categoryWeightMode) && bp.weightAuthor === 'ai'
        ? 'You also choose each category\'s weight (0-100). Return the weights you chose.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  const named = bp.categories.filter((c) => c.name.trim());
  const lines = named.map((c) => {
    const bits = [`- id: ${c.id}  |  name: ${c.name.trim()}`];
    if (weightsAreUsed(bp.categoryWeightMode) && bp.weightAuthor === 'user' && c.weight != null) {
      bits.push(`weight: ${c.weight}`);
    }
    if (targets && targets[c.id] != null) bits.push(`questions: exactly ${targets[c.id]}`);
    return bits.join('  |  ');
  });
  const head = 'LOCKED — use these ids exactly as written. Do not rename them, add to them, or leave any of them out.';
  const weightNote =
    weightsAreUsed(bp.categoryWeightMode) && bp.weightAuthor === 'ai'
      ? '\nYOU CHOOSE each category\'s weight (0-100) and must return the weights in the package.'
      : '';
  return `${head}\n${lines.join('\n')}${weightNote}`;
}

/** The smallest schema that is still unambiguous for the chosen components. */
function schemaBlock(bp: StudyPackageBlueprint): string {
  const parts: string[] = [];
  parts.push(`{
  "format": "vts-study-package",
  "schemaVersion": ${SCHEMA_VERSION},
  "blueprintId": "{{BLUEPRINT_ID}}",
  "package": {
    "name": "string",
    "subject": "string",
    "settings": { "explanationMode": "${bp.explanationMode ?? 'none'}", "categoryWeightMode": "${bp.categoryWeightMode ?? 'tracking_only'}" }
  },`);

  parts.push(`  "categories": [ { "id": "cat_01", "name": "string", "weight": 0, "questionTarget": 0 } ],`);

  if (wantsQuestions(bp)) {
    parts.push(`  "questions": [
    {
      "id": "q_0001",
      "categoryId": "cat_01",
      "stem": "string",
      "options": [ {"label":"A","text":"string"}, {"label":"B","text":"string"}, {"label":"C","text":"string"}, {"label":"D","text":"string"} ],
      "answer": "A",
      "explanation": ${bp.explanationMode === 'none' ? 'null' : '"string"'}
    }
  ],`);
  } else {
    parts.push(`  "questions": [],`);
  }

  parts.push(`  "flashcards": ${bp.includeFlashcards ? '[ { "id": "f_0001", "categoryId": "cat_01", "term": "string", "definition": "string" } ]' : '[]'},`);

  const wantsSlides = bp.includePresentation && bp.presentationSource !== 'upload';
  parts.push(
    `  "presentation": ${wantsSlides ? '{ "title": "string", "slides": [ { "id": "s_001", "title": "string", "body": "string" } ] }' : 'null'},`,
  );

  parts.push(`  "lessons": ${bp.includeLessons ? '[ { "id": "l_001", "title": "string", "objective": "string", "body": "string", "slideIds": ["s_001"] } ]' : '[]'}`);
  parts.push('}');
  return parts.join('\n');
}

function multipartBlock(): string {
  return `{
  "format": "vts-study-package-part",
  "schemaVersion": ${SCHEMA_VERSION},
  "blueprintId": "{{BLUEPRINT_ID}}",
  "partType": "manifest | questions | flashcards | presentation | lessons",
  "partIndex": 1,
  "partCount": 3,
  "payload": "the manifest part's payload is { package, categories }; every other part's payload is that component's array or object"
}`;
}

function componentLines(bp: StudyPackageBlueprint): string[] {
  const out: string[] = [];
  if (wantsQuestions(bp)) {
    out.push(
      bp.questionMethod === 'ai_format_existing'
        ? '- Questions: I will give you questions I already have. Structure, validate and normalize them into the format below. Do NOT rewrite sound questions merely to make them different — preserve what each one is testing.'
        : '- Questions: write them.',
    );
  } else {
    out.push('- Questions: I am writing these myself. Do NOT produce any questions.');
  }
  out.push(
    bp.includeFlashcards
      ? `- Flashcards: write them, focused on ${(bp.flashcardFocus ? FOCUS_LABELS[bp.flashcardFocus] : 'a mix').toLowerCase()}.`
      : '- Flashcards: none. Do not produce any.',
  );
  if (!bp.includePresentation) {
    out.push('- Presentation: none. Do not produce one.');
  } else if (bp.presentationSource === 'upload') {
    out.push('- Presentation: I am uploading my own. Do NOT write slides.');
  } else {
    out.push('- Presentation: write the slide text. Do not attempt images — I add those in VTS afterwards.');
  }
  out.push(
    bp.includeLessons
      ? '- Lessons: organize the presentation into lessons, and map each lesson to the slides it covers.'
      : '- Lessons: none. Do not produce any.',
  );
  return out;
}

function explanationLine(bp: StudyPackageBlueprint): string {
  if (bp.explanationMode === 'none') return 'Not required — you may leave explanation null.';
  return bp.explanationMode === 'on_incorrect'
    ? 'Required on EVERY question (the player shows it only after a wrong answer).'
    : 'Required on EVERY question.';
}

function sourceBlock(bp: StudyPackageBlueprint): string {
  if (!wantsQuestions(bp) || !bp.sourceMaterial) return '';
  if (bp.sourceMaterial === 'topic_and_instructions') {
    return '\nSOURCE MATERIAL\nWork from the subject above and whatever instructions I give you in this chat.\n';
  }
  const both = bp.sourceMaterial === 'both';
  return [
    '',
    'SOURCE MATERIAL',
    `I will paste or attach my own study material in this chat${both ? ', alongside the subject above' : ''}.`,
    '- Preserve what it actually says. Do not contradict it.',
    '- Turn it into original questions and explanations rather than copying long passages out of it.',
    '- If it is incomplete or ambiguous on something you need, tell me and ask, rather than inventing facts to fill the gap.',
    '',
  ].join('\n');
}

/**
 * The whole handoff, ready to copy.
 *
 * `blueprintId` is the draft's own id, and every package produced from this text
 * carries it back. That is what lets the importer refuse a package built from a
 * different plan instead of importing it against the wrong targets.
 */
export function buildHandoff(bp: StudyPackageBlueprint, blueprintId: string): string {
  const targets = questionTargets(bp);
  const provider = bp.aiProvider ? PROVIDER_LABELS[bp.aiProvider] : 'your AI';
  const schema = schemaBlock(bp).replace('{{BLUEPRINT_ID}}', blueprintId);

  return `VTS STUDY PACKAGE CREATION HANDOFF

You are helping me create educational content that I will import into VTS Terminal.

IMPORTANT WORKFLOW
- Ask me only ONE question at a time.
- Wait for my answer before asking the next question.
- Do not give me a long list of questions.
- Ask only what you still need in order to complete the package below.
- Treat the VTS blueprint as locked unless a field explicitly says you may recommend or choose it.
- If I provide source material, use it as instructed and tell me if it is incomplete or unclear rather than silently inventing unsupported facts.
- Before producing the final package, give me a short plain-language summary of what you are about to create and resolve any remaining missing information one question at a time.

LOCKED VTS BLUEPRINT
Blueprint ID: ${blueprintId}
Package name: ${bp.packageName || bp.subject}
Subject: ${bp.subject}
Audience: ${bp.audience ? AUDIENCE_LABELS[bp.audience] : 'not stated'}
Depth: ${bp.depth ? DEPTH_LABELS[bp.depth] : 'not stated'}
Question creation mode: ${bp.questionMethod ?? 'not stated'}
Question count: ${countLine(bp)}
Source material mode: ${bp.sourceMaterial ? SOURCE_LABELS[bp.sourceMaterial] : 'not applicable'}
Track categories: ${yesNo(bp.categoriesEnabled)}
Category mode: ${bp.categoryWeightMode ? WEIGHT_MODE_LABELS[bp.categoryWeightMode] : 'not applicable'}
Explanation mode: ${explanationLine(bp)}

WHAT TO PRODUCE
${componentLines(bp).join('\n')}

CATEGORY BLUEPRINT
${categoryBlock(bp, targets)}
${sourceBlock(bp)}
CONTENT RULES
- Study questions use exactly four answer options labeled A, B, C and D.
- Each question has exactly one correct answer.
- Use the category ids exactly as provided when categories are locked.
- Meet exact per-category question targets when they are given above.
- Avoid duplicate or near-duplicate questions.
- Questions should test understanding, not just trivial wording changes.
- ${bp.explanationMode === 'none' ? 'Explanations are optional for this package.' : 'Give a concise, useful explanation for every question.'}
- Create flashcards, presentation and lessons only where "WHAT TO PRODUCE" asks for them.
- Keep presentation slide text short enough to read as a slide.
- Make lesson sequencing coherent with the presentation when lessons are requested.

RIGHTS AND EDUCATIONAL USE
- Create original educational questions and explanations.
- Do not reproduce proprietary or copyrighted question banks, books, courses, or long protected passages unless I have the right to use and reproduce that material.
- If I provide source material, transform it into original educational content rather than copying long passages unnecessarily.
- Finance-related content must remain educational and informational.
- Do not provide personalized investment recommendations or individualized buy/sell/hold instructions.

FINAL OUTPUT
When all necessary questions have been answered:
1. Produce a VTS Study Package conforming exactly to schemaVersion ${SCHEMA_VERSION}.
2. Use Blueprint ID ${blueprintId}.
3. Do not add components that this handoff did not request.
4. Do not change locked categories, weights or question targets.
5. Return valid UTF-8 JSON matching the schema below.
6. Do not add commentary inside the JSON.
7. If ${provider} can create files, create a file named ${PACKAGE_FILE_NAME}.
8. If it cannot, return the JSON in one code block so I can copy it into VTS.
9. If the package is too large for one response or file, use the multipart schema below exactly and produce ONE numbered part at a time. Wait for me to tell you to continue before producing the next part.

VTS SCHEMA
${schema}

VTS MULTIPART SCHEMA (only if the package will not fit in one response)
${multipartBlock().replace('{{BLUEPRINT_ID}}', blueprintId)}
`;
}

/**
 * Instructions for fixing a package that failed validation.
 *
 * Generated locally, like the handoff. It names the schema, the failures and
 * the affected import ids — deliberately NOT the whole package, which is often
 * enormous and is already in the AI's own conversation. The caller tells the
 * user what it does and does not contain before they copy it.
 */
export function buildRepairPrompt(
  blueprintId: string,
  errors: { code: string; message: string; ids?: string[] }[],
): string {
  const lines = errors.map((e) => {
    const ids = e.ids?.length ? ` [${e.ids.join(', ')}]` : '';
    return `- ${e.message}${ids}`;
  });
  return `VTS STUDY PACKAGE — CORRECTIONS NEEDED

The study package you produced did not pass validation in VTS Terminal.

Blueprint ID: ${blueprintId}
Schema version: ${SCHEMA_VERSION}

PROBLEMS FOUND
${lines.join('\n')}

WHAT TO DO
- Fix exactly these problems in the package you already produced.
- Change nothing else. Keep every other question, category and id as it is.
- Keep the same Blueprint ID.
- Return the corrected package as valid JSON only, with no commentary outside it.
- If you produced the package in numbered parts, return only the corrected parts, each with its original partIndex and partCount.
`;
}
