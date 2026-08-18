import type { CSSProperties } from 'react';
import type { Theme } from '../../theme/themes';
import { scorePct } from './gameEngine';
import type { DeckGameState } from './studyEngine';
import { hasUsableWeights, weightedCategories, weightedResult, type CategoryWeights } from './examWeights';

// How a learner is doing CATEGORY BY CATEGORY on one study game — the weighted
// score, each area's accuracy against its share of the exam, and how much of
// the practice has actually gone to each.
//
// One component, drawn on both the Progress summary and the game screen itself
// (owner request, 2026-08). The two answer the same question, so they read the
// same figures from the same function rather than each computing its own — a
// breakdown that can disagree with itself between two screens is worse than one
// screen having it.
//
// Two rules carried over from the practice test, and they are what make these
// numbers honest:
//
//  * A category the learner has never been asked about is NOT scored as zero.
//    It is rescaled out of the weighted score and named, the same way an
//    undrawn category is on a sitting. Marking somebody down for questions they
//    were never given would read as a real result while being nothing of the
//    kind.
//  * The weighted figures are LIFETIME, so they are measured over the same
//    answers as the Lifetime accuracy beside them. An unweighted game keeps the
//    100-answer window its per-topic bars have always shown.
//
// `askedShare` is the one genuinely new figure: what proportion of the
// learner's answers have come from this area, against what proportion of the
// exam it carries. Playing draws evenly across the deck unless the learner asks
// for a blueprint-shaped draw (see deckDraw.ts), so the two diverge whenever a
// deck holds a different mix of questions than the exam does — and until this
// was shown there was no way to see that from inside the game.

const muted = '#a99ff0';
const GREEN = '#35c47b';
const RED = '#ef5468';
const AMBER = '#e0a23a';

export interface CategoryRow {
  name: string;
  share: number | null; // % of the exam this area carries (null on an unweighted game)
  answered: number; // lifetime answers in this area
  correct: number;
  askedShare: number | null; // % of the learner's answers that came from it
  accuracy: number | null; // the figure shown: lifetime when weighted, last-100 otherwise
  pointsAvailable: number | null; // of 100, once uncovered areas are rescaled out
  pointsEarned: number | null;
}

export interface CategoryReport {
  weighted: boolean; // the game carries a usable blueprint
  score: number | null; // the weighted score, over what has been answered
  rows: CategoryRow[];
  uncovered: string[]; // weighted areas with no answers yet
  focus: { name: string; lost: number }[]; // where the marks are going, worst first
  weakest: CategoryRow | null; // the one line worth showing when there is only room for one
}

// Build the whole report from a deck's categories, its blueprint, and the
// learner's stored game state. Pure — every screen that shows category progress
// goes through this.
export function buildCategoryReport(
  categories: string[],
  weights: CategoryWeights,
  game: DeckGameState,
): CategoryReport {
  const cats = categories.length ? categories : ['General'];
  const stateFor = (c: string) => game.cats[c] ?? { answered: 0, correct: 0, recent: [] };
  const answeredTotal = cats.reduce((a, c) => a + stateFor(c).answered, 0);
  const askedShare = (n: number) => (answeredTotal > 0 ? (100 * n) / answeredTotal : null);

  const weighted = hasUsableWeights(categories, weights);
  if (!weighted) {
    const rows: CategoryRow[] = cats.map((c) => {
      const cs = stateFor(c);
      return {
        name: c,
        share: null,
        answered: cs.answered,
        correct: cs.correct,
        askedShare: askedShare(cs.answered),
        accuracy: scorePct(cs.recent),
        pointsAvailable: null,
        pointsEarned: null,
      };
    });
    const answered = rows.filter((r) => r.accuracy != null);
    return {
      weighted: false,
      score: null,
      rows,
      uncovered: [],
      focus: [],
      weakest: answered.length
        ? answered.reduce((a, b) => ((b.accuracy as number) < (a.accuracy as number) ? b : a))
        : null,
    };
  }

  // The blueprint share, kept separate from `pointsAvailable`: the share is what
  // the exam gives this area whatever the learner has practised, while the
  // points are rescaled across the areas actually covered. They agree once
  // everything has been touched, and the note below says why they differ before
  // that.
  const shares = new Map(weightedCategories(categories, weights).map((c) => [c.name, c.share * 100]));
  const result = weightedResult(
    categories,
    weights,
    new Map(cats.map((c) => [c, { correct: stateFor(c).correct, total: stateFor(c).answered }])),
  );

  // Every area that carries weight is listed whether or not it has been
  // practised — an untouched one is exactly what this panel exists to surface,
  // so it must not be missing from it. The points come from the weighted result
  // where there is one; before any answers land there is no result and the row
  // is still worth drawing.
  const scored = new Map((result?.categories ?? []).map((c) => [c.name, c]));
  const rows: CategoryRow[] = weightedCategories(categories, weights)
    .filter((c) => c.weight > 0)
    .map((c) => {
      const cs = stateFor(c.name);
      const s = scored.get(c.name);
      return {
        name: c.name,
        share: shares.get(c.name) ?? 0,
        answered: cs.answered,
        correct: cs.correct,
        askedShare: askedShare(cs.answered),
        accuracy: cs.answered > 0 ? (100 * cs.correct) / cs.answered : null,
        pointsAvailable: s && s.total > 0 ? s.pointsAvailable : null,
        pointsEarned: s && s.total > 0 ? s.pointsEarned : null,
      };
    });

  // A weighted category with no weight is off the paper on purpose, but the
  // learner can still be answering its questions — so it is listed with its
  // share of the practice and no exam share, rather than dropped.
  for (const c of cats) {
    if (rows.some((r) => r.name === c)) continue;
    const cs = stateFor(c);
    if (cs.answered === 0) continue;
    rows.push({
      name: c,
      share: 0,
      answered: cs.answered,
      correct: cs.correct,
      askedShare: askedShare(cs.answered),
      accuracy: cs.answered > 0 ? (100 * cs.correct) / cs.answered : null,
      pointsAvailable: null,
      pointsEarned: null,
    });
  }

  // Ranked by points LOST rather than by accuracy: a weak area worth 5% of the
  // exam costs less than a middling one worth 30%.
  const focus = rows
    .filter((r) => r.answered > 0 && r.pointsAvailable != null && (r.pointsAvailable as number) - (r.pointsEarned as number) >= 0.05)
    .map((r) => ({ name: r.name, lost: (r.pointsAvailable as number) - (r.pointsEarned as number) }))
    .sort((a, b) => b.lost - a.lost);

  return {
    weighted: true,
    score: result ? result.score : null,
    rows,
    uncovered: result ? result.uncovered : rows.filter((r) => r.answered === 0).map((r) => r.name),
    focus: focus.slice(0, 3),
    weakest: focus.length ? rows.find((r) => r.name === focus[0].name) ?? null : null,
  };
}

