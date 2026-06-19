import 'fastify';
import type { UserRow } from './db/schema.js';

// Make the authenticated user available on every request after the
// loadUser hook runs. Null when the request is unauthenticated.
declare module 'fastify' {
  interface FastifyRequest {
    currentUser: UserRow | null;
  }
}
