// The marketing page as it was hand-written — the document a fresh install
// starts from, and what the site renders if it has never reached the portal.
//
// `npm run verify:marketing-render` renders this and compares it with
// `src/index.html`. That check is what "the landing page did not change" means
// here: not a promise, a comparison.

/** @type {import('./render.mjs').Model} */
export const MARKETING_SEED = {
  head: {
    title: 'Vitalis Trading Systems',
    description:
      'VTS Terminal — a personal market workbench: trade records, market data, news, study tools and personal finances in one place. Try the demo, no account needed.',
    ogTitle: 'VTS Terminal — your market workbench',
    ogDescription:
      'Trade records, market data, news, study tools and personal finances in one terminal. Try the demo — no account needed.',
  },
  bar: {
    mark: 'VITALIS',
    markEm: 'TRADING SYSTEMS',
    links: [
      { label: 'What it does', href: '#what' },
      { label: 'What it doesn’t', href: '#boundary' },
      { label: 'Sign in', href: 'https://app.vitalistradingsystems.com', ghost: true },
    ],
  },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      anchor: false,
      eyebrow: 'VTS Terminal',
      h1: 'Your market workbench.',
      h1Em: 'Focused and personal.',
      lede: 'Every trade you have taken, the rates and headlines you watch, what you are studying, and what you are worth — in one terminal instead of six tabs.',
      buttons: [
        { label: 'Try the demo', href: 'https://app.vitalistradingsystems.com/?demo=1' },
        { label: 'Sign in', href: 'https://app.vitalistradingsystems.com', ghost: true },
      ],
      fine: 'No account, nothing to install. The demo uses sample data and resets when you leave.',
      items: [],
    },
    {
      id: 'what',
      type: 'grid',
      items: [
        {
          title: 'Trade records',
          body: 'Log a trade, edit it, or put one back after deleting it. Win rate, profit factor and P/L are scored from what you actually entered.',
        },
        {
          title: 'Market data',
          body: 'Rates, prints and prices on one board — with who publishes each figure, when it was last revised, and when the next one lands.',
        },
        {
          title: 'News, not noise',
          body: 'Headlines from the wires, tagged with the instruments they mention. Reported plainly, with no view attached.',
        },
        {
          title: 'Predictions you can score',
          body: 'Write the call before the market makes it, then settle it against what happened. Private to you, always.',
        },
        {
          title: 'Study tools',
          body: 'Build study games, flashcards and presentations from your own material. Progress, streaks and per-topic standing are kept as you go.',
        },
        {
          title: 'Personal finances',
          body: 'Net worth, a budget, and a long-term portfolio tracker for retirement and brokerage accounts.',
        },
      ],
    },
    {
      id: 'boundary',
      type: 'boundary',
      title: 'What it deliberately does not do',
      body: 'The terminal never sends an instruction to a broker, never moves money, and holds no trading credentials. It does not tell you what to buy or sell, and it makes no claim about what any strategy will return. It is a record of your own work and the market around it — informational and educational, and nothing more.',
      items: [],
    },
    {
      id: 'early',
      type: 'early',
      anchor: false,
      title: 'Beta access',
      body: 'The terminal is in pre-release and admission is by invitation. Nothing is sold here: there are no plans, no tiers and no payments anywhere in it. Ask to be told when a place opens.',
      buttons: [
        { label: 'Request an invitation', href: 'https://app.vitalistradingsystems.com/?screen=early-access' },
      ],
      items: [],
    },
  ],
  footer: {
    copyright: '© 2024–2026 Vitalis Trading Systems LLC',
    fine: 'Informational and educational only. Not financial, investment, tax or trading advice. Trading carries risk, including the loss of capital.',
  },
};
