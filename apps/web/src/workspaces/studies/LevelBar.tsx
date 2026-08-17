import { overallLevel, mainLevelProgress, type MainLevelProgress } from './gameEngine';

// The level bar for a study game: how far through the CURRENT MAIN LEVEL the
// learner is, with a tick at each sub-level. A full bar means leaving this
// level for the next one — so on 🍊 Orange the bar fills across all five of
// Orange's stars and completes as 🌽 Corn begins.
//
// The ticks are placed by what each sub-level actually COSTS, not at even
// fifths: a sub-level costs one more correct answer than the one before it, so
// the later stars of a level sit further apart than the early ones. All of that
// arithmetic is `mainLevelProgress` in gameEngine.ts — the same module the level
// itself comes from — so the bar cannot disagree with the badge above it.
//
// Each segment carries the colour of the sub-level it represents, taken from
// the same shading the level badge uses, so the bar reads as the level filling
// in from dark to light rather than as a plain meter.

const muted = '#a99ff0';

export function LevelBar({
  correct,
  borderColor = 'rgba(255,255,255,.16)',
  compact = false,
  showHeader = true,
}: {
  correct: number; // level-counting correct answers (DeckGameState.levelCorrect)
  borderColor?: string;
  compact?: boolean;
  showHeader?: boolean;
}) {
  const p = mainLevelProgress(correct);
  const height = compact ? 9 : 12;

  return (
    <div>
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: compact ? 10.5 : 11.5, fontWeight: 700, color: '#e7e0ff' }}>
            {p.main.emoji} {"Lv"} {p.mainIndex + 1} · {p.main.name}
            <span style={{ color: muted, fontWeight: 500 }}>
              {' · '}
              {"sub-level"} {p.sub}/{p.segments.length}
            </span>
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: compact ? 11 : 12.5, fontWeight: 700, color: '#fff' }}>
            {p.isMax ? 'MAX' : `${p.into}/${p.span}`}
          </span>
        </div>
      )}

      <div style={{ position: 'relative', height }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,.06)',
            border: `1px solid ${borderColor}`,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {/* One block per sub-level, each clipped to how much of it is filled,
              so the bar shades from the level's darkest sub-level to its
              lightest as it fills. */}
          {p.segments.map((s) => {
            const width = Math.max(0, Math.min(s.endPct, p.pct) - s.startPct);
            if (width <= 0) return null;
            const shade = overallLevel(p.startCorrect + costTo(p, s.sub));
            return (
              <div
                key={s.sub}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${s.startPct}%`,
                  width: `${width}%`,
                  background: shade.bg,
                  transition: 'width .35s ease',
                }}
              />
            );
          })}

          {/* A tick where each sub-level begins. The first boundary is the
              start of the bar and the last is its end, so only the internal
              ones are drawn. They live INSIDE the track, alongside the fills,
              so a tick lands exactly on the colour change rather than a pixel
              or two off it — the track's own border would otherwise shift the
              two apart.

              A tick standing on filled bar is drawn in that level's readable
              colour; one on empty bar in a light grey. Otherwise a dark level
              (Onyx) loses its ticks against the fill and a light one (Egg)
              loses them against the track. */}
          {p.segments.slice(1).map((s) => {
            const passed = p.pct >= s.startPct;
            const shade = overallLevel(p.startCorrect + costTo(p, s.sub - 1));
            return (
              <div
                key={s.sub}
                title={`${'★'.repeat(s.sub)}${'☆'.repeat(p.segments.length - s.sub)} · ${s.cost} correct`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${s.startPct}%`,
                  width: 2,
                  marginLeft: -1,
                  background: passed ? shade.text : 'rgba(255,255,255,.38)',
                  opacity: passed ? 0.6 : 1,
                }}
              />
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: compact ? 10 : 10.5, color: muted, marginTop: 4 }}>
        {p.isMax
          ? 'Top of the ladder — every level cleared.'
          : `${p.toNextMain} correct to ${p.nextMain ? `${p.nextMain.emoji} ${p.nextMain.name}` : 'the next level'}`}
      </div>
    </div>
  );
}

// Correct answers from the start of this main level to the start of sub-level
// `sub` (1-based) — used to resolve the shade each segment should carry.
function costTo(p: MainLevelProgress, sub: number): number {
  let n = 0;
  for (const s of p.segments) {
    if (s.sub >= sub) break;
    n += s.cost;
  }
  return n;
}
