import type {
  FastifyRequest,
  FastifyReply,
  onRequestHookHandler,
  preHandlerHookHandler,
} from 'fastify';
import { SESSION_COOKIE, getUserForToken } from './sessions.js';
import {
  canAccessWorkspace,
  isAdmin,
  isFounder,
  isWorkspaceReadOnly,
  parseRoles,
  type WorkspaceKey,
} from './rbac.js';
import { isDemoUser } from '../demo/identity.js';
import { featuresForUser } from '../features/service.js';
import { hasEntitlement } from '../memberships/service.js';
import { FEATURE_LABELS, FEATURE_TIER, TIER_LABELS, type PremiumFeature } from '../memberships/tiers.js';

// Runs on every request: resolves the signed session cookie to a user
// (or null) and attaches it to request.currentUser.
export const loadUser: onRequestHookHandler = async (
  request: FastifyRequest,
) => {
  request.currentUser = null;
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return;
  request.currentUser = await getUserForToken(unsigned.value);
};

// Reject the request unless a user is logged in.
export const requireAuth: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!request.currentUser) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
};

// Reject unless the logged-in user is an Admin. Used for user management.
export const requireAdmin: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = request.currentUser;
  if (!user) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
  if (!isAdmin(parseRoles(user))) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
};

// Reject unless the logged-in user is founder-level (founder or the
// permission-equivalent software_developer). Guards the founder-only tools:
// the Founder Terminal (AI Instructions, Site Wording, View as role) and the
// site-wording copy overrides. Plain admins are rejected here.
export const requireFounder: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = request.currentUser;
  if (!user) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
  if (!isFounder(parseRoles(user))) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
};

// Reject unless the logged-in user can access the given workspace.
//
// Trading is opt-in (My Terminal ▸ Premium Features), so the workspace guard checks
// that too — which means every endpoint already behind it inherits the gate
// rather than each route having to remember. The market-facing endpoints that
// are included with every account use `requireMarkets` instead.
export function requireWorkspace(ws: WorkspaceKey): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    if (!canAccessWorkspace(parseRoles(user), ws)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (ws === 'trading' && !(await featuresForUser(user)).advancedTrading) {
      return reply.code(403).send({ error: 'Advanced Trading is not turned on for your account' });
    }
  };
}

// The market-facing surfaces — headlines, the economic calendar, market data and
// the chart board — are included with every account, so this is just "signed
// in". Named rather than reusing requireAuth at the call sites so the boundary is
// legible: anything on this guard is deliberately available to a user who has
// opted into nothing. (The name predates the Markets workspace being dissolved
// into My Terminal; what it guards — public market data, no trade, no broker, no
// balance — is unchanged, so the name still describes the boundary.)
export const requireMarkets: preHandlerHookHandler = requireAuth;

// Reject unless the user has opted into Advanced Trading (My Terminal ▸ Premium
// Features). This is the gate on the whole desk — placing and reviewing trades,
// broker connections, alerts, strategy sessions, the manual book. The
// market-facing endpoints (news, the economic calendar, market data, the chart
// board) deliberately do NOT use this guard: they are included with every
// account.
export const requireAdvancedTrading: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = request.currentUser;
  if (!user) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
  const features = await featuresForUser(user);
  if (!features.advancedTrading) {
    return reply.code(403).send({ error: 'Advanced Trading is not turned on for your account' });
  }
};

// Reject unless the user has opted into the Funded Account tracker. Funded is
// nested under Advanced Trading — the service will not store it enabled while
// the desk is off — so this one check covers both.
//
// The public demo account is hard-excluded here regardless: the Funded section
// is not part of the demo tour, so the exclusion is baked into the guard rather
// than relying on the demo's stored features alone.
export const requireFunded: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = request.currentUser;
  if (!user) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
  const features = await featuresForUser(user);
  if (isDemoUser(user) || !features.funded) {
    return reply.code(403).send({ error: 'Forbidden' });
  }
};

// Reject unless the account's membership reaches a paid feature.
//
// This is the paywall, and it is a THIRD axis alongside roles and feature
// opt-ins: a role says what you are trusted with, an opt-in says what you have
// asked to see, and a membership says what you have paid for. All three can
// apply to one endpoint — the Funded tracker needs the desk opt-in AND a paid
// tier — so these guards compose rather than replace one another.
//
// It answers 402 Payment Required, not 403, and the distinction is load-bearing:
// the client shows an upgrade prompt on a 402 and an error on a 403, so a paid
// feature that answered 403 would tell a paying-capable user they are forbidden
// instead of offering them the thing they would happily buy. The body carries
// the feature and the tier it needs so the prompt can name both.
export function requirePremium(feature: PremiumFeature): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    if (!(await hasEntitlement(user, feature))) {
      return reply.code(402).send({
        error: `${FEATURE_LABELS[feature]} needs a ${TIER_LABELS[FEATURE_TIER[feature]]} membership`,
        upgrade: { feature, requiredTier: FEATURE_TIER[feature] },
      });
    }
  };
}

// Reject unless the user can *modify* the workspace — use this on every
// POST/PATCH/DELETE.
//
// It checks three things: workspace access, the Advanced Trading opt-in, and
// whether the workspace is read-only for these roles. That last check cannot
// currently fire: the read-only role variants (`trading_viewer` and friends) are
// retired, so isWorkspaceReadOnly() is false for everyone and the only read-only
// account is the demo, which demoGuard stops before this runs. Keep using this
// on writes anyway — it is where a read-only tier's check would land if one is
// ever introduced, and putting writes on requireWorkspace instead would silently
// remove that seam. (The PAID tier's check is separate: requirePremium above,
// composed alongside this rather than folded into it, because "has not paid" and
// "may not write" are different refusals with different answers.)
export function requireWorkspaceWrite(ws: WorkspaceKey): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    const roles = parseRoles(user);
    if (!canAccessWorkspace(roles, ws)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (ws === 'trading' && !(await featuresForUser(user)).advancedTrading) {
      return reply.code(403).send({ error: 'Advanced Trading is not turned on for your account' });
    }
    if (isWorkspaceReadOnly(roles, ws)) {
      return reply.code(403).send({ error: 'Read-only access' });
    }
  };
}
