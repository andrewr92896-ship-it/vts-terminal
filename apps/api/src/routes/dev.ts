import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRealFounder } from '../auth/middleware.js';
import { SESSION_COOKIE, sessionIdForToken } from '../auth/sessions.js';
import { PREVIEW_MODES, setSessionPreview } from '../dev/preview.js';
import { FIXTURE_KINDS, FIXTURE_LABELS, buildFixture, isFixtureKind } from '../dev/fixtures.js';
import { PACKAGE_SCHEMA_VERSION } from '../studies/packageFormat.js';
import { db } from '../db/index.js';
import { studyPackageAdds, studyPackageShares, studyPackageSubmissions, studyPackages } from '../db/schema.js';
import { packageAudience } from '../studies/packageAccess.js';
import { readDevEnvironment } from '../dev/environment.js';

// Developer capabilities — the SAME production terminal, with the diagnostics
// and preview controls a founder needs to test it.
//
// Everything here is access-controlled server-side and every one of these routes
// is read-only or reversible. Two rules shape the whole file:
//
//   • THERE IS NO "TURN THE SAFEGUARDS OFF" ROUTE, and there must never be one.
//     A preview only ever narrows what the caller may do; the diagnostics only
//     report; the fixtures only produce text for the ordinary validator to read.
//     Nothing here lets a developer commit a package the validator refused,
//     publish without review, or reach content they could not otherwise reach.
//
//   • THE GUARD READS THE REAL ROLES (`requireRealFounder`), not the ones a
//     preview has narrowed. That is the only place in the terminal that does,
//     and it exists so previewing as a member of the public cannot take away the
//     ability to stop previewing.

const previewSchema = z.object({ mode: z.enum(PREVIEW_MODES) });

// The blueprint a fixture is built against. Deliberately the same shape the
// import routes take, so a fixture is checked by exactly the validator a real
// package meets.
const fixtureSchema = z.object({
  kind: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120).default(''),
  blueprint: z.object({
    blueprintId: z.string().trim().min(1).max(80),
    categoriesLocked: z.boolean(),
    categories: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          name: z.string().trim().min(1).max(60),
          weight: z.number().min(0).max(100).nullable(),
        }),
      )
      .max(60),
    questionTargets: z.record(z.string().trim().min(1).max(80), z.number().int().min(0).max(1000)).nullable(),
    totalQuestions: z.number().int().min(1).max(1000).nullable(),
    explanationsRequired: z.boolean(),
    wantQuestions: z.boolean(),
    wantFlashcards: z.boolean(),
    wantPresentation: z.boolean(),
    wantLessons: z.boolean(),
  }),
});

