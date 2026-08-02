// Terminal zoom — scaling the app itself, independent of the browser's own zoom.
//
// Why this exists rather than telling people to press ⌘+: browser zoom is per
// origin and per device, invisible to the app, and it also scales the browser's
// own chrome. This is a terminal control that lives in the account menu, reads
// back as a percentage, and survives a reload.
//
// **The mechanism is CSS `zoom`, deliberately not `transform: scale`.** `zoom`
// re-lays-out the subtree at its new size, exactly as browser zoom does, so
// panels re-wrap and text re-flows. `transform: scale` would draw the page at
// its original size and then stretch the pixels: blurry text, and every layout
// decision made for the wrong width.
//
// **The one trap is screen-relative units.** Inside a zoomed subtree a raw
// `100vh` still resolves against the *full* viewport and is only then multiplied
// by the zoom factor, so at 1.5× it paints half a screen too tall. `global.css`
// publishes pre-divided `--vh`/`--vw` for that reason and every screen-relative
// length in the app is written in terms of them. Widths need no such correction:
// `width: 100%` already resolves against the unzoomed parent, and dividing it
// would double-compensate.
//
// Device-local by design: this is a comfort setting for one screen, not an
// account preference, so it lives in localStorage and never reaches the server.

import { useSyncExternalStore } from 'react';

const KEY = 'vts_zoom';

// The steps + and − move through. Denser around 100%, where small adjustments
// are what people actually want, and coarser towards the extremes.
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export const DEFAULT_ZOOM = 1;
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

let current: number = DEFAULT_ZOOM;
const listeners = new Set<() => void>();

function clamp(z: number): number {
  if (!Number.isFinite(z)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

// Snap an arbitrary stored value onto the ladder, so a hand-edited or legacy
// localStorage entry cannot leave + and − stepping from nowhere.
function snap(z: number): number {
  const target = clamp(z);
  let best: number = ZOOM_STEPS[0];
  for (const step of ZOOM_STEPS) {
    if (Math.abs(step - target) < Math.abs(best - target)) best = step;
  }
  return best;
}

function read(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ZOOM;
    return snap(Number(raw));
  } catch {
    // Private mode / storage blocked — zoom simply does not persist.
    return DEFAULT_ZOOM;
  }
}

// Publish the factor as a custom property on <html>. Everything else — the
// `zoom` on #root, every --vh/--vw length — derives from it, so this single
// write is the whole application step.
function publish(z: number): void {
  document.documentElement.style.setProperty('--vts-zoom', String(z));
}

function write(z: number): void {
  current = z;
  publish(z);
  try {
    if (z === DEFAULT_ZOOM) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(z));
  } catch {
    /* not persisting is survivable — the setting still holds for this session */
  }
  for (const fn of listeners) fn();
}

// Called from main.tsx **before the first render**, so a saved zoom is already
// in effect on frame one rather than snapping into place after paint.
export function applyStoredZoom(): void {
  current = read();
  publish(current);
}

export function getZoom(): number {
  return current;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function currentIndex(): number {
  const i = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number]);
  return i === -1 ? ZOOM_STEPS.indexOf(snap(current) as (typeof ZOOM_STEPS)[number]) : i;
}

export function canZoomIn(z: number = current): boolean {
  return z < MAX_ZOOM;
}
export function canZoomOut(z: number = current): boolean {
  return z > MIN_ZOOM;
}

export function zoomIn(): void {
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, currentIndex() + 1)];
  if (next !== current) write(next);
}

export function zoomOut(): void {
  const next = ZOOM_STEPS[Math.max(0, currentIndex() - 1)];
  if (next !== current) write(next);
}

export function resetZoom(): void {
  if (current !== DEFAULT_ZOOM) write(DEFAULT_ZOOM);
}

// Subscribe a component to the factor, so the menu's percentage and the enabled
// state of + / − update the moment either is pressed.
export function useZoom(): number {
  return useSyncExternalStore(subscribe, getZoom, () => DEFAULT_ZOOM);
}

// What the menu shows: "100%", "150%", "67%".
export function zoomLabel(z: number = current): string {
  return `${Math.round(z * 100)}%`;
}
