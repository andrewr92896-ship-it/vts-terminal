import 'fastify';
import type { PreviewedUser } from './dev/preview.js';

// Make the authenticated user available on every request after the
// loadUser hook runs. Null when the request is unauthenticated.
//
// It is a `PreviewedUser` rather than a bare row: a `UserRow` plus the developer
// preview this session may be in. That is a superset, so every existing caller
// is unaffected — and it means the ONE object a request answers from already
// carries the preview, so guards and payloads apply it without knowing it
// exists. Rows loaded from the database elsewhere are still plain rows and can
// never be in a preview, which is what keeps a preview the previewer's own view.
declare module 'fastify' {
  interface FastifyRequest {
    currentUser: PreviewedUser | null;
  }
}
