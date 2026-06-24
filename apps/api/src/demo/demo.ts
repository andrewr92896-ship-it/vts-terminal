import type { preHandlerHookHandler } from 'fastify';
import { getAlerts, type AlertsData } from '../trading/alerts.js';
import type { AnalyzeResult, TradeAnalysis } from '../ai/claude.js';
import { isDemoUser } from './identity.js';

// Everything that makes the public, read-only demo behave like a guided showcase
// rather than the live app: the AI answers are scripted (no Claude calls, no
// cost, no key needed) and every data mutation is politely refused.

// Pull the most recent user message out of a chat body, so a scripted reply can
// at least acknowledge what was asked.
function lastUserMessage(body: unknown): string {
  const b = body as { messages?: { role?: string; content?: unknown }[]; ask?: unknown } | null;
  if (b && Array.isArray(b.messages)) {
    for (let i = b.messages.length - 1; i >= 0; i--) {
      const m = b.messages[i];
      if (m?.role === 'user' && typeof m.content === 'string') return m.content;
    }
  }
  if (b && typeof b.ask === 'string') return b.ask;
  return '';
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const SAMPLE_NOTE =
  'This is a scripted sample reply in the read-only demo. The live portal answers with Claude (Sonnet), aware of the workspace you are in.';

function cannedAsk(body: unknown): string {
  const q = clip(lastUserMessage(body), 160);
  return [
    SAMPLE_NOTE,
    q ? `You asked: "${q}".` : '',
    'In the real app I would give a concise, practical answer and point you to the exact screen for any specific numbers. Try the guided tour to see what each workspace does.',
  ]
    .filter(Boolean)
    .join(' ');
}

function cannedKia(body: unknown): string {
  const q = clip(lastUserMessage(body), 160);
  return [
    'This is a scripted sample reply in the demo. In the live portal this is a Kia product expert running on Claude (Sonnet).',
    q ? `You asked: "${q}".` : '',
    'It briefs a salesperson on trims, towing and payload, EV range, MPG, incentives, and quick model comparisons, and flags when an exact figure should be confirmed on the window sticker.',
  ]
    .filter(Boolean)
    .join(' ');
}

function cannedTutor(body: unknown): string {
  const q = clip(lastUserMessage(body), 160);
  return [
    'This is a scripted sample reply in the demo; the live Series 65 tutor runs on Claude.',
    q ? `On "${q}":` : '',
    'In the real app I explain why the correct answer is right, why the tempting distractors are wrong, and give a short memory hook, all sized for an exam candidate.',
  ]
    .filter(Boolean)
    .join(' ');
}

const BRIEF_METRICS =
  'Sample desk brief (demo). The account is tracking toward its profit target with healthy drawdown buffers: roughly two thirds of the daily allowance and over half of the max-drawdown allowance remain. The tightest constraint right now is the daily buffer on high-impact news days, so size down into releases and bank partial profits to protect the trailing drawdown. The live portal generates this from your real challenge metrics with Claude.';

const BRIEF_NEWS =
  'Sample desk brief (demo). Tone is risk-on but headline-sensitive: indices firm, the dollar soft into the next inflation print, and energy steady. The two things that matter today are the CPI release and central-bank commentary; everything else is noise until those clear. Watch for a fade if inflation surprises hot. The live portal writes this from the current headlines with Claude.';

const BRIEF_FINANCE =
  'Sample brief (demo). Take-home comfortably covers fixed bills with room to save, and net worth is positive and trending up as liabilities come down. The clearest next step is to automate a fixed monthly transfer to savings on payday and keep the FTP payout scaling in testing until results are consistent. The live portal builds this from your real finances with Claude.';

const BRIEF_WEALTH =
  'Sample brief (demo). The book is concentrated in a few active households with steady AUM; model portfolios are diversified and within target bands. The priority this quarter is the compliance calendar: keep the ADV and filing dates from slipping, and document each client review. The live portal generates this from your real practice data with Claude.';

// Overlay a scripted Claude analysis onto the chosen alert and return the alerts
// list as the real analyze route would, but without calling the model or saving
// anything.
export async function demoAnalyze(userId: string, alertId: string): Promise<AlertsData> {
  const data = await getAlerts(userId);
  const target = data.alerts.find((a) => a.id === alertId);
  const parsed: TradeAnalysis = {
    instrument: target?.instrument ?? 'EUR/USD',
    side: target?.side ?? 'long',
    plannedEntry: target?.price ?? null,
    actualFill: target?.price ?? null,
    exit: null,
    slippage: 'Fill was within a fraction of a pip of the alert price, so slippage is negligible.',
    setupQuality: 'Clean break and retest in line with the higher-timeframe trend; entry is well located.',
    risk: 'Stop sits beyond the recent structure with about a 1:2 reward-to-risk to the first target.',
    verdict: 'good',
    summary:
      'A disciplined, trend-aligned entry with a sensible stop. This is a scripted sample analysis in the demo; the live portal reads your chart screenshot with Claude (Opus).',
  };
  const analysis: AnalyzeResult = {
    model: 'demo (sample analysis)',
    raw: parsed.summary,
    parsed,
  };
  return {
    ...data,
    alerts: data.alerts.map((a) =>
      a.id === alertId ? { ...a, status: 'analyzed', analysis, analyzedAt: Date.now() } : a,
    ),
  };
}

// Block writes and serve scripted AI for the demo account. Registered as a
// global preHandler, so it runs after the body is parsed and after the user is
// resolved, but before each route's own handler.
export const demoGuard: preHandlerHookHandler = async (request, reply) => {
  if (!isDemoUser(request.currentUser)) return;

  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

  const url = request.url.split('?')[0];

  // Leaving the demo is always allowed.
  if (url === '/api/auth/logout') return;

  // Scripted AI: same response shapes as the real routes, no model call.
  if (url === '/api/ai/ask') return reply.send({ reply: cannedAsk(request.body) });
  if (url === '/api/ai/kia') return reply.send({ reply: cannedKia(request.body) });
  if (url === '/api/ai/tutor') return reply.send({ reply: cannedTutor(request.body) });
  if (url === '/api/trading/metrics/brief') return reply.send({ brief: BRIEF_METRICS });
  if (url === '/api/trading/news/brief') return reply.send({ brief: BRIEF_NEWS });
  if (url === '/api/finance/overview/brief') return reply.send({ brief: BRIEF_FINANCE });
  if (url === '/api/wealth/overview/brief') return reply.send({ brief: BRIEF_WEALTH });

  const analyzeMatch = /^\/api\/trading\/alerts\/([^/]+)\/analyze$/.exec(url);
  if (analyzeMatch) return reply.send(await demoAnalyze(request.currentUser!.id, analyzeMatch[1]));

  // Any other mutation is refused: the demo is read-only.
  return reply.code(403).send({
    error: 'This is a read-only demo, so changes are not saved. The live portal is available on request.',
  });
};
