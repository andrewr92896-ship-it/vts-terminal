import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { BadgeType, RoleKey } from '../api/types';
import { Icon } from './Icon';

// Recognition badges shown as small icons next to a member's name. The registry
// (which badges exist, their icon/color, and any auto-grant role) is loaded once
// and shared via context so every place that renders a name — the top bar, the
// admin user list, team chat — draws the same icons without refetching.

const BadgeRegistryContext = createContext<BadgeType[]>([]);

export function BadgesProvider({ children }: { children: ReactNode }) {
  const [badges, setBadges] = useState<BadgeType[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .badges()
      .then((r) => alive && setBadges(r.badges))
      .catch(() => {
        /* no badges available — names simply render without icons */
      });
    return () => {
      alive = false;
    };
  }, []);
  return <BadgeRegistryContext.Provider value={badges}>{children}</BadgeRegistryContext.Provider>;
}

export function useBadgeRegistry(): BadgeType[] {
  return useContext(BadgeRegistryContext);
}

// The badges a user effectively shows: any assigned to them, plus any that are
// auto-granted by a role they hold (e.g. the Admin shield). Ordered by the
// registry's position so the row is stable.
export function effectiveBadges(
  registry: BadgeType[],
  roles: RoleKey[],
  assigned: string[],
): BadgeType[] {
  const assignedSet = new Set(assigned);
  return registry.filter(
    (b) => assignedSet.has(b.key) || (b.autoRole && roles.includes(b.autoRole as RoleKey)),
  );
}

// Render the icons next to a name. Pass the user's roles + assigned badge keys.
export function UserBadges({
  roles,
  badges,
  size = 14,
  gap = 3,
  style,
}: {
  roles: RoleKey[];
  badges: string[];
  size?: number;
  gap?: number;
  style?: React.CSSProperties;
}) {
  const registry = useBadgeRegistry();
  const shown = effectiveBadges(registry, roles, badges);
  if (shown.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, ...style }}>
      {shown.map((b) => (
        <span key={b.key} title={b.description || b.label} style={{ display: 'inline-flex' }} aria-label={b.label}>
          <Icon name={b.icon} size={size} color={b.color} />
        </span>
      ))}
    </span>
  );
}
