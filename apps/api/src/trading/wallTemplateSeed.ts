import type { TemplateTile } from './wallTemplates.js';

// The three built-in Live Wall layouts, as the SEED for `wall_templates`.
//
// Kept in step with the web's presetLayouts.ts by hand — the client cannot be
// imported here, and a shared package for three literals would cost more than it
// saves. They are only ever read once per install: `seedWallTemplates` creates
// what is missing on boot and never overwrites, so after the first deploy the
// table is the source of truth and this file is history.
export const WALL_TEMPLATE_SEED: {
  key: string;
  label: string;
  blurb: string;
  tiles: TemplateTile[];
}[] = [
  {
    key: 'markets',
    label: 'Markets',
    blurb: 'Charts, quotes, headlines and the calendar.',
    tiles: [
      { kind: 'watchlist', x: 0, y: 0, w: 12, h: 3 },
      { kind: 'chart', x: 0, y: 3, w: 8, h: 16 },
      { kind: 'news', x: 8, y: 3, w: 4, h: 16 },
      { kind: 'calendar', x: 0, y: 19, w: 6, h: 12 },
      { kind: 'clock', x: 6, y: 19, w: 6, h: 12 },
    ],
  },
  {
    key: 'desk',
    label: 'Trading Desk',
    blurb: 'Open trades, the record, and what you are watching.',
    tiles: [
      { kind: 'watchlist', x: 0, y: 0, w: 12, h: 3 },
      { kind: 'chart', x: 0, y: 3, w: 8, h: 16 },
      { kind: 'positions', x: 8, y: 3, w: 4, h: 16 },
      { kind: 'tradelog', x: 0, y: 19, w: 4, h: 9 },
      { kind: 'closed', x: 4, y: 19, w: 4, h: 9 },
      { kind: 'alerts', x: 8, y: 19, w: 4, h: 9 },
    ],
  },
  {
    key: 'personal',
    label: 'My Terminal',
    blurb: 'Your money, your list, and what is new.',
    tiles: [
      { kind: 'networth', x: 0, y: 0, w: 4, h: 10 },
      { kind: 'portfolio', x: 4, y: 0, w: 4, h: 10 },
      { kind: 'todo', x: 8, y: 0, w: 4, h: 10 },
      { kind: 'studystats', x: 0, y: 10, w: 4, h: 9 },
      { kind: 'announcements', x: 4, y: 10, w: 4, h: 9 },
      { kind: 'patchnotes', x: 8, y: 10, w: 4, h: 9 },
    ],
  },
];
