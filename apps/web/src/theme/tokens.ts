// Meridian design tokens — the single source of truth for the redesign's
// palette. These mirror the CSS variables declared in styles/global.css so
// inline styles (the app's convention) and CSS can share the same values.
//
// The shell is a unified blue-tinted navy everywhere; each workspace is
// signalled only by its accent (sidebar icon, active-section pill, small
// markers) — backgrounds are never themed per workspace.

export const C = {
  // Surfaces (blue-tinted dark)
  bg: '#050B18', // app background
  side: '#071021', // sidebar
  panel: '#0A1426', // cards
  panel2: '#0C1930', // nested / footer strips

  // Hairlines & borders
  line: '#152139', // default card border / dividers
  line2: '#1E2E52', // stronger border, inputs, chips
  hover: '#24365F', // card border on hover

  // Text
  text: '#E9EFFB', // primary
  muted: '#93A5C9', // secondary
  faint: '#5E7098', // labels, metadata

  // Brand + semantic
  gold: '#EBCB74', // PRIMARY actions, active nav, accents
  gold2: '#C9A24B', // gold gradient bottom stop
  goldText: '#241A05', // text on a gold button
  green: '#2FC77E', // long / positive / live
  red: '#F0596E', // short / negative / high impact
  amber: '#E5A43B', // warnings, privacy banner
  info: '#6C9EFF', // LLC workspace accent
  violet: '#B69CFF', // Studies workspace accent

  // Font families (the sans matches the app's existing self-hosted stack).
  mono: "'IBM Plex Mono', monospace",
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

// The primary (gold) button gradient — used for Ask Claude, primary CTAs, and
// the active workspace switcher.
export const GOLD_GRADIENT = 'linear-gradient(180deg, #EBCB74, #C9A24B)';

// A translucent tint of a hex color — used for accent-tinted pills and the
// active-section gradient pill in the sidebar.
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
