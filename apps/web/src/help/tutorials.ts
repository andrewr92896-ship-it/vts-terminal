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
  // ---- Personal Finance ----
  fin_overview: {
    title: 'Personal Finance',
    intro: 'Your take-home this month across every job and business — car sales commission, real-broker trading, and Funded Trading Plus (scaled) — minus your bills.',
    steps: [
      {
        title: 'Earnings this month',
        body: 'The top card adds up your earnings (Kia commission + real broker trading P/L + scaled FTP), subtracts your expenses, and shows what’s left after bills, with a “bills covered” bar.',
      },
      {
        title: 'FTP is scaled',
        body: 'Funded Trading Plus is a simulation, so its P/L is scaled into real take-home. Use the Testing / Funded toggle: Testing divides P/L by 18; Funded pays out 80%. Both numbers are editable next to the toggle.',
      },
      {
        title: 'Sources',
        body: 'The Earnings sources panel breaks the total down. Car sales pulls from your Kia tracker; trading uses your closed trades this month.',
      },
      {
        title: 'Expenses & Net Worth',
        body: 'Add your bills on the Expenses tab (each with the day it leaves your bank), and list your accounts/debts on the Net Worth tab — both feed back into this overview.',
      },
    ],
  },
  fin_expenses: {
    title: 'Expenses',
    intro: 'Your recurring monthly bills. Each has the day of the month it comes out of your bank account.',
    steps: [
      { title: 'Add a bill', body: 'Enter a label, amount, and the bank day (1–31), plus an optional category, then click Add.' },
      { title: 'Paid vs upcoming', body: 'Bills whose day has already passed this month show as “paid”; the rest are “upcoming”. The summary tracks how much has gone out so far.' },
      { title: 'Pause or edit', body: 'Use Pause to keep a bill but exclude it from the totals (e.g. a cancelled subscription), or Edit to change details. × removes it.' },
    ],
  },
  fin_networth: {
    title: 'Net Worth',
    intro: 'A running net-worth figure — your assets minus your liabilities.',
    steps: [
      { title: 'Add accounts & assets', body: 'List each account, asset, or debt with its current value, marking it Asset or Liability.' },
      { title: 'Your total', body: 'The top shows assets minus liabilities. Liabilities are shown in parentheses and subtract from the total, which also appears on the Overview tab.' },
    ],
  },

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

  metrics: {
    title: 'Account Metrics',
    intro: 'Your funded-account (prop) challenge dashboard — equity vs. profit target, plus daily and max drawdown limits. FTP has no API, so you keep equity current (or pull it from your Trade Log).',
    steps: [
      {
        title: 'Set up the challenge',
        body: 'Click Edit and enter your account size, profit target %, daily drawdown %, and max drawdown % (trailing or static). Defaults match a typical $200K / 10% / 4% / 6% trailing challenge.',
      },
      {
        title: 'Keep equity current',
        body: 'Type your current equity from your prop dashboard, or click “Pull equity from Trade Log” to set it to account size + realized P/L of your closed trades since the start date.',
      },
      {
        title: 'Progress to target',
        body: 'The top card shows equity, profit, and a bar toward your profit target, with how much is left to reach it.',
      },
      {
        title: 'Drawdown buffers',
        body: 'The two gauges show how much room you have before breaching the max drawdown (trailing from your peak equity) and the daily drawdown (from the day-start equity — reset it each trading day). The status pill flips to Breached if you cross a floor, or Target Reached when you hit the goal.',
      },
      {
        title: 'Hide dollar details',
        body: 'Use “Hide $” or Privacy mode to mask figures. Dollar amounts only show if your account has the brokerage-view permission; percentages always show.',
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
        title: 'Check things off',
        body: 'Click the square checkbox to mark a task done. Completed tasks get a line through them and float to the top of the section.',
      },
      {
        title: 'Recurring tasks',
        body: 'Tasks in Weekly / Monthly (and similar) categories show a timer like "+3 days", "due today", or an overdue count. When you complete one, it automatically schedules the next cycle.',
      },
      {
        title: 'Remove a task',
        body: 'Click the × on the right side of any task to delete it.',
      },
      {
        title: 'Life Changes',
        body: 'Use the "Show Life Changes / Hide Life Changes" button at the top right to reveal or hide reflective note sections, which are kept separate from your checkable tasks.',
      },
    ],
  },

  // ---- Kia Sales ----
  kia_dash: {
    title: 'Using the Sales Dashboard',
    intro: 'Track your month: deals, pace to goal, commission, and Google reviews — all updated automatically as you log deals.',
    steps: [
      {
        title: 'Log a deal',
        body: 'In "Log a deal", enter the customer (optional), model, New/Used, profit in dollars, and the sale date, then click "Add deal". It appears in Recent Deals and updates every metric.',
      },
      {
        title: 'Read your KPIs',
        body: 'The cards across the top show units sold, projected pace, days left in the month, total profit, estimated commission, and your review percentage.',
      },
      {
        title: 'Set your goal and reviews',
        body: 'Use the +/- steppers on "Monthly Unit Goal" and "Google Reviews" to set your target units and how many reviews you have. Reviews need to stay at 50%+ to unlock the unit bonus.',
      },
      {
        title: 'Hide dollar details',
        body: 'Click "Hide $ details" to mask profit and commission figures when someone might see your screen. Click again to show them.',
      },
      {
        title: 'Remove a deal',
        body: 'Click the × on any row in Recent Deals to remove that deal; the metrics recalculate instantly.',
      },
    ],
  },
  kia_news: {
    title: 'Kia News',
    intro: 'Product, incentive, and corporate headlines relevant to the floor.',
    steps: [
      {
        title: 'Browse headlines',
        body: 'Each card shows a topic tag, the source, and how long ago it was posted, with a short summary.',
      },
      {
        title: 'Sample feed for now',
        body: 'This is sample content. A live news source gets wired in later — the layout stays the same.',
      },
    ],
  },
  kia_know: {
    title: 'Product Knowledge',
    intro: 'A Claude (Sonnet) assistant for Kia specs, trims, incentives, and troubleshooting — quick answers before you walk back to a customer.',
    steps: [
      { title: 'Ask anything', body: 'Type a question about any Kia model — towing, payload, EV range and charging, MPG, trims, features, incentives, or troubleshooting — and press Enter.' },
      { title: 'Topic shortcuts', body: 'Tap a chip at the top to send a common question instantly.' },
      { title: 'Double-check exact numbers', body: 'Figures vary by model year and trim; the assistant will flag when a number is approximate. Confirm specifics on the window sticker or kia.com.' },
    ],
  },
  kia_todo: {
    title: 'Dealership To-Do',
    intro: 'Your sales tasks and working deals — a focused view of the Kia parts of your full To Do List.',
    steps: [
      {
        title: 'Add a dealership task',
        body: 'Type a task in the box and click Add. It is filed under Dealership / Sales.',
      },
      {
        title: 'Shared with your To Do List',
        body: 'These tasks also appear in the full To Do List workspace, so anything you add here shows up there too.',
      },
      {
        title: 'Check off and track deals',
        body: 'Tick the checkbox to complete a task. Working Deals shows deals you are actively tracking.',
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
    intro: 'A gamified Series 65 self-quiz: answer questions, level up each category, and track your score against the passing line.',
    steps: [
      {
        title: 'Pick a category (or Mix)',
        body: 'Use the chips at the top to drill one area, or choose “Mix (weighted)” to get questions across all four areas in the same proportions as the real exam.',
      },
      {
        title: 'Answer the question',
        body: 'Click the option you think is right. The correct choice is highlighted; if you missed it, the correct answer (and a quick definition when available) is shown.',
      },
      {
        title: 'Watch your score',
        body: 'Your score is accuracy over your last 100 answers, to one decimal, with the change from the previous question. The bar marks the ~72% pass line and the status shows how many points you are above or below it.',
      },
      {
        title: 'Level up and prestige',
        body: 'Each category has its own level ladder (Novice → Grandmaster) that climbs as you answer more questions in it. Max it out and the category prestiges — a crown 👑 is added and the ladder restarts.',
      },
      {
        title: 'Flashcards',
        body: 'Flip the Quiz / Flashcards switch at the top right to study the Series 65 vocabulary deck — filter by topic, tap a card to reveal the definition, or turn on auto-rotate (term 10s / definition 20s).',
      },
      {
        title: 'Reset',
        body: 'Use “Skip” to pass on a question without scoring it, or “Reset progress” to clear all levels and scores and start fresh.',
      },
    ],
  },
  st_progress: {
    title: 'Progress',
    intro: 'A snapshot of how you are doing in the Series 65 Study Game.',
    steps: [
      {
        title: 'Overall score',
        body: 'The top figure is your accuracy over the last 100 answered questions, with PASSING / NOT PASSING relative to the ~72% line.',
      },
      {
        title: 'By category',
        body: 'Each exam area shows its level (with any prestige crowns), how many questions you have answered there, and your score — so you can see which areas need more work.',
      },
    ],
  },

  // ---- Vitalis Wealth Management ----
  wm_clients: {
    title: 'Managing your clients',
    intro: 'Your advisory client book. New accounts start empty — add clients as you bring them on. Every client is private to your login.',
    steps: [
      {
        title: 'Add a client',
        body: 'In "Add a client", enter the name (the only required field), plus optional email, phone, account value, status, and notes, then click "Add client".',
      },
      {
        title: 'Track status',
        body: 'Set each client to Prospect, Onboarding, Active, or Inactive. The list groups Active clients first, and the summary cards count your active relationships.',
      },
      {
        title: 'Watch your AUM',
        body: 'The "Assets Under Management" card adds up every client\'s account value. Leave the account field blank for prospects you have not funded yet.',
      },
      {
        title: 'Edit a client',
        body: 'Click "Edit" on any row to change details inline, then Save. Clearing the account value field removes the amount.',
      },
      {
        title: 'Hide dollar details',
        body: 'Click "Hide $ details" — or turn on Privacy mode in the top bar — to mask client names, contacts, and dollar amounts when someone might see your screen.',
      },
      {
        title: 'Remove and undo',
        body: 'Click the × to remove a client. A short "Undo" bar appears at the bottom so you can restore them if it was a mistake.',
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
        body: 'Admin = everything (including this screen). Sales = Kia workspace + to-do. Trader = Trading workspace + to-do. Viewer = read-only.',
      },
      {
        title: 'Manage existing users',
        body: 'From each row you can change a role, reset a password, or deactivate / reactivate an account. Deactivating or resetting a password signs that user out everywhere.',
      },
      {
        title: 'Delete an account',
        body: 'Click "Delete", then "Confirm delete", to permanently remove an account and all of its data (to-dos, Kia deals, clients). This cannot be undone — use Deactivate instead if you only need to suspend access. You cannot delete your own account or the last remaining admin.',
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
      body: 'Use the workspace switcher in the top bar to move between To Do List, Kia Sales, and the other areas you have access to.',
    },
  ],
};

export function tutorialFor(screen: string): Tutorial {
  return TUTORIALS[screen] ?? DEFAULT_TUTORIAL;
}
