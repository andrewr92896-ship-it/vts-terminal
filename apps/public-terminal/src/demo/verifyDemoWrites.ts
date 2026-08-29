// Drive every demo WRITE to the act it exists for.
//
// The demo is the showcase, and its writes are the half a screenshot test
// cannot see: a capture asserts a page rendered, not that pressing "add" on it
// did anything. An unhandled name answers with an empty-but-generic payload, so
// `const { portfolio } = await api.createInvestmentAccount(...)` destructures
// `undefined` and the screen publishes nothing — no error, no stack trace, just
// a workspace that goes blank when a visitor tries the first thing they think of.
//
// So each case below calls the method the screen calls, with the arguments the
// screen sends, and asserts on the field the screen destructures.
import assert from 'node:assert/strict';
import { demoCall } from './demoStore';

const call = (name: string, args: unknown[] = []) => {
  const answered = demoCall(name, args as never);
  // `handled: false` is the failure this file exists to catch: the demo would
  // fall through to a generic empty payload and the screen would break on it.
  assert.equal(answered.handled, true, `${name} is not handled by the demo`);
  return answered.value as any;
};

// ---- Investments ------------------------------------------------------------

const start = call('investmentPortfolio').totals;
// The seed carries one deliberately unpriced holding, so every count below is a
// DELTA. Asserting an absolute here would pass today and fail the moment the
// seed gains another — and it is the seed's job to have one.
const seededUnpriced = start.unpricedCount;
assert.ok(seededUnpriced >= 1, 'the seed carries an unpriced holding on purpose');

const account = call('createInvestmentAccount', [{ label: 'HSA', kind: 'hsa', cashBalance: 1_000 }]);
assert.ok(account.portfolio, 'createInvestmentAccount must answer with a portfolio');
assert.equal(account.portfolio.totals.value, start.value + 1_000, 'the cash lands in the total');

const priced = call('createInvestmentHolding', [
  { accountId: account.id, name: 'Index fund', assetClass: 'fund', quantity: 10, manualPrice: 50 },
]);
assert.equal(priced.portfolio.totals.value, start.value + 1_500);

// An unpriced holding is COUNTED and left out of the total, never valued at
// zero — the one thing a tracker must not do, and the demo has to show it.
const unpriced = call('createInvestmentHolding', [
  { accountId: account.id, name: 'Collective trust', assetClass: 'fund', quantity: 3 },
]);
assert.equal(unpriced.portfolio.totals.value, start.value + 1_500, 'unpriced adds nothing to the total');
assert.equal(unpriced.portfolio.totals.unpricedCount, seededUnpriced + 1, 'and is counted');

const repriced = call('updateInvestmentHolding', [priced.id, { manualPrice: 60, quantity: 10 }]);
assert.equal(repriced.portfolio.totals.value, start.value + 1_600);

// Deleting the account takes its holdings with it: leaving them would put a
// holding in the totals that belongs to an account no longer on the screen.
const removed = call('deleteInvestmentAccount', [account.id]);
assert.equal(removed.portfolio.totals.value, start.value);
assert.equal(removed.portfolio.totals.unpricedCount, seededUnpriced);

// ---- Contributions, goals and dividends ------------------------------------

call('createInvestmentTransaction', [{ accountId: 'ia2', kind: 'contribution', amount: 500, occurredAt: Date.now() }]);
assert.equal(call('investmentContributions').uncappedContributed, 500, 'a contribution appears on the screen that reads it');

const goal = call('createInvestmentGoal', [{ label: 'Retire at 60', targetAmount: 1_000_000 }]);
// EVERY FIELD THE SCREEN READS, not just the count. Counting was all this did,
// and a goal missing `pct` threw `.toFixed of undefined` and blanked the screen
// the moment one was added — which the count could never have seen.
const [saved] = call('investmentContributions').goals;
assert.equal(call('investmentContributions').goals.length, 1);
for (const field of ['id', 'label', 'targetAmount', 'targetDate', 'accountLabel', 'current', 'pct']) {
  assert.ok(field in saved, `a goal the screen renders is missing ${field}`);
}
assert.equal(typeof saved.pct, 'number', 'pct is rendered with .toFixed, so it has to be a number');
assert.equal(typeof saved.current, 'number');
call('deleteInvestmentGoal', [goal.id]);
assert.equal(call('investmentContributions').goals.length, 0);