const pct0 = (n: number) => `${Math.round(n)}%`;

// The panel. Rows first, then the two things the rows cannot say on their own:
// which areas have never been practised, and where the marks are going.
export function CategoryBreakdown({
  theme,
  report,
  title,
}: {
  theme: Theme;
  report: CategoryReport;
  title?: string;
}) {
  const heading = title ?? (report.weighted ? 'By category · points of 100' : 'Accuracy by topic');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent }}>
        {heading}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {report.rows.map((r) => (
          <CategoryRowView key={r.name} theme={theme} row={r} weighted={report.weighted} />
        ))}
      </div>

      {report.uncovered.length > 0 && (
        <div style={{ fontSize: 11.5, color: '#f0dcb4', lineHeight: 1.5, borderTop: `1px solid ${theme.navBorder}`, paddingTop: 10 }}>
          {"Not practised yet: "}
          {report.uncovered.join(', ')}
          {". Those areas are left out of the weighted score rather than counted as zero, so it covers only what you have answered."}
        </div>
      )}

      {report.focus.length > 0 && (
        <div style={{ borderTop: `1px solid ${theme.navBorder}`, paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: theme.accent, marginBottom: 8 }}>
            {"Where the marks are going"}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {report.focus.map((f) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5, color: '#e7e0ff' }}>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{f.name}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: RED, whiteSpace: 'nowrap' }}>
                  −{f.lost.toFixed(1)} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRowView({ theme, row, weighted }: { theme: Theme; row: CategoryRow; weighted: boolean }) {
  const acc = row.accuracy;
  const fill = acc == null ? 0 : Math.max(0, Math.min(100, acc));
  const color = acc == null ? muted : acc >= 70 ? GREEN : acc >= 50 ? AMBER : RED;

  // What the practice mix has actually been, against what the exam asks for.
  // Stated as two figures side by side rather than as a judgement — a deck can
  // hold a different mix of questions than the exam does, and this is the only
  // place that is visible.
  const detail: string[] = [];
  if (row.answered > 0) detail.push(`${row.correct}/${row.answered} correct`);
  else detail.push('not practised yet');
  if (row.askedShare != null && row.answered > 0) detail.push(`${pct0(row.askedShare)} of your answers`);
  if (weighted && row.pointsEarned != null && row.pointsAvailable != null) {
    detail.push(`${row.pointsEarned.toFixed(1)} of ${row.pointsAvailable.toFixed(1)} pts`);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#e7e0ff', overflowWrap: 'anywhere' }}>
          {row.name}
        </span>
        {weighted && row.share != null && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: muted, whiteSpace: 'nowrap' }}>
            {pct0(row.share)} of exam
          </span>
        )}
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700, color, minWidth: 46, textAlign: 'right' }}>
          {acc == null ? '—' : `${Math.round(acc)}%`}
        </span>
      </div>
      <div style={{ height: 8, background: 'rgba(255,255,255,.06)', border: `1px solid ${theme.navBorder}`, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${fill}%`, background: color, transition: 'width .35s ease' }} />
      </div>
      <div style={{ fontSize: 10.5, color: muted, marginTop: 4 }}>{detail.join(' · ')}</div>
    </div>
  );
}

// A one-line summary for a header that has room for a single reading: the
// weighted score, and the area currently costing the most marks.
export function categorySummary(report: CategoryReport): string | null {
  if (report.weighted && report.score != null) {
    const worst = report.focus[0];
    return worst
      ? `Weighted ${report.score.toFixed(1)}% · ${worst.name} costing ${worst.lost.toFixed(1)} pts`
      : `Weighted ${report.score.toFixed(1)}%`;
  }
  const w = report.weakest;
  if (w && w.accuracy != null) return `Weakest: ${w.name} ${Math.round(w.accuracy)}%`;
  return null;
}

export function breakdownCard(theme: Theme): CSSProperties {
  return {
    background: 'linear-gradient(180deg,rgba(40,30,72,.5),rgba(28,20,54,.55))',
    border: `1px solid ${theme.navBorder}`,
    borderRadius: 14,
    padding: '14px 16px',
  };
}
