// Small per-user UI preferences persisted in localStorage — cosmetic view
// choices that need no server round-trip. Set from My Terminal ▸ Preferences and
// read by the screens they affect (e.g. the Trade Log's deck/tape layout).

export type Layout = 'deck' | 'tape';

const LAYOUT_KEY = 'vts.tradelog.layout';

export function getTradeLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'tape' ? 'tape' : 'deck';
  } catch {
    return 'deck';
  }
}

export function setTradeLayout(v: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, v);
  } catch {
    /* ignore — private mode / storage disabled */
  }
}
