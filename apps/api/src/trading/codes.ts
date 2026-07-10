import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tradingTrades, tradingPositions, users } from '../db/schema.js';
import { canAccessWorkspace, parseRoles } from '../auth/rbac.js';
import { DEMO_USERNAME } from '../demo/identity.js';

// The desk works in Eastern Time, so a trade's code is stamped with its ET
// calendar day.
const ET = 'America/New_York';

// MMDDYY for a moment in ET, e.g. Dec 23 2026 → "122326".
function etDayCode(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}${get('day')}${get('year')}`;
}

// Assign each trade a desk code MMDDYY-N, where N is the trade's order within its
// ET calendar day (1 = the first fill of the day). Ordered by open time, then id
// as a stable tiebreak, so the SAME trade always resolves to the SAME code no
// matter which screen it's shown on.
export function assignTradeCodes(items: { id: string; openedAt: number }[]): Map<string, string> {
  const sorted = [...items].sort(
    (a, b) => a.openedAt - b.openedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const perDay = new Map<string, number>();
  const codes = new Map<string, string>();
  for (const it of sorted) {
    const day = etDayCode(it.openedAt);
    const n = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, n);
    codes.set(it.id, `${day}-${n}`);
  }
  return codes;
}

// A desk-wide code index across BOTH hand-logged trades and broker/manual
// positions, so a single trade carries one stable code everywhere it appears
// (Trade Log and History). Demo and non-trading accounts are excluded so a real
// trader's daily numbering has no phantom gaps.
export async function deskTradeCodeIndex(): Promise<Map<string, string>> {
  const trades = await db
    .select({ id: tradingTrades.id, openedAt: tradingTrades.openedAt, roles: users.roles, username: users.username })
    .from(tradingTrades)
    .innerJoin(users, eq(users.id, tradingTrades.userId));
  const positions = await db
    .select({
      id: tradingPositions.id,
      openedAt: tradingPositions.openedAt,
      firstSeenAt: tradingPositions.firstSeenAt,
      roles: users.roles,
      username: users.username,
    })
    .from(tradingPositions)
    .innerJoin(users, eq(users.id, tradingPositions.userId));

  const items: { id: string; openedAt: number }[] = [];
  for (const t of trades) {
    if (t.username === DEMO_USERNAME) continue;
    if (!canAccessWorkspace(parseRoles({ roles: t.roles }), 'trading')) continue;
    items.push({ id: t.id, openedAt: t.openedAt.getTime() });
  }
  for (const p of positions) {
    if (p.username === DEMO_USERNAME) continue;
    if (!canAccessWorkspace(parseRoles({ roles: p.roles }), 'trading')) continue;
    // openedAt can be null on a position we first saw already-open; fall back to
    // when the desk first saw it so it still sorts into a day.
    const opened = p.openedAt ?? p.firstSeenAt;
    items.push({ id: p.id, openedAt: opened.getTime() });
  }
  return assignTradeCodes(items);
}
