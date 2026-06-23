import { askClaude, extractJson } from './claude.js';

// Generate fresh Series 65 practice questions with Claude (Sonnet). Returns a
// validated set of multiple-choice questions with the correct answer and a
// short explanation, for the Studies "practice quiz" feature.

export interface QuizQuestion {
  stem: string;
  options: { label: 'A' | 'B' | 'C' | 'D'; text: string }[];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface QuizResult {
  topic: string | null;
  questions: QuizQuestion[];
}

const LABELS = ['A', 'B', 'C', 'D'] as const;
type Label = (typeof LABELS)[number];

const SYSTEM = [
  'You are a Series 65 (Uniform Investment Adviser Law Exam) item writer.',
  'Write exam-quality multiple-choice questions and return ONLY a JSON object.',
  'Shape: {"questions":[{"stem":string,"options":[{"label":"A","text":string},{"label":"B",...},{"label":"C",...},{"label":"D",...}],"answer":"A"|"B"|"C"|"D","explanation":string}]}',
  'Each question has exactly four options labeled A–D, one correct answer, and a one-to-two sentence explanation of why it is correct.',
  'Match the real exam: plausible distractors, precise wording, no markdown. Cover a range of subtopics within the requested area; do not repeat the same idea.',
].join('\n');

function isLabel(v: unknown): v is Label {
  return typeof v === 'string' && (LABELS as readonly string[]).includes(v);
}

function validate(raw: unknown): QuizQuestion[] {
  const arr = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(arr)) return [];
  const out: QuizQuestion[] = [];
  for (const q of arr) {
    const stem = typeof q?.stem === 'string' ? q.stem.trim() : '';
    const opts = Array.isArray(q?.options) ? q.options : [];
    if (!stem || opts.length !== 4) continue;
    const options: QuizQuestion['options'] = [];
    for (let i = 0; i < 4; i++) {
      const text = typeof opts[i]?.text === 'string' ? opts[i].text.trim() : '';
      if (!text) break;
      options.push({ label: LABELS[i], text }); // normalize labels to A–D by position
    }
    if (options.length !== 4) continue;
    const answer = isLabel(q?.answer) ? q.answer : 'A';
    const explanation = typeof q?.explanation === 'string' ? q.explanation.trim().slice(0, 600) : '';
    out.push({ stem: stem.slice(0, 1000), options, answer, explanation });
  }
  return out;
}

export async function generateQuiz(topic: string | undefined, count: number): Promise<QuizResult> {
  const n = Math.min(10, Math.max(1, Math.round(count) || 5));
  const topicLine = topic ? `Topic area: ${topic}.` : 'Cover a mix across all four exam areas.';
  const prompt = `${topicLine}\nWrite ${n} fresh Series 65 practice questions.`;
  const raw = await askClaude(prompt, SYSTEM);
  const questions = validate(extractJson(raw)).slice(0, n);
  return { topic: topic ?? null, questions };
}
