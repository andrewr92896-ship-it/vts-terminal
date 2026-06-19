import type { SectionType } from '../db/schema.js';

// Initial To Do list seeded for a new user, mirroring the prototype exactly.
// For routine items, `offset` is the number of days from "today" for the
// initial due date, and the section-level `intervalDays` is the reset
// interval. `hyphen` marks daily-reference dashes. Everything else is a
// plain one-time task.

export interface TemplateItem {
  text: string;
  hyphen?: boolean;
  done?: boolean;
  offset?: number; // routine only: initial due date = today + offset days
}

export interface TemplateSection {
  n: number;
  icon: string;
  title: string;
  type: SectionType;
  tag?: 'kia' | 'trading';
  life?: boolean;
  intervalDays?: number; // routine sections
  items: TemplateItem[];
}

export const TODO_TEMPLATE: TemplateSection[] = [
  {
    n: 1,
    icon: '⭐',
    title: 'Priority',
    type: 'one',
    items: [
      { text: 'Sort life insurance (research and make info available)' },
      { text: 'Get someone to look at the drain pipe' },
      { text: 'Remove pipe from garage' },
    ],
  },
  {
    n: 2,
    icon: '🌱',
    title: 'Life Changes',
    type: 'note',
    life: true,
    items: [
      { text: 'Maintain door checklist' },
      { text: 'Talk less, smile more' },
      { text: "Don't be so overbearing" },
      { text: 'Have you been humble?' },
      { text: 'Do not pick face' },
      { text: 'Maintain a calm voice volume' },
      { text: 'Reflect on behaviors that are harmful to others, whether or not accidental' },
      { text: 'Full sobriety (excluding prescribed): no THC, no drinking, no recreational drugs (1 month milestone July 5)' },
      { text: 'Never call for Baxter when Scout can chase him' },
      { text: 'During frustration: no swearing, stay positive, keep composed and in control' },
      { text: "Don't let impulsive thoughts make you get up to tell someone something non-urgent" },
    ],
  },
  {
    n: 3,
    icon: '📋',
    title: 'Daily Routine',
    type: 'daily',
    items: [
      { text: 'Customer responses (salesman, emails, Teams, apt board, texts)', hyphen: true },
      { text: 'Fresh leads', hyphen: true },
      { text: 'Sold car follow up', hyphen: true },
      { text: 'Showroom visit follow up', hyphen: true },
      { text: 'Google reviews', hyphen: true },
      { text: 'Check odometers', hyphen: true },
      { text: 'Empty shred box', hyphen: true },
      { text: 'Organize desk', hyphen: true },
      { text: 'Check phone feed', hyphen: true },
      { text: 'Wash face', hyphen: true },
      { text: 'Check life', hyphen: true },
      { text: 'Find proper places for keys in drawers', hyphen: true },
      { text: 'Clean desk', hyphen: true },
    ],
  },
  {
    n: 4,
    icon: '📋',
    title: 'Weekly',
    type: 'routine',
    intervalDays: 7,
    items: [
      { text: 'Reset alerts', done: true, offset: 7 },
      { text: 'Clean room', offset: -24 },
      { text: 'Do laundry', offset: -24 },
      { text: 'Pick up medication', offset: -24 },
    ],
  },
  {
    n: 5,
    icon: '📋',
    title: 'Monthly',
    type: 'routine',
    intervalDays: 30,
    items: [
      { text: "1st of month: pay bills and map out month's bills", done: true, offset: 30 },
      { text: 'Check Kdealer (Kia points, tests, upload offers to Discord)', done: true, offset: 30 },
      { text: 'Check Kdealer surveys', done: true, offset: 30 },
      { text: 'Clean gutters', done: true, offset: 30 },
      { text: 'Clean phone photos', done: true, offset: 30 },
      { text: 'Computer maintenance (drivers, CCleaner, unused apps, startup)', done: true, offset: 30 },
      { text: 'Commission check pay bills', done: true, offset: 30 },
      { text: 'Clean Claude memory', done: true, offset: 30 },
      { text: 'Clean cookies, old programs, Windows updates, Defender', done: true, offset: 30 },
      { text: 'Clean Google Drive', done: true, offset: 30 },
      { text: 'Organize and update Discord', done: true, offset: 30 },
      { text: 'Complete at least 1 life item', done: true, offset: 30 },
      { text: 'Check all trading accounts for unauthorized logins', offset: 0 },
      { text: 'Check/shop car insurance', offset: 0 },
      { text: 'Clean and organize garage', offset: 0 },
      { text: 'Organize trading files and back up', offset: 0 },
      { text: 'Compile monthly trading performance review (P&L, win rate, profit factor, drawdown, key takeaways)', offset: 0 },
      { text: 'Organize drawer under computer desk', offset: 0 },
    ],
  },
  {
    n: 6,
    icon: '📋',
    title: 'Quarterly',
    type: 'routine',
    intervalDays: 92,
    items: [
      { text: 'Check Chase Freedom Flex new 5% cash back categories', done: true, offset: 92 },
      { text: 'Create a Maxim', done: true, offset: 92 },
      { text: 'Rotate API keys', offset: 61 },
      { text: 'Audit all sensitive accounts: review logins and remove all devices', offset: 61 },
      { text: 'Get flowers for Nicole (not an apology gift)', offset: 61 },
    ],
  },
  {
    n: 7,
    icon: '📋',
    title: 'Every 6 Months',
    type: 'routine',
    intervalDays: 183,
    items: [{ text: 'Rotate passwords', offset: 153 }],
  },
  {
    n: 8,
    icon: '🚗',
    title: 'Dealership / Sales',
    type: 'one',
    tag: 'kia',
    items: [
      { text: 'Clean work toolbox' },
      { text: 'Go back to using Google Voice for Kia leads' },
    ],
  },
  {
    n: 9,
    icon: '🤝',
    title: 'Working Deals',
    type: 'deals',
    tag: 'kia',
    items: [],
  },
  {
    n: 10,
    icon: '💹',
    title: 'Vitalis Trading',
    type: 'one',
    tag: 'trading',
    items: [{ text: 'Upload trading documents to Discord' }],
  },
  {
    n: 11,
    icon: '💰',
    title: 'Finance',
    type: 'one',
    items: [
      { text: 'Lock credit bureaus' },
      { text: 'Close Best Rewards Credit Union' },
      { text: 'Check on student loans' },
    ],
  },
  {
    n: 12,
    icon: '🏠',
    title: 'Personal / Home',
    type: 'one',
    items: [
      { text: 'Full wardrobe (~$1,423)' },
      { text: 'Pet insurance: Pets Best BestBenefit, $500 deductible, 80% reimbursement, $10K annual limit, skip Wellness' },
      { text: 'Get EZ Pass' },
      { text: 'Lock private Discord chats and invite Dale' },
      { text: 'Make specific notification sounds for specific apps' },
      { text: 'Finish Series 65 prep' },
      { text: 'Return Amazon items' },
      { text: 'Sign up for graduate school' },
      { text: 'Fill out FAFSA for Krystal and I' },
    ],
  },
  {
    n: 13,
    icon: '🔨',
    title: 'House Projects',
    type: 'one',
    items: [
      { text: 'Stain fence' },
      { text: 'Cabinet magnets' },
      { text: 'Shed lock' },
      { text: 'Add dirt to post left of back door (cover pipe, incline away from house)' },
      { text: 'Label garage storage locations and organize' },
      { text: 'Fix closet door by front door' },
      { text: 'Unclog downstairs bathroom sink' },
    ],
  },
  {
    n: 14,
    icon: '🏷️',
    title: 'Sell / Gift / Trash',
    type: 'one',
    items: [
      { text: 'Sell altimeter' },
      { text: 'Sell helmet' },
      { text: 'Sell bowling ball' },
      { text: 'Sell welder' },
    ],
  },
  { n: 15, icon: '⚔️', title: 'RuneScape', type: 'one', items: [] },
  {
    n: 16,
    icon: '💕',
    title: 'Time with Nicole',
    type: 'one',
    items: [
      { text: 'Roller blading with Nicole' },
      { text: 'Vacation with Nicole' },
    ],
  },
  {
    n: 17,
    icon: '⏸️',
    title: 'On Hold',
    type: 'one',
    items: [
      { text: 'Schedule eye doctor' },
      { text: 'Schedule primary doctor' },
      { text: 'Post Series 65 prep' },
      { text: 'Get Spectrum Wireless Hotspot' },
      { text: 'Animal vet (was monthly routine)' },
    ],
  },
];
