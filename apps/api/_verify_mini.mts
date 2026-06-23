import { runMigrations } from './src/db/migrate.js';
import { db } from './src/db/index.js';
import { users } from './src/db/schema.js';
import { addDeal, getDashboard, updatePayPlan } from './src/kia/service.js';
import { hashPassword } from './src/auth/passwords.js';
import crypto from 'node:crypto';

await runMigrations();
const uid = crypto.randomUUID();
await db.insert(users).values({ id: uid, username: 'u', displayName: 'U', passwordHash: await hashPassword('x'),
  roles: JSON.stringify(['sales']), viewBrokerage: false, active: true, createdAt: new Date(), updatedAt: new Date() });

let fails = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) { console.log('  ->', JSON.stringify(extra)); fails++; }
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

// Default plan: total mode, 13.5%, default mini $200.
let dash = await getDashboard(uid);
check('default mini is 200', dash.payPlan.miniAmount === 200, dash.payPlan.miniAmount);

// Thin deal: $500 profit * 13.5% = $67.50 -> floored to the $200 mini.
await addDeal(uid, { model: 'Rio', type: 'New', profit: 500, soldAt: today });
dash = await getDashboard(uid);
check('thin deal pays the mini (200, not 68)', dash.metrics.commission === 200, dash.metrics.commission);

// Fat deal: $3000 * 13.5% = $405 -> above the mini, pays the percentage.
await addDeal(uid, { model: 'Telluride', type: 'New', profit: 3000, soldAt: today });
dash = await getDashboard(uid);
// total = 200 (mini for Rio) + 405 (Telluride) = 605
check('fat deal pays percentage; total = 605', dash.metrics.commission === 605, dash.metrics.commission);

// Zero-profit deal still earns the mini.
await addDeal(uid, { model: 'Soul', type: 'Used', profit: 0, soldAt: today });
dash = await getDashboard(uid);
check('zero-profit deal earns the mini; total = 805', dash.metrics.commission === 805, dash.metrics.commission);

// Configurable: raise the mini to $300; thin + zero deals re-floor.
await updatePayPlan(uid, { miniAmount: 300 });
dash = await getDashboard(uid);
// Rio 300 + Telluride 405 + Soul 300 = 1005
check('raising mini to 300 re-floors thin deals; total = 1005', dash.metrics.commission === 1005, dash.metrics.commission);
check('payPlan reflects mini 300', dash.payPlan.miniAmount === 300, dash.payPlan.miniAmount);

// Split mode also honors the mini.
await updatePayPlan(uid, { commissionMode: 'split', commissionFrontPct: 25, commissionBackPct: 5, miniAmount: 200 });
// Add a split deal with tiny front/back: 100 front *25% + 50 back *5% = 25 + 2.5 = 27.5 -> mini 200.
await addDeal(uid, { model: 'Forte', type: 'New', frontProfit: 100, backProfit: 50, soldAt: today });
dash = await getDashboard(uid);
const forte = dash.deals.find((d) => d.model === 'Forte')!;
check('split mini applies (deal exists)', !!forte, forte);
// Recompute expected: Rio 200, Telluride: 3000*25%(front, since single profit -> all front)=750, Soul 0->200, Forte 200
//   = 200 + 750 + 200 + 200 = 1350
check('split-mode totals honor mini; total = 1350', dash.metrics.commission === 1350, dash.metrics.commission);

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
