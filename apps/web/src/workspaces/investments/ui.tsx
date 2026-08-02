import type { CSSProperties, ReactNode } from 'react';
import { C, tint } from '../../theme/tokens';
import { usePrivacy } from '../../privacy/privacy';
import { Icon } from '../../components/Icon';
import type { InvestmentAssetClass, InvestmentPriceSource } from '../../api/types';

// Shared primitives for the Investments workspace. The eight screens compose
// from these rather than each restyling a card, so the workspace reads as one
// thing and a change to the look happens here instead of eight times.

/** The Investments accent (teal) — matches theme/nav.ts. */
export const TEAL = '#2DD4BF';

export const panel: CSSProperties = {
  background: 'linear-gradient(180deg,rgba(9,26,42,.5),rgba(6,18,30,.6))',
  border: `1px solid ${C.line}`,
  borderRadius: 12,
};

export const inputStyle: CSSProperties = {
  background: '#091633',
  border: `1px solid ${C.line2}`,
  borderRadius: 7,
  color: C.text,
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: C.sans,
  width: '100%',
  boxSizing: 'border-box',
};

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: C.faint,
  fontFamily: C.mono,
  marginBottom: 5,
};

export const primaryBtn: CSSProperties = {
  background: TEAL,
  color: '#04231f',
  border: 'none',
  borderRadius: 7,
  padding: '8px 14px',
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: C.sans,
};

export const ghostBtn: CSSProperties = {
  background: 'rgba(255,255,255,.05)',
  color: C.muted,
  border: `1px solid ${C.line2}`,
  borderRadius: 7,
  padding: '8px 12px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: C.sans,
};

export const dangerBtn: CSSProperties = {
  ...ghostBtn,
  color: C.red,
  borderColor: 'rgba(240,89,110,.35)',
};

// ---- Money ----

/**
 * Format dollars. `null` renders an em dash rather than "$0" — the difference
 * between "we don't know" and "it's worth nothing" is the whole honesty posture
 * of this workspace, and it has to survive all the way to the pixel.
 */
export function usd(n: number | null | undefined, opts: { cents?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '' : ''}${n.toFixed(digits)}%`;
}

/** Share/unit counts keep more decimals the smaller they get, so 0.0042 of a
 *  coin does not render as "0" the way the default locale format would. */
export function units(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = abs === 0 ? 0 : abs < 0.01 ? 6 : abs < 1 ? 4 : abs < 1000 ? 3 : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** Dollar figure that respects Privacy mode (the top-bar eye toggle). */
export function Money({
  value,
  cents,
  style,
}: {
  value: number | null | undefined;
  cents?: boolean;
  style?: CSSProperties;
}) {
  const { privacy } = usePrivacy();
  return <span style={style}>{privacy ? '•••••' : usd(value, { cents })}</span>;
}

/** A gain/loss figure — green up, red down, muted when unknown. */
export function Delta({
  value,
  percent,
  cents,
  size = 13,
}: {
  value: number | null;
  percent?: number | null;
  cents?: boolean;
  size?: number;
}) {
  const { privacy } = usePrivacy();
  if (value == null) return <span style={{ color: C.faint, fontSize: size }}>—</span>;
  const up = value >= 0;
  const color = up ? C.green : C.red;
  return (
    <span style={{ color, fontSize: size, fontWeight: 600, fontFamily: C.mono }}>
      {privacy ? '•••' : `${up ? '+' : '−'}${usd(Math.abs(value), { cents })}`}
      {percent != null && Number.isFinite(percent) && (
        <span style={{ color, opacity: 0.75, marginLeft: 6 }}>({pct(Math.abs(percent))})</span>
      )}
    </span>
  );
}

// ---- Layout ----

export function ScreenHeader({
  title,
  blurb,
  right,
}: {
  title: string;
  blurb: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: '#fff' }}>{title}</h2>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6, maxWidth: 680, lineHeight: 1.55 }}>{blurb}</div>
      </div>
      {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}

export function Card({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...panel, padding: 16, ...style }}>
      {(title || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          {title && (
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                color: C.faint,
                fontFamily: C.mono,
              }}
            >
              {title}
            </div>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatTile({
  label,
  children,
  sub,
}: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div style={{ ...panel, padding: '13px 15px', minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: C.faint,
          fontFamily: C.mono,
          marginBottom: 7,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 21, fontWeight: 700, color: C.text, fontFamily: C.mono, lineHeight: 1.15 }}>
        {children}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function TileGrid({ children, min = 190 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div style={{ ...panel, padding: '34px 26px', textAlign: 'center' }}>
      <Icon name={icon} size={22} color={C.faint} />
      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text, margin: '12px 0 6px' }}>{title}</div>
      {children && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>{children}</div>}
    </div>
  );
}

export function Bar({ pct: value, color = TEAL, height = 7 }: { pct: number; color?: string; height?: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 99, height, overflow: 'hidden' }}>
      <div style={{ width: `${clamped}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .3s ease' }} />
    </div>
  );
}

