import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { aiUsage, users } from '../db/schema.js';
import { config } from '../config.js';
import {
  AiLimitError,
  VISION_KINDS,
  aiUsageThisMonth,
  enforceAiLimit,
  getAiUsage,
} from './usage.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function addUser(label: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(users).values({
    id,
    username: `ai-check-${label}-${id.slice(0, 8)}`,
    displayName: `AI check ${label}`,
    passwordHash: 'not-a-login',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function expectLimit(run: () => Promise<void>, message: string): Promise<AiLimitError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AiLimitError) return error;
    throw error;
  }
  throw new Error(message);
}

// Keep all synthetic rows inside the current Eastern month. The limiter accepts
// a clock so this exercises its real burst behavior without waiting in real time.
const ym = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
}).format(new Date());
const monthStart = Date.parse(`${ym}-01T12:00:00Z`);

const visionUser = await addUser('vision');
const formerCap = 40;
const visionCalls = formerCap + VISION_KINDS.length;
for (let index = 0; index < visionCalls; index += 1) {
  await enforceAiLimit(
    visionUser,
    VISION_KINDS[index % VISION_KINDS.length],
    monthStart + 86_400_000 + index * 61_000,
  );
}
assert(
  (await aiUsageThisMonth(visionUser, 'vision')) === visionCalls,
  'vision calls past the former monthly cap were not all recorded',
);
const usage = await getAiUsage(visionUser);
assert(usage.vision.used === visionCalls, 'vision usage count is wrong');
assert(!('limit' in usage.vision), 'vision usage still exposes a monthly limit');
assert(!('remaining' in usage.vision), 'vision usage still exposes a monthly remainder');

const burstUser = await addUser('burst');
const burstAt = monthStart + 2 * 86_400_000;
for (let index = 0; index < config.AI_RATE_PER_MIN; index += 1) {
  await enforceAiLimit(burstUser, 'funded_screenshot', burstAt);
}
const burstError = await expectLimit(
  () => enforceAiLimit(burstUser, 'funded_screenshot', burstAt),
  'vision burst above AI_RATE_PER_MIN was accepted',
);
assert((burstError.retryAfterSec ?? 0) > 0, 'burst refusal did not include retry timing');
assert(
  (await aiUsageThisMonth(burstUser, 'vision')) === config.AI_RATE_PER_MIN,
  'the refused burst call was recorded as usage',
);

const textUser = await addUser('text');
await db.insert(aiUsage).values(
  Array.from({ length: config.AI_MONTHLY_LIMIT }, (_, index) => ({
    id: crypto.randomUUID(),
    userId: textUser,
    kind: 'ask',
    createdAt: new Date(monthStart + 3 * 86_400_000 + index),
  })),
);
const textError = await expectLimit(
  () => enforceAiLimit(textUser, 'ask', monthStart + 4 * 86_400_000),
  'text call at AI_MONTHLY_LIMIT was accepted',
);
assert(textError.retryAfterSec == null, 'monthly text refusal was reported as a burst');
assert(
  (await aiUsageThisMonth(textUser, 'text')) === config.AI_MONTHLY_LIMIT,
  'the refused monthly text call was recorded as usage',
);

console.log(
  `AI usage checks passed: ${visionCalls} vision calls recorded without a monthly cap; burst and text limits retained.`,
);
