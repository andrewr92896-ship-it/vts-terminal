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
// Trading is opt-in (My Terminal ▸ Feature Access), so the workspace guard checks
// that too — which means every endpoint already behind it inherits the gate
// rather than each route having to remember. Market-facing endpoints that moved
// to the always-on Markets workspace use `requireMarkets` instead.
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

// The Markets workspace — headlines, the economic calendar, market data and the
// chart board — is included with every account, so this is just "signed in".
// Named rather than reusing requireAuth at the call sites so the boundary is
// legible: anything on this guard is deliberately available to a user who has
// opted into nothing.
export const requireMarkets: preHandlerHookHandler = requireAuth;

// Reject unless the user has opted into Advanced Trading (My Terminal ▸ Feature
// Access). This is the gate on the whole desk — placing and reviewing trades,
// broker connections, alerts, strategy sessions, the manual book. The
// market-facing endpoints behind the Markets workspace (news, the economic
// calendar, market data, the chart board) deliberately do NOT use this guard:
// they are included with every account.
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

// Reject unless the user can *modify* the workspace. Read-only roles (today only
// trading_viewer) can see the workspace but must not mutate it — use this on
// every POST/PATCH/DELETE so a viewer's writes are rejected server-side.
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
