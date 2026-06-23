import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { ingestAlert } from '../trading/alerts.js';

// Public webhook for TradingView alerts (the FTP/prop-trade replacement).
// TradingView sends no authentication, so every alert must carry the shared
// secret (in the JSON body as `secret`, or as a ?secret= query param). The
// secret is configured via TRADINGVIEW_WEBHOOK_SECRET; when unset, the webhook
// rejects everything.
export async function webhookRoutes(app: FastifyInstance) {
  // TradingView posts the alert message as the request body, often as
  // text/plain rather than JSON — capture it as a raw string so we can parse
  // either shape.
  app.addContentTypeParser(
    ['text/plain', 'application/x-www-form-urlencoded'],
    { parseAs: 'string' },
    (_req, body, done) => done(null, body),
  );

  app.post('/api/webhooks/tradingview', { bodyLimit: 256 * 1024 }, async (request, reply) => {
    const secret = config.TRADINGVIEW_WEBHOOK_SECRET;
    if (!secret) {
      return reply.code(503).send({ error: 'Webhook not configured' });
    }

    // Normalize the body into an object + a raw string, whatever was sent.
    let obj: Record<string, unknown> = {};
    let raw = '';
    const body = request.body;
    if (typeof body === 'string') {
      raw = body;
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
        else obj = { message: body };
      } catch {
        obj = { message: body };
      }
    } else if (body && typeof body === 'object') {
      obj = body as Record<string, unknown>;
      raw = JSON.stringify(body);
    }

    const provided =
      (typeof obj.secret === 'string' && obj.secret) ||
      (typeof (request.query as { secret?: string }).secret === 'string' &&
        (request.query as { secret?: string }).secret) ||
      '';
    if (provided !== secret) {
      return reply.code(401).send({ error: 'Invalid secret' });
    }

    const id = await ingestAlert(obj, raw);
    return reply.code(200).send({ ok: true, stored: id != null });
  });
}
