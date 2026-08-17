// Per-page tutorials shown by the "?" help button on each section. Text-only
// steps for now; each step has an optional `image` slot so screenshots can be
// dropped in later (e.g. under /public/tutorials/) without changing this shape.
// Keyed by screen key (see theme/nav.ts, the source of truth for sections).

export interface TutorialStep {
  title: string;
  body: string;
  image?: string; // optional screenshot URL, added later
}

export interface Tutorial {
  title: string;
  intro?: string;
  steps: TutorialStep[];
}

export const TUTORIALS: Record<string, Tutorial> = {
  // ---- My Terminal ----
  my_access: {
    title: 'Turning features on and off',
    intro:
      'Feature Access is where you choose which optional parts of the terminal you want. Investments, Studies, My Terminal and Site Help are included with every account — there is nothing to switch on for those. The two optional ones are both about the trading desk.',
    steps: [
      {
        title: 'Advanced Trading',
        body: 'The trading desk: placing and managing real orders through your own broker, your closed trades and performance, strategy sessions, and the manual trade book. The first time you turn it on you are shown what the desk does and asked to confirm — it places live orders, so nobody should arrive there by accident.',
      },
      {
        title: 'Funded Account',
        body: 'Sits under Advanced Trading, so turn that on first. It tracks a prop-firm challenge: equity against your target and how much daily and overall drawdown you have left. Everything is entered by hand or read off a screenshot, since prop firms do not offer account connections.',
      },
      {
        title: 'Turning something off',
        body: 'Nothing is deleted. The workspace disappears from the sidebar and the terminal stops serving it, but every trade, account and setting stays exactly where it was — switch it back on and it all returns.',
      },
      {
        title: 'Finding it again',
        body: 'A feature you have not turned on still shows in the sidebar, dimmed with a small padlock. Clicking it brings you straight back to this screen.',
      },
    ],
  },
  // ---- Trading ----
  live: {
    title: 'Using the Live Wall',
    intro:
      'The terminal’s one board, at the top of My Terminal, and what the terminal opens on. Tiles draw from every part of the site — charts and quotes, your open and closed trades, your net worth and portfolio, your to-do list, study progress, announcements, and a live news channel — arranged on one screen.',
    steps: [
      {
        title: 'Choose a layout',
        body: 'Three layouts come built in: Markets (charts, quotes, headlines, the calendar), Trading Desk (open trades, the record, desk metrics) and My Terminal (your money, your list, what is new). Pick one from the Layout menu. A layout only ever shows tiles your account actually has, so it never opens with gaps where something you have not turned on would be.',
      },
      {
        title: 'Add a tile',
        body: 'With a Premium membership, turn on Edit layout and use "Add a tile". Tiles are grouped by where their data comes from — Markets, Advanced Trading, My Terminal, Studies, Group. Every tile is listed, including ones your membership does not reach; those carry a star (Premium) or diamond (Max) so you can see what upgrading would add.',
      },
      {
        title: 'Arrange and save',
        body: 'While Edit layout is on, drag a tile by its header and resize it from the bottom-right corner. Most tiles carry their own settings in the header while editing — which news topic, which study game, which funded account, how many rows. Save keeps the arrangement; "Save as new" keeps the current one and stores a copy under a new name.',
      },
      {
        title: 'Positions',
        body: 'With Advanced Trading on, the Positions view beside the board shows every open position your desk holds as full trade cards — planned entry against actual fill, slippage, stop and target, and live open P/L. Slippage is green when the fill beat your plan and amber when it was worse; it only appears once a planned or alert price was recorded.',
      },
      {
        title: 'Hide dollar details',
        body: 'Use "Hide $" — or Privacy mode in the top bar — to mask money figures across the wall when someone might see your screen.',
      },
    ],
  },


  notes: {
    title: 'Trading Notes',
    intro:
      'What you think the market does next, written down before it does — and what you make of it afterwards. Two kinds of entry: a prediction, which owes a verdict, and an observation, which does not.',
    steps: [
      {
        title: 'Make a call',
        body: '“+ Prediction” takes what you think will happen and why. Add an instrument and a direction and the terminal settles it against the market for you on Friday; leave them off and you settle it yourself. A target price is optional — without one, the call is measured against the price when the week opened.',
      },
      {
        title: 'A shared call is fixed',
        body: 'The moment you share a prediction with your group — or the moment its window opens — the call itself can no longer be edited. That is the point of it: a record you can rewrite afterwards is not a record. You can always add or change the reflection underneath.',
      },
      {
        title: 'Nobody sees your call early',
        body: 'A prediction shared with your group stays sealed until its window opens on Monday. Everyone writes without knowing what anyone else said, which is the only way the week means anything.',
      },
      {
        title: 'How sure you are',
        body: 'The 1–5 confidence feeds the calibration table on your record: what you said, against how often you were actually right at that level. The gap between the two is the useful part, and it is a better thing to know than a win percentage.',
      },
      {
        title: 'Calls that could not be settled',
        body: 'If the market could not be priced at the deadline, the call settles as “not settled” with the reason on it, and it is left out of your hit rate entirely. It is never counted as a call you got wrong.',
      },
      {
        title: 'Did you trade it',
        body: 'When a call names an instrument, the screen shows what you actually traded in it that week — and says so plainly if you traded against your own call. Your own trades only; nobody else sees them.',
      },
      {
        title: 'Waiting on you',
        body: 'A prediction past its deadline with no verdict, or a settled one with no reflection, sits in a red panel at the top until you answer it. Your record is yours alone — nobody in your group sees your hit rate.',
      },
    ],
  },

  sessions: {
    title: 'Strategy Sessions',
    intro: 'Your trading windows in Eastern Time — each with a bias and bull/bear playbooks per instrument. Cards regroup themselves as sessions open and close.',
    steps: [
      { title: 'Add a session', body: 'Click “+ New session”, name it (e.g. London Open), set the open/close times (ET) and instrument, pick a bias, and write your bull and bear plans.' },
      { title: 'Live status', body: 'Sessions sort into Active now, Opening soon (within 30 minutes — with a countdown), and Idle, based on the current Eastern-Time clock. The view refreshes itself every minute.' },
      { title: 'Playbooks', body: 'Each card shows your bull and bear plan side by side so you know exactly what you’re looking for when the window opens.' },
      { title: 'Pause, edit, remove', body: 'Pause keeps a session but greys it out and stops it going active; Edit changes any field; × removes it.' },
    ],
  },

  funded: {
    title: 'Manual Trades',
    intro: 'Your own book of accounts, kept entirely by hand — nothing here connects to an outside platform. Add an account, place trades by typing them in or reading them off a screenshot, and track open positions live on the Live Wall, with each account’s balance and Today / This week / 30-day P/L. Capital figures are shown to full traders only.',
    steps: [
      {
        title: 'Add an account',
        body: 'Use “+ Add account” to set one up — give it a name, an optional broker/label, a currency, and a current balance. Everything is self-entered; you keep the balance current yourself.',
      },
      {
        title: 'Place a trade',
        body: 'Add a trade by hand with “+ Trade” (instrument, side, size, entry/exit, P/L), or use “Import from screenshot” to read a batch off a trade-history photo — VTS AI parses the rows, skips duplicates (by time + profit), and sets the balance if it’s shown.',
      },
      {
        title: 'Track an open position live',
        body: '“Track live trade” reads an open position off a screenshot and posts it to the Live Wall, marked against the desk’s OANDA price — while staying off the Trade Log and Live Brokers totals. Close it later from its result screenshot and it lands in the account’s logged P/L.',
      },
      {
        title: 'Hide dollar details',
        body: 'Use “Hide $” or Privacy mode to mask every figure on the page at once.',
      },
    ],
  },

  prop: {
    title: 'Funded',
    intro: 'A private prop-firm challenge dashboard — equity vs. target plus daily / max drawdown buffers. This section is only visible to accounts an admin has granted the Funded role; it never appears in the demo or to the public. Hand-logged trades live on the separate Manual Trades tab.',
    steps: [
      {
        title: 'Set up the challenge',
        body: 'Click Edit to set account size, profit target %, and daily / max drawdown %. The card shows equity, progress to target, and two drawdown gauges; the status pill flips to Breached or Target Reached.',
      },
      {
        title: 'Keep equity current',
        body: 'No API here — type your equity, or use “Update balance from a screenshot”: upload or paste (⌘/Ctrl+V) a screenshot of your account and VTS AI reads the balance and sets your equity. You can also pull equity from the Trade Log.',
      },
      {
        title: 'Who can see it',
        body: 'An admin grants the Funded role per account under Admin → Users. Without it, the section is hidden from the sidebar entirely.',
      },
      {
        title: 'Hide dollar details',
        body: 'Use “Hide $” or Privacy mode to mask every figure on the page at once. Percentages and drawdown buffers still show.',
      },
    ],
  },

  metrics: {
    title: 'Live Brokers',
    intro: 'Your live broker capital, pulled from the broker API so it updates as trades are placed. Capital figures are shown to full traders only; hand-kept accounts live on the Manual Trades tab.',
    steps: [
      {
        title: 'Live brokers (OANDA)',
        body: 'Your OANDA capital (NAV, balance, open P/L) is pulled live from the API, so it updates as trades are placed — with Today / This week / 30-day P/L from your closed trades (deposits don’t count).',
      },
      {
        title: 'Connect a broker',
        body: 'No broker connected yet? Connect an OANDA account from Admin → Broker connections and your live capital will appear here automatically.',
      },
      {
        title: 'Hide dollar details',
        body: 'Use “Hide $” or Privacy mode to mask every figure on the page at once.',
      },
    ],
  },

  news: {
    title: 'Market News',
    intro: 'A shared desk feed — market and geopolitical headlines with impact and bias tags, plus an economic calendar in Eastern Time. Everyone on the trading desk sees the same feed.',
    steps: [
      {
        title: 'Post a headline',
        body: 'Click “+ Headline”, write the headline (and optional detail, source, and link), then tag it with a category, impact level, and market bias. Read-only viewers can see the feed but can’t post.',
      },
      {
        title: 'Read the tags',
        body: 'Each headline shows its category, impact (High/Med/Low — the colored left edge), bias (Bullish/Bearish/Neutral), and how long ago it was posted. Click “Source ↗” to open the original link.',
      },
      {
        title: 'Economic calendar',
        body: 'Click “+ Calendar event” to add a release (e.g. CPI, FOMC). Enter the time in your local zone and it’s shown to everyone in Eastern Time, grouped by day, with forecast/previous/actual figures and an impact dot.',
      },
      {
        title: 'VTS AI desk brief',
        body: 'Click “✨ Brief me” for a quick VTS AI read on the current headlines — overall risk tone and what to watch. Nothing is stored; it just summarizes what’s on the board.',
      },
    ],
  },

  history: {
    title: 'Trade History',
    intro: 'Closed trades, recorded automatically. When an open position on the Live Wall closes (the broker stops reporting it), it’s moved here with its last-seen exit price and P/L.',
    steps: [
      {
        title: 'Automatic',
        body: 'You don’t add anything here — keep the Live Wall open and closures are captured as they happen. Exit price and P/L are the last values seen while the trade was open.',
      },
      {
        title: 'Read your results',
        body: 'The cards show closed-trade count, win rate, and total realized P/L. The “By Strategy” and “By Instrument” panels break those down so you can see what’s working.',
      },
      {
        title: 'Closed trades',
        body: 'The table lists each closed trade with its instrument, direction, entry → exit, strategy, realized P/L, and close date — newest first.',
      },
      {
        title: 'Hide dollar details',
        body: 'Use “Hide $” or Privacy mode to mask P/L during a screen-share. P/L is only shown if your account has the brokerage-view permission.',
      },
    ],
  },

  tradedesk: {
    title: 'Live Trades',
    intro: 'Where you place a trade. The ticket on the left sends the order to your own connected broker account; the panel beside it shows every position your group currently has open, so you size a trade knowing what the desk already holds.',
    steps: [
      {
        title: 'Connect your account',
        body: 'The desk trades through your own OANDA account. Open Connections, add your API token and account ID, and pick practice or live. Your key is encrypted on the server — the browser never sees it. Every account you have connected appears as a card at the top with its live balance, and the one you pick is the one that gets the order.',
      },
      {
        title: 'Build the ticket',
        body: 'Pick the instrument, then Buy or Sell. Market fills now; Limit and Stop rest on the book until price reaches your level. Type the size in units, or set a stop and use “Size from risk” — enter the amount you are willing to lose and it works the size out from your stop distance.',
      },
      {
        title: 'Read the money before you send',
        body: 'The stop and target boxes show what they are worth in your account currency and in pips, priced from the live quote rather than assumed to be dollars. Under them, the position value, an estimated margin against what you have free, and the risk/reward as an R multiple.',
      },
      {
        title: 'Review, then confirm',
        body: 'The first click never sends the order — it opens a review panel that states the trade in one sentence with the amount at risk. A live account says so in red and names the account. The second click sends it.',
      },
      {
        title: 'The desk’s open book',
        body: 'Every position across your group, yours and everyone else’s, with entry, current price and open P/L. Click any instrument to load it into the ticket. Your own positions carry Close and Stop/Target controls; everyone else’s are watch-only — the desk never trades someone else’s account.',
      },
      {
        title: 'Working orders and the journal',
        body: 'Resting limit and stop orders are listed with a Cancel button. Below them, “Sent orders” is the record of everything the desk sent — including the ones the broker refused, with its reason, which is the only place a rejected order shows up at all.',
      },
    ],
  },

  desk: {
    title: 'Closed Trades & Metrics',
    intro: 'Reviewing what has already been traded: every closed trade, what it scored, and the capital in the accounts behind it — all on one page. (Placing a trade, and watching what is open, is Live Trades above.)',
    steps: [
      {
        title: 'The record',
        body: 'Every trade — planned vs. actual entry, slippage, and realized P/L, with a per-trader filter and Deck / Tape layouts. Click “+ Log a trade” to add one; trades from a connected broker show up automatically.',
      },
      {
        title: 'Metrics and breakdowns',
        body: 'Win rate, profit factor, gross profit and loss, and your deposited, withdrawn and total capital, over whatever the current filters select. “By Strategy” and “By Instrument” break the same trades down so you can see what is working.',
      },
      {
        title: 'Live Brokers',
        body: 'At the bottom of the page: your live broker capital (OANDA NAV, balance, open P/L), pulled from the broker API so it updates as trades are placed, with Today / This week / 30-day P/L.',
      },
      {
        title: 'Hide dollar details',
        body: 'The page has a “Hide $” toggle, and Privacy mode masks every figure at once — handy on a screen-share.',
      },
    ],
  },

  log: {
    title: 'Using the Trade Log',
    intro: 'Your record of every trade — planned vs. actual entry, slippage, and realized P/L. New accounts start empty; log trades as you take them. Each log is private to your login.',
    steps: [
      {
        title: 'Log a trade',
        body: 'Click "+ Log a trade", then enter at least an instrument and entry price. Add the planned (alert) entry, exit, TP/SL, size, realized P/L, strategy, timeframe, and date as you have them. Set status to Open for a position still running.',
      },
      {
        title: 'Slippage',
        body: 'When you record a planned entry, the log computes slippage (your actual fill minus the plan) and colors it green when the fill beat your plan, amber when it was worse. The summary shows your average slippage across all trades.',
      },
      {
        title: 'Deck vs. Tape',
        body: 'Use the Deck / Tape switch at the top right. Deck shows full trade cards; Tape is a dense, scannable row view of the same trades.',
      },
      {
        title: 'Win rate and P/L',
        body: 'The summary cards show your trade count, win rate over closed trades, total realized P/L, and average slippage. P/L is only visible if your account has the "view brokerage" permission.',
      },
      {
        title: 'Edit, remove, undo',
        body: 'In Deck view click Edit on a card to change a trade inline, or × to remove it. A short Undo bar lets you restore a removed trade. Use "Hide $" or Privacy mode to mask P/L during a screen-share.',
      },
    ],
  },

  td_trading: {
    title: 'Trading To-Do',
    intro: 'Your trading tasks and reminders, shared with your group.',
    steps: [
      {
        title: 'Add a trading task',
        body: 'Type a task in the box and click Add. It is filed under Vitalis Trading.',
      },
      {
        title: 'Shared with your group',
        body: 'These tasks are the shared Vitalis Trading list, so anything you add here is visible to your group.',
      },
      {
        title: 'Check things off',
        body: 'Tick the checkbox to complete a task. Completed tasks get a line through them; click the × to remove one, with a short Undo bar to restore it.',
      },
    ],
  },

  // ---- Studies ----
  st_game: {
    title: 'Study Game',
    intro: 'Pick one of your study games to play — answer questions, level up as you go, and climb the leaderboard.',
    steps: [
      {
        title: 'Pick a game to play',
        body: 'The Study Game section lists your study games (built in Study Creation). Tap Play on one to start; use “‹ All study games” to come back and switch games.',
      },
      {
        title: 'Answer the question',
        body: 'Click an option to highlight it, then Confirm to submit. When the answer is revealed the correct choice is highlighted, with a short explanation when the author included one. “I Don’t Know” reveals the answer and counts as incorrect.',
      },
      {
        title: 'Settings',
        body: '“⚙ Settings” on the Progress card is where the game is set up: Practice mode (answers reveal and explain but don’t count towards your score, level, streak, or the leaderboard), Rapid fire, Reset, and what the progress bars measure against.',
      },
      {
        title: 'Rapid fire',
        body: 'Switch “Rapid fire” on in Settings to study hands-free: pressing an option submits it straight away — no Confirm step — and the next question is drawn once the answer has been on screen for the number of seconds set beneath the toggle. There is no clock on choosing your answer; the timer only ever covers how long the result is shown. “Stay on this” stops the countdown on that answer, and it also stops on its own if you open the tutor, start fixing the question, or leave the tab.',
      },
      {
        title: 'Watch your score',
        body: 'Your score is your lifetime accuracy on that game — every correct answer divided by every question attempted — with the change from the previous question.',
      },
      {
        title: 'Level up',
        body: 'One level ladder spans the whole game: 12 themed levels (🥚 Egg → 💎 Diamond), each with five star sub-levels that shade the level colour from dark to light. Answer correctly to climb; a run of correct answers adds a streak multiplier.',
      },
      {
        title: 'Leaderboard & reset',
        body: 'Flip to the Leaderboard tab to see how you stack up. “Reset”, in Settings, banks your current run to the leaderboard as a past run, then clears your level and score to start fresh — your best level ever reached is kept.',
      },
    ],
  },
  st_test: {
    title: 'Practice Tests',
    intro: 'Sit a graded practice test drawn from one of your study games.',
    steps: [
      {
        title: 'Pick a game and set it up',
        body: 'Choose a game, then set how many questions to draw and the pass line (default 72%). Choose “feedback as you go” to see each answer, or leave it off for a silent exam graded at the end.',
      },
      {
        title: 'Leaving part-way through',
        body: 'A test you leave part-way through is kept. Come back to Practice Tests and you are offered “Continue where I left off”, which picks up the same paper on the same question with your answers intact — or discard it and start a fresh one. The one case it cannot be resumed is when the game’s questions have changed since you started, which would make it a different test; it says so.',
      },
      {
        title: 'Your result',
        body: 'At the end you get a score, a pass/fail against your pass line, and a per-topic breakdown so you can see which areas need more work. Take another anytime.',
      },
    ],
  },
  st_progress: {
    title: 'Progress',
    intro: 'A snapshot of how you are doing on any of your study games.',
    steps: [
      {
        title: 'Pick a game',
        body: 'Choose a game to see your progress on it: your current level, your best level ever reached, and your lifetime accuracy.',
      },
      {
        title: 'Accuracy by topic',
        body: 'Each of the game’s topics shows how many questions you have answered there and your recent accuracy — so you can see where to focus.',
      },
    ],
  },

  // ---- Admin ----
  admin: {
    title: 'Managing users',
    intro: 'Create accounts for other people and manage their access — all from here.',
    steps: [
      {
        title: 'Add a user',
        body: 'Fill in the display name, username, and role, then set a temporary password (use Generate for a random one) and click "Create user".',
      },
      {
        title: 'Share the temporary password',
        body: 'Give the new person their username and the temporary password. They will be required to set their own password the first time they sign in.',
      },
      {
        title: 'Choose the right role',
        body: 'Every signed-in user is a Member with full access to Trading, Studies, My Terminal, and Site Help. Add Admin for user and group management, and Funded to reveal the private prop-challenge section in Trading. Founder / Software Developer (Developer Terminal) are granted only by the owner.',
      },
      {
        title: 'Manage existing users',
        body: 'From each row you can change a role, reset a password, or deactivate / reactivate an account. Deactivating or resetting a password signs that user out everywhere.',
      },
      {
        title: 'Delete an account',
        body: 'Click "Delete", then "Confirm delete", to permanently remove an account and all of its data (to-dos, trades, studies progress, and more). This cannot be undone — use Deactivate instead if you only need to suspend access. You cannot delete your own account or the last remaining admin.',
      },
      {
        title: 'Renamed accounts',
        body: 'If a user changes their own username, the row still shows the username the account was created with ("created as @…") so you can always recognize it.',
      },
    ],
  },
};

