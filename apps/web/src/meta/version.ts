// Single source of truth for the app version and the patch notes shown in the
// help hub. Bump APP_VERSION and prepend a PATCH_NOTES entry on every deploy
// (for example Alpha V 1.0 -> Alpha V 1.1). The top-bar version pill and the
// hub's Patch Notes tab both read from here, so they never drift apart.

export interface PatchNote {
  version: string;
  date: string;
  notes: string[];
}

export const APP_VERSION = 'Beta V 2.8';

export const PATCH_NOTES: PatchNote[] = [
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
      'Study Game: build your own subsections. Click “✦ New subsection”, name a topic like Bonds or Compliance, and Claude scans all questions and gathers the ones that fit into a chip you can drill.',
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
      'Flashcards: opening "More Details" or asking Claude a question now stops auto-rotate, so the card stays put while you read the reply.',
    ],
  },
  {
    version: 'Alpha V 1.17',
    date: 'June 28, 2026',
    notes: [
      'Ask Claude is now a real back-and-forth chat — ask follow-up questions about a quiz question or a flashcard and Claude keeps the context. "More Details" starts the conversation, and you can keep going from there.',
    ],
  },
  {
    version: 'Alpha V 1.16',
    date: 'June 28, 2026',
    notes: [
      'Flashcards: add your own words — type a term and Claude writes a Series 65 definition and files it under the right topic. Your custom words sync across devices and can be removed anytime.',
      'Study Game: star any question (☆) to save it, then switch to the new "Starred" tab to drill just the ones you flagged. Your starred set syncs across devices.',
      'Ask Claude about a question or a flashcard: the "Explain with Claude" button is now "More Details", with an "Ask Claude…" box next to it for your own follow-up questions.',
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
      'Ask Claude in the Kia workspace now uses the dedicated Kia product expert.',
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
      'Cleaner small screens: the top bar now tucks the clock, privacy, trade alert sound, and admin into a single "More" menu, leaving just Ask Claude and your account in view.',
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
      'The Ask Claude assistant is available on every screen.',
    ],
  },
];
