import type { CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import type { TradeDesignation } from '../../api/types';

// The coloured designation shown on a position whose owner is a Chief Strategist
// (green) or Chief Analyst (red). Two variants share the same icon + colour:
//   • 'chip' — the badge icon plus its label, for the roomy trade cards.
//   • 'icon' — the badge icon alone (with a tooltip), for dense tape/table rows.
// Renders nothing when the position carries no designation, so callers can drop
// it in unconditionally.
export function DesignationTag({
  designation,
  variant = 'chip',
  size = 13,
  color: colorOverride,
}: {
  designation: TradeDesignation | null | undefined;
  variant?: 'chip' | 'icon';
  size?: number;
  // Override the badge's own colour — used to render a designated but off-book
  // (funded) position's tag in gray, matching its muted tile.
  color?: string;
}) {
  if (!designation) return null;
  const { icon, label } = designation;
  const color = colorOverride ?? designation.color;

  if (variant === 'icon') {
    return (
      <span title={label} aria-label={label} style={{ display: 'inline-flex', flex: 'none' }}>
        <Icon name={icon} size={size} color={color} />
      </span>
    );
  }

  return (
    <span title={label} aria-label={label} style={chip(color)}>
      <Icon name={icon} size={size} color={color} />
      <span>{label}</span>
    </span>
  );
}

// A subtle wash of an accent colour blended into a card's base background, so the
// whole trade tile reads in that colour — green for Chief Strategist, red for
// Chief Analyst, gray for an off-book (funded) position.
export function tileTint(accent: string, base: string): string {
  return `color-mix(in srgb, ${accent} 13%, ${base})`;
}

function chip(color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.3px',
    color,
    // A faint tint of the designation colour so the chip reads as "their colour"
    // without a hardcoded palette — mixed against transparent keeps it subtle.
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
    borderRadius: 5,
    padding: '2px 7px 2px 5px',
  };
}