// ---- The disclaimer ----

/**
 * The informational-only line. Every advice-adjacent surface in this workspace
 * carries one — it is what keeps a tracker that displays and educates on the
 * right side of the line from a service that advises. Do not remove it from a
 * screen; if a new screen shows figures a person could act on, add it there too.
 */
export function Disclaimer({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 14,
        borderTop: `1px solid ${C.line}`,
        fontSize: 11,
        lineHeight: 1.6,
        color: C.faint,
        fontFamily: C.mono,
      }}
    >
      {children ??
        'Informational only. Investments is a read-only tracker — it never places trades or moves money, and nothing here is investment, tax, or financial advice.'}
    </div>
  );
}

// ---- Price provenance ----

export const PRICE_SOURCE_LABEL: Record<InvestmentPriceSource, string> = {
  live: 'Live price',
  manual: 'Your price',
  none: 'No price',
};

/**
 * Says where a holding's price came from. This badge is not decoration: a
 * portfolio priced off figures the user typed in three months ago is a
 * different object from one priced live, and the screens must never let those
 * look the same.
 */
export function PriceSourceTag({ source, at }: { source: InvestmentPriceSource; at?: number | null }) {
  const color = source === 'live' ? C.green : source === 'manual' ? C.amber : C.faint;
  const label = PRICE_SOURCE_LABEL[source];
  const when = source === 'manual' && at ? ` · ${relativeDay(at)}` : '';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontFamily: C.mono,
        color,
        border: `1px solid ${tint(color, 0.35)}`,
        background: tint(color, 0.08),
        borderRadius: 5,
        padding: '2px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 99, background: color, flex: 'none' }} />
      {label}
      {when}
    </span>
  );
}

/** "today" / "3 days ago" / "2 months ago" — for stamping a hand-entered price. */
export function relativeDay(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export const ASSET_CLASS_LABEL: Record<InvestmentAssetClass, string> = {
  us_stock: 'US stocks',
  intl_stock: 'International stocks',
  bond: 'Bonds',
  cash: 'Cash',
  real_estate: 'Real estate',
  commodity: 'Commodities',
  crypto: 'Crypto',
  target_date: 'Target-date fund',
  other: 'Other',
};

/** A stable colour per asset class, so a class is the same colour on every
 *  screen that charts it. */
export const ASSET_CLASS_COLOR: Record<InvestmentAssetClass | 'cash', string> = {
  us_stock: '#2DD4BF',
  intl_stock: '#6C9EFF',
  bond: '#B69CFF',
  cash: '#5E7098',
  real_estate: '#E5A43B',
  commodity: '#EBCB74',
  crypto: '#F0596E',
  target_date: '#35c47b',
  other: '#93A5C9',
};

export function bucketColor(key: string, index: number): string {
  const known = (ASSET_CLASS_COLOR as Record<string, string>)[key];
  if (known) return known;
  const palette = ['#2DD4BF', '#6C9EFF', '#B69CFF', '#E5A43B', '#F0596E', '#35c47b', '#EBCB74', '#93A5C9'];
  return palette[index % palette.length]!;
}

/**
 * The banner that appears whenever some of the portfolio could not be priced.
 * A total that silently excludes three holdings is a wrong total unless the
 * screen says so — this is that saying-so, and it is why `unpricedCount` is on
 * every payload.
 */
export function UnpricedNote({ count, onFix }: { count: number; onFix?: () => void }) {
  if (count <= 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flexWrap: 'wrap',
        background: tint(C.amber, 0.08),
        border: `1px solid ${tint(C.amber, 0.3)}`,
        borderRadius: 9,
        padding: '9px 12px',
        fontSize: 12,
        color: C.amber,
        marginBottom: 14,
      }}
    >
      <Icon name="alert-triangle" size={14} color={C.amber} />
      <span>
        {count === 1
          ? '1 holding has no price yet, so it is left out of the totals below.'
          : `${count} holdings have no price yet, so they are left out of the totals below.`}
      </span>
      {onFix && (
        <button onClick={onFix} style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11.5, color: C.amber }}>
          Show me
        </button>
      )}
    </div>
  );
}
