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
  isWorkspaceReadOnly,
  parseRoles,
  type RoleKey,
  type WorkspaceKey,
} from './rbac.js';

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

// Shared guard core. Ensures a user is logged in (else 401) and, when a role
// `check` is given, that their roles satisfy it (else 403 with the returned
// message). Centralizing this means every guard does the auth step identically
// — a new guard can't accidentally skip the logged-in check. When this sends a
// reply, Fastify short-circuits and the route handler never runs.
function gate(
  check?: (roles: RoleKey[]) => string | null, // null = allowed; string = 403 reason
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    if (check) {
      const denial = check(parseRoles(user));
      if (denial) return reply.code(403).send({ error: denial });
    }
  };
}

// Reject the request unless a user is logged in.
export const requireAuth: preHandlerHookHandler = gate();

// Reject unless the logged-in user is an Admin. Used for user management.
export const requireAdmin: preHandlerHookHandler = gate((roles) =>
  isAdmin(roles) ? null : 'Forbidden',
);

// Reject unless the logged-in user can access the given workspace.
export function requireWorkspace(ws: WorkspaceKey): preHandlerHookHandler {
  return gate((roles) => (canAccessWorkspace(roles, ws) ? null : 'Forbidden'));
}

// Reject unless the user can *modify* the workspace. Read-only roles (today only
// trading_viewer) can see the workspace but must not mutate it — use this on
// every POST/PATCH/DELETE so a viewer's writes are rejected server-side.
export function requireWorkspaceWrite(ws: WorkspaceKey): preHandlerHookHandler {
  return gate((roles) => {
    if (!canAccessWorkspace(roles, ws)) return 'Forbidden';
    if (isWorkspaceReadOnly(roles, ws)) return 'Read-only access';
    return null;
  });
}
