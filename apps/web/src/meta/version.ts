// Single source of truth for the app version, and the historical archive of
// patch notes. Bump APP_VERSION and prepend a PATCH_NOTES entry on every deploy
// (for example Beta V 5.16 -> Beta V 5.17). APP_VERSION drives the top-bar
// version pill. Patch notes are now DB-backed (admins draft & publish from
// Admin ▸ Patch Notes); the help hub merges those DB notes (newest) with this
// array as the historical record, so keep prepending here.

export interface PatchNote {
  version: string;
  date: string;
  notes: string[];
}

export const APP_VERSION = 'Beta V 5.72';

export const PATCH_NOTES: PatchNote[] = [
  {
    version: 'Beta V 5.72',
    date: 'July 28, 2026',
    notes: [
      'Opening the Employee Portal now always starts a sign-in from the beginning. Leaving part-way through and coming back used to drop you on the code screen, still waiting on a code that had usually expired by then.',
      'The sign-in button says "Signing you in…" while it works, rather than "Checking…".',
      'A mail setting left blank in the deployment config is now treated as not set at all, instead of overriding the built-in default with an empty value — which could stop sign-in codes sending, or in one case stop the site starting.',
    ],
  },
  {
    version: 'Beta V 5.71',
    date: 'July 28, 2026',
    notes: [
      'Fixed the Employee Portal hanging on "Checking…" and then failing to load when the mail server does not answer. Signing in waits for the code to be sent, and that wait was unbounded — a mail server that accepted the connection and then went quiet held the sign-in open for up to two minutes, until the browser gave up.',
      'The wait is now capped at ten seconds. A mail server that is unreachable or misconfigured gets you the "code could not be emailed" notice instead of a broken page, which is what was always intended.',
    ],
  },
  {
    version: 'Beta V 5.70',
    date: 'July 28, 2026',
    notes: [
      'Maintenance only: added a behind-the-scenes check that confirms each broker trade is recorded once and that the desk’s trade counts and P/L match the broker. Nothing in the portal itself changed.',
    ],
  },
  {
    version: 'Beta V 5.69',
    date: 'July 28, 2026',
    notes: [
      'Fixed the Trade Desk showing two records for every broker position. Trades captured live were being stored a second time by the closed-trade import, so trade counts and realized P/L were both inflated.',
      'The duplicates have been merged away. Each trade now keeps one record, with the exit price and P/L taken from the broker’s own fill rather than the last price the desk polled before the position closed.',
      'Broker history keeps correcting itself: where the live feed could only estimate how a trade ended, the broker’s record now replaces that estimate on the next sync.',
    ],
  },
  {
    version: 'Beta V 5.68',
    date: 'July 28, 2026',
    notes: [
      'Setup notes only: the deployment guide now records how to connect the mail account that sends the Employee Portal sign-in codes. Nothing about the portal itself changed.',
    ],
  },
  {
    version: 'Beta V 5.67',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal now signs you in with a six-digit code emailed to your work address instead of an authenticator app. There is nothing to set up: enter your password and the code arrives in your inbox.',
      'New "Remember this device for 30 days" option on the code screen. A remembered browser skips the emailed code next time — your password is still required every time.',
      'The Security screen lists every device you have remembered and lets you forget any of them; a portal administrator can forget all of someone\'s at once.',
      'Authenticator apps and printed recovery codes are gone, along with the setup walkthrough.',
    ],
  },
  {
    version: 'Beta V 5.66',
    date: 'July 27, 2026',
    notes: [
      'Removed the in-app wording editor (the floating icon that let a founder rewrite site text live) from both the main portal and the Employee Portal. All coded text is now fixed directly in the source — the same wording as before, just no longer changeable from the browser.',
    ],
  },
  {
    version: 'Beta V 5.65',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal sign-in page drops the line under its heading about being a separate area with its own session. The heading and the form carry the point on their own.',
    ],
  },
  {
    version: 'Beta V 5.64',
    date: 'July 27, 2026',
    notes: [
      'Developers can add a headshot for anyone in the Employee Portal. Each person on the photo roster now carries an Add link — or Replace and Remove once they have one — so the directory can be filled in without waiting on everybody individually.',
      'Only founder-level accounts get this; a portal admin still manages records but not faces. Every photo set on someone else’s behalf is written to the activity log with who did it and who it was about.',
    ],
  },
  {
    version: 'Beta V 5.63',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal takes headshots. Drop a photo onto the Overview card, or pick a file, and it appears beside your name in the directory. It is cropped square and resized in the browser before it is sent, so a large photo off a phone is fine.',
      'A roster beside the dropzone shows who has a photo and who does not, with a count of how many are still missing — a nudge, not a leaderboard.',
      'You can set where you are working today — in office, remote, or away — and it shows against your name in the directory. Only you can change your own.',
    ],
  },
  {
    version: 'Beta V 5.62',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal has a task list. Everyone gets a “My tasks” card on their Overview — add something you need to remember, give it a due date, tick it off. Completed items go grey and drop below the open ones rather than disappearing.',
      'Portal administrators can assign a task to one person or to everyone at once. Assigning to everyone gives each person their own copy, so one person ticking it off does not clear it for anybody else.',
      'Your tasks are yours. Nobody — administrators included — can see what you have and have not ticked off.',
    ],
  },
  {
    version: 'Beta V 5.61',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal has its new look. It is now a light, calm site — warm sand background, white cards, a deep green header and terracotta buttons — rather than the dark terminal styling it borrowed from the trading portal. The two are different tools for different jobs, and they no longer have to share a palette.',
      'The Employee Portal row in the main sidebar picks up the same terracotta, so the link previews where it leads.',
    ],
  },
  {
    version: 'Beta V 5.60',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal now uses its own typefaces — Source Sans for the interface and Source Serif for headings — the first piece of its new design landing. The fonts are served from the portal itself, not a font network, so nothing about the page reaches outside the company.',
    ],
  },
  {
    version: 'Beta V 5.59',
    date: 'July 27, 2026',
    notes: [
      'Developers can now reword the Employee Portal in place. A pencil button sits in the lower-right corner of the employee site; turning it on highlights every piece of wording the software itself is built from, and clicking one opens a small editor to rewrite it, reset it to the built-in text, or hide it entirely. Changes are live for everyone straight away — no deploy.',
      'Only developers see the pencil. HR administrators of the employee portal do not; managing people and documents is a different job from changing the words the site is written in. Every change is written to the employee activity log with the key, the new wording, and who made it.',
      'The editor only ever touches wording that is coded into the site. Names, document titles, announcement text, counts, dates and times are deliberately not editable — they come from the data, and a rewrite must never be able to contradict them.',
    ],
  },
  {
    version: 'Beta V 5.58',
    date: 'July 26, 2026',
    notes: [
      'The Employee Portal now has its own row at the very top of the sidebar, above Workspaces, and opens in a new tab — so the main portal stays exactly where you left it. It replaces the section that briefly sat under My Portal.',
      'Suggestions moved from the Admin Portal to the Developer Portal. Anyone can still send one from Site Help ▸ Suggestion; reading and acting on the queue is now developer-level.',
    ],
  },
  {
    version: 'Beta V 5.57',
    date: 'July 26, 2026',
    notes: [
      'New Employee Portal, at its own address: vitalistradingsystems.com/employee. It is a genuinely separate site rather than another workspace — its own page, its own bundle, and its own sign-in. Being signed in to the main portal does not sign you in there, and vice versa.',
      'Inside it: an Overview of your employment record, a staff Directory, internal Announcements and Documents, and a Security section showing your active sessions and a full log of activity on your account. Portal administrators also get a People screen for granting access and keeping records up to date.',
      'Entry requires a second factor. The first time you sign in you are walked through pairing an authenticator app and given ten single-use recovery codes. Sessions there are short — eight hours at most, and they end after thirty minutes idle.',
      'You get in from My Portal ▸ Employee Portal, which explains what to expect and opens the site. The section only appears for accounts that a founder has granted the new Employee role AND that sign in with a @vitalistradingsystems.com email — both are required, and both are re-checked at the door. The read-only demo can never reach it.',
    ],
  },
  {
    version: 'Beta V 5.56',
    date: 'July 25, 2026',
    notes: [
      'The “Dave Ramsey’s Money Principles” study game now phrases every question as “According to Dave Ramsey, …,” so each one clearly attributes the idea to him. Your progress on the game is unchanged.',
    ],
  },
  {
    version: 'Beta V 5.55',
    date: 'July 25, 2026',
    notes: [
      'New built-in Study Game: “Dave Ramsey’s Money Principles” — 50 plain-English questions on the core ideas of his approach (the Baby Steps order, the debt snowball, budgeting, investing, insurance, mortgages, and the millionaire study). It’s built to teach the concepts, not just quiz labels.',
      'Like the other built-in games it lives in Browse Study Games — add it to your list to play, take as a practice test, or track progress. Educational only, and not affiliated with or endorsed by Dave Ramsey or Ramsey Solutions.',
    ],
  },
  {
    version: 'Beta V 5.54',
    date: 'July 24, 2026',
    notes: [
      'Study games now carry a short disclaimer across the Study Game, Practice Tests, and Progress screens: the content is educational only — not financial, investment, legal, or tax advice — and any third-party method, brand, or person a game names is referenced to teach about it, not because the game is affiliated with or endorsed by them.',
    ],
  },
  {
    version: 'Beta V 5.53',
    date: 'July 24, 2026',
    notes: [
      'Study Game now separates your games from the portal’s built-in ones: your team’s games appear in violet, the portal’s ready-made games in blue.',
      'The built-in example games no longer crowd the list on day one — a new “Browse Study Games” button opens a gallery where you add just the ones you want to your study games (and remove them any time).',
      'Renamed the section heading from “Your team’s study games” to “Your study games.”',
    ],
  },
  {
    version: 'Beta V 5.51',
    date: 'July 24, 2026',
    notes: [
      'Renamed the Trading workspace to “Advanced Trading.”',
      'Introduced a new Investments workspace — a read-only, long-term portfolio tracker for the layman: 401(k), IRA, ESA, and general holdings, connected read-only through a secure aggregator or entered by hand. It displays and educates only; it never places trades or moves money, and it carries no buy/sell advice.',
      'Laid the Investments foundation with its sidebar sections — Portfolio Overview, Accounts, Holdings, Allocation, Performance, Dividends & Income, Contributions & Goals, and Projections — each marked “Coming Soon” while we build them.',
      'Added an Investment Holdings summary to My Portal that will combine your active Advanced Trading positions with your long-term investment portfolio — Coming Soon.',
    ],
  },
  {
    version: 'Beta V 5.50',
    date: 'July 24, 2026',
    notes: [
      'Added a Message Templates section to the Admin Portal — a shared library of reusable text-message and email templates admins can copy and paste wherever they need them.',
      'Right-click any template (or use its Copy button) to copy it to your clipboard; email templates also offer a “copy subject only” option.',
      'Software developers can add, edit, and delete templates; every admin can view and copy them.',
    ],
  },
  {
    version: 'Beta V 5.49',
    date: 'July 23, 2026',
    notes: [
      'Refined the Terms and Rules: automated copying — webhooks, bots, or order-routing that relay or copy someone else’s trades — is prohibited, and any trade you place must be entered by you manually in your own broker account. (Paying someone to place or copy trades, and soliciting others to copy yours, remain prohibited.)',
      'Clarified in the Terms and Rules that being able to add trades manually, edit your information, and delete trades is by design — so you can keep records that are accurate for your own goals — and that because of that flexibility the data is not verified and is not proof of performance.',
      'Updated the contact address in the Terms and Privacy Policy to support@vitalistradingsystems.com.',
      'Because these documents changed, everyone is asked to review and accept them once more.',
    ],
  },
  {
    version: 'Beta V 5.48',
    date: 'July 23, 2026',
    notes: [
      'Added a Terms of Service and a Privacy Policy, plus a plain-English “Rules & Conduct” overview — all three now live in Site Help.',
      'Everyone is asked to review and accept the Terms and Privacy Policy once before continuing into the portal. You can reopen the full documents any time from Site Help.',
      'Reinforced throughout that VTS Portal is an informational and educational tool only — not financial, investment, or trading advice — and that trade figures can be edited, so they are for your own and your team’s reference and must never be used to solicit others or prove performance.',
      'The built-in AI assistants now clearly decline requests for personalized financial or investment advice and will not help work around platform rules; AI and support conversations may be reviewed by the admins.',
    ],
  },
  {
    version: 'Beta V 5.47',
    date: 'July 23, 2026',
    notes: [
      'Trade metrics CSV export now includes the exact open and close times for each trade, in two new “Open Time” and “Close Time” columns. Times are shown in Eastern Time (the same clock the rest of the portal uses for sessions and market hours), so an export reads the same no matter where you are. Still-open trades leave the close time blank.',
    ],
  },
  {
    version: 'Beta V 5.46',
    date: 'July 23, 2026',
    notes: [
      'New built-in Study Games so new members can see how Studies works right away: “Market Terminology 101” (a plain-English glossary of orders, quotes, and trading vocabulary — educational only, not financial advice), “How Study Games Work” (levels, streaks, scoring, and leaderboards, taught by playing), and “VTS Portal 101” (a quick tour of the workspaces and where to find things).',
      'These show up automatically for every team (and any new team), tagged “Built-in.” You can play them like any other game, but they can’t be edited or removed.',
    ],
  },
  {
    version: 'Beta V 5.45',
    date: 'July 23, 2026',
    notes: [
      'The iPhone positions widget now adapts to its size: Large shows full position cards (a single one shows all the detail), Medium shows a clean compact list of everyone’s trades, and Small shows just your own top position in a tidy layout instead of a cramped, cut-off card.',
      'Regenerate the script from My Portal ▸ Settings ▸ Home-screen widget and re-paste it into Scriptable to get the size-aware layouts.',
    ],
  },
  {
    version: 'Beta V 5.44',
    date: 'July 23, 2026',
    notes: [
      'Performance: the Live Wall and the iPhone widgets now share one live snapshot per team instead of each polling the brokers separately. Several teammates and widgets open at once no longer multiply the load on OANDA/Kraken — everyone reads the same fresh feed. No visible change to your positions; it just scales cleanly as more people (and widgets) come online.',
    ],
  },
  {
    version: 'Beta V 5.43',
    date: 'July 23, 2026',
    notes: [
      'The iPhone open-positions widget now refreshes as often as iOS allows — the script asks for a ~5-minute refresh instead of the slower default. (iOS caps how often any Home Screen widget can update, so it lands around every 5–15 minutes when you’re using your phone; tap the widget to open the app for real-time.)',
      'If you already added the widget, regenerate the script from My Portal ▸ Settings ▸ Home-screen widget and paste the new version into Scriptable to pick up the faster refresh.',
    ],
  },
  {
    version: 'Beta V 5.42',
    date: 'July 23, 2026',
    notes: [
      'New: put your team’s open positions on your iPhone Home Screen. In My Portal ▸ Settings, open the “Home-screen widget” card to generate a personal read-only token and copy a ready-made Scriptable script.',
      'Add one widget per teammate — set each widget’s Parameter to a person’s handle to see just their open positions, styled like the Live Wall card. Leave it blank to show the whole team.',
      'The widget token is read-only (it can’t place trades or expose broker keys) and can be revoked anytime from the same card.',
    ],
  },
  {
    version: 'Beta V 5.41',
    date: 'July 22, 2026',
    notes: [
      'Fixed a mobile bug where rotating your phone (portrait ↔ landscape) while playing a study game — or on any screen — kicked you back out to the start. The app was rebuilding the whole screen when the layout switched between the phone and wide views; it now keeps your place, so an in-progress game, test, or half-filled form survives a rotation.',
    ],
  },
  {
    version: 'Beta V 5.40',
    date: 'July 22, 2026',
    notes: [
      'The "Unrealized PF" card on the Trade Log and Live Wall metrics is now "Projected PF" — your profit factor if every open position closed right now at its current price. It folds each open trade\'s live P/L into your realized totals, so it always reads a real number (e.g. 0.95) instead of the old "∞" you saw when all open positions were green. (The realized Profit Factor is unchanged.)',
    ],
  },
  {
    version: 'Beta V 5.39',
    date: 'July 22, 2026',
    notes: [
      'Fixed the Unrealized Profit Factor on the Trade Log and Live Wall metrics: when every open position is currently in the green there are no open losses to divide by, so it now reads "—" instead of an "∞" that made an all-green open book look like an infinite track record. It still shows a real number as soon as any open position is underwater. (The realized Profit Factor is unchanged.)',
    ],
  },
  {
    version: 'Beta V 5.37',
    date: 'July 21, 2026',
    notes: [
      'Price alerts now cover crypto. Set an alert on BTC, ETH, SOL and other major coins (e.g. BTC/USDT crosses above 70000) right alongside forex, metals and indices.',
      'Crypto alerts work without any broker connection — prices come from a live public feed. (Forex, metals and index alerts still need an OANDA connection to fire.)',
    ],
  },
  {
    version: 'Beta V 5.36',
    date: 'July 21, 2026',
    notes: [
      'New: create your own price alerts inside the portal. In Trading ▸ Trading Alerts, open the "Price alerts" card to get buzzed when a market crosses a price you set (e.g. EUR/USD crosses above 1.1000) — covers OANDA forex, metals and indices.',
      'You can also set one straight from a chart: click the 🔔 on any Live Wall chart tile to add an alert for that symbol.',
      'Alerts are personal — each one buzzes only you (phone push + Pushover) and lands in your own Trading Alerts feed. Choose one-shot or repeat-on-every-cross. Turn on phone alerts for a device to actually buzz.',
    ],
  },
  {
    version: 'Beta V 5.35',
    date: 'July 21, 2026',
    notes: [
      'Strategy Sessions ▸ "All open market hours" now includes the Sunday-evening open. For EUR/USD (and other forex) it fills Sunday 5:00 PM–11:59 PM, Monday–Thursday full days, and Friday to 5:00 PM — matching the real trading week instead of starting at Monday 12:00 AM.',
      'Index and commodity futures similarly get their Sunday-evening open (6:00 PM ET). Stocks stay Mon–Fri and crypto stays 24/7.',
    ],
  },
  {
    version: 'Beta V 5.34',
    date: 'July 20, 2026',
    notes: [
      'Developer Portal ▸ Sidebar Layout: reordering the sections inside a workspace is now obvious. Click any workspace row to open it and reorder its sections with their own up/down arrows — the section arrows no longer hide behind a stray chevron.',
      'New "Expand all / Collapse all" control opens every workspace at once, so you can rearrange sub-sections across the whole sidebar without clicking each one open.',
    ],
  },
  {
    version: 'Beta V 5.33',
    date: 'July 20, 2026',
    notes: [
      'Admins can now reply to a bug report. Open a report in Admin ▸ Bug Reports and use the new reply box to write back to the reporter — it posts into the same thread and pings them with a notification.',
      'Once an admin replies, the reporter can answer back in Site Help ▸ Report a bug, turning the ticket into a two-way conversation (the AI intake steps aside once a human is on the thread).',
      'The support/bug assistant is now named VTS AI everywhere it appears.',
    ],
  },
  {
    version: 'Beta V 5.32',
    date: 'July 20, 2026',
    notes: [
      'Support chat (the corner bubble ▸ Support tab) now remembers your conversations. Closing the bubble no longer throws away an in-progress request — reopen it and pick up right where you left off.',
      'Your previous support requests are listed at the top of the Support tab. Tap one to reopen the whole thread, with a Draft / In progress / Sent status on each.',
      'Anything you typed but didn’t send is saved as a draft and restored when you reopen that request. Once a request has been sent to the admins you can still add a follow-up in the same thread.',
    ],
  },
  {
    version: 'Beta V 5.31',
    date: 'July 20, 2026',
    notes: [
      'Market News board window: dropped the All / Med+ / High impact toggle. The window now shows every headline regardless of impact — each story still carries its High / Med / Low badge so you can tell at a glance.',
      'Live Wall ▸ Master: while editing the layout there’s now a little breathing room below the grid, so the bottom-row window’s resize handle no longer sits jammed against the footer and can be dragged down to grow.',
    ],
  },
  {
    version: 'Beta V 5.29',
    date: 'July 20, 2026',
    notes: [
      'Trade Desk settings are now per trader. Each trader’s break-even buffer, per-instrument buffers, and “ignore test trades” floor shape their own view of the desk.',
      'The team leader and the Chief Analyst / Chief Strategist (and admins) can now change any teammate’s Trade Desk settings — open Settings and use the new “Whose settings” picker at the top to choose a member. Everyone else edits only their own.',
    ],
  },
  {
    version: 'Beta V 5.28',
    date: 'July 20, 2026',
    notes: [
      'Developer Portal ▸ Sidebar Layout: a new tool to reorganize the sidebar. Reorder the workspaces and the sections inside each one with up/down arrows, then Save to apply the new order for everyone. Reset restores the built-in order. New sections added in future updates always appear automatically at the bottom of their group.',
    ],
  },
  {
    version: 'Beta V 5.27',
    date: 'July 20, 2026',
    notes: [
      'Emails are now editable by admins: open Admin ▸ Users and tap the pencil next to anyone’s email to change their sign-in address. This fixes older accounts whose email showed a doubled “…@vitalistradingsystems.com@vitalistradingsystems.com” — just edit it down to the correct address and Save.',
    ],
  },
  {
    version: 'Beta V 5.26',
    date: 'July 20, 2026',
    notes: [
      'Pushover (custom alert sound): App Store and Google Play icons now sit to the right of the Disconnect button. Tap either to jump straight to the Pushover app’s store listing to install it.',
    ],
  },
  {
    version: 'Beta V 5.25',
    date: 'July 20, 2026',
    notes: [
      'Display names are now editable by admins: open Admin ▸ Users and tap the pencil next to anyone’s name to rename them. You could already rename yourself from Account settings.',
      'People are now shown by their display name across the portal — the “@username” handle no longer trails the name on the Users list, team rosters, and pending invites.',
      'Live Wall ▸ Desk Metrics: the whole-desk / per-trader picker is now a clean, on-theme dropdown (no more clashing native menu) and lists traders by display name.',
      'My Portal ▸ Trading Team reads cleaner on a phone — each member’s actions (Badge, Make leader, Remove) now sit on their own row instead of crowding the name.',
    ],
  },
  {
    version: 'Beta V 5.24',
    date: 'July 20, 2026',
    notes: [
      'Study Game: new Practice mode toggle. Flip it on to drill questions freely — you still see whether you’re right and can talk each one through with VTS AI, but nothing counts toward your score, level, streak, or the leaderboard. A revealed answer shows “Practice — not counted” instead of a lifetime change.',
      'Study Game now keeps your place. Switch tabs, background the app, or relaunch and you land right back on the exact question you were on — even one you’ve already answered but not yet moved past — so you can revisit the explanation or keep chatting it through instead of jumping to a fresh one. Your practice-mode choice sticks too.',
    ],
  },
  {
    version: 'Beta V 5.23',
    date: 'July 19, 2026',
    notes: [
      'New Deleted Trades section (under Trading). Removing a trade from the Trade Log or History no longer throws it away — it moves here, out of your stats, and one tap restores it. Great for clearing test trades without fear of losing a real one.',
      'Unrealized Profit Factor: both the Trade Log and the Live Wall Metrics tile now show a profit factor for your open book (winners’ open gains ÷ losers’ open losses), each with its size-scaled reading beneath — just like the realized one.',
      'Live Wall Metrics tile can now scope to one trader: use the picker in the tile header to switch between the whole desk and any individual.',
      '“Count trades since” is now in Trade Desk ▸ Settings (and still on each connection), so it’s easy to find. Pick the date your real trading began per account.',
      'Profit Factor now always shows the scaled figure beneath the raw one — the Deck/Tape and Scaled-PF toggles have left the Trade Log header. Deck vs Tape moved to My Portal ▸ Preferences (new).',
      'Fixed a missing-glyph box on the Export button.',
    ],
  },
  {
    version: 'Beta V 5.22',
    date: 'July 19, 2026',
    notes: [
      'Trade Log now shows Unrealized P/L. A new card totals the live open P/L across your open positions, and every open trade shows its running P/L instead of a dash — so when your account is up on an open winner but flat on closed trades, the log reads green instead of looking like a loss. Realized P/L is still closed-only; the two sit side by side.',
      'Live Wall: new “Metrics” tile. Add it from the board’s edit bar to pin your desk’s headline numbers — realized, unrealized, and net P/L, win rate, profit factor (raw + scaled), and trade count — right next to your charts and positions.',
      'Broker connections: the “Count trades since” date is now front-and-center on each connection (no more digging into Edit). Pick the date your real trading began and it saves on the spot.',
    ],
  },
  {
    version: 'Beta V 5.21',
    date: 'July 19, 2026',
    notes: [
      'Broker connections now have a “Count trades since” date. Set it on a connection (Edit) to mark your real start on that account — an earlier learning/practice phase that you funded, traded, and withdrew no longer pollutes your Trade Log and History. Trades opened before the date are left out of every stat (win rate, profit factor, realized P/L, pips) and are never re-imported from the broker. Admins can set it per trader from Team connections. Leave it blank to count everything, exactly as before.',
      'Trade Desk Settings: new “Ignore test trades” floor. Broker fills under the units you set (e.g. the 1-unit orders you place to check a connection) drop out of the Trade Log and History entirely — stats and list. Hand-logged trades always count. Set 0 to keep everything.',
      'Trade Log: new “⚖ Scaled PF” toggle. Profit factor with every trade scaled to the same lot size (per-unit P/L), so a couple of outsized positions can’t prop up — or sink — the ratio. Both the raw and scaled readings show at a glance, and the scaled figure is in the CSV export.',
    ],
  },
  {
    version: 'Beta V 5.20',
    date: 'July 19, 2026',
    notes: [
      'Study Creation now does CSV. Study games and flashcard sets each get an “Import CSV” option (with a downloadable template) that reads a spreadsheet directly — no AI needed — and every game and set has an “Export CSV” button. Edit your content in Excel or Google Sheets and round-trip it: export, tweak, re-import.',
    ],
  },
  {
    version: 'Beta V 5.19',
    date: 'July 19, 2026',
    notes: [
      'Study Creation: new “Audit answers” button on any study game. VTS AI reviews every question one by one for problems — above all a wrong answer key, plus missing/duplicate correct options and ambiguous wording — and flags the ones to look at, with a one-tap fix to adopt the answer it thinks is right.',
      'Study Game: correcting a question’s answer key now re-scores the attempt you just made. If your original pick becomes the right answer, the miss is un-counted — your streak, level, and lifetime accuracy update to match.',
    ],
  },
  {
    version: 'Beta V 5.18',
    date: 'July 19, 2026',
    notes: [
      'Study Game: spot a flawed question mid-play and fix it on the spot. After answering, tap “Something wrong? Fix this question” to change the marked correct answer (if the key was wrong) or delete the question outright. Fixes save for the whole team instantly. Only the game’s creator or an admin sees these controls.',
    ],
  },
  {
    version: 'Beta V 5.17',
    date: 'July 19, 2026',
    notes: [
      'Study Game: after you answer a question (right or wrong), you can now talk it through with VTS AI right there. A back-and-forth tutor chat opens under each answer, already knowing the question, the options, the correct answer, and what you picked — tap “Break this down” for a plain-language walkthrough, then ask follow-ups until it clicks.',
    ],
  },
  {
    version: 'Beta V 5.16',
    date: 'July 19, 2026',
    notes: [
      'The top-bar settings cog is gone — its controls now live in My Portal ▸ Settings. Privacy mode, the trade-alert sound (Chime / Alarm / Digital alarm), broker status, Notifications & connections (phone push, Pushover, per-trader alerts, broker connections), and “Check for updates” are all in one place in your own workspace.',
    ],
  },
  {
    version: 'Beta V 5.15',
    date: 'July 19, 2026',
    notes: [
      'Strategy Sessions now cover the whole week and round-the-clock markets: pick any days including Saturday and Sunday, flag any day as “24 hours”, or tap “24/7” to run every day non-stop — so a 24/7 Monday-through-Friday (or full-week crypto) instrument is a single session. The “TF (M15)” timeframe box has been removed.',
    ],
  },
  {
    version: 'Beta V 5.14',
    date: 'July 19, 2026',
    notes: [
      'My Portal ▸ Trading Team now shows your real trading team — the same team you share trades with — instead of a separate “create a team” form. Your teammates appear automatically, and the leader can rename it, set badges, adjust each member’s permissions, invite, and hand off leadership.',
    ],
  },
  {
    version: 'Beta V 5.13',
    date: 'July 19, 2026',
    notes: [
      'My Portal now sits at the very top of the workspaces list, and the Founder Portal is renamed the Developer Portal.',
      'Strategy Sessions rebuilt: pick the exact days (Mon–Fri) and hours a session runs, drop a bias of Bull, Bear, or Two-way, or tap “All open market hours” to have VTS AI fill the instrument’s full market hours for you.',
      'Trading Alerts (formerly “Alerts”) can now notify you when a strategy session opens, when it closes, and a set number of minutes before it opens.',
    ],
  },
  {
    version: 'Beta V 5.12',
    date: 'July 19, 2026',
    notes: [
      'Software Developers now show a blue code badge next to their name everywhere names appear, alongside the Founder crown.',
    ],
  },
  {
    version: 'Beta V 5.11',
    date: 'July 19, 2026',
    notes: [
      'Founders now show a gold crown badge next to their name everywhere names appear (top bar, admin lists, team chat).',
    ],
  },
  {
    version: 'Beta V 5.10',
    date: 'July 19, 2026',
    notes: [
      'The admin Users role picker now only shows the roles you’re allowed to assign: the owner sees every role, a founder sees Admin / Funded / Member, and a plain admin sees just Member. A user’s existing higher roles are preserved when you edit them.',
    ],
  },
  {
    version: 'Beta V 5.9',
    date: 'July 19, 2026',
    notes: [
      'New “My Portal” workspace with a Trading Team you own: create a team, invite up to five teammates by username, and lead it. The leader can hand off leadership, give members cosmetic badges (Chief Strategist, Chief Analyst, Risk Manager, Lead Trader, or a custom title), and set each member’s permissions (create study guides, invite members, manage badges, remove members, edit team info).',
      'Roles are simplified to Founder, Admin, Member, plus Funded. Every signed-in member now sees every standard workspace. Only the owner can grant the Founder role; only a founder can grant Admin or Funded. A new Software Developer role carries founder-level access.',
      'New founder-only “Founder Portal” holds AI Instructions, Site Wording, and View as role (moved out of Admin, now renamed “Admin Portal”). Editing site wording — including the corner edit shield — is now founder-only.',
      'In Studies, members only see their own team’s content, and only the Trading Team leader can delete team study games, flashcard sets, and guides.',
    ],
  },
  {
    version: 'Beta V 5.8',
    date: 'July 19, 2026',
    notes: [
      'Study games now show progress bars: a Lifetime bar (your all-time correct %, what the leaderboard ranks by) and a Session bar (your correct % over your most recent answers). Hit “Adjust” to set how many recent answers the session covers (for example your last 50) and to give each bar a passing score — set 72% and the bar turns green with a pass line once you clear it. These settings are personal to you. The bars appear both while playing a game and on its Progress screen.',
    ],
  },
  {
    version: 'Beta V 5.7',
    date: 'July 19, 2026',
    notes: [
      'Site-wording edit mode can now remove a piece of coded text, not just reword it — open any editable text and hit “Hide” to drop it site-wide (Reset or new text brings it back). The corner edit button is now the admin shield to match your badge.',
    ],
  },
  {
    version: 'Beta V 5.6',
    date: 'July 19, 2026',
    notes: [
      'Site-wording editing now reaches the copy it was missing: explanatory blurbs with bolded words (Study Hub, Flashcards, Team Study Games, Team Flashcards) are editable as a single line — bold a word by wrapping it in **double asterisks** — every Admin section’s heading and description is editable, and the Manual Trades screen’s labels and blurbs are covered too.',
    ],
  },
  {
    version: 'Beta V 5.5',
    date: 'July 19, 2026',
    notes: [
      'Admins can now rewrite site wording in place: a gold pencil sits next to the corner chat bubble (admins only) — turn it on and any editable coded text across the portal highlights, so you can click it and change the wording live. It covers titles, blurbs, buttons, and explanations coded into the site, not user-created content (a study game’s name), trade data, or live figures. Edits save instantly and everyone sees them; each can be reset to its built-in default.',
    ],
  },
  {
    version: 'Beta V 5.4',
    date: 'July 19, 2026',
    notes: [
      'Removed the redundant Study Creation shortcuts from the Study Hub landing — the “Create one” button under Study games and the “Open Study Creation” button under Flashcards & guides are gone, since Study Creation already has its own sidebar section.',
    ],
  },
  {
    version: 'Beta V 5.3',
    date: 'July 19, 2026',
    notes: [
      'Building a study game from a topic with AI no longer fails with a “Request failed (502)” on larger question counts — the questions are now generated in small parallel batches so the request finishes well within the server’s time limit.',
    ],
  },
  {
    version: 'Beta V 5.2',
    date: 'July 19, 2026',
    notes: [
      'Team Flashcards no longer shows two “New flashcard set” buttons on the empty screen — the redundant top-right one only appears once you already have a set.',
    ],
  },
  {
    version: 'Beta V 5.1',
    date: 'July 19, 2026',
    notes: [
      'The corner chat bubble now has two tabs — Team chat (open by default) and a new Support tab. In Support, pick whether you’re reporting a bug, sending a suggestion, or need general help, and an AI assistant asks a couple of quick questions before filing it to the admins automatically: bugs go to Bug Reports, suggestions to Suggestions, and general questions to a new admin Support section.',
      'New activity now flags the admin nav: a solid red blinking dot appears next to the Admin workspace and next to the specific section (Suggestions, Bug Reports, or Support) with something new, and clears when you open that section.',
    ],
  },
  {
    version: 'Beta V 5.0',
    date: 'July 19, 2026',
    notes: [
      '“Check for updates” is now its own option in the settings cog (top bar) — one click checks for a new version and updates this device if there is one. It’s no longer buried in Notifications & connections, and the separate “Force refresh” option is gone.',
    ],
  },
  {
    version: 'Beta V 4.9',
    date: 'July 19, 2026',
    notes: [
      'The study game again recolors the whole Studies workspace to your level while you play — the background and accents shift as you climb the ladder.',
      'Flashcards ▸ new “From a study game” option: pick one of your study games and AI pulls its key vocabulary into a flashcard set (with definitions) for you to review.',
      'Study Presentations (formerly Study Guides) now have an Edit button — rename the presentation and edit, reorder, or delete slides. On desktop they’re listed top-to-bottom instead of side-by-side.',
      'Renamed two sections: “Test Mode” is now “Practice Tests”, and “Study Guides” is now “Study Presentations”.',
    ],
  },
  {
    version: 'Beta V 4.8',
    date: 'July 19, 2026',
    notes: [
      'Flashcard sets are now editable: in Study Creation, each set has an Edit button. Rename the set, edit every card’s term, definition, and topic, add or delete cards, sort by topic, and let VTS AI auto-categorize the cards (with an optional custom prompt). Creating a set now opens it in the editor so you can refine it.',
    ],
  },
  {
    version: 'Beta V 4.7',
    date: 'July 19, 2026',
    notes: [
      'New Flashcards section in the sidebar: pick one of your team’s flashcard sets and study it with the auto-rotate player. Flashcard sets are still built in Study Creation — now they’re studied here, so Study Creation stays purely for making and managing.',
    ],
  },
  {
    version: 'Beta V 4.6',
    date: 'July 19, 2026',
    notes: [
      'Study Creation is now purely for making and editing — the Play button is gone from study games there (play them in the Study Game section). Creating or combining a game now opens it in the editor so you can refine it.',
      'Sidebar order: Study Creation is now the last Studies section, with Progress right above it.',
    ],
  },
  {
    version: 'Beta V 4.5',
    date: 'July 19, 2026',
    notes: [
      'Study Creation ▸ Edit a study game: each game now has an Edit button. Rename it, manage its categories, and edit every question — the text, the four options, the correct answer, the explanation, and its category. Sort the questions by category, and let VTS AI auto-categorize them (leave the prompt blank to let it choose the groupings, or tell it how to group).',
      'Combine games: merge several games into one — great for one massive game with every question. Optionally have it remember which game each question came from, which unlocks a “Guess the source” toggle while you play.',
    ],
  },
  {
    version: 'Beta V 4.4',
    date: 'July 18, 2026',
    notes: [
      'Studies is now fully self-serve: every study game, flashcard set, and test is something your team builds. The Study Game, Test Mode, and Progress sections each let you pick one of your team’s games and play it, sit a graded test on it (set your own length and pass line), or see your level and accuracy on it.',
      'Test Mode is now per-game and configurable — choose how many questions to draw and the pass line, with a per-topic breakdown of your result at the end.',
    ],
  },
  {
    version: 'Beta V 4.3',
    date: 'July 18, 2026',
    notes: [
      'Studies ▸ Study Creation: you can now build your own flashcard sets. Type the cards in, have AI generate them from a topic, or upload a text file (a glossary or “term – definition” lines) and AI formats them for you to review. Study any set with the full auto-rotate player — two-phase term/definition timing, “always show the definition”, topic filters, “I know this”, and Ask VTS AI on every card.',
    ],
  },
  {
    version: 'Beta V 4.2',
    date: 'July 18, 2026',
    notes: [
      'Study Game vs Study Creation are now cleanly split. Study Creation is only for building study games — creating one no longer drops you into playing it there. Instead, the Study Game section is now a launcher where you pick which game to play: the built-in Series 65 quiz or any study game your team built. After you create a game it takes you to the launcher, and each game in Study Creation has a Play button that opens it in the Study Game section.',
      'The Study Game section is now visible to every Studies user (not just the Series 65 team), since it also lists your team’s own study games.',
    ],
  },
  {
    version: 'Beta V 4.1',
    date: 'July 18, 2026',
    notes: [
      'Live Wall ▸ Master: you can now add an Alerts tile to any board. Turn on Edit layout and press “+ Alerts” to pin your TradingView alerts right next to your charts — the same webhook alerts from the Alerts section, in a compact live feed. Toggle it between all active alerts and just the new (unanalyzed) ones.',
    ],
  },
  {
    version: 'Beta V 4.0',
    date: 'July 18, 2026',
    notes: [
      'Study Creation ▸ upload a file: fixed a timeout (“Request failed (524)”) when generating questions from a larger file. The file is now read in parallel batches instead of one long request, so big question banks come through — and every question in the file is formatted, not just the first batch.',
    ],
  },
  {
    version: 'Beta V 3.9',
    date: 'July 18, 2026',
    notes: [
      'Study Creation ▸ upload a file: uploading a text file now just accepts the file instead of dumping its contents into a box. Press Generate and AI reads the file and formats the questions for you, then shows the full list to review before you create the game. The “Max questions” field is gone.',
    ],
  },
  {
    version: 'Beta V 3.8',
    date: 'July 18, 2026',
    notes: [
      'Trade Desk & History now backfill from your broker’s own closed-trade record (OANDA), so trades that opened and closed between price polls no longer go missing — your full trade history shows up, not just the ones the Live Wall happened to catch live.',
    ],
  },
  {
    version: 'Beta V 3.7',
    date: 'July 18, 2026',
    notes: [
      'Live Wall ▸ Master: the Open Positions tile now has two extra layout options — “List ↕” and “Cards ↕”. In these expanding modes the tile grows taller for each open trade instead of scrolling inside a fixed box, so every position is visible at a glance.',
    ],
  },
  {
    version: 'Beta V 3.6',
    date: 'July 18, 2026',
    notes: [
      'Notification settings are now per-trader: in Notifications & connections, pick a specific teammate and choose exactly which of their trade actions buzz you.',
      'Each trader now has independent toggles for placing trades, closing trades, and placing vs. moving the stop-loss and take-profit — so you can, say, hear only when someone moves a stop and stay quiet on everything else. Everyone stays on by default until you change it.',
    ],
  },
  {
    version: 'Beta V 3.5',
    date: 'July 18, 2026',
    notes: [
      'Live Wall order is now Chief Strategist positions first, then Chief Analyst, then the rest of your on-book (broker) positions, with off-book (funded / FTP) positions grouped last.',
      'Off-book positions now read in gray — no matter who placed them — so they’re clearly set apart from your live broker positions.',
    ],
  },
  {
    version: 'Beta V 3.4',
    date: 'July 18, 2026',
    notes: [
      'Position designations now tint the whole trade tile in the trader’s colour — a green wash for Chief Strategist, red for Chief Analyst — on the Live Wall and Trade Log, not just the accent stripe.',
      'The Live Wall now floats the Chief Strategist’s open positions to the top, followed by the Chief Analyst’s, then everyone else (newest first within each).',
    ],
  },
  {
    version: 'Beta V 3.3',
    date: 'July 18, 2026',
    notes: [
      'New position designations: two badges — Chief Strategist (green) and Chief Analyst (red). Whoever an admin gives a badge to has their open positions colour-coded in that colour everywhere on the desk — the Live Wall cards, the Trade Log, and History all carry their icon and a matching accent.',
      'Trade opened / closed notifications now lead with the trader’s designation (🟢 Chief Strategist / 🔴 Chief Analyst) when they hold one, so you can tell whose call it is at a glance.',
    ],
  },
  {
    version: 'Beta V 3.2',
    date: 'July 18, 2026',
    notes: [
      'Reorganized Studies: you now build study guides in the Study Creation section (alongside study games), and the finished guides live in the Study Guides section, ready to present.',
      'New: build a study guide from an existing presentation — upload a PowerPoint (.pptx) and its slides and images come in as a draft you can refine with VTS AI, add screenshots to, and save. Using Google Slides? Export it as PowerPoint (File ▸ Download ▸ Microsoft PowerPoint) and upload that.',
    ],
  },
  {
    version: 'Beta V 3.1',
    date: 'July 17, 2026',
    notes: [
      'New Site Help workspace gathers everything support-related in one place: How-to guides, Announcements (formerly News), Patch notes, Report a bug, and Suggestion.',
      'The lower-right corner is now your Team Chat — a private channel just for you and your trading team, with each teammate’s profile picture beside their messages. New messages show up in the top-bar notification bell. Not on a trading team yet? The panel explains how the feature works.',
      'Report a bug from Site Help and our assistant reads it, asks for anything that’s missing, then thanks you and files the ticket for the admins.',
      'Add a profile picture in Account settings — it appears in the top bar, your account menu, and next to your team-chat messages.',
      'Admins: “View as role”, “Suggestions”, and “Bug Reports” now each have their own section in the Admin workspace. Suggestions and bug reports land there automatically.',
      'The corner chat button is now a chat bubble.',
    ],
  },
  {
    version: 'Beta V 3.0',
    date: 'July 17, 2026',
    notes: [
      'Reworked the Trading “Funded” tab into “Manual Trades” — a self-managed book where you place trades for accounts by hand, with nothing tied to an outside funded platform.',
      'Added a private “Funded” section (the prop-firm challenge dashboard: equity vs. target and daily / max drawdown buffers) that only appears for accounts an admin grants the new Funded role. It is never shown in the demo or to the public.',
      'Cleaned up the assignable roles: removed the retired Wealth Management and Finance roles, leaving Admin, Trading, Trading (View only), Funded, Studies, and To Do.',
      'Removed the Wealth Management and Personal Finance workspaces entirely — their screens, API, and stored data are gone. The portal now focuses on Trading, Studies, and To Do.',
    ],
  },
  {
    version: 'Beta V 2.9',
    date: 'July 16, 2026',
    notes: [
      'Removed the Vitalis Trading Systems LLC business workspace (Overview, Documents, Members, Contractors, Compliance, Banking, and Legal). The portal now focuses on Trading, Studies, To Do, Wealth, and Finance.',
    ],
  },
  {
    version: 'Beta V 2.8',
    date: 'July 16, 2026',
    notes: [
      'Removed the Kia Sales workspace and its dashboard, news, product-knowledge, and to-do tools. The portal now focuses on Trading, Studies, To Do, Wealth, Finance, and the LLC workspace.',
    ],
  },
  {
    version: 'Beta V 2.7',
    date: 'July 14, 2026',
    notes: [
      'Study Game: each sub-level now costs one more correct answer than the last — the first star takes 10, the next 11, then 12, and so on continuously up the ladder, so higher levels take progressively more work.',
      'Study Game: the current category now shows your percentage correct in it right next to its name (e.g. “Client Management · 82% correct”).',
      'Studies: removed the read-aloud / text-to-speech option from the quiz, mock test, and flashcards.',
    ],
  },
  {
    version: 'Beta V 2.6',
    date: 'July 14, 2026',
    notes: [
      'Study Game: the whole page now changes colour with your level — the background, buttons, and accents shift through all 12 level hues (🥚 cream → 💎 cyan) as you climb, so your progress is visible at a glance.',
      'Study Game: mock test answers now count toward your level too. Finishing a test advances your level (and can trigger a level-up on the results screen) — without changing your lifetime accuracy or leaderboard score, which stay driven by the quiz.',
    ],
  },
  {
    version: 'Beta V 2.5',
    date: 'July 14, 2026',
    notes: [
      'Study Game: your score is now simply your lifetime accuracy — every correct answer divided by every question you have attempted. No more moving/weighted score.',
      'Study Game: “Reset progress” now banks the run you just played onto the leaderboard as a past run, so a reset preserves the session instead of erasing it. A quick confirmation shows what will be saved.',
      'Study Game: a “Best reached” badge shows the highest level you have ever hit, and it sticks around even after you reset. The leaderboard now shows each run’s best level too.',
    ],
  },
  {
    version: 'Beta V 2.4',
    date: 'July 14, 2026',
    notes: [
      'Study Game: a brand-new level ladder that spans every category. Climb 12 themed levels from 🥚 Egg to 💎 Diamond, each with five star sub-levels (★☆☆☆☆ → ★★★★★) that shade the level colour from dark to light. Every 10 correct answers is one sub-level up.',
      'Study Game: answering is now two steps — click an option to highlight it, then Confirm (or press Enter/Space) to submit, so a misclick never scores. On the keyboard, A–D pick and Enter/Space confirms.',
      'Study Game: a new ↩ Undo button reverts your last answer — restoring your score and stats and re-presenting the question. Usable once every 10 questions.',
    ],
  },
  {
    version: 'Beta V 2.3',
    date: 'July 8, 2026',
    notes: [
      'Updates now pop up an “Update available” prompt on any screen the moment a new version is deployed — click “Relaunch to update” to apply it, instead of only noticing when you opened the Studies tab.',
      'Trading: the Trade Log, Live Brokers, and History sections are combined into one “Trade Desk” tab, with a switch at the top to move between them.',
    ],
  },
  {
    version: 'Beta V 2.2',
    date: 'July 5, 2026',
    notes: [
      'Study Game: build your own subsections. Click “✦ New subsection”, name a topic like Bonds or Compliance, and VTS AI scans all questions and gathers the ones that fit into a chip you can drill.',
      'Study Game: new Practice mode toggle — answer freely without affecting your score, levels, or totals, so you can grind a specific subsection with no risk to your stats.',
    ],
  },
  {
    version: 'Beta V 2.1',
    date: 'July 5, 2026',
    notes: [
      'To Do: create your own sections. Use the new "Add a section" box — name it and pick Checklist, Daily routine, or Notes — or just tell the command bar "new section Garden".',
      'To Do: reorder tasks. Use the ▲ / ▼ arrows on each task, or ask the command bar to "move 1.2 to the top" or "move 3.1 up 2".',
    ],
  },
  {
    version: 'Beta V 2.0',
    date: 'June 28, 2026',
    notes: [
      'The portal is now in Beta (V2.0) — thanks for helping shape it through Alpha.',
      'Flashcards: a new "All terms" list below the card gives every term its own Reveal button, so you can check any definition without flipping through the whole deck.',
      'Flashcards: opening "More Details" or asking VTS AI a question now stops auto-rotate, so the card stays put while you read the reply.',
    ],
  },
  {
    version: 'Alpha V 1.17',
    date: 'June 28, 2026',
    notes: [
      'Ask VTS AI is now a real back-and-forth chat — ask follow-up questions about a quiz question or a flashcard and VTS AI keeps the context. "More Details" starts the conversation, and you can keep going from there.',
    ],
  },
  {
    version: 'Alpha V 1.16',
    date: 'June 28, 2026',
    notes: [
      'Flashcards: add your own words — type a term and VTS AI writes a Series 65 definition and files it under the right topic. Your custom words sync across devices and can be removed anytime.',
      'Study Game: star any question (☆) to save it, then switch to the new "Starred" tab to drill just the ones you flagged. Your starred set syncs across devices.',
      'Ask VTS AI about a question or a flashcard: the "Explain with VTS AI" button is now "More Details", with an "Ask VTS AI…" box next to it for your own follow-up questions.',
      'Fixed an occasional crash when opening the Studies section after an app update.',
    ],
  },
  {
    version: 'Alpha V 1.15',
    date: 'June 24, 2026',
    notes: [
      'Cleaner top bar: privacy, trade alert sound, and broker status now live in one settings (gear) menu, and the clock is smaller, so the row is no longer crowded.',
      'Admin tools moved into your name menu: "User management" is there, and "View as role" is a tucked-away collapsible list instead of a row of buttons.',
    ],
  },
  {
    version: 'Alpha V 1.14',
    date: 'June 24, 2026',
    notes: [
      'Study Game progress now saves to your account: your category levels, scores, and learned words follow you across devices instead of living only on one browser.',
    ],
  },
  {
    version: 'Alpha V 1.13',
    date: 'June 24, 2026',
    notes: [
      'Flashcards: an "Explain simply" button on each card gives a plain-language breakdown that defines any tricky words used inside the definition itself.',
    ],
  },
  {
    version: 'Alpha V 1.12',
    date: 'June 24, 2026',
    notes: [
      'Market News now pulls live market headlines and shows Donald Trump\'s Truth Social posts, refreshing automatically.',
      'You get a toast in the corner when a new headline or Truth Social post arrives.',
    ],
  },
  {
    version: 'Alpha V 1.11',
    date: 'June 24, 2026',
    notes: [
      'The corner button now shows the VTS mark, and pops a toast when a new chat message, announcement, or market news headline arrives.',
    ],
  },
  {
    version: 'Alpha V 1.10',
    date: 'June 24, 2026',
    notes: [
      'Ask VTS AI in the Kia workspace now uses the dedicated Kia product expert.',
      'Market News headline times ("x ago") stay current instead of going stale between refreshes.',
    ],
  },
  {
    version: 'Alpha V 1.9',
    date: 'June 24, 2026',
    notes: [
      'Flashcards: the words you mark as known now sync to your account, so your learned list follows you across devices.',
    ],
  },
  {
    version: 'Alpha V 1.8',
    date: 'June 24, 2026',
    notes: [
      'Cleaner small screens: the top bar now tucks the clock, privacy, trade alert sound, and admin into a single "More" menu, leaving just Ask VTS AI and your account in view.',
      'On phones, a workspace\'s sections are now a dropdown picker instead of a row that ran off the edge.',
    ],
  },
  {
    version: 'Alpha V 1.7',
    date: 'June 24, 2026',
    notes: [
      'Flashcards: mark a word "I know this" to hide it from the deck. Learned words collect in a side list with a checkmark; tap the X next to one to add it back.',
    ],
  },
  {
    version: 'Alpha V 1.6',
    date: 'June 24, 2026',
    notes: [
      'Flashcards: set your own auto-rotate times for the term and the definition.',
      'Flashcards: a new mode that shows each word together with its definition (no term-only step) and rotates through the cards on one timer.',
    ],
  },
  {
    version: 'Alpha V 1.5',
    date: 'June 24, 2026',
    notes: [
      'Broker connections: a new Manual connection type for any broker. Name it after your broker, then enter your open positions by hand and they show on the Live Wall with full pip and risk and reward math. Update them when your trades change.',
    ],
  },
  {
    version: 'Alpha V 1.4',
    date: 'June 24, 2026',
    notes: [
      'Chat: delete your own messages. Admins can remove any message.',
    ],
  },
  {
    version: 'Alpha V 1.3',
    date: 'June 24, 2026',
    notes: [
      'The corner help and chat button now shows a dot when there are new chat messages or announcements since you last opened it.',
    ],
  },
  {
    version: 'Alpha V 1.2',
    date: 'June 24, 2026',
    notes: [
      'Chat: scrolling up to read older messages is no longer interrupted when new messages arrive.',
      'Chat: message order is now stable, and the message box stops you at the length limit instead of erroring.',
    ],
  },
  {
    version: 'Alpha V 1.1',
    date: 'June 24, 2026',
    notes: [
      'New help and chat hub in the corner: a trading desk chat, a website chat for everyone, patch notes, and announcements.',
      'Install the portal to your phone home screen (PWA), and pick a trade alert sound that plays on a new TradingView alert.',
      'Connect your own broker API from Account Settings, with forex pip math on the Live Wall: pips, money per pip, and risk and reward to your stop and target.',
      'Added a one-click read-only demo with simulated data and a guided tour.',
    ],
  },
  {
    version: 'Alpha V 1.0',
    date: 'Initial release',
    notes: [
      'VTS Portal: Trading, Kia Sales, Wealth Management, Personal Finance, Series 65 Studies, and a shared To-Do list.',
      'The Ask VTS AI assistant is available on every screen.',
    ],
  },
];
