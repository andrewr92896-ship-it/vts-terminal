import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { employeeProfiles, type EmployeeProfileRow, type UserRow } from '../db/schema.js';
import { canAccessEmployeePortal, isFounder, parseRoles } from '../auth/rbac.js';
import { isDemoUser } from '../demo/identity.js';
import {
  EMPLOYEE_COOKIE,
  EMPLOYEE_CSRF_HEADER,
  csrfMatches,
  resolveEmployeeSession,
  touchEmployeeSession,
} from './sessions.js';
import { EMPLOYEE_DEVICE_COOKIE } from './trustedDevices.js';
import { ipAllowed } from './network.js';
import { audit } from './audit.js';

// Everything that stands between a request and the employee portal's data.
//
// The layers, in the order they are applied:
//   1. network  — optional IP allowlist (fails closed when configured)
//   2. origin   — Sec-Fetch-Site / Origin must be this site, on every write
//   3. session  — the employee cookie only; the main portal's session is not
//                 consulted anywhere in this file
//   4. identity — active account, not the demo, holds the `employee` role, and
//                 has an `active` employee profile
//   5. csrf     — a derived per-session token echoed in a custom header
// A refusal at any layer is recorded in the audit log and answered with a
// deliberately vague message.

export interface EmployeeContext {
  user: UserRow;
  profile: EmployeeProfileRow;
  sessionId: string;
  /** Employee-portal administrator (HR flag, or a founder-level portal user). */
  isPortalAdmin: boolean;
  /**
   * Founder-level on the underlying portal account. Deliberately narrower than
   * `isPortalAdmin`: HR administrators run the people/announcement/document
   * surfaces, but only a developer may rewrite the site's own wording.
   */
  isDeveloper: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    employee?: EmployeeContext;
  }
}

// Response headers for every employee-portal response — the page shell and the
// API alike. The employee portal is not embeddable, not cacheable, not
// referrer-leaking, and loads no third-party code.
export function applyEmployeeSecurityHeaders(reply: FastifyReply, opts: { html?: boolean } = {}): void {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // The portal styles with React inline `style` attributes throughout, which
    // require 'unsafe-inline' in style-src. No inline *script* is permitted,
    // which is the directive that actually stops injected code from running.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Same-origin API only — a compromised page cannot exfiltrate to elsewhere.
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "worker-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  reply.header('Content-Security-Policy', csp);
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  reply.header('Cross-Origin-Opener-Policy', 'same-origin');
  reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
  // Nothing on this surface may ever be held by a browser or an intermediary.
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  reply.header('Pragma', 'no-cache');
  if (opts.html) reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  // Only meaningful over HTTPS; COOKIE_SECURE is the site's "we are on HTTPS" flag.
  if (process.env.NODE_ENV === 'production') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function clientIp(request: FastifyRequest): string {
  return request.ip ?? '';
}

function cookieToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[EMPLOYEE_COOKIE];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return undefined;
  return unsigned.value;
}

export { cookieToken as employeeCookieToken };

// The long-lived "remember this device" token, read the same signed way. It is
// deliberately not consulted by any guard below: holding it lets a browser skip
// the emailed code at sign-in, and nothing else. Authority still comes from the
// session cookie alone.
export function employeeDeviceCookieToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[EMPLOYEE_DEVICE_COOKIE];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return undefined;
  return unsigned.value;
}

