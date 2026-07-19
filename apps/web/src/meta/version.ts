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

export const APP_VERSION = 'Beta V 5.17';

export const PATCH_NOTES: PatchNote[] = [
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
