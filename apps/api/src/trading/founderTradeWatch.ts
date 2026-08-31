import { config } from '../config.js';
import { pushConfigured, sendToUsers } from '../notifications/push.js';
import { pushoverConfigured, sendPushoverToUsers } from '../notifications/pushover.js';
import { LEVEL_PRIORITY } from '../notifications/prefs.js';
import { dueReminders, markNotified, type DueReminder } from './founderTrades.js';

// The server-side reminder loop for Founder trade coordination.
//
// **THIS IS WHAT MAKES A PUSHOVER ACKNOWLEDGEMENT NOT AN ANSWER.** Pushover's
// own emergency retries stop the moment somebody presses acknowledge on their
// phone — which is fine for an alert whose whole job is to be seen, and wrong
// for a workflow that is only resolved by doing something in the terminal. So
// the repeats that matter are not Pushover's: each pass reads the DATABASE, and
// while a row still owes an action it sends a FRESH notification. Silencing a
// phone therefore buys quiet until the next interval and nothing more.
//
// It is bounded in four ways, deliberately, because "keeps alerting forever" is
// the failure mode a workflow like this reaches for on its own:
//
//   • it only ever reads rows that are still unresolved, so completing a step
//     stops the reminders on the next pass with nothing to unschedule;
//   • each recipient sets their own interval, and a row is skipped until that
//     much time has passed since its last send;
//   • a row being answered right now (a JOIN in flight) is skipped;
//   • reminders lapse 24 hours after the invite (REMINDER_MAX_AGE_MS). The modal
//     stays — the workflow is server state and does not expire — but a phone
//     that has been repeating for a day is no longer saying anything new.
//
// There is one loop and one timer, started once from server.ts, so there is
// nothing to duplicate: adding invites lengthens a pass, it never adds a job.

// What each pending state asks for, in the fewest words that still make sense on
// a lock screen at 3am. The direction leads because it is the fact somebody
// half-awake has to read correctly.
function messageFor(r: DueReminder): { title: string; body: string; url: string; tag: string } {
  const dir = r.side === 'long' ? 'BUY' : 'SELL';
  const repeat = r.notifyCount > 0 ? ' (still waiting)' : '';
  // A TEST SAYS SO IN THE TITLE, BEFORE ANYTHING ELSE. Somebody woken at 3am
  // reads the first line on a lock screen and little more, so a drill that
  // reads like a real fill gets acted on — the rule every other test
  // notification in the terminal follows.
  const t = (title: string) => (r.isTest ? `TEST · ${title}` : title);
  // A LEVEL MOVE AND A TRADE INVITATION READ DIFFERENTLY ON A LOCK SCREEN, and
  // they have to: one is asking somebody to take a position, the other to change
  // one they are already in. A single wording for both is how a half-awake
  // recipient opens the terminal expecting the wrong decision.
  if (r.kind === 'amend') {
    const moved = [
      r.stopLoss == null ? null : `stop → ${r.stopLoss}`,
      r.takeProfit == null ? null : `target → ${r.takeProfit}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      title: t(`${r.inviterName} moved their levels`),
      body: `${r.instrument} ${dir} — ${moved || 'levels changed'}. Open the terminal to match it.${repeat}`,
      url: '/?screen=live',
      tag: `founder-amend-${r.id}`,
    };
  }
  return {
    title: t(`${r.inviterName} invited you to a trade`),
    body: `${r.instrument} ${dir} — open the terminal to JOIN or decline.${repeat}`,
    url: '/?screen=live',
    tag: `founder-primary-${r.id}`,
  };
}

// One pass. Exported so it can be driven directly rather than only on a timer.
export async function tickFounderTradeWatch(now: Date = new Date()): Promise<void> {
  const due = await dueReminders(now);
  if (due.length === 0) return;

  await Promise.all(
    due.map(async (r) => {
      const msg = messageFor(r);
      // Both channels, like every other watch here. Web push has no equivalent
      // of a level, so it goes out unchanged; the Pushover priority comes from
      // the recipient's own level, which is what lets this break through silent
      // mode when they have asked it to.
      await sendToUsers([r.recipientUserId], {
        title: msg.title,
        body: msg.body,
        url: msg.url,
        tag: msg.tag,
      }).catch(() => {});
      await sendPushoverToUsers(
        [r.recipientUserId],
        {
          title: msg.title,
          message: msg.body,
          priority: LEVEL_PRIORITY[r.level],
          url: msg.url,
          urlTitle: 'Open the terminal',
        },
        'founder_trade',
      ).catch(() => {});
      // Stamped conditionally on the status it was sent for, so a reminder
      // racing a decision cannot re-pace a workflow that has already moved on.
      await markNotified(r.id, r.status).catch(() => {});
    }),
  );
}

// Sample often enough that a one-minute interval is honoured, while the pacing
// itself lives on each row. Shares SESSION_WATCH_SECONDS with the session and
// rollover watches — all three are doing the same thing, waking on a clock.
const WATCH_MS = Math.max(10, Number(process.env.SESSION_WATCH_SECONDS) || 30) * 1000;

// Start the watch. Production-only and only when a delivery channel exists —
// there is nothing to poll for otherwise, and the terminal's own modal is
// unaffected either way.
export function startFounderTradeWatch(): void {
  if (!config.isProd || (!pushConfigured() && !pushoverConfigured())) return;
  const tick = () => {
    void tickFounderTradeWatch().catch((err) => console.error('Founder trade watch error:', err));
  };
  setTimeout(tick, 18 * 1000);
  const timer = setInterval(tick, WATCH_MS);
  timer.unref?.();
}
