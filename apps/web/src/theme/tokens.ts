// Design tokens — the single source of truth for the "Claude-clean" dark theme.
//
// The whole portal is restyled onto a calm, warm-neutral dark palette with one
// clay accent, in the spirit of Anthropic/Claude's own product UI: flat warm
// surfaces (no radial washes or glows), hairline borders, generous spacing, and
// typography-led hierarchy. Color is used sparingly — the clay accent for
// actions, muted green/amber/red only for real status.
//
// Screens still use inline `style` objects (project convention — see HANDOFF.md),
// but they now pull colors/spacing from here instead of hardcoding hexes, so the
// look can be tuned in one place. The small UI primitives in `components/ui`
// build on these tokens.

import type { WorkspaceKey } from './themes';

// ---- Color ----------------------------------------------------------------

export const color = {
  // Warm-neutral dark surfaces (flat — no gradients/washes).
  bg: '#1B1A17', // page background
  surface: '#24221E', // cards, panels
  surfaceAlt: '#2B2925', // subtle alternate / row hover
  elevated: '#302E29', // modals, dropdowns, popovers
  inset: '#171613', // wells, code, table headers

  // Hairline borders.
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.16)',

  // Text.
  text: '#ECE9E3', // primary (warm off-white)
  muted: '#A8A199', // secondary / labels
  faint: '#78736B', // captions, footnotes, disabled

  // Clay accent (the one brand accent, used for primary actions + active state).
  accent: '#D97757',
  accentHover: '#C4643F',
  accentQuiet: 'rgba(217,119,87,0.13)', // tinted background for active/selected
  accentBorder: 'rgba(217,119,87,0.45)',
  onAccent: '#1F1A16', // text/icon on a solid accent fill (warm near-black)

  // Functional status (muted, only for genuine state).
  green: '#7FB88A',
  amber: '#E0B15A',
  red: '#E06B5E',
  blue: '#7E97C4',
  greenQuiet: 'rgba(127,184,138,0.14)',
  amberQuiet: 'rgba(224,177,90,0.14)',
  redQuiet: 'rgba(224,107,94,0.14)',
} as const;

// ---- Type, radius, spacing, shadow, motion --------------------------------

export const font = {
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

// Spacing scale (px). Prefer these over ad-hoc numbers for rhythm.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.28)',
  md: '0 10px 30px rgba(0,0,0,0.38)',
  lg: '0 24px 60px rgba(0,0,0,0.5)',
} as const;

// ---- Per-workspace identity accent ----------------------------------------
//
// The system is unified: clay is the primary accent everywhere. Each workspace
// keeps a *subtle* identity color used only for wayfinding — the active tab
// underline and the wordmark — so you always know where you are without the app
// feeling like six different products. Kept low-saturation so they read as a
// family.

export const workspaceIdentity: Record<WorkspaceKey, string> = {
  trading: '#D9A441', // warm gold
  kia: '#CC6A5A', // muted brick red
  studies: '#9E86D6', // muted violet
  todo: '#5FA88F', // muted teal
  wealth: '#6FB491', // muted green (removed in a later phase)
  finance: '#7E97C4', // slate blue (becomes "Business")
};

// Convenience: a very subtle, near-flat accent gradient for primary fills.
// Restraint over glow — this is barely a gradient, just enough depth.
export function accentFill(): string {
  return `linear-gradient(180deg, ${color.accent}, ${color.accentHover})`;
}
