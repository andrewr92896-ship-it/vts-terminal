import type {
  FastifyRequest,
  FastifyReply,
  onRequestHookHandler,
  preHandlerHookHandler,
} from 'fastify';
import { SESSION_COOKIE, getUserForToken } from './sessions.js';
import { canAccessWorkspace, type WorkspaceKey } from './rbac.js';

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

// Reject unless the logged-in user can access the given workspace.
export function requireWorkspace(ws: WorkspaceKey): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    if (!canAccessWorkspace(user.role, ws)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
