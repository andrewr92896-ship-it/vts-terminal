import type {
  FastifyRequest,
  FastifyReply,
  onRequestHookHandler,
  preHandlerHookHandler,
} from 'fastify';
import { SESSION_COOKIE, getUserForToken } from './sessions.js';
import {
  canAccessFunded,
  canAccessWorkspace,
  isAdmin,
  isWorkspaceReadOnly,
  parseRoles,
  type WorkspaceKey,
} from './rbac.js';
import { isDemoUser } from '../demo/identity.js';

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

// Reject unless the logged-in user can access the given workspace.
export function requireWorkspace(ws: WorkspaceKey): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    if (!canAccessWorkspace(parseRoles(user), ws)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}

// Reject unless the user holds the admin-assigned `funded` role (admins pass).
// Guards the private Funded (prop-challenge) endpoints. Pair with a Trading
// workspace guard so the caller also holds Trading access.
//
// The public demo account is hard-excluded here regardless of roles: the Funded
// section is a private feature that must never be reachable from the demo or the
// public, so the exclusion is baked into the guard rather than relying only on
// the demo not being granted the role.
export const requireFunded: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = request.currentUser;
  if (!user) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
  if (isDemoUser(user) || !canAccessFunded(parseRoles(user))) {
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
    if (isWorkspaceReadOnly(roles, ws)) {
      return reply.code(403).send({ error: 'Read-only access' });
    }
  };
}
