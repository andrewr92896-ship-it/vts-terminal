import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, type UserRow } from '../db/schema.js';
import { isFounder, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import type { MembershipTier } from '../memberships/tiers.js';

// DEVELOPER PREVIEW — seeing the real product as somebody else sees it.
//
// The owner has to be able to check what a free account, a Premium account or a
// member of the public actually gets, on the real screens, without keeping a
// second login for each. The obvious implementations are all wrong:
//
//   • A client-side flag is not a preview, it is a costume. The screen would
//     draw a padlock and the API would go on serving the paid answer behind it,
//     so the one thing being tested — does the boundary hold — is the one thing
//     it cannot show.
//   • Temporarily downgrading the real membership is worse. It is a write to a
//     real account, it is visible to anything else reading that account, and a
//     browser closed mid-preview leaves the owner locked out of their own
//     terminal with no obvious cause.
//
// So a preview is SERVER-SIDE and lives on the SESSION. Every request in that
// session is answered for the previewed account: the guards refuse, the payloads
// narrow, the 402s fire. The account itself is untouched, a second browser is
// unaffected, and signing out ends it.
//
// THE PREVIEW ONLY EVER REDUCES. There is no value here that grants anything —
// every mode resolves to a tier at or below what the previewer already had, and
// `public` additionally strips their elevated roles. That is what makes this a
// testing tool rather than the generic "turn the safeguards off" switch the
// handoff forbids: there is nothing to turn off, only privilege to give up.

/** The four things a developer can ask to be treated as. */
export const PREVIEW_MODES = ['free', 'premium', 'max', 'public'] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];

export function isPreviewMode(v: unknown): v is PreviewMode {
  return typeof v === 'string' && (PREVIEW_MODES as readonly string[]).includes(v);
}

export interface PreviewState {
  mode: PreviewMode;
  /** The membership tier every entitlement check resolves to. */
  tier: MembershipTier;
  /**
   * Whether to strip elevated roles as well.
   *
   * This is what separates "preview as Free" from "preview as a member of the
   * public". The first keeps the developer's own roles, so the Admin and
   * Developer Terminals stay in the sidebar and they can move around while
   * testing a locked screen. The second takes those away too, which is the only
   * way to see the sidebar, the routing and the empty states an ordinary signup
   * actually meets.
   */
  asPublic: boolean;
}

export function previewStateFor(mode: PreviewMode): PreviewState {
  switch (mode) {
    case 'premium':
      return { mode, tier: 'premium', asPublic: false };
    case 'max':
      return { mode, tier: 'max', asPublic: false };
    case 'public':
      return { mode, tier: 'free', asPublic: true };
    default:
      return { mode, tier: 'free', asPublic: false };
  }
}

/**
 * The user object a previewing request carries.
 *
 * `roles` holds the EFFECTIVE roles — rewritten to a plain member while
 * previewing as the public — because every guard, every `parseRoles` call and
 * every payload in the terminal reads that field. Rewriting it once here is what
 * makes the preview authoritative everywhere without a single call site knowing
 * this module exists. `realRoles` keeps the truth, for the two things that must
 * ask who this actually is: the guard on changing the preview, and the client's
 * own "you are previewing" banner.
 */
export interface PreviewedUser extends UserRow {
  preview: PreviewState | null;
  /** The account's own roles, before the preview narrowed them. */
  realRoles: string | null;
}

const MEMBER_ONLY = JSON.stringify(['member']);

/**
 * Apply a stored preview to a freshly-loaded user row.
 *
 * Refuses in two cases, both of which would be a privilege change rather than a
 * preview: an account that is not founder-level (only they may hold one at all,
 * and a role revoked mid-session must drop the preview with it), and the demo,
 * which is already a fixed presentation of the product and has nothing to
 * preview.
 */
export function applyPreview(user: UserRow, stored: string | null): PreviewedUser {
  const plain: PreviewedUser = { ...user, preview: null, realRoles: user.roles };
  if (!stored || !isPreviewMode(stored)) return plain;
  if (isDemoUser(user) || !isFounder(parseRoles(user))) return plain;

  const preview = previewStateFor(stored);
  return {
    ...user,
    roles: preview.asPublic ? MEMBER_ONLY : user.roles,
    preview,
    realRoles: user.roles,
  };
}

/** Whether this account may set a preview — asked of the REAL roles, always. */
export function canPreview(user: { realRoles?: string | null; roles: string | null; username: string }): boolean {
  if (isDemoUser(user as { username: string })) return false;
  return isFounder(parseRoles({ roles: user.realRoles ?? user.roles }));
}

export async function setSessionPreview(sessionId: string, mode: PreviewMode | null): Promise<void> {
  await db.update(sessions).set({ previewAs: mode }).where(eq(sessions.id, sessionId));
}
