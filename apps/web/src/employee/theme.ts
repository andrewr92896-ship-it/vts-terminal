// The Employee Portal's design tokens.
//
// This file deliberately does NOT extend the main portal's `C` tokens. The two
// surfaces are different products with different jobs: the trading portal is a
// dark pro-terminal you stare at all day, the employee portal is a calm internal
// site you drop into for five minutes. Sharing a palette would have forced one
// to compromise for the other, and every token below would have needed an
// override anyway.
//
// Values come from the design system (docs/design/employee-portal/README.md):
// a warm sand page, white cards, a deep forest masthead, terracotta for action.

export const EMP = {
  // ---- Surfaces ----
  bg: '#f5f2ec', // the page itself — warm sand
  panel: '#ffffff', // cards
  panel2: '#faf8f4', // nested fills, table header rows, hover states
  side: '#0f3d3a', // the masthead and any deliberately dark chrome

  // ---- Hairlines ----
  line: '#e3ddd3', // card borders
  lineSoft: '#ece7de', // dividers inside a card
  line2: '#ded7cb', // field and control borders

  // ---- Text on light ----
  text: '#23302f',
  muted: '#6e7a78',
  faint: '#9aa3a0',

  // ---- Text on the forest masthead ----
  onDark: '#f0ece2',
  onDarkMuted: '#a9bbb7',

  // ---- Brand ----
  // Terracotta is the action colour: primary buttons, active nav, links, badges.
  accent: '#c25a38',
  accent2: '#a94a2c', // hover
  accentText: '#ffffff', // text on a terracotta fill
  forest: '#0f3d3a',
  forestHover: '#0b2e2c',
  apricot: '#e8a87c', // accent used *on* forest, where terracotta would muddy

  // ---- Semantic ----
  // Green reads "good" (in office, done, attending). The warn/bad pair stays in
  // the palette's warm family rather than importing a generic alert red, which
  // would fight the terracotta everywhere it appeared.
  green: '#2f7d5b',
  greenBg: '#eef4f1',
  greenBorder: '#bcd6c9',
  amber: '#a8631f',
  red: '#b3402a',
  redBg: '#fbeee8',
  redBorder: '#f0d5c8',

  // ---- Type ----
  // Source Sans carries the UI; Source Serif is for headings only — screen
  // titles and the portal's own name — never body copy or controls. Mono is kept
  // for the few places that genuinely need it: addresses, timestamps, copy ids.
  sans: "'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

// Shadows appear only on floating chrome, never on cards — the design uses
// hairline borders for elevation on the page itself. All three are tinted with
// the forest rather than neutral black, so they sit warm against the sand.
export const SHADOW = {
  fab: '0 8px 24px rgba(13,45,42,.26)',
  banner: '0 10px 30px rgba(13,45,42,.28)',
  popover: '0 18px 44px rgba(13,45,42,.22)',
} as const;

// Corner radii, from the design's scale.
export const RADIUS = {
  tag: 3,
  chip: 4,
  control: 5,
  card: 6,
  popover: 12,
  pill: 999,
} as const;

export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Shared date/time helpers — the portal shows absolute times, never "3h ago",
// because an audit trail that rounds is an audit trail you cannot cite.
export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contractor: 'Contractor',
  intern: 'Intern',
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  suspended: 'Suspended',
  offboarded: 'Offboarded',
};

export const DOC_CATEGORY_LABELS: Record<string, string> = {
  policy: 'Policy',
  handbook: 'Handbook',
  form: 'Form',
  guide: 'Guide',
  other: 'Other',
};