// Layer 1 — the optional network fence. Used by the API guard and by the
// /employee page route in server.ts, so a blocked address never even receives
// the sign-in page.
export async function enforceIpAllowlist(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (ipAllowed(clientIp(request))) return true;
  await audit({
    action: 'access.blocked_ip',
    ip: clientIp(request),
    userAgent: request.headers['user-agent'],
    detail: request.url.split('?')[0],
    ok: false,
  });
  reply.code(403).send({ error: 'Not available from this network' });
  return false;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Layer 2 — where the request came from. `Sec-Fetch-Site` is sent by every
// current browser and is not forgeable by page script; the Origin check is the
// fallback for anything that omits it. Belt and braces on top of SameSite=Strict.
function originOk(request: FastifyRequest): boolean {
  const site = request.headers['sec-fetch-site'];
  if (typeof site === 'string') return site === 'same-origin' || site === 'none';
  const origin = request.headers.origin;
  if (!origin) return true; // no Origin at all (non-browser client, same-origin GET)
  const host = request.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function deny(
  request: FastifyRequest,
  reply: FastifyReply,
  code: number,
  message: string,
  action: 'access.denied' | 'access.csrf_rejected',
  userId?: string | null,
): Promise<void> {
  await audit({
    action,
    userId: userId ?? null,
    ip: clientIp(request),
    userAgent: request.headers['user-agent'],
    detail: `${request.method} ${request.url.split('?')[0]}`,
    ok: false,
  });
  reply.code(code).send({ error: message });
}

// Resolve the employee context for a request, or null. Shared by the guards
// below and by the session-bootstrap route (which must answer "not signed in"
// rather than 401 so the page can render its sign-in form).
export async function loadEmployeeContext(
  request: FastifyRequest,
): Promise<{ ctx: EmployeeContext; stage: string } | null> {
  const resolved = await resolveEmployeeSession(cookieToken(request));
  if (!resolved) return null;
  const { session, user } = resolved;

  // Layer 4 — identity. Re-checked on every request, not just at sign-in, so
  // revoking the role or suspending the profile takes effect at once.
  if (isDemoUser(user)) return null;
  const roles = parseRoles(user);
  // Both conditions, re-checked here rather than trusted from sign-in time: the
  // `employee` role AND a company-domain sign-in email. Changing either one on
  // an account cuts its access on the very next request.
  if (!canAccessEmployeePortal(roles, user.email)) return null;

  const profile = (
    await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1)
  )[0];
  if (!profile || profile.status !== 'active') return null;

  const developer = isFounder(roles);
  return {
    ctx: {
      user,
      profile,
      sessionId: session.id,
      isPortalAdmin: profile.isAdmin || developer,
      isDeveloper: developer,
    },
    stage: session.stage,
  };
}

// The main guard: a fully signed-in employee, second factor already satisfied.
export const requireEmployee: preHandlerHookHandler = async (request, reply) => {
  if (!(await enforceIpAllowlist(request, reply))) return reply;

  if (!SAFE_METHODS.has(request.method) && !originOk(request)) {
    return deny(request, reply, 403, 'Request rejected', 'access.csrf_rejected');
  }

  const loaded = await loadEmployeeContext(request);
  if (!loaded) {
    return deny(request, reply, 401, 'Not signed in to the employee portal', 'access.denied');
  }
  if (loaded.stage !== 'active') {
    // A session that has passed the password check but not finished enrolling a
    // second factor may only reach the enrollment endpoints.
    return deny(request, reply, 403, 'Two-factor enrollment required', 'access.denied', loaded.ctx.user.id);
  }

  // Layer 5 — CSRF. Every state change must echo the per-session token in a
  // custom header, which a cross-site page cannot read or set.
  if (!SAFE_METHODS.has(request.method)) {
    const presented = request.headers[EMPLOYEE_CSRF_HEADER];
    if (!csrfMatches(loaded.ctx.sessionId, typeof presented === 'string' ? presented : undefined)) {
      return deny(request, reply, 403, 'Request rejected', 'access.csrf_rejected', loaded.ctx.user.id);
    }
  }

  request.employee = loaded.ctx;
  void touchEmployeeSession(loaded.ctx.sessionId);
};

// A session that has authenticated but still owes us a second factor. Only the
// enrollment endpoints use this.
export const requirePendingEmployee: preHandlerHookHandler = async (request, reply) => {
  if (!(await enforceIpAllowlist(request, reply))) return reply;
  if (!SAFE_METHODS.has(request.method) && !originOk(request)) {
    return deny(request, reply, 403, 'Request rejected', 'access.csrf_rejected');
  }
  const loaded = await loadEmployeeContext(request);
  if (!loaded) {
    return deny(request, reply, 401, 'Not signed in to the employee portal', 'access.denied');
  }
  if (!SAFE_METHODS.has(request.method)) {
    const presented = request.headers[EMPLOYEE_CSRF_HEADER];
    if (!csrfMatches(loaded.ctx.sessionId, typeof presented === 'string' ? presented : undefined)) {
      return deny(request, reply, 403, 'Request rejected', 'access.csrf_rejected', loaded.ctx.user.id);
    }
  }
  request.employee = loaded.ctx;
};

// Managing people, announcements and documents. Runs after requireEmployee.
export const requireEmployeeAdmin: preHandlerHookHandler = async (request, reply) => {
  const ctx = request.employee;
  if (!ctx) {
    return deny(request, reply, 401, 'Not signed in to the employee portal', 'access.denied');
  }
  if (!ctx.isPortalAdmin) {
    return deny(request, reply, 403, 'Forbidden', 'access.denied', ctx.user.id);
  }
};

// Rewriting the portal's own wording. Founder-level only — an HR administrator
// manages people and content, not the words the software itself is built from.
// Runs after requireEmployee.
export const requireEmployeeDeveloper: preHandlerHookHandler = async (request, reply) => {
  const ctx = request.employee;
  if (!ctx) {
    return deny(request, reply, 401, 'Not signed in to the employee portal', 'access.denied');
  }
  if (!ctx.isDeveloper) {
    return deny(request, reply, 403, 'Forbidden', 'access.denied', ctx.user.id);
  }
};

export function requestMeta(request: FastifyRequest): { ip: string; userAgent: string | undefined } {
  return { ip: clientIp(request), userAgent: request.headers['user-agent'] };
}
