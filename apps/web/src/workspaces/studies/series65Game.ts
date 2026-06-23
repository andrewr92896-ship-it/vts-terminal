// State + rules for the gamified Series 65 Study Game: per-category levels and
// prestige, exam-weighted question mix, and last-100 accuracy scoring. Persisted
// per user in localStorage.

import { SERIES65_QUESTIONS, SERIES65_TOPICS, type Series65Topic } from './series65Questions';

export const PASS_THRESHOLD = 72; // Series 65 passing score (~72%)
export const WINDOW = 100; // score is accuracy over the last 100 answers

// Official NASAA Series 65 content areas and their exam weightings, mapped to
// our four topics. Used to weight the question mix and shown in the HUD.
export interface CategoryMeta {
  topic: Series65Topic;
  official: string;
  weight: number; // exam percentage
}

export const CATEGORY_META: CategoryMeta[] = [
  { topic: 'Economics', official: 'Economic Factors & Business Information', weight: 15 },
  { topic: 'Investments', official: 'Investment Vehicle Characteristics', weight: 25 },
  { topic: 'Client Management', official: 'Client Recommendations & Strategies', weight: 30 },
  { topic: 'Regulations & Ethics', official: 'Laws, Regulations & Ethics', weight: 30 },
];

export function metaFor(topic: Series65Topic): CategoryMeta {
  return CATEGORY_META.find((c) => c.topic === topic)!;
}

// The universal level ladder. `at` is the count of questions answered (in a
// category) at which the level is reached.
export interface LevelDef {
  icon: string;
  name: string;
  at: number;
}

export const LEVELS: LevelDef[] = [
  { icon: '🌱', name: 'Novice', at: 0 },
  { icon: '📖', name: 'Student', at: 25 },
  { icon: '✏️', name: 'Apprentice', at: 50 },
  { icon: '🧠', name: 'Adept', at: 75 },
  { icon: '🔬', name: 'Specialist', at: 100 },
  { icon: '🎓', name: 'Scholar', at: 125 },
  { icon: '🏅', name: 'Expert', at: 175 },
  { icon: '⭐', name: 'Master', at: 225 },
  { icon: '👑', name: 'Grandmaster', at: 300 },
];

// Reaching Grandmaster (300) holds for a 75-question band, then the category
// prestiges: a crown is added and the ladder restarts at Novice. (The spec
// leaves the prestige point open; 375 keeps the band consistent with the others.)
export const PRESTIGE_AT = 375;

export interface LevelInfo {
  prestige: number; // crowns earned (completed cycles)
  index: number; // 0..8 within the current cycle
  level: LevelDef;
  within: number; // answers into the current cycle
  isMax: boolean; // at Grandmaster
  nextAt: number; // answers-in-cycle for the next milestone (or PRESTIGE_AT)
  toNext: number; // answers remaining to that milestone
  nextLabel: string; // what the next milestone is
}

export function levelInfo(answered: number): LevelInfo {
  const prestige = Math.floor(answered / PRESTIGE_AT);
  const within = answered - prestige * PRESTIGE_AT;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (within >= LEVELS[i].at) index = i;
  const isMax = index === LEVELS.length - 1;
  const nextAt = isMax ? PRESTIGE_AT : LEVELS[index + 1].at;
  const nextLabel = isMax
    ? `Prestige 👑${'👑'.repeat(prestige)}`
    : `${LEVELS[index + 1].icon} ${LEVELS[index + 1].name}`;
  return { prestige, index, level: LEVELS[index], within, isMax, nextAt, toNext: nextAt - within, nextLabel };
}

export interface CatState {
  answered: number;
  correct: number;
  recent: boolean[]; // last WINDOW outcomes in this category
}

export interface GameState {
  recent: boolean[]; // last WINDOW outcomes overall
  totalAttempted: number;
  totalCorrect: number;
  cats: Record<Series65Topic, CatState>;
}

export function emptyGame(): GameState {
  const cats = {} as Record<Series65Topic, CatState>;
  for (const t of SERIES65_TOPICS) cats[t] = { answered: 0, correct: 0, recent: [] };
  return { recent: [], totalAttempted: 0, totalCorrect: 0, cats };
}

export function gameKey(userId: string | undefined): string {
  return `vts_series65_game_${userId ?? 'anon'}`;
}

export function loadGame(key: string): GameState {
  const fresh = emptyGame();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fresh;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return fresh;
    const g: GameState = {
      recent: Array.isArray(p.recent) ? p.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW) : [],
      totalAttempted: Number(p.totalAttempted) || 0,
      totalCorrect: Number(p.totalCorrect) || 0,
      cats: fresh.cats,
    };
    for (const t of SERIES65_TOPICS) {
      const c = p.cats?.[t];
      if (c) {
        g.cats[t] = {
          answered: Number(c.answered) || 0,
          correct: Number(c.correct) || 0,
          recent: Array.isArray(c.recent) ? c.recent.filter((x: unknown) => typeof x === 'boolean').slice(-WINDOW) : [],
        };
      }
    }
    return g;
  } catch {
    return fresh;
  }
}

export function saveGame(key: string, g: GameState): void {
  try {
    localStorage.setItem(key, JSON.stringify(g));
  } catch {
    /* ignore storage failures */
  }
}

// Record one answer, returning a new state (the previous is left untouched so
// callers can diff scores/levels for the "score change" and level-up display).
export function recordAnswer(g: GameState, topic: Series65Topic, correct: boolean): GameState {
  const cat = g.cats[topic];
  const next: GameState = {
    recent: [...g.recent, correct].slice(-WINDOW),
    totalAttempted: g.totalAttempted + 1,
    totalCorrect: g.totalCorrect + (correct ? 1 : 0),
    cats: {
      ...g.cats,
      [topic]: {
        answered: cat.answered + 1,
        correct: cat.correct + (correct ? 1 : 0),
        recent: [...cat.recent, correct].slice(-WINDOW),
      },
    },
  };
  return next;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Accuracy % over a window, to one decimal. Null when no answers yet.
export function scorePct(recent: boolean[]): number | null {
  if (!recent.length) return null;
  return round1((100 * recent.filter(Boolean).length) / recent.length);
}

// Pick a category for the "mix" mode, weighted to the real exam percentages.
export function weightedCategory(): Series65Topic {
  const total = CATEGORY_META.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CATEGORY_META) {
    r -= c.weight;
    if (r <= 0) return c.topic;
  }
  return CATEGORY_META[CATEGORY_META.length - 1].topic;
}

// Shuffled question-index pools per category (cycled through, then reshuffled).
export function buildPools(): Record<Series65Topic, number[]> {
  const pools = {} as Record<Series65Topic, number[]>;
  for (const t of SERIES65_TOPICS) pools[t] = [];
  SERIES65_QUESTIONS.forEach((q, i) => pools[q.topic].push(i));
  for (const t of SERIES65_TOPICS) {
    const a = pools[t];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return pools;
}
