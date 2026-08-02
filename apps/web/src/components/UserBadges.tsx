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

// The two membership badges, highest tier first. Earned by holding a tier and
// appended to the user payload on read (withMembershipBadge, server-side), never
// hand-assigned — so the admin picker leaves them out. Mirrors
// MEMBERSHIP_BADGE_KEYS in apps/api/src/badges/service.ts, which is the enforcer.
export const MEMBERSHIP_BADGE_KEYS = ['max', 'premium'];

// The account-status badges, highest standing first. Exactly ONE of these ever
// shows, and it leads the row — the first badge beside a name answers "what is
// this account", and the rest are recognition.
//
// A role badge REPLACES a tier badge rather than sitting beside it: a founder,
// software developer or admin already reaches everything Max does (getMembership
// resolves them to Max without a stored grant), so a crown and a gem together
// state the same fact twice. Likewise the crown alone on a founder who is also
// an admin — founder-level is a superset, so the shield adds nothing.
//
// A rung is matched on a badge's `autoRole` where it has one and its `key`
// otherwise, which is what the seeded rows carry: the role badges are the only
// ones with an autoRole, and `premium` / `max` are the two membership keys.
// An admin can rename or recolour a builtin badge but cannot change either
// field, so this holds.
const STATUS_ORDER = ['founder', 'software_developer', 'admin', ...MEMBERSHIP_BADGE_KEYS];

function statusRank(b: BadgeType): number {
  return STATUS_ORDER.indexOf(b.autoRole ?? b.key);
}

// The badges a user effectively shows: any assigned to them, plus any that are
// auto-granted by a role they hold (e.g. the Admin shield). The one account-
// status badge leads; everything else follows in the registry's position order
// so the row is stable.
export function effectiveBadges(
  registry: BadgeType[],
  roles: RoleKey[],
  assigned: string[],
): BadgeType[] {
  const assignedSet = new Set(assigned);
  const held = registry.filter(
    (b) => assignedSet.has(b.key) || (b.autoRole && roles.includes(b.autoRole as RoleKey)),
  );
  const status = held
    .filter((b) => statusRank(b) >= 0)
    .sort((a, b) => statusRank(a) - statusRank(b))[0];
  const rest = held.filter((b) => statusRank(b) < 0);
  return status ? [status, ...rest] : rest;
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
