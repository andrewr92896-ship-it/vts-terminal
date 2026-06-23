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
