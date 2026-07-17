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
    intro: 'TradingView alerts arrive here automatically by webhook (the prop/FTP trades that have no broker API). Paste a chart screenshot and Claude (Opus 4.8) analyzes the trade and logs it for you.',
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
        title: 'Analyze with Claude',
        body: 'Click “Analyze with Opus 4.8”. Claude reads the chart against the alert and reports the fill vs. planned price, slippage, setup quality, risk, and a verdict.',
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
        body: 'Add a trade by hand with “+ Trade” (instrument, side, size, entry/exit, P/L), or use “Import from screenshot” to read a batch off a trade-history photo — Claude parses the rows, skips duplicates (by time + profit), and sets the balance if it’s shown.',
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
        body: 'No API here — type your equity, or use “Update balance from a screenshot”: upload or paste (⌘/Ctrl+V) a screenshot of your account and Claude reads the balance and sets your equity. You can also pull equity from the Trade Log.',
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
        title: 'Claude desk brief',
        body: 'Click “✨ Brief me” for a quick Claude (Sonnet) read on the current headlines — overall risk tone and what to watch. Nothing is stored; it just summarizes what’s on the board.',
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
        body: 'Closed trades across the desk, recorded automatically when a Live Wall position closes, with “By Strategy” and “By Instrument” breakdowns so you can see what’s working.',
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
    intro: 'Your trading tasks and reminders — a focused view of the trading parts of your full To Do List.',
    steps: [
      {
        title: 'Add a trading task',
        body: 'Type a task in the box and click Add. It is filed under Vitalis Trading.',
      },
      {
        title: 'Shared with your To Do List',
        body: 'These tasks also appear in the full To Do List workspace, so anything you add here shows up there too.',
      },
      {
        title: 'Check things off',
        body: 'Tick the checkbox to complete a task. Completed tasks get a line through them; click the × to remove one, with a short Undo bar to restore it.',
      },
    ],
  },

  // ---- To Do List ----
  td_all: {
    title: 'Using your To Do List',
    intro: 'Your personal list, organized into numbered categories. New accounts start with empty categories — add your own tasks.',
    steps: [
      {
        title: 'Add a task',
        body: 'In the "Add a task" box, choose a category from the dropdown, type your task, and press Enter or click Add. New tasks appear at the top of their category.',
      },
      {
        title: 'Add a section',
        body: 'Use the "Add a section" box to create your own category. Type a name, pick a type — Checklist (tickable tasks), Daily routine (resets each day), or Notes (bullet points) — and click Add. It appears at the end of your list, ready for tasks.',
      },
      {
        title: 'Reorder tasks',
        body: 'Use the ▲ / ▼ arrows on the right of a task to move it up or down within its category. You can also tell the command bar things like "move 1.2 to the top" or "move 3.1 up 2".',
      },
      {
        title: 'Check things off',
        body: 'Click the square checkbox to mark a task done. Completed tasks get a line through them and float to the top of the section.',
      },
      {
        title: 'Recurring tasks',
        body: 'Tasks in Weekly / Monthly (and similar) categories show a timer like "+3 days", "due today", or an overdue count. When you complete one, it automatically schedules the next cycle.',
      },
      {
        title: 'Daily Routine resets each day',
        body: 'Daily Routine items are checkboxes you tick as you do them; they automatically uncheck at the start of the next day so the list is fresh each morning.',
      },
      {
        title: 'Remove a task',
        body: 'Click the × on the right side of any task to delete it.',
      },
      {
        title: 'Undo',
        body: 'When you remove a task or check one off, a short Undo bar appears at the bottom. Click Undo to put it back or restore the prior checked state.',
      },
      {
        title: 'Ask Claude / command',
        body: 'Type a plain-English instruction in the "Ask Claude / command" box and click Run. Claude (Sonnet) updates the list for you — e.g. "add to Finance: pay rent", "new section Garden", "move 1.2 to top", "done 1.2", "remove 3.1", or several at once separated by "·". It shows what it changed and skips anything it can\'t match.',
      },
      {
        title: 'Life Changes',
        body: 'Use the "Show Life Changes / Hide Life Changes" button at the top right to reveal or hide reflective note sections, which are kept separate from your checkable tasks.',
      },
    ],
  },

  // ---- Studies (Series 65) ----
  st_home: {
    title: 'Study Hub',
    intro: 'Your study home. Series 65 is the first track — the rest of the tabs (Practice Quiz, Flashcards, Progress) all work from it.',
    steps: [
      {
        title: 'Open a subject',
        body: 'The Series 65 card shows how many questions and flashcards are loaded. Use its buttons to jump straight into the quiz, flashcards, or your progress.',
      },
      {
        title: 'Your progress is saved',
        body: 'Quiz accuracy is stored on this device per login, so you can close the tab and pick up where you left off.',
      },
    ],
  },
  st_game: {
    title: 'Study Game',
    intro: 'A gamified Series 65 self-quiz: answer questions, level up as you go, and track your score against the passing line.',
    steps: [
      {
        title: 'Pick a category (or Mix)',
        body: 'Use the chips at the top to drill one area, or choose “Mix (weighted)” to get questions across all four areas in the same proportions as the real exam.',
      },
      {
        title: 'Build your own subsection',
        body: 'Want to drill something narrower, like Bonds or Compliance? Click “✦ New subsection”, type a topic name, and Claude scans the whole question bank and gathers every question that fits into its own chip. Delete a subsection anytime with the × on its chip.',
      },
      {
        title: 'Practice mode (no scoring)',
        body: 'Flip on “Practice mode” to answer freely without touching your score, levels, or lifetime totals — ideal for grinding a specific subsection. Turn it off to have answers count again. (Starred review is always practice-only.)',
      },
      {
        title: 'Answer the question',
        body: 'Answering takes two steps: click an option to highlight it, then click Confirm (or press Enter/Space) to submit. Nothing is scored until you confirm, so you can change your pick first. On the keyboard, A–D select and Enter/Space confirm. When the answer is revealed the correct choice is highlighted, with a quick definition when available.',
      },
      {
        title: 'Undo a slip',
        body: 'Misclicked or want a mulligan? The ↩ Undo button reverts your last answer — it restores your score and stats and re-presents that question. It can be used once every 10 questions, then greys out until 10 more have elapsed.',
      },
      {
        title: 'Watch your score',
        body: 'Your score is your lifetime accuracy — every correct answer divided by every question attempted, to one decimal — with the change from the previous question. The bar marks the ~72% pass line and the status shows how many points you are above or below it.',
      },
      {
        title: 'Level up',
        body: 'One level ladder spans every category: 12 themed levels (🥚 Egg → 💎 Diamond), each with five star sub-levels ★☆☆☆☆ → ★★★★★ that shade the level colour from dark to light. Every 10 correct answers is one sub-level up; clearing the fifth advances to the next level’s emoji and colour.',
      },
      {
        title: 'Flashcards',
        body: 'Flip the Quiz / Flashcards switch at the top right to study the Series 65 vocabulary deck — filter by topic, tap a card to reveal the definition, or turn on auto-rotate (term 10s / definition 20s).',
      },
      {
        title: 'Reset (and bank your run)',
        body: 'Tap “I Don’t Know” to reveal the answer and move on (it counts as incorrect). “Reset progress” saves the run you just played to the leaderboard as a past run — then clears your levels and score to start fresh. The highest level you have ever reached is kept, shown as a “Best reached” badge.',
      },
    ],
  },
  st_progress: {
    title: 'Progress',
    intro: 'A snapshot of how you are doing in the Series 65 Study Game.',
    steps: [
      {
        title: 'Overall score',
        body: 'The top figure is your lifetime accuracy — correct answers divided by questions attempted — with PASSING / NOT PASSING relative to the ~72% line.',
      },
      {
        title: 'Level and accuracy',
        body: 'Your overall level (one ladder across all categories, advancing every 10 correct answers) sits up top, and each exam area shows how many questions you have answered there and your accuracy — so you can see which areas need more work.',
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
      body: 'Use the workspace switcher in the top bar to move between To Do List, Trading, and the other areas you have access to.',
    },
  ],
};

export function tutorialFor(screen: string): Tutorial {
  return TUTORIALS[screen] ?? DEFAULT_TUTORIAL;
}
