import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { tvAlerts } from '../db/schema.js';

// Ingestion endpoint for TradingView alerts. TradingView can only POST a body
// (no custom headers), so the shared token travels inside the alert JSON as
// `token`. Every request is rejected unless that token matches
// TV_WEBHOOK_SECRET. The token is taken only from the body — never the query
// string or a header — so it never lands in request logs (Fastify does not log
// bodies). The secret is never logged.

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(/[^0-9.\-eE]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStr(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// Constant-time string compare that doesn't throw on length mismatch.
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function tvWebhookRoutes(app: FastifyInstance) {
  // TradingView often sends the alert as text/plain, not application/json.
  // Capture it as a raw string when no parser is already registered for it.
  if (!app.hasContentTypeParser('text/plain')) {
    app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    );
  }

  app.post('/api/tv-webhook', { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const secret = config.TV_WEBHOOK_SECRET;
    if (!secret) {
      return reply.code(503).send({ error: 'Webhook not configured' });
    }

    // Normalize the body into a raw string + a parsed object, accepting either
    // a JSON object or a JSON/plain string.
    let raw = '';
    let obj: Record<string, unknown> = {};
    const body = request.body;
    if (typeof body === 'string') {
      raw = body;
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
      } catch {
        /* leave obj empty — token check below will reject */
      }
    } else if (body && typeof body === 'object') {
      obj = body as Record<string, unknown>;
      raw = JSON.stringify(body);
    }

    // Body-only: keeping the token out of the URL/headers guarantees it is
    // never written to request logs.
    const token = typeof obj.token === 'string' ? obj.token : '';
    if (!tokensMatch(token, secret)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const id = crypto.randomUUID();
    await db.insert(tvAlerts).values({
      id,
      strategy: toStr(obj.strategy, 120),
      symbol: toStr(obj.symbol ?? obj.ticker, 40),
      side: toStr(obj.side ?? obj.action, 16),
      entry: toNum(obj.entry),
      takeProfit: toNum(obj.takeProfit),
      stopLoss: toNum(obj.stopLoss),
      alertPrice: toNum(obj.alertPrice),
      alertTime: toStr(obj.alertTime, 64),
      receivedAt: new Date(),
      payload: raw.slice(0, 8000),
    });

    return reply.code(200).send({ ok: true, id });
  });
}
