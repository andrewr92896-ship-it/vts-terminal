// Level-driven recolouring for the Studies workspace. The whole study page
// (accents, borders, buttons, and the content background) shifts to the hue of
// the learner's current level, so it visibly changes colour as they level up —
// from 🥚 Egg through 💎 Diamond.

import type { Theme } from '../../theme/themes';
import { gameKey, loadGame, overallLevel, type OverallLevel } from './series65Game';

// Build a dark Theme tinted to a level's base hue. Lightness stops are fixed so
// every hue yields a legible dark theme; the accent is a brighter shade of the
// same hue, with dark accent text for contrast on it.
export function studyThemeForLevel(level: OverallLevel): Theme {
  const h = Math.round(level.main.hue);
  // Keep some colour but avoid washed-out (Onyx) or neon extremes.
  const s = Math.max(20, Math.min(70, level.main.sat));
  const hsl = (sat: number, l: number) => `hsl(${h}, ${sat}%, ${l}%)`;
  return {
    pageBg: `radial-gradient(1200px 600px at 70% -10%, ${hsl(s, 15)} 0%, ${hsl(s, 7)} 62%)`,
    headerBg: `linear-gradient(90deg, ${hsl(s, 11)} 0%, ${hsl(s, 17)} 100%)`,
    headerBorder: hsl(s, 27),
    navBg: hsl(s, 9),
    navBorder: hsl(Math.max(16, s - 10), 22),
    accent: hsl(Math.min(90, s + 12), 68),
    accent2: hsl(s, 52),
    accentText: hsl(Math.min(46, s), 12),
  };
}

// The learner's current level, from their saved game (topic-agnostic, driven by
// the level-only correct count so mock tests count here too).
export function currentStudyLevel(userId: string | undefined): OverallLevel {
  return overallLevel(loadGame(gameKey(userId)).levelCorrect);
}

// The tinted Studies theme for the current level.
export function currentStudyTheme(userId: string | undefined): Theme {
  return studyThemeForLevel(currentStudyLevel(userId));
}

// The level step used purely for change-detection (0..59), so listeners can skip
// re-tinting when the hue-bearing level hasn't actually moved.
export function currentStudyStep(userId: string | undefined): number {
  return currentStudyLevel(userId).step;
}

// A translucent wash of the level hue, layered over the app's dark content area
// so the whole study page background carries the level colour. Combines a
// top-right glow with a faint full-area tint; layer it above a solid dark base.
export function studyBgTint(level: OverallLevel): string {
  const h = Math.round(level.main.hue);
  const s = Math.max(20, Math.min(70, level.main.sat));
  return [
    `radial-gradient(1100px 560px at 72% -12%, hsla(${h}, ${s}%, 32%, 0.34) 0%, hsla(${h}, ${s}%, 14%, 0.18) 52%, rgba(0,0,0,0) 76%)`,
    `linear-gradient(180deg, hsla(${h}, ${s}%, 26%, 0.15) 0%, hsla(${h}, ${s}%, 12%, 0.10) 100%)`,
  ].join(', ');
}

// Tiny pub/sub so the shell re-tints the moment the level changes, without
// lifting the game state out of the Study Game component.
const listeners = new Set<() => void>();
export function onStudyLevelChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export function emitStudyLevelChange(): void {
  for (const cb of listeners) cb();
}
