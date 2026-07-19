import type { Theme } from '../../theme/themes';

// A tiny pub/sub that lets the study-game player recolour the Studies workspace
// to the learner's current level *while a game is being played*. The player
// publishes its level's base hue; the portal shell subscribes and re-themes the
// workspace + tints the content background from it. Cleared when the player
// unmounts, so the recolouring only applies to the game you're playing.

let cur: { hue: number; sat: number } | null = null;
const listeners = new Set<() => void>();

export function setStudyTint(v: { hue: number; sat: number } | null): void {
  const same = (cur == null && v == null) || (cur != null && v != null && cur.hue === v.hue && cur.sat === v.sat);
  if (same) return;
  cur = v;
  for (const cb of listeners) cb();
}
export function getStudyTint(): { hue: number; sat: number } | null {
  return cur;
}
export function onStudyTintChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// A dark Theme tinted to a level's base hue: accents, borders, and backgrounds
// all shift, so the whole study page reads in the level's colour.
export function studyThemeForLevel(hue: number, sat: number): Theme {
  const h = Math.round(hue);
  const s = Math.max(20, Math.min(70, sat));
  const hsl = (sat2: number, l: number) => `hsl(${h}, ${sat2}%, ${l}%)`;
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

// A translucent wash of the level hue, layered over the content area's dark
// background so the whole study page carries the level colour.
export function studyBgTint(hue: number, sat: number): string {
  const h = Math.round(hue);
  const s = Math.max(20, Math.min(70, sat));
  return [
    `radial-gradient(1100px 560px at 72% -12%, hsla(${h}, ${s}%, 32%, 0.34) 0%, hsla(${h}, ${s}%, 14%, 0.18) 52%, rgba(0,0,0,0) 76%)`,
    `linear-gradient(180deg, hsla(${h}, ${s}%, 26%, 0.15) 0%, hsla(${h}, ${s}%, 12%, 0.10) 100%)`,
  ].join(', ');
}
