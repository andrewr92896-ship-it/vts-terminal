import { C } from '../theme/tokens';

// The employee portal reuses the portal's surface palette (same navy, same
// hairlines, same type) so it reads as the same company's software — but its
// accent is deliberately its own. Gold means Advanced Trading, rose means Admin,
// violet means Studies; sky means "you are in the secure employee zone, on a
// separate session". The colour is the standing reminder of which door you came
// through.
export const EMP = {
  ...C,
  accent: '#38BDF8',
  accent2: '#0EA5E9',
  accentText: '#04202E',
  // The design system's type stack, self-hosted in employee/fonts.css. Source
  // Sans carries the UI; Source Serif is for headings only — screen titles and
  // the portal's own name — never body copy or controls.
  sans: "'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
} as const;

export const EMP_GRADIENT = 'linear-gradient(180deg, #38BDF8, #0EA5E9)';

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