// A dividend belongs on the Dividends screen, not with the contributions —
// otherwise it is recorded and then appears nowhere.
const dividendsBefore = call('investmentDividends').totalLast12;
const dividend = call('createInvestmentTransaction', [
  { accountId: 'ia1', kind: 'dividend', symbol: 'VTI', amount: 100, occurredAt: Date.now() },
]);
assert.equal(Math.round(call('investmentDividends').totalLast12), Math.round(dividendsBefore + 100));
assert.equal(call('investmentContributions').uncappedContributed, 500, 'and not with the contributions');
call('deleteInvestmentTransaction', [dividend.id]);
assert.equal(Math.round(call('investmentDividends').totalLast12), Math.round(dividendsBefore));

// ---- Undo -------------------------------------------------------------------

const target = call('getTodo').sections[0].items[0];
const gone = call('removeTodoItem', [target.id]);
assert.ok(!gone.sections[0].items.some((item: any) => item.id === target.id));
const back = call('restoreTodoItem', [{ ...target, position: 0 }]);
assert.ok(back.sections[0].items.some((item: any) => item.id === target.id), 'undo puts the row back');
// A restore that finds the id already there changes nothing, so pressing undo
// twice cannot leave two copies of one task.
const again = call('restoreTodoItem', [{ ...target, position: 0 }]);
assert.equal(again.sections[0].items.filter((item: any) => item.id === target.id).length, 1);

// ---- The hand-kept funded book ----------------------------------------------

const book = call('funded').accounts[0];
const opened = call('addFundedTrade', [book.id, { instrument: 'GBP/USD', side: 'long', units: 10_000, entryPrice: 1.31 }]);
const added = opened.accounts[0].trades.find((t: any) => t.instrument === 'GBP/USD');
assert.ok(added, 'the trade appears on the account it was logged against');
// An OPEN trade has made and lost nothing yet, so its realized P/L is null and
// never zero — a zero scores as a break-even in every figure that reads it.
assert.equal(added.realizedPl, null);
assert.equal(opened.accounts[0].balance, book.balance, 'and an open trade does not move the balance');

const closed = call('addFundedTrade', [book.id, { instrument: 'USD/JPY', side: 'short', units: 10_000, entryPrice: 150, exitPrice: 149.5, realizedPl: 120 }]);
assert.equal(closed.accounts[0].balance, book.balance + 120, 'a closed one does');

call('removeFundedTrade', [added.id]);
const secondBook = call('addFundedAccount', [{ label: 'Second book', startingBalance: 5_000 }]);
assert.equal(secondBook.accounts.length, 2);
assert.equal(secondBook.accounts[1].balance, 5_000, 'a new book starts on what was paid into it');
call('removeFundedAccount', [secondBook.accounts[1].id]);
assert.equal(call('funded').accounts.length, 1);

// ---- Reporting a bug --------------------------------------------------------

// Free on every account, and the thing somebody evaluating the product is most
// likely to press. The screen prepends `r.report` straight into the list it
// renders, so an answer without one puts `undefined` in front of a render.
const filed = call('createBugReport', ['The chart tile does not resize']);
assert.ok(filed.report?.id, 'createBugReport must answer with a report');
assert.equal(call('myBugReports').reports.length, 1, 'and it is in the list it was added to');
const replied = call('replyBugReport', [filed.report.id, 'It happens at 390px too']);
assert.equal(replied.report.messages.length, 2);
// Admin editing INSIDE the demo: the act, on the screen the notice appears on.
// Asserting the write answered is not enough — the screens re-render from the
// list the write returns, so the list is what has to carry it.
const posted = call('addAnnouncement', ['Doors open Monday', 'A first wave of beta invitations goes out.']);
assert.equal(posted.canManage, true, 'the demo must offer the composer');
assert.equal(posted.announcements[0].title, 'Doors open Monday');
assert.equal(call('removeAnnouncement', [posted.announcements[0].id]).announcements.length, posted.announcements.length - 1);

const published = call('publishPatchNote', ['Beta V 9.99', 'August 28, 2026', ['A change made in the demo']]);
assert.equal(published.canManage, true);
assert.equal(published.notes[0].version, 'Beta V 9.99');
// The screen renders `notes` with `.map`, so an answer without the array is a
// thrown render rather than an empty card.
assert.deepEqual(published.notes[0].notes, ['A change made in the demo']);

const suggested = call('sendSuggestion', ['A dark-mode print view']);
assert.ok(suggested.suggestion?.id, 'sendSuggestion must answer with the suggestion');
// The screen prints `notice` in place of its own "sent to the admins" line, so a demo
// that answers without one silently claims the suggestion reached somebody.
assert.match(String(suggested.notice ?? ''), /demonstration purposes only/i);
assert.match(String(suggested.notice ?? ''), /demonstration purposes only/);

console.log('demo writes: every path drove to the act it exists for');
