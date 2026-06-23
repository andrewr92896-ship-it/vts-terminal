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
    intro: 'A Claude-powered assistant for Kia specs, trims, incentives, and troubleshooting.',
    steps: [
      {
        title: 'Pick a topic',
        body: 'The chips at the top (towing, EV range, MPG, trims, etc.) are example questions the assistant will answer.',
      },
      {
        title: 'Coming soon',
        body: 'The chat connects in a later stage. The input is disabled until then.',
      },
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
  st_quiz: {
    title: 'Practice Quiz',
    intro: 'A self-quiz that rotates through the four Series 65 topics and recycles the questions you miss.',
    steps: [
      {
        title: 'Answer the question',
        body: 'Read the question and click the option you think is right. The topic rotates on every question, so you cover all four areas.',
      },
      {
        title: 'See the result',
        body: 'After you answer, the correct choice is highlighted. If you were wrong, the correct answer is shown. Two figures update: overall accuracy (last 100) and accuracy in that topic (last 20).',
      },
      {
        title: '“I don’t know”',
        body: 'Not sure? Click “I don’t know” to reveal the answer. It counts as a miss, the same as answering incorrectly.',
      },
      {
        title: 'Back-burner review',
        body: 'Missed questions return later, tagged “Review.” Review questions do not count toward your percentages — they are just to reinforce the misses.',
      },
      {
        title: 'Fix a mark',
        body: 'If a question was scored wrong by mistake, use the small “mark right / wrong” buttons to override it. Use “Reset progress” to clear your stats and reshuffle the deck.',
      },
    ],
  },
  st_cards: {
    title: 'Flashcards',
    intro: 'Series 65 vocabulary, drawn from the terms in the question bank and grouped by topic.',
    steps: [
      {
        title: 'Filter by topic',
        body: 'Use the chips at the top to show all cards or just one area (Economics, Regulations & Ethics, Investments, Client Management).',
      },
      {
        title: 'Flip a card',
        body: 'Tap the card (or use “Show definition”) to reveal the meaning. Use Prev / Next to move through the deck.',
      },
      {
        title: 'Auto-rotate',
        body: 'Turn on “Auto-rotate” to cycle hands-free: the term shows for 10 seconds, then the definition for 20, then it advances. A countdown bar shows the timing.',
      },
    ],
  },
  st_progress: {
    title: 'Progress',
    intro: 'A snapshot of how you are doing on the Series 65 practice quiz.',
    steps: [
      {
        title: 'Overall accuracy',
        body: 'The top figure is your accuracy over the last 100 answered questions. The marker on the bar shows the ~72% passing line.',
      },
      {
        title: 'By topic',
        body: 'Each topic shows your accuracy over its last 20 answers, so you can see which areas need more work.',
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