// Shown for any screen that doesn't have its own tutorial yet.
export const DEFAULT_TUTORIAL: Tutorial = {
  title: 'About this section',
  steps: [
    {
      title: 'Getting around',
      body: 'The header on the page describes what this section does. Use the sections list to move between the areas of this workspace.',
    },
    {
      title: 'Switch workspaces',
      body: 'Use the workspace switcher in the top bar to move between Trading, Studies, and the other areas you have access to.',
    },
  ],
};

export function tutorialFor(screen: string): Tutorial {
  return TUTORIALS[screen] ?? DEFAULT_TUTORIAL;
}

// The curated set of screens shown in Site Help ▸ How to and offered in the
// admin Site Wording editor. Shared so both stay in sync.
// Labels here mirror the section labels in theme/nav.ts (the source of truth)
// so the same section reads the same everywhere.
export const HOWTO_TOPICS: { key: string; label: string }[] = [
  // The screen was renamed to Premium Features; the key stayed `my_access` so
  // saved sidebar orders and in-app links keep working.
  { key: 'my_access', label: 'Premium Features' },
  { key: 'live', label: 'Live Wall' },
  { key: 'tradedesk', label: 'Live Trades' },
  { key: 'desk', label: 'Closed Trades & Metrics' },
  { key: 'notes', label: 'Trading Notes' },
  { key: 'sessions', label: 'Strategy Sessions' },
  { key: 'funded', label: 'Manual Trades' },
  { key: 'news', label: 'Market News' },
  { key: 'td_trading', label: 'To Do' },
  { key: 'st_game', label: 'Study Game' },
];

// Parse an admin override (stored JSON) into a Tutorial, keeping only the fields
// we render. Returns null when the JSON is missing/invalid so callers fall back
// to the bundled default.
export function parseHowtoOverride(json: string | undefined | null): Tutorial | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<Tutorial>;
    if (!raw || typeof raw.title !== 'string') return null;
    const steps = Array.isArray(raw.steps)
      ? raw.steps
          .filter((s): s is TutorialStep => !!s && typeof s.title === 'string' && typeof s.body === 'string')
          .map((s) => ({ title: s.title, body: s.body }))
      : [];
    return { title: raw.title, intro: typeof raw.intro === 'string' ? raw.intro : undefined, steps };
  } catch {
    return null;
  }
}

export function serializeTutorial(t: Tutorial): string {
  return JSON.stringify({ title: t.title, intro: t.intro ?? '', steps: t.steps.map((s) => ({ title: s.title, body: s.body })) });
}

// The effective How-to for a screen: an admin override if present, else the
// bundled default.
export function mergedTutorial(screen: string, overrides: Record<string, string>): Tutorial {
  return parseHowtoOverride(overrides[screen]) ?? tutorialFor(screen);
}
