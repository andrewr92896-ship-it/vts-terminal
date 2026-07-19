// Per-page tutorials shown by the "?" help button on each section. Text-only
// steps for now; each step has an optional `image` slot so screenshots can be
// dropped in later (e.g. under /public/tutorials/) without changing this shape.
// Keyed by screen key (see theme/themes.ts TABS and DEFAULT_SCREEN).

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
  // ---- Trading ----
  live: {
    title: 'Using the Live Wall',
    intro: 'Your open positions across every connected broker, normalized into one feed — planned entry vs. actual fill, slippage, take-profit/stop-loss, and open P/L. The wall refreshes itself every 30 seconds.',
    steps: [
      {
        title: 'Connect your brokers',
        body: 'The strip near the top shows each broker (FTP, OANDA, Kraken, TradeStation) and whether it is connected. Until API keys are added, the wall shows clearly-labeled sample trades so you can see the layout. Once a broker is connected, its real open positions stream in.',
      },
      {
        title: 'Read a trade card',
        body: 'Each card shows the instrument and direction (LONG/SHORT), the planned entry → actual fill with slippage, take-profit and stop-loss, position size, and the strategy/timeframe. Cards are colored green for longs and red for shorts.',
      },
      {
        title: 'Slippage',
        body: 'Slippage is the actual fill minus the price you planned to enter at. It is green when the fill beat your plan and amber when it was worse. It only shows once a planned/alert price is recorded for the trade.',
      },
      {
        title: 'Open P/L and balances',
        body: 'The footer of each card shows live open profit or loss. This is only visible if your account has the "view brokerage" permission; otherwise it reads "P/L hidden".',
      },
      {
        title: 'Hide dollar details',
        body: 'Click "Hide $" — or turn on Privacy mode in the top bar — to mask P/L figures when someone might see your screen. Use "Refresh" to pull the latest positions immediately.',
      },
    ],
  },

  alerts: {
    title: 'Using Alerts',
    intro: 'TradingView alerts arrive here automatically by webhook (the prop/FTP trades that have no broker API). Paste a chart screenshot and VTS AI analyzes the trade and logs it for you.',
    steps: [
      {
        title: 'Connect TradingView',
        body: 'In a TradingView alert, set the Webhook URL to https://vitalistradingsystems.com/api/webhooks/tradingview and put your shared secret plus the trade fields in the alert message (JSON). New alerts show up at the top of this list. Webhooks require a paid TradingView plan.',
      },
      {
        title: 'Paste a screenshot',
        body: 'On a new alert, paste a chart screenshot (Ctrl/Cmd-V) into the drop area, or use Upload. A preview appears so you can confirm it before analyzing.',
      },
      {
        title: 'Analyze with VTS AI',
        body: 'Click “Analyze with VTS AI”. VTS AI reads the chart against the alert and reports the fill vs. planned price, slippage, setup quality, risk, and a verdict.',
      },
      {
        title: 'It lands in your Trade Log',
        body: 'Each analyzed alert automatically creates a Trade Log entry (planned entry from the alert; fill, exit, and notes from the analysis). Use “View in Trade Log” to open it.',
      },
      {
        title: 'Dismiss',
        body: 'Use Dismiss to clear an alert you don’t want to log.',
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

  desk: {
    title: 'The Trade Desk',
    intro: 'The Trade Log, Live Brokers, and History views in one place. Use the switch at the top to move between them — logging and reviewing trades, and your live broker capital, all under one tab.',
    steps: [
      {
        title: 'Trade Log',
        body: 'Your record of every trade — planned vs. actual entry, slippage, and realized P/L, with a per-trader filter and Deck / Tape layouts. Click “+ Log a trade” to add one; trades from a connected broker show up automatically.',
      },
      {
        title: 'Live Brokers',
        body: 'Your live broker capital (OANDA NAV, balance, open P/L), pulled from the broker API so it updates as trades are placed, with Today / This week / 30-day P/L. Shown to full traders only.',
      },
      {
        title: 'History',
        body: 'Closed trades across your team, recorded automatically when a Live Wall position closes, with “By Strategy” and “By Instrument” breakdowns so you can see what’s working.',
      },
      {
        title: 'Hide dollar details',
        body: 'Each view has a “Hide $” toggle, and Privacy mode masks every figure at once — handy on a screen-share.',
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
    intro: 'Your trading tasks and reminders, shared with your team.',
    steps: [
      {
        title: 'Add a trading task',
        body: 'Type a task in the box and click Add. It is filed under Vitalis Trading.',
      },
      {
        title: 'Shared with your team',
        body: 'These tasks are the shared Vitalis Trading list, so anything you add here is visible to your team.',
      },
      {
        title: 'Check things off',
        body: 'Tick the checkbox to complete a task. Completed tasks get a line through them; click the × to remove one, with a short Undo bar to restore it.',
      },
    ],
  },

  // ---- Studies ----
  st_home: {
    title: 'Study Hub',
    intro: 'Your study home. Everything here is built by your team in Study Creation — study games, flashcard sets, and study guides — and studied from their own sections.',
    steps: [
      {
        title: 'Build, then study',
        body: 'Start in Study Creation to make a study game, a flashcard set, or a guide. Then use the Study Game, Test Mode, and Progress sections to play, test, and track any game your team built.',
      },
      {
        title: 'Your progress is saved',
        body: 'Your level and accuracy for each game are saved to your account, so you can close the tab and pick up where you left off — on any device.',
      },
    ],
  },
  st_game: {
    title: 'Study Game',
    intro: 'Pick one of your team’s study games to play — answer questions, level up as you go, and climb your team’s leaderboard.',
    steps: [
      {
        title: 'Pick a game to play',
        body: 'The Study Game section lists your team’s study games (built in Study Creation). Tap Play on one to start; use “‹ All study games” to come back and switch games.',
      },
      {
        title: 'Answer the question',
        body: 'Click an option to highlight it, then Confirm to submit. When the answer is revealed the correct choice is highlighted, with a short explanation when the author included one. “I Don’t Know” reveals the answer and counts as incorrect.',
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
        body: 'Flip to the Leaderboard tab to see how your team stacks up. “Reset” banks your current run to the leaderboard as a past run, then clears your level and score to start fresh — your best level ever reached is kept.',
      },
    ],
  },
  st_test: {
    title: 'Practice Tests',
    intro: 'Sit a graded practice test drawn from one of your team’s study games.',
    steps: [
      {
        title: 'Pick a game and set it up',
        body: 'Choose a game, then set how many questions to draw and the pass line (default 72%). Choose “feedback as you go” to see each answer, or leave it off for a silent exam graded at the end.',
      },
      {
        title: 'Your result',
        body: 'At the end you get a score, a pass/fail against your pass line, and a per-topic breakdown so you can see which areas need more work. Take another anytime.',
      },
    ],
  },
  st_progress: {
    title: 'Progress',
    intro: 'A snapshot of how you are doing on any of your team’s study games.',
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
        body: 'Admin = everything (including this screen). Trader = Trading workspace + to-do. Viewer = read-only.',
      },
      {
        title: 'Manage existing users',
        body: 'From each row you can change a role, reset a password, or deactivate / reactivate an account. Deactivating or resetting a password signs that user out everywhere.',
      },
      {
        title: 'Delete an account',
        body: 'Click "Delete", then "Confirm delete", to permanently remove an account and all of its data (to-dos, clients). This cannot be undone — use Deactivate instead if you only need to suspend access. You cannot delete your own account or the last remaining admin.',
      },
      {
        title: 'Renamed accounts',
        body: 'If a user changes their own username, the row still shows the username the account was created with ("created as @…") so you can always recognize it.',
      },
    ],
  },
};

// Shown for screens without a specific tutorial yet (e.g. Trading/Studies
// placeholders).
export const DEFAULT_TUTORIAL: Tutorial = {
  title: 'About this section',
  steps: [
    {
      title: 'Not built yet',
      body: 'This section is a placeholder for a later stage. The card on the page describes what it will do once its data is connected.',
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
export const HOWTO_TOPICS: { key: string; label: string }[] = [
  { key: 'live', label: 'Live Wall' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'desk', label: 'Trade Desk' },
  { key: 'sessions', label: 'Strategy Sessions' },
  { key: 'funded', label: 'Manual Trades' },
  { key: 'news', label: 'Market News' },
  { key: 'td_trading', label: 'Trading To-Do' },
  { key: 'st_game', label: 'Study Game' },
  { key: 'st_home', label: 'Study Hub' },
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
