import type { UserRow } from '../db/schema.js';
import { DEFAULT_TEAM_ID } from '../teams/service.js';
import { isDemoUser } from '../demo/identity.js';

// The Series 65 study track (its 400-question bank, explanations, and vocabulary)
// is licensed content the owner may not share outside their own trading team. So
// it is available only to members of the default (owner's) team — Vitalis — and
// never to the public demo account. Every other team builds and plays its own
// team-authored study games instead.
//
// This is the single server-side gate on the copyrighted bank endpoint; the web
// mirrors it (apps/web/src/auth/access.ts) only to hide the UI.
export function canUseSeries65(user: Pick<UserRow, 'teamId' | 'username'> | null | undefined): boolean {
  if (!user) return false;
  if (isDemoUser(user)) return false;
  return user.teamId === DEFAULT_TEAM_ID;
}
