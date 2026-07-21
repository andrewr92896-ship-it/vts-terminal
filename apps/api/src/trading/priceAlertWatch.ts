import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { priceAlerts, tradingAlerts, type PriceAlertRow } from '../db/schema.js';
import { config } from '../config.js';
import { pushConfigured, sendToUsers } from '../notifications/push.js';
import { pushoverConfigured, sendPushoverToUsers } from '../notifications/pushover.js';
import { fetchLivePrices } from './priceSource.js';
import { activePriceAlerts, shouldFire, sideOf, toPricingInstrument } from './priceAlerts.js';

// Background watch that fires a trader's OWN price alerts: on a genuine cross of
// a rule's threshold, buzz only its owner (push + Pushover) and drop a row into
// that owner's alerts feed so there's an in-app record. Personal, so it never
// fans out to a team. Production-only and only when push or Pushover is
// configured — mirrors the desk / session watches. Best-effort throughout.

// Round a price for display without over-truncating FX pips. Big numbers (index
// levels) get 2 decimals; sub-1000 marks keep up to 5 significant decimals.
function fmtPrice(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(Number(n.toFixed(5)));
}

// Deliver one fired alert: an in-app feed row for the owner plus a push +
// Pushover buzz. `display` is the readable instrument ("EUR/USD").
async function fireAlert(alert: PriceAlertRow, display: string, price: number, now: Date): Promise<void> {
  const verb = alert.condition === 'above' ? 'rose above' : 'fell below';
  const summary = `${display} ${verb} ${fmtPrice(alert.threshold)} (now ${fmtPrice(price)})`;
  const title = `Price alert · ${display}`;

  // Echo into the owner's Trading Alerts feed (source 'price-alert'), so it shows
  // in-app alongside inbound signals and can drive the screenshot→log flow.
  await db
    .insert(tradingAlerts)
    .values({
      id: crypto.randomUUID(),
      userId: alert.userId,
      source: 'price-alert',
      instrument: display,
      side: null,
      price: alert.threshold,
      strategy: null,
      timeframe: null,
      message: alert.note ? `${summary} — ${alert.note}` : summary,
      payload: JSON.stringify({ priceAlertId: alert.id, condition: alert.condition, threshold: alert.threshold, price }),
      status: 'new',
      analysis: null,
      analyzedAt: null,
      tradeId: null,
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .catch(() => {});

  await sendToUsers([alert.userId], {
    title,
    body: summary,
    url: '/?screen=alerts',
    tag: `price-alert-${alert.id}`,
  }).catch(() => {});
  await sendPushoverToUsers([alert.userId], {
    title,
    message: summary,
    priority: 1, // high — a level was hit
    url: '/?screen=alerts',
    urlTitle: 'Open the desk',
  }).catch(() => {});
}

// One pass: price every active rule's instrument, fire any that crossed, and
// record the latest observation so crossing detection has a previous side.
export async function tickPriceAlertWatch(now: Date = new Date()): Promise<void> {
  const alerts = await activePriceAlerts();
  if (alerts.length === 0) return;

  // One batched price fetch for all distinct instruments this tick.
  const pricingBySymbol = new Map<string, string>();
  const instruments = new Set<string>();
  for (const a of alerts) {
    const p = toPricingInstrument(a.symbol);
    pricingBySymbol.set(a.symbol, p);
    instruments.add(p);
  }
  const marks = await fetchLivePrices([...instruments]);
  if (marks.size === 0) return; // no OANDA source, or nothing priceable this tick

  for (const a of alerts) {
    const pricing = pricingBySymbol.get(a.symbol);
    const price = pricing ? marks.get(pricing) : undefined;
    if (price == null) continue; // unpriceable this tick — leave state untouched

    const prevSide = a.lastSide ?? null;
    const cur = sideOf(price, a.threshold);
    const fire = shouldFire(prevSide, price, a);

    // Record the latest observation every tick (arms a null-side rule, keeps the
    // "last seen" price fresh). On a fire, also stamp lastFiredAt and, for a
    // one-shot rule, disable it.
    const set: Partial<PriceAlertRow> = { lastSide: cur, lastPrice: price };
    if (fire) {
      set.lastFiredAt = now;
      set.updatedAt = now;
      if (a.repeat === 'once') set.active = false;
    }
    await db.update(priceAlerts).set(set).where(eq(priceAlerts.id, a.id));

    if (fire) {
      await fireAlert(a, pricing ?? a.symbol, price, now).catch(() => {});
    }
  }
}

// Cadence: default 20s (override with ALERT_WATCH_SECONDS). Fast enough that a
// level hit buzzes within a tick, gentle on the OANDA pricing endpoint since one
// call covers every watched instrument.
const PRICE_ALERT_WATCH_MS = Math.max(10, Number(process.env.ALERT_WATCH_SECONDS) || 20) * 1000;

// Start the background price-alert watch. Production-only and only when a
// delivery channel is configured (no point polling prices otherwise).
export function startPriceAlertWatch(): void {
  if (!config.isProd || (!pushConfigured() && !pushoverConfigured())) return;
  const tick = () => {
    void tickPriceAlertWatch().catch((err) => console.error('Price alert watch error:', err));
  };
  setTimeout(tick, 10 * 1000);
  const timer = setInterval(tick, PRICE_ALERT_WATCH_MS);
  timer.unref?.();
}