export async function devRoutes(app: FastifyInstance) {
  const dev = { preHandler: requireRealFounder };

  // What this session is currently previewing as, if anything, plus what it
  // could preview as. Answers for any signed-in account — a plain member simply
  // gets `{ preview: null, canPreview: false }` — because the client asks on
  // load and a 403 there would be noise rather than information.
  app.get('/api/dev/preview', { preHandler: requireAuth }, async (request) => {
    const me = request.currentUser!;
    return {
      preview: me.preview ? me.preview.mode : null,
      modes: PREVIEW_MODES,
    };
  });

  /**
   * Enter or change a preview.
   *
   * Stored on the SESSION, so it ends when the sign-in does and a second browser
   * is unaffected. Nothing about the account is written — this is a lens, not a
   * grant, and there is deliberately no state to restore afterwards.
   */
  app.post('/api/dev/preview', dev, async (request, reply) => {
    const parsed = previewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Pick something to preview as' });
    const sessionId = currentSessionId(request);
    if (!sessionId) return reply.code(401).send({ error: 'Not authenticated' });
    await setSessionPreview(sessionId, parsed.data.mode);
    return { preview: parsed.data.mode };
  });

  /**
   * Leave a preview.
   *
   * Deliberately on `requireAuth` rather than the founder guard. While previewing
   * as a member of the public the caller's effective roles ARE a member of the
   * public, and a guard that refused them here would be a one-way door — the
   * exact trap the "View as role" control was moved to the account menu to
   * avoid. Clearing a preview nobody holds is a harmless no-op, so there is
   * nothing to protect.
   */
  app.delete('/api/dev/preview', { preHandler: requireAuth }, async (request, reply) => {
    const sessionId = currentSessionId(request);
    if (!sessionId) return reply.code(401).send({ error: 'Not authenticated' });
    await setSessionPreview(sessionId, null);
    return { preview: null };
  });

  // The fixture catalog, for the picker.
  // Which database is this deployment serving, and what is in it?
  //
  // Read-only, and it never returns a connection string — a libsql URL carries
  // its auth token in the query string, so the service reports the shape of the
  // target rather than the target. See dev/environment.ts.
  app.get('/api/dev/environment', dev, async () => readDevEnvironment());

  app.get('/api/dev/study/fixtures', dev, async () => {
    return {
      schemaVersion: PACKAGE_SCHEMA_VERSION,
      fixtures: FIXTURE_KINDS.map((kind) => ({ kind, label: FIXTURE_LABELS[kind] })),
    };
  });

  /**
   * Build one fixture against the blueprint the developer currently has open.
   *
   * It returns TEXT, nothing else — the same strings a creator would paste — so
   * the fixture goes through the ordinary validate-then-confirm path with no
   * shortcut around it. A "good" fixture that fails validation is therefore a
   * real finding rather than an artifact of a special code path.
   */
  app.post('/api/dev/study/fixtures', { ...dev, bodyLimit: 1024 * 1024 }, async (request, reply) => {
    const parsed = fixtureSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A fixture kind and a blueprint are required' });
    const { kind, name, subject, blueprint } = parsed.data;
    if (!isFixtureKind(kind)) return reply.code(400).send({ error: 'Unknown fixture' });
    return {
      kind,
      label: FIXTURE_LABELS[kind],
      documents: buildFixture(kind, blueprint, { name, subject: subject || name }),
    };
  });

  /**
   * A package's sharing and publication state, as stored.
   *
   * Read-only, and admins can already reach any package through the ordinary
   * routes — this adds no reach, it puts the state on one screen so a developer
   * can see what the access rules are actually deciding from. It reports the
   * recipients' ids rather than names deliberately: this is a diagnostic about
   * relationships, not a directory.
   */
  app.get('/api/dev/study/packages/:id/state', dev, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const pkg = (await db.select().from(studyPackages).where(eq(studyPackages.id, id)).limit(1))[0];
    if (!pkg) return reply.code(404).send({ error: 'Study package not found' });

    const [shares, submissions, adds, audience] = await Promise.all([
      db
        .select({
          id: studyPackageShares.id,
          recipientUserId: studyPackageShares.recipientUserId,
          status: studyPackageShares.status,
          createdAt: studyPackageShares.createdAt,
        })
        .from(studyPackageShares)
        .where(eq(studyPackageShares.packageId, id)),
      db
        .select({
          id: studyPackageSubmissions.id,
          status: studyPackageSubmissions.status,
          submittedAt: studyPackageSubmissions.submittedAt,
          reviewedAt: studyPackageSubmissions.reviewedAt,
          attestationVersion: studyPackageSubmissions.attestationVersion,
        })
        .from(studyPackageSubmissions)
        .where(eq(studyPackageSubmissions.packageId, id)),
      db.select({ userId: studyPackageAdds.userId }).from(studyPackageAdds).where(eq(studyPackageAdds.packageId, id)),
      packageAudience(id),
    ]);

    return {
      state: {
        id: pkg.id,
        name: pkg.name,
        ownerUserId: pkg.ownerUserId,
        visibility: pkg.visibility,
        archivedAt: pkg.archivedAt?.getTime() ?? null,
        formatVersion: pkg.formatVersion,
        shares: shares.map((s) => ({ ...s, createdAt: s.createdAt.getTime() })),
        submissions: submissions.map((s) => ({
          ...s,
          submittedAt: s.submittedAt.getTime(),
          reviewedAt: s.reviewedAt?.getTime() ?? null,
        })),
        libraryAdds: adds.map((a) => a.userId),
        /** Who the package leaderboard ranks — the answer access actually gives. */
        leaderboardAudience: audience,
      },
    };
  });
}

// The session this request is authenticated by. A preview is stored against it,
// so changing one has to resolve the same id `getUserForToken` did.
function currentSessionId(request: { cookies: Record<string, string | undefined>; unsignCookie: (v: string) => { valid: boolean; value: string | null } }): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return sessionIdForToken(unsigned.value);
}
