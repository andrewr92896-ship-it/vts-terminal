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

export const APP_VERSION = 'Beta V 6.98';

export const PATCH_NOTES: PatchNote[] = [
  {
    version: 'Beta V 6.98',
    date: 'August 10, 2026',
    notes: [
      'The study package wizard now finishes the job. At the end you get a handoff to copy into your own ChatGPT or Claude — it tells them to ask you one question at a time, and exactly what to build, down to how many questions each category gets. Bring back the file it makes, or paste it, and the terminal checks it.',
      'Checking is thorough and tells you what is actually wrong — "Question 47 is missing option D", "Expected 15 questions in Regulations; found 14" — with a set of repair instructions you can hand straight back to your AI. You see everything, including the questions themselves, before anything is created. If your AI runs out of room, ask it for one part at a time and add the parts as they come.',
      'Choosing to type the questions in yourself now builds a proper study package too, rather than a loose game off to one side. Either way, nothing is saved until you say so.',
    ],
  },
  {
    version: 'Beta V 6.97',
    date: 'August 10, 2026',
    notes: [
      'Studies ▸ Study Creation now opens with “Create a study package” — a short set of questions, one at a time, about what you need: how many questions, whether to track categories, whether to include flashcards or a presentation. It only asks what follows from your answers, so a simple package is a handful of taps.',
      'It writes nothing itself. At the end you either take a handoff to your own ChatGPT or Claude, which does the writing, or go straight to typing the questions in. Your answers are kept if you leave the screen or reload, and the three existing makers are still there underneath for building one piece at a time.',
    ],
  },
  {
    version: 'Beta V 6.96',
    date: 'August 10, 2026',
    notes: [
      'Groundwork for the new way of building study content. Nothing looks different yet — study games, flashcard sets and presentations all work exactly as before.',
      'What changed underneath: study content can now belong to a person rather than to a group, which is what lets it be shared with someone who is not in your group. Categories also gained a permanent identity, so renaming one no longer resets what it had recorded about how you were doing in it.',
    ],
  },
  {
    version: 'Beta V 6.95',
    date: 'August 10, 2026',
    notes: [
      'Your metrics now say what they are leaving out. Two settings quietly narrow them — a broker connection’s “count trades since” date, and the test-trade floor — and neither said so, which meant an export covering June could list no June trades and read as though there had been none.',
      'The Trade Log, the CSV export and the Live Wall’s Trade History tile all now name how many trades were left out and from what date. Nothing appears when nothing was excluded.',
    ],
  },
  {
    version: 'Beta V 6.94',
    date: 'August 10, 2026',
    notes: [
      'Admins can now remove a trader’s broker connection from Trade History ▸ Live Brokers, not just rename or pause it — so a dead account somebody left behind can be tidied up by whoever is looking at it. The trader’s closed trades stay on the desk.',
      'It only offers to remove a paused connection, and refuses a hand-kept book that still holds positions, since those trades exist nowhere else. Removals are recorded in the Administrator Log.',
    ],
  },
  {
    version: 'Beta V 6.93',
    date: 'August 10, 2026',
    notes: [
      'A broker account that answers but sends back something the terminal cannot read no longer looks like an account with nothing open. It used to mark every open position closed at the last price seen, and buzz a “trade closed” for each — the connection now reports as unhealthy instead, which closes nothing.',
      'A position wrongly marked closed is put back the way the broker has it when it reappears, instead of being stored a second time alongside the bad copy.',
    ],
  },
  {
    version: 'Beta V 6.92',
    date: 'August 10, 2026',
    notes: [
      'Fixed closed trades being counted twice. Reconnecting a broker account as a new connection made the desk re-import that account’s whole closed-trade history, so trades captured before the reconnect were held twice and both copies counted toward the trade count, win rate and P/L. The duplicates are removed and the surviving copy now carries the broker’s own fill.',
      'A trade left showing as open because its connection went dark mid-trade is now closed off the broker’s record.',
      'An account that is already connected can no longer be added a second time — update the key on the connection you have instead.',
    ],
  },
  {
    version: 'Beta V 6.91',
    date: 'August 9, 2026',
    notes: [
      'The Live Wall moved to the top of Advanced Trading. Sign-in still opens on it, and every link to it still works — but it now sits behind the Advanced Trading switch, so an account without the desk turned on lands on Premium Features instead.',
      'A new Order Ticket tile puts the Live Trades ticket on the wall itself — the same ticket, with the same review-and-confirm step — with its own account and instrument per tile.',
      'Boards now have a phone default and a desktop default, set separately from Preset Settings, so each device opens on the layout arranged for it.',
      'A Desk Metrics tile remembers whose figures it is showing, so a board can carry one per trader alongside the whole desk.',
      'Finances, Investments and the World and Politics news sections are now marked as still being built.',
    ],
  },
  {
    version: 'Beta V 6.90',
    date: 'August 9, 2026',
    notes: [
      'The Live Wall’s layout dropdown ends with “Create New Layout” — name it and you get an empty board, already in edit mode, ready for the first tile.',
      'It is saved from the moment you name it, so it appears in your boards straight away and nothing you had unsaved on the layout you were looking at is touched.',
    ],
  },
  {
    version: 'Beta V 6.89',
    date: 'August 9, 2026',
    notes: [
      'The Live Wall’s Desk Metrics tile now carries the full figure set from Closed Trades & Metrics: gross profit and gross loss, average slippage, break-even trades in the win-rate line, pip figures under each money card, and your deposited, withdrawn and total capital.',
      'The capital figures are always your own and do not follow the tile’s trader picker. They are read-only on the wall — set or sync them from Closed Trades & Metrics.',
    ],
  },
  {
    version: 'Beta V 6.88',
    date: 'August 8, 2026',
    notes: [
      'The Progress screen now shows a weighted score for any study game that has category weights, beside your lifetime accuracy — the same answers scored against the exam’s own mix, so practice that has been heavy on one area no longer reads as mastery of the whole paper.',
      'Its category breakdown shows what each area is worth and what it has contributed, and a “Where the marks are going” list ranks the areas costing you the most. An area you have not practised at all is named and left out of the score rather than counted as zero.',
    ],
  },
  {
    version: 'Beta V 6.87',
    date: 'August 8, 2026',
    notes: [
      'A study game’s categories can now carry a weight — the share of the exam each one is worth. Tick “Weight categories for scoring” in the game editor and give each category a percentage.',
      'A practice test on a weighted game then draws its questions in those proportions and scores each category against its share, so the result reflects the real paper rather than whichever questions came up. You pick weighted or plain scoring before each sitting, and both scores are shown at the end.',
      'The result breaks down what each category was worth, what it earned, and which areas cost you the most marks. A category the game does not hold enough questions for is named rather than quietly counted.',
    ],
  },
  {
    version: 'Beta V 6.86',
    date: 'August 7, 2026',
    notes: [
      'Trading teams are now called private groups, everywhere they appear. The sidebar row is My Group, team chat is group chat, and a shared layout reads “Shared with your group”. Nothing about how they work has changed — the same people, the same access, the same private conversation.',
      'The Terms of Service and Privacy Policy use the new wording too. No obligation changed, so there is nothing to re-accept.',
    ],
  },
  {
    version: 'Beta V 6.85',
    date: 'August 7, 2026',
    notes: [
      'An unfinished Live Wall arrangement is now kept. Move some tiles, go and look at something else, come back tomorrow — the board is exactly as you left it, marked “Unsaved changes”, with Load layout to go back to the saved version and Save layout to keep it.',
      'Everything you can do to the open preset — rename, set default, share, save, save as new, delete — now sits behind one Preset Settings menu while editing, instead of a row of buttons above the board.',
      'The default layouts every account starts on can be arranged on the wall itself and published from there, rather than typed in as numbers.',
      'Parts of the terminal that are still being built before launch now carry a small marker beside their name.',
    ],
  },
  {
    version: 'Beta V 6.84',
    date: 'August 6, 2026',
    notes: [
      'On Live Trades, the stop loss and take profit can now be set in pips instead of price — a Price / Pips toggle sits beside the two fields, and the reading underneath each shows the price your distance lands on. Anything that is not a currency pair asks for points instead, the same unit the rest of the desk quotes it in.',
      'You never type which way the level goes: a stop is placed on the losing side and a target on the winning side of your entry, so switching between buy and sell moves both to the right place. Distances are measured from the price the order will actually transact at — the ask on a buy, the bid on a sell, or your trigger price on a resting order.',
      'The heading on Closed Trades & Metrics now matches its sidebar row.',
    ],
  },
  {
    version: 'Beta V 6.83',
    date: 'August 6, 2026',
    notes: [
      'Advanced Trading is renamed and reordered to follow a trade’s own life: Live Trades, Closed Trades & Metrics, Funded Trades, Manual Trades, Deleted Trades, then Strategy Sessions.',
      'Live Brokers is no longer a separate tab — your live broker capital now sits at the bottom of Closed Trades & Metrics, on the same page as the trades it was earned on.',
      'Trading Alerts has been removed. The two settings that lived there did not go with it: session open/close/pre-open alerts are now on the Strategy Sessions screen, and price alerts moved to My Terminal ▸ Settings with your other notification controls — where an account without Advanced Trading can finally reach them.',
    ],
  },
  {
    version: 'Beta V 6.82',
    date: 'August 6, 2026',
    notes: [
      'Every Live Wall tile can now be zoomed on its own. While editing a layout, hover a tile and a small − 100% + control appears at the bottom of it: zoom out to fit more into the same tile, or in to make a chart or a figure readable across the room. The percentage button puts it back to 100%, and each tile’s zoom saves with the layout.',
      'Fixed: an Open Positions tile on one of the ↕ views could not be resized taller or shorter — it locked itself to whatever height it already had, most visibly when you had no open positions. It now grows to fit your trades as intended while still letting you drag it to whatever height you want.',
    ],
  },
  {
    version: 'Beta V 6.81',
    date: 'August 6, 2026',
    notes: [
      'Widening the Live Wall’s workspace now makes the board itself bigger: the dotted box grows out across the screen and your tiles keep their size, instead of squeezing more, thinner columns into the same width. On a wide screen or a television the wall now fills it rather than sitting in a strip down the middle.',
      'Expanding stops once the workspace fills the screen you are on, so it can never reach a point where widening starts shrinking your tiles. A board arranged wide still opens on a laptop or phone — it just fits itself to the smaller screen.',
    ],
  },
  {
    version: 'Beta V 6.80',
    date: 'August 6, 2026',
    notes: [
      'The Live Wall now has a workspace area. While editing a layout, a dotted outline shows the canvas your tiles sit in — locked in place so arranging tiles can never change it by accident. A small pencil on its top corner unlocks it; drag either side (or use the − / + steppers) to widen the workspace by whole columns, then lock it again.',
      'A wider workspace fits more tiles side by side on the same screen — built for a desktop or a television running the wall. Each layout keeps its own width and saves with it; layouts you never touch stay exactly as they are, and phones keep the single-column view either way.',
    ],
  },
  {
    version: 'Beta V 6.79',
    date: 'August 6, 2026',
    notes: [
      'Trade History’s capital cards grew up: Deposited Capital gained a Withdrawn Capital card beside it, and both can now be typed in with Edit or synced from your connected OANDA account’s deposit history with Sync. Synced figures keep themselves current; typing a number switches that card back to manual, and nothing you typed is lost by trying sync.',
      'A Total Capital card shows what your connected broker accounts hold right now, combined — OANDA and Kraken. Accounts in different currencies, or one that will not answer, are called out rather than silently mistotalled.',
      'Only real deposits count in a sync: transfers between your own OANDA accounts and account migrations are excluded and noted, so the figure means what you actually put in.',
    ],
  },
  {
    version: 'Beta V 6.78',
    date: 'August 6, 2026',
    notes: [
      'Trade History has a Deposited Capital card you fill in yourself — what you put into the account out of your own pocket. Once it is set, the card shows what your own closed trades have returned on it as a percentage.',
    ],
  },
  {
    version: 'Beta V 6.77',
    date: 'August 6, 2026',
    notes: [
      'Funded accounts are now shared with your trading team, and you can keep more than one. Each account belongs to the trader who set it up — everyone on the desk can see them, only the owner can change one.',
      'The Funded screen now carries the funded book’s own stats — trades, win rate, realized and unrealized P/L, gross profit and loss, profit factor — scored over funded trades only, and kept completely separate from the desk’s numbers.',
      'It also lists your completed funded trades, and lets you load older ones in: from a trade-history screenshot, or typed in with the dates the trade actually ran.',
    ],
  },
  {
    version: 'Beta V 6.76',
    date: 'August 6, 2026',
    notes: [
      'Advanced Trading ▸ Trade Analysis is now called Trade History. Nothing about the screen changed — the Trade Log and Live Brokers are still there, and every link to it still works.',
    ],
  },
  {
    version: 'Beta V 6.75',
    date: 'August 6, 2026',
    notes: [
      'Funded Account: the daily drawdown gauge now actually resets daily. It was measuring the whole loss since the challenge started, so an account that was down overall but flat on the day read as most of its daily allowance already spent.',
      'Day-start equity rolls onto your current equity at the start of each Eastern trading day. You can still set it by hand, and a figure you type stays put for the rest of that day.',
    ],
  },
  {
    version: 'Beta V 6.74',
    date: 'August 6, 2026',
    notes: [
      'Trade Desk: each open position now shows how many pips it is up or down, beside its profit. Forex only — crypto and index positions have no pip size and show money alone.',
    ],
  },
  {
    version: 'Beta V 6.73',
    date: 'August 6, 2026',
    notes: [
      'You can now set a funded position’s stop and target by hand, from the row it sits on in Manual Trades. Until now the only fix for a level VTS AI read wrong was deleting the trade and importing it again.',
      'Those two levels now show on the live funded trades table as well, beside the entry and live price.',
    ],
  },
  {
    version: 'Beta V 6.72',
    date: 'August 6, 2026',
    notes: [
      'A funded position now shows the stop and target it is actually sitting behind. VTS AI was already reading them off the screenshot, but there was nowhere to keep them, so every funded trade was drawn as having no stop at all.',
      'Re-pasting a screenshot of a funded position you are already tracking now updates its stop and target instead of doing nothing — which is how you move a stop at the prop firm and have the desk follow.',
      'Funded positions now show a live price and open P/L again. They could be left unpriced even when the same instrument was being priced elsewhere on the desk.',
    ],
  },
  {
    version: 'Beta V 6.71',
    date: 'August 4, 2026',
    notes: [
      'The terms screen now says up front that you need to scroll to the bottom before you can accept — previously the only explanation sat beside the checkbox, which you could not see until you got there.',
      'Fixed that same screen on a phone: scrolling the page did not enable the checkbox, only scrolling inside the document box did.',
      'Reworded the rules page so it reads like a policy document rather than a summary of one.',
      'Trading teams can see each other\u2019s trades again. This applies only to accounts granted trading teams — every other account, and anyone signing up publicly, still sees their own trading and nobody else\u2019s.',
    ],
  },
  {
    version: 'Beta V 6.70',
    date: 'August 4, 2026',
    notes: [
      'The Terms of Service and Privacy Policy have been rewritten to match how the terminal now works: your trading information is private to you, what public study leaderboards show, what budgeting data is, and exactly what is and is not kept from AI conversations. Everyone will be asked to accept them once on next sign-in.',
      'Closed a gap where a team leader could still adjust a teammate\u2019s Trade Analysis settings without being granted trading teams.',
      'The World and Politics feeds now try several addresses per source, so one retired feed no longer leaves a topic empty.',
    ],
  },
  {
    version: 'Beta V 6.69',
    date: 'August 4, 2026',
    notes: [
      'Live Wall tiles now resize from all four corners instead of only the bottom-right one, so a tile at the edge of the board or low down a long one is no longer awkward to reach.',
      'Editing a board looks like editing now — tiles show an outline, the header takes a grab cursor, and Escape leaves edit mode instead of hunting for the Done button.',
      'New in the Developer Terminal: Live Wall Templates. The default boards every account chooses between can be edited there rather than needing a deploy. Changes save as a draft and only reach members when you press Publish.',
    ],
  },
  {
    version: 'Beta V 6.68',
    date: 'August 4, 2026',
    notes: [
      'The Live Wall now sits at the very top of My Terminal, above everything else, with an icon that stands out. It is the biggest thing the terminal does and it was buried.',
      'New Finances workspace: your Net Worth moved here, and there is now a Budget — set up what money comes in and goes out on, record amounts as the month goes, and see what is left over. Entered by hand for now; nothing is connected to a bank.',
      'New News workspace. Market News moved here, joined by World and Politics from the wire services (Reuters and AP) — reporting only, no opinion outlets and no commentary from us. Market Data stays in My Terminal.',
    ],
  },
  {
    version: 'Beta V 6.67',
    date: 'August 4, 2026',
    notes: [
      'The terminal\u2019s built-in study games now have public leaderboards — every player on the platform ranked together on one board, rather than only the people around you.',
      'Games you make yourself have no leaderboard for now. The tab simply does not appear on them.',
      'You can take yourself off the public boards from My Terminal \u25b8 Preferences. You still see your own rank; other players just will not see you.',
    ],
  },
  {
    version: 'Beta V 6.66',
    date: 'August 4, 2026',
    notes: [
      'Display names are now unique — no two accounts can share one. If yours clashed with somebody who had it first, a number was added to yours and you can change it to anything free from Settings.',
      'Site Rules now sit in My Terminal as well as Site Help. It is the same document in both places, updated to say what the terminal actually does: the desk trades forex and crypto only, anything else is tracked by hand and should not be shared, and desk metrics are never proof of performance.',
      'Added plainly: posting your results anywhere to build credibility or attract money will have the content removed. Trades can be edited and deleted here, so no figure in the terminal is verified.',
      'Nobody else can see your email address. That was already true and is now stated in the rules.',
    ],
  },
  {
    version: 'Beta V 6.65',
    date: 'August 4, 2026',
    notes: [
      'VTS AI now holds firm financial-advice limits across every AI feature in the terminal. It will explain how anything works, but it will not tell anyone what to buy or sell, when to trade, or how to size a position. These limits are built in and cannot be edited or switched off from any screen.',
      'If VTS AI declines a request, you get a plain note explaining why. The first one is only a warning. A second within a day pauses AI features for 30 minutes — support and bug reports always stay open. Every notice carries an "I think the AI made a mistake" button, because the system does get it wrong sometimes.',
      'The Ask VTS AI panel now states plainly that conversations are not private and can be reviewed, and that your trading data is separate — positions, results, balances and broker keys are never read by administrators.',
      'New for admins: Admin Terminal ▸ Rule Breaking shows each declined request with the conversation behind it, flags the ones the user disputes, and lets you end a pause when the terminal got it wrong.',
    ],
  },
  {
    version: 'Beta V 6.64',
    date: 'August 4, 2026',
    notes: [
      'Your trading results are now yours alone. Positions, the trade log, history, deleted trades and broker capital are visible only to you — nobody else on the terminal sees another person\u2019s numbers, and trade notifications go only to the trader they are about.',
      'New accounts now start in their own private space. Study games, flashcard sets, presentations and your news channel list belong to you rather than to a shared group, so nothing you make is visible to, or editable by, anyone else.',
      'Trading Teams are hidden for now and handed out by a software developer. The Vitalis Trading Team and everyone already on it are unchanged.',
      'Private mode has been retired from the Trading Team screen. It existed to keep your book off other people\u2019s screens, and that is now simply how the terminal works.',
    ],
  },
  {
    version: 'Beta V 6.63',
    date: 'August 4, 2026',
    notes: [
      'Every position on the Trade Desk now states its stop loss and take profit outright — including when there are none, which used to show as nothing at all. Each level carries what it is worth from your fill in money and pips (points on crypto and indices), plus the risk-to-reward when both are set, and the price line now says what a pip of movement is worth at that size.',
      'The stop/target editor opens on the levels your broker is holding right now rather than the ones that were there when the screen loaded, so a stop moved since then can no longer be wiped by saving. What you type is priced as you type it.',
    ],
  },
  {
    version: 'Beta V 6.62',
    date: 'August 4, 2026',
    notes: [
      'The study tutor is now a paid feature, split in two. “Break this down” — the one-tap explanation of the question or flashcard in front of you — needs Premium and carries the gold star. Typing your own question or a follow-up needs Max and carries the diamond. Both buttons still show on every account with their badge, so you can see what each costs, and both are listed on My Terminal ▸ Premium Features. Answering questions, your streak, level and progress are unchanged and still free.',
      'View as role moved out of the Developer Terminal and into the account menu, under your name in the top right. Previewing as a lower role used to hide the very screen you switch back from; now the way in and the way out are in the same place on every screen.',
    ],
  },
  {
    version: 'Beta V 6.61',
    date: 'August 4, 2026',
    notes: [
      'Fixed the Live Wall watchlist on iPhone. With the terminal zoomed to anything other than 100%, the ticker was drawn short of the tile and a white band showed down the right side and along the bottom — the same fault hit the chart and live-stream tiles. Embedded windows now ignore the terminal zoom instead of being scaled twice. A scrolling watchlist also no longer gets padded out to a tall tile on a phone: it is a fixed-height strip, so it keeps the height you gave it.',
    ],
  },
  {
    version: 'Beta V 6.60',
    date: 'August 3, 2026',
    notes: [
      'The Live Wall no longer shows sample positions when your broker is connected but can’t be read. It used to fill the screen with example trades — marked “sample”, but they read as a real book and hid the actual problem. Now it says the feed isn’t being read and points you at Trade Analysis ▸ Live Brokers to reconnect, and the Positions tile, the Trade Desk book and the iPhone widget all say the same. The sample is still shown to an account that has never connected a broker, which is the one case it is honest in.',
    ],
  },
  {
    version: 'Beta V 6.59',
    date: 'August 3, 2026',
    notes: [
      'Removed the Chief Strategist and Chief Analyst titles. Both badges are gone from Admin ▸ Badges and from the Trading Team title list, and any that were already given out have been cleared. Positions are no longer colour-coded or sorted by whose they are — the Live Wall, Trade Log and History now read the same for everyone, and trade notifications name the trader without a title. Changing a teammate’s Trade Analysis settings now takes team leadership or an admin.',
    ],
  },
  {
    version: 'Beta V 6.58',
    date: 'August 3, 2026',
    notes: [
      'The Markets workspace is gone. Market Data and Market News are My Terminal sections now, sitting together just above the Live Wall — one place for everything you watch. Nothing was removed and nothing changed about who can reach what: both screens work exactly as before, and signing in still opens the Live Wall.',
    ],
  },
  {
    version: 'Beta V 6.57',
    date: 'August 3, 2026',
    notes: [
      'Removed Developer Terminal ▸ Sidebar Layout. The order of the workspaces, and of the sections inside each one, is now set in code and changes with a deploy — there is no longer a way to reorder the sidebar from inside the terminal. Any order saved with the old editor has been cleared, so everyone now sees the built-in order.',
    ],
  },
  {
    version: 'Beta V 6.56',
    date: 'August 3, 2026',
    notes: [
      'The sidebar now leads each workspace with its paid sections instead of burying them: Max first, then Premium, then everything included with your account. Nothing moved between workspaces and nothing changed about what you can reach — Advanced Trading now opens its list with Trade Desk, Markets with Market Data, Studies with Study Creation, and My Terminal with Trading Team. Signing in still opens the Live Wall.',
    ],
  },
  {
    version: 'Beta V 6.55',
    date: 'August 3, 2026',
    notes: [
      'The Funded Account tile showed your remaining drawdown in red even when the whole allowance was untouched. Red now means breached, matching the gauges on the Funded Account screen, with amber as the warning once less than a quarter is left.',
    ],
  },
  {
    version: 'Beta V 6.54',
    date: 'August 3, 2026',
    notes: [
      'Fixed the Live Wall being laid out at a fixed width regardless of your screen. On a desktop the board was slightly narrower than the space it had; on a phone it was drawn at desktop width and clipped, so tiles ran off the side. It now fits the window at every size, and follows along when you resize or rotate.',
    ],
  },
  {
    version: 'Beta V 6.53',
    date: 'August 3, 2026',
    notes: [
      'The Live Wall now has two separate tiles where it had one wrong one. "Funded Account" reads your prop-firm challenge — equity against the target, and how much drawdown is left before it is breached. "Manual Trades" reads the book you keep by hand. The single tile shipped yesterday was labelled Funded Account but showed the manual book.',
    ],
  },
  {
    version: 'Beta V 6.52',
    date: 'August 3, 2026',
    notes: [
      'The Broker Capital tile no longer locks you out of an account you already connected. Connecting a broker is a Max feature, but reading a connection you already have is not — the tile still shows the diamond so the cost is clear, and it opens for anyone with the trading desk on, matching the Live Brokers screen.',
    ],
  },
  {
    version: 'Beta V 6.51',
    date: 'August 3, 2026',
    notes: [
      'You can search the Live Wall tile list. With two dozen tiles across five groups, typing "net worth" beats guessing which group it files under.',
      'The Live Wall stops polling while its tab is in the background, and catches up the moment you come back. A board left open all day was quietly making requests for a screen nobody was looking at.',
    ],
  },
  {
    version: 'Beta V 6.50',
    date: 'August 3, 2026',
    notes: [
      'You can now share a Live Wall layout with your team. Publish one of your boards and every teammate finds it in their own layout menu, named after you. Each person can take a copy and rearrange it however they like.',
      'Only the arrangement is shared, never the figures. A teammate opening your layout sees their own net worth, their own trades and their own lists in it — and if the board has a notes tile, your notes are stripped before anyone else can see it.',
      'A free account can open a layout its team has shared, even though it cannot build one. Taking a copy needs a Premium membership.',
      'Switching layouts no longer asks whether to discard changes you had not made.',
    ],
  },
  {
    version: 'Beta V 6.49',
    date: 'August 3, 2026',
    notes: [
      'The Live Wall now works properly on a phone. Tiles stack into one full-width column in the order you arranged them, instead of being squeezed into a twelve-column grid. Your desktop arrangement is untouched — the phone only changes how it is drawn.',
      'Any tile can be blown up to fill the screen. Hover a tile and press the expand button in its bottom-right corner; Escape or Close puts it back. Useful for charts and for the longer lists.',
      'Saved boards now follow your membership rather than the trading desk. A Premium member who has not switched Advanced Trading on used to get exactly one board despite paying for custom boards; they now get named layouts like everyone else.',
      'The wall makes fewer requests. Two tiles reading the same thing — Trade Analysis beside Closed Trades, say — now share one request instead of each making their own.',
    ],
  },
  {
    version: 'Beta V 6.48',
    date: 'August 3, 2026',
    notes: [
      'The Live Wall is now the terminal’s one board, and it sits at the top of My Terminal — it is also what the terminal opens on when you sign in. Nineteen new tiles bring the rest of the terminal onto it: market data, a live news channel, a market clock, your net worth, your investment portfolio, dividends, your to-do list, notes, announcements, what’s new, study progress, flashcards, the study leaderboard, trade analysis, closed trades, strategy sessions, funded accounts, broker capital and team chat.',
      'Adding a tile is now a grouped catalog rather than a row of buttons. Every tile is listed, including ones your membership does not reach — those carry the star or diamond that says what they cost, so you can see what upgrading would add.',
      'Every account now gets three ready-made Live Wall layouts to choose between: Markets, Trading Desk, and My Terminal. Building and saving your own arrangement stays a Premium feature.',
      'A layout only ever shows what your account actually has, so a board never opens with holes or padlocks in it where a tile you have not turned on would be.',
      'Paid features across the terminal now consistently carry their tier marker — the star for Premium, the diamond for Max. Ask VTS AI, team chat, broker connections and teammate badges were each missing theirs.',
    ],
  },
  {
    version: 'Beta V 6.47',
    date: 'August 3, 2026',
    notes: [
      'AI running costs cut. The terminal was paying to have every news headline read by AI every five minutes around the clock, whether or not anyone was signed in — that is now off unless it is switched on. Headlines still arrive and display exactly as before; the small bias arrow on a story is hidden while it is off, rather than showing on some stories and not others.',
      'Screenshot imports now run on a faster, cheaper model. Reading a trade off a broker screenshot is the same job it always was, at roughly 40% less per import.',
      'Screenshots and questions now have separate monthly allowances, because a screenshot costs several times what a question does. Running out of one no longer blocks the other, and the message tells you which one you have used up.',
      'Background AI spend is now recorded and visible to admins alongside personal usage. It was previously invisible — roughly half the bill appeared nowhere.',
    ],
  },
  {
    version: 'Beta V 6.46',
    date: 'August 3, 2026',
    notes: [
      'Your broker connections now keep a record of every time one of your keys was used and what for — orders placed, positions closed, prices read — with a "Credential use" panel under Live Brokers showing it. Until now nothing anywhere recorded that a key had been used, so there was no way to answer "was my key used?" after anything went wrong.',
      'Only you can see your own. Being on the same team, or leading it, does not show anyone your credential use; administrators can see everyone for support.',
      'Routine background checks are counted by the hour rather than listed one by one, so the list stays readable — the desk checks your positions every ten seconds.',
    ],
  },
  {
    version: 'Beta V 6.45',
    date: 'August 3, 2026',
    notes: [
      'Market prices for the Market Data board and price alerts now come from an account belonging to the site. Before this, if the site had no account of its own, it quietly used whichever trader\'s OANDA connection it found first — spending their rate limit to serve everyone else, with no way for them to know or opt out.',
      'The same borrowing is gone from funded positions on the Live Wall: a funded position is now marked with the site price feed or its own owner\'s connection, never a teammate\'s.',
      'Your broker connection is now only ever used for your own positions.',
    ],
  },
  {
    version: 'Beta V 6.44',
    date: 'August 3, 2026',
    notes: [
      'Broker credentials are now stored under a stronger, dedicated encryption key. Everyone has to enter their broker keys once more: your connections are still there with their names and settings, marked disconnected — open Trade Analysis ▸ Live Brokers and paste the key back in.',
      'Hand-entered (manual) books are unaffected and need nothing from you.',
      'A connection whose stored credentials cannot be read now says so on the connection itself, instead of quietly disappearing from the desk while still showing a green light.',
    ],
  },
  {
    version: 'Beta V 6.43',
    date: 'August 3, 2026',
    notes: [
      'You can now keep your trading book to yourself while staying on your team. The switch is in My Terminal ▸ Trading Team, and it says exactly what a teammate sees before you turn it on: instrument, direction, entry, size, stop, target, live P&L and open time.',
      'Going private hides your trades from your teammates — the team leader included — on the Live Wall, Trade Log and History. It changes nothing about what you see, and you still get every team alert.',
      'Anyone already on a team keeps sharing, so nothing on the wall goes dark. Whoever joins a team from here starts private until they say otherwise.',
    ],
  },
  {
    version: 'Beta V 6.42',
    date: 'August 3, 2026',
    notes: [
      'Anything that takes an API key of your own is now Max. That was already true of broker connections; Pushover joins it, since connecting it means handing over your Pushover key.',
      'Phone notifications stay free on every account — they need no key from you — so a free account is still told when a price alert fires.',
    ],
  },
  {
    version: 'Beta V 6.41',
    date: 'August 3, 2026',
    notes: [
      'Fixed the Live Wall on mobile: with the terminal zoomed in, the board sized its tiles wider than the screen, which pushed the page sideways and left the watchlist and chart rendering off-centre with a white band beside them. They now measure the screen the same way the tiles are drawn, at any zoom level.',
    ],
  },
  {
    version: 'Beta V 6.40',
    date: 'August 2, 2026',
    notes: [
      'Yahoo Finance now leads the live-stream list — it is the one channel a free account can play, so it should not sit last under three it cannot open.',
      'Premium and above can watch up to four live streams at once instead of one; free accounts still play one at a time.',
      'A free account now sees the whole channel list with a Premium star on the ones it cannot open yet, and the Max diamond on "Add a channel", instead of them being hidden.',
      'Live Brokers is now Max, marked with the diamond. Connecting a broker moves up with it.',
      'Trade Analysis dropped the History tab. It showed the same closed trades the Trade Log already had — the day and month filters, the By Strategy and By Instrument breakdowns, the held time, the strategy column, and correcting a closed broker trade all moved into the Trade Log.',
    ],
  },
  {
    version: 'Beta V 6.39',
    date: 'August 2, 2026',
    notes: [
      'The date under the top-bar clock now names its time zone, the way the time above it already did.',
    ],
  },
  {
    version: 'Beta V 6.38',
    date: 'August 2, 2026',
    notes: [
      'Your time zone is saved to your account instead of the device, so it follows you to your phone, your laptop and anywhere else you sign in. A zone you had already picked carries over on its own.',
    ],
  },
  {
    version: 'Beta V 6.37',
    date: 'August 2, 2026',
    notes: [
      'My Terminal ▸ Preferences has a time zone. Pick a city or follow your device, and the top-bar clock, trade stamps, alert times, headline times and the chart axis all move to it. Eastern stays the default.',
      'Market hours, strategy sessions and the Fed schedule stay on Eastern whatever you pick — those are the market’s hours, not yours.',
    ],
  },
  {
    version: 'Beta V 6.36',
    date: 'August 2, 2026',
    notes: [
      'The first badge beside a name is now the account status — founder, software developer, admin, Max or Premium — and only one of them shows. A founder, software developer or admin no longer also carries a Max or Premium badge, since those accounts reach everything Max does anyway.',
      'The Ask VTS AI button carries the Max diamond, so the button says what the feature costs.',
    ],
  },
  {
    version: 'Beta V 6.35',
    date: 'August 2, 2026',
    notes: [
      'Study Presentations now ends with a "Build a presentation" tile, and Study Creation is a chooser — three tiles for study games, flashcard sets and presentations — instead of all three makers stacked down one page.',
      'Removed the Subjects section from Studies. With six sections in the sidebar, a page listing them was redundant.',
    ],
  },
  {
    version: 'Beta V 6.34',
    date: 'August 2, 2026',
    notes: [
      'The sidebar keeps its workspace colours. A section that costs something now carries a small star (Premium) or diamond (Max) at the right of the row instead, and sections are stacked free first, then Premium, then Max.',
      'To Do moved to My Terminal.',
      'Now Max: the Trade Desk, trading teams, team chat, and adding your own live stream. Now Premium: the Market Data board, the live streams beyond Yahoo Finance, suggestions, and general support. Reporting a bug stays free for everyone.',
      'Market Data’s economic calendar and Fed countdown stay free — only the series board is Premium.',
      'The study screens now finish with a "Browse" and a "Create" tile instead of buttons in the corner, each showing the membership it needs.',
      'Premium Features has a box for each tier listing what it includes, with "Your membership" over the one you hold.',
      'The Max badge is a proper cut diamond rather than a tilted square.',
    ],
  },
  {
    version: 'Beta V 6.33',
    date: 'August 2, 2026',
    notes: [
      'VTS AI now needs a Max membership. Customer support is unaffected — it stays free on every account.',
      'Trading teams stay on Premium.',
    ],
  },
  {
    version: 'Beta V 6.32',
    date: 'August 2, 2026',
    notes: [
      'The sidebar is now colour-coded by membership. A section that needs Premium is yellow; one that needs Max is diamond blue; everything else keeps its workspace colour.',
      'The Premium badge star is yellow and the Max badge diamond is diamond blue — the same two colours the sidebar uses, so the nav reads without needing a key.',
      'Premium Features lists what tier each paid feature needs, in that tier’s colour.',
    ],
  },
  {
    version: 'Beta V 6.31',
    date: 'August 2, 2026',
    notes: [
      'Memberships. The terminal now has paid tiers — Free, Premium and Max — ahead of opening to the public. Eight things sit behind them: VTS AI, broker and API connections, Funded Account tracking, making your own study games, custom Live Wall boards, trading teams, badges and Strategy Sessions. Everyone already on the terminal keeps everything, permanently.',
      'My Terminal ▸ Premium Features is now Premium Features, and shows what your membership includes.',
      'Administrator Log (Admin Terminal). Every membership an admin grants is recorded with who granted it and why — a reason is required. Bug reports, support requests and Early Access requests appear here too: red while they need somebody, green once closed.',
      'Admin Guidelines (Admin Terminal). The rules admins work to, and how to handle the situations that come up.',
      'Administrator chat. A third tab in the corner chat, for founders, developers and admins.',
      'Developer Blog (Developer Terminal). An idea board. Posts marked VTS Development come from Claude Code.',
      'Fixed: phone notifications, Pushover, the positions widget, broker connections and the trade alert sound were invisible for every account. Phone alerts and Pushover now work without the trading desk turned on, since price alerts are included with every account.',
      'Investment Holdings has been removed from My Terminal — the Investments workspace already tracks your portfolio.',
      'Early Release is now a rocket. A gold star means Premium; a diamond means Max.',
      'Trimmed the redundant how-to tips that had built up across the terminal.',
    ],
  },
  {
    version: 'Beta V 6.30',
    date: 'August 2, 2026',
    notes: [
      'The login screen is tidier: the note under the email box is gone, and the footer no longer calls the terminal confidential.',
    ],
  },
  {
    version: 'Beta V 6.29',
    date: 'August 2, 2026',
    notes: [
      'The login screen no longer shows a sample company email in the box. The label and the line under it already say what goes there, and a company address is the wrong hint for anyone signing in from outside the company.',
    ],
  },
  {
    version: 'Beta V 6.28',
    date: 'August 2, 2026',
    notes: [
      'Market News: you can now rename a channel on the stream wall. The pencil beside a channel opens it — the name is the desk’s, so everyone on your team sees the change.',
      'You can also mark a channel as broadcasting 24/7, both when you add it and afterwards. This was already how the four starter channels worked, but there was no way to set it on one you added yourself.',
      'That tick does real work: a 24/7 channel keeps its player up even when we cannot confirm the stream is on. Without it, your own round-the-clock channel could sit reading “not live right now” while it was plainly broadcasting.',
      'Renaming keeps everything else about the channel — what you are watching, and whether the bell is armed — exactly where it was.',
    ],
  },
  {
    version: 'Beta V 6.27',
    date: 'August 2, 2026',
    notes: [
      'Checked all 33 contribution limits in Contributions & Goals against the IRS announcements. One was wrong: the 2026 SIMPLE IRA catch-up was showing $3,500, which was last year’s figure. It is $4,000. Everything else — the 401(k), IRA, SEP, HSA and ESA limits for 2024, 2025 and 2026 — was correct.',
      'Fixed a more subtle error: every catch-up was labelled \u201cAge 50+\u201d, but an HSA’s extra $1,000 only starts at 55. Anyone aged 50 to 54 was being shown a thousand dollars of room they did not have. Each limit now states its own starting age.',
      'Added the higher catch-up for ages 60 to 63 introduced by SECURE 2.0 — $11,250 on a 401(k), $5,250 on a SIMPLE. It replaces the ordinary catch-up rather than adding to it, and the screen says so.',
      'The footnote now also flags that a SIMPLE plan at a small employer can allow a higher limit than the published one.',
    ],
  },
  {
    version: 'Beta V 6.26',
    date: 'August 2, 2026',
    notes: [
      'New: My Terminal \u25b8 Net Worth. Everything you own minus everything you owe, in one number, recorded once a day so you can watch it move.',
      'Your investment portfolio and trading account are counted automatically — you do not enter them, and the screen marks them so you do not add them a second time by mistake. Everything else goes in by hand: a house, a car, savings, a mortgage, a card balance.',
      'Debts are entered as plain positive amounts and subtracted for you. A negative net worth shows honestly rather than being hidden.',
      'If part of the picture cannot be read — say a broker is not answering — no total is shown at all, and that day is not recorded. A net worth with a piece missing looks complete when it is not.',
      'That completes the build: every section in Investments and both My Terminal summaries are now live.',
    ],
  },
  {
    version: 'Beta V 6.25',
    date: 'August 2, 2026',
    notes: [
      'New: My Terminal ▸ Investment Holdings. Your long-term investment portfolio and your trading desk on one screen, with a single total across both.',
      'The total adds your portfolio to the money actually in your trading account, plus any coins you hold outright. Open trades are listed with their profit or loss but are deliberately not added in — the size of a leveraged position is not money you hold, and counting it would badly overstate what you are worth.',
      'Anything left out of the total is named rather than quietly dropped: a book you keep by hand has no balance to read, and a funded challenge account is the firm’s capital rather than yours.',
      'Without Advanced Trading turned on the screen still works — it shows your investments and offers the trading half if you want it.',
    ],
  },
  {
    version: 'Beta V 6.24',
    date: 'August 2, 2026',
    notes: [
      'Fixed: anyone invited before Feature Access arrived on July 31 lost the Advanced Trading workspace instead of keeping it. The update that was meant to carry every existing account across silently did nothing, so those accounts were treated as brand new and had the trading desk switched off. They have it back now, along with the Funded Account tracker if they had it before.',
      'If you had deliberately turned Advanced Trading off, it stays off — this only restores accounts that never chose anything.',
      'Fixed: a Market News channel could be listed twice on the same desk, because the rule preventing it was never applied to the database. Duplicates have been merged, keeping the original, and the rule is in place now.',
      'The starter channels on the Market News wall now carry their real YouTube IDs on every desk. Ones set up a while ago could be left with tiles that never played.',
    ],
  },
  {
    version: 'Beta V 6.23',
    date: 'August 2, 2026',
    notes: [
      'The Investments workspace is open. It was eight “Coming Soon” cards; all eight are now real screens — Portfolio Overview, Accounts, Holdings, Allocation, Performance, Dividends & Income, Contributions & Goals, and Projections.',
      'Add your accounts — 401(k), IRA, Roth, ESA, HSA, brokerage — and what each one holds, and the rest fills itself in: total value, what you have gained, how you are spread across stocks, bonds and cash, and what each account is worth on its own.',
      'Contributions are tracked against the annual IRS limits, so you can see how much room you have left this tax year. Employer match is shown beside your own figure rather than counted against your limit. Savings goals track alongside, either against one account or your whole portfolio.',
      'Where a holding cannot be priced automatically, you enter the price and the terminal says so plainly — every holding is labelled “live price” or “your price”, and anything with no price at all is left out of the totals and flagged rather than quietly counted as zero.',
      'Performance separates what you paid in from what the market actually did, so a balance that only grew because you kept contributing does not read as a gain. It starts recording the day you first open the workspace and builds from there — it cannot show history from before that, because there is no way to look up what your funds were worth last year.',
      'Accounts are entered by hand for now. Connecting them automatically needs a paid read-only service (Plaid or SnapTrade), which is a decision rather than a build — the Accounts screen explains where that stands.',
      'Investments is a tracker. It never places a trade, never moves money, and nothing in it is investment, tax or financial advice.',
    ],
  },
  {
    version: 'Beta V 6.22',
    date: 'August 2, 2026',
    notes: [
      'The gold “due soon” dates are meaningful again. Now that the review dates are real, every daily figure — the yields, TIPS, the VIX — was permanently highlighted, because a daily release is always due tomorrow. The highlight now only appears on monthly and quarterly releases like CPI and the jobs report, which is where knowing one is coming up actually helps.',
    ],
  },
  {
    version: 'Beta V 6.21',
    date: 'August 2, 2026',
    notes: [
      'The site is now called VTS Terminal rather than VTS Portal. The name has changed everywhere it appeared — the sidebar, the browser tab, the installed app on your phone, notifications, the legal documents and the help pages.',
      'The workspaces renamed with it: My Portal is now My Terminal, Admin Portal is Admin Terminal, and Developer Portal is Developer Terminal. Nothing moved and nothing was lost — only the wording changed.',
      'The Employee Portal keeps its name. It is a separate site with its own sign-in, and it is meant to read as a different tool.',
      'Older patch notes below still say “portal”. They are a dated record of what shipped at the time and have been left as written.',
    ],
  },
  {
    version: 'Beta V 6.20',
    date: 'August 2, 2026',
    notes: [
      'The “Last → next review” dates on the economic rows can now be real rather than typed in by hand. They show when a figure was actually published and when it is published next, straight from the St. Louis Fed’s release calendar, and they keep themselves up to date.',
      'This needs a free FRED API key set on the server — it is the one part of the board that cannot work without one. Until the key is set, those dates stay as they are today.',
      'The Fed funds and primary credit rows keep reading the Fed’s own meeting schedule, which is a better answer for them than a statistics release date.',
    ],
  },
  {
    version: 'Beta V 6.19',
    date: 'August 2, 2026',
    notes: [
      'Rows no longer point at a “next review” date that has already passed. Seven of them did — jobless claims, GDP, the mortgage rate, the Fed balance sheet and a few others were all still showing dates from late July. Those now read “tbc” until a real date is known, which corrects itself as the calendar moves rather than going stale again.',
    ],
  },
  {
    version: 'Beta V 6.18',
    date: 'August 2, 2026',
    notes: [
      'Gold and silver stay on sample figures. The free source tried over the last two releases will not serve a server, only a browser, so the code has been removed rather than left in place doing nothing. Both rows keep the grey Sample dot so they are never mistaken for real prices.',
      'They will switch to live on their own if you ever connect a broker account that carries metals — no further work needed at that point.',
    ],
  },
  {
    version: 'Beta V 6.17',
    date: 'August 2, 2026',
    notes: [
      'Second attempt at getting gold and silver live. The source added last release returned nothing once deployed — it hands a server a different response than it hands a browser, so the request now identifies itself the way a browser does, and falls back to a second address if the first gives nothing.',
      'If it still comes back empty, the two rows stay on their sample figures exactly as now — nothing else on the board is affected either way.',
    ],
  },
  {
    version: 'Beta V 6.16',
    date: 'August 2, 2026',
    notes: [
      'Gold and silver now read live, with real change columns. They were the last two price rows on sample figures — your OANDA account carries no metals, so they now come from a free daily close instead. If a gold quote ever looks stale or cannot be read, the row falls back to its sample figure rather than showing an old price as current.',
      'That leaves 53 of the 71 rows live. Copper is the last price row on a placeholder; the rest are all data nobody publishes for free.',
    ],
  },
  {
    version: 'Beta V 6.15',
    date: 'August 2, 2026',
    notes: [
      'Fixed a change figure getting cut off mid-number. A double-digit percentage move was too wide for its column, so the VIX read “−17.2…” instead of “−17.3%”. Large moves now drop one decimal so they always fit; small moves keep their precision.',
    ],
  },
  {
    version: 'Beta V 6.14',
    date: 'August 2, 2026',
    notes: [
      'Rows still showing placeholder figures no longer describe themselves as “live”. Eight of them did, which contradicted the grey Sample dot on the same row — they now simply say “sample”.',
      'The cut and hold odds for the next Fed meeting used to read 78% and 96%, which cannot both be true. They are now complements, as they should be.',
      'The VIX now shows its moves as percentages, matching the S&P, Nasdaq and Dow rows sitting beside it rather than using a different unit in the same table.',
      'Year-to-date is now measured from the same Eastern-time year boundary everywhere on the board.',
    ],
  },
  {
    version: 'Beta V 6.13',
    date: 'August 2, 2026',
    notes: [
      'The Fed funds and primary credit rows said they were last reviewed in June while the Fed bar right above them said July. Both now read the same live meeting schedule, so they cannot disagree. The dot plot keeps its own date — it only comes out four times a year, with the projections.',
      'The 2y–10y and 3m–10y spread rows now come straight from the two yield rows on the board rather than being read separately, so the three numbers always add up. Before, the spread could be a day fresher than the yields and show +47 where the yields implied +45.',
    ],
  },
  {
    version: 'Beta V 6.12',
    date: 'August 2, 2026',
    notes: [
      'Bitcoin and Ethereum now show their five change columns instead of dashes. Their prices were already live, but nothing behind them carried any history — the daily closes now come from Kraken’s public data, so 1D through 1Y read like every other row.',
      'Fixed rows that described themselves two ways at once. The S&P 500 and VIX said “close” on one side and “continuous” on the other; a published daily close is not a continuous tape, and the rows now say the one true thing.',
    ],
  },
  {
    version: 'Beta V 6.11',
    date: 'August 2, 2026',
    notes: [
      'The S&P 500, Nasdaq 100, Dow, WTI, Brent and natural gas now read live. They had stayed on sample figures because your OANDA account cannot quote indices or commodities — it is a forex-only account — so they now come from the St. Louis Fed and the EIA instead, as published daily closes. If you ever connect an OANDA account that does carry them, the live real-time quote takes over automatically.',
      'That takes the board to 51 of the 71 rows live, up from 45.',
      'Fixed the Fed decision bar showing an out-of-date target range. It said the Fed was “held at 4.25–4.50%” while the row directly below it correctly read 3.50–3.75%. The bar now reads the same live figure as the row, so the two can never disagree again.',
      'Gold, silver and copper are the last price rows still on sample figures — no free source publishes them daily, and your OANDA account does not carry metals. They keep the grey Sample dot.',
    ],
  },
  {
    version: 'Beta V 6.10',
    date: 'August 2, 2026',
    notes: [
      'Market Data is now live. Where the board previously showed real figures only for currencies, the dollar index and crypto, it now reads live for policy rates, inflation, the jobs numbers, the Treasury curve, the VIX, the Fed balance sheet, commodities and the US indices — values and all five change columns.',
      'That is 54 of the 71 data rows reading real numbers, up from 8. The economic data comes from the St. Louis Fed and the prices from OANDA; no setup is needed on your side.',
      'The 17 rows still showing sample figures are the ones no free data source covers — Fed meeting odds, the dot plot, the ISM surveys, the MOVE index, blended earnings and the crypto flow rows. They keep the grey Sample dot, and the notice at the top of the board now names them so you can see exactly what is left.',
      'Each live row is labelled with the period it is for — “Jun”, “wk to Jul 25”, “Q2” — so a monthly figure is never mistaken for today’s. Monthly and weekly figures show a flat 0 in the day column rather than borrowing a longer period’s move.',
    ],
  },
  {
    version: 'Beta V 6.09',
    date: 'August 1, 2026',
    notes: [
      'New Zoom control in the account menu (click your name, top right): a − and a + beside the current percentage, so you can make the whole portal bigger or smaller without touching your browser’s zoom.',
      'It steps between 50% and 200%, remembers your choice on that device, and applies the moment the page loads. “Reset to 100%” appears whenever you are not at 100%.',
      'Zooming re-lays-out the portal rather than magnifying a picture of it, so panels re-flow and text stays sharp — and nothing runs off the edge of the screen at any size.',
    ],
  },
  {
    version: 'Beta V 6.08',
    date: 'August 1, 2026',
    notes: [
      'Market News now plays one live stream at a time. Picking a channel switches to it rather than adding another tile, and picking the one that is playing closes it.',
      'The single stream takes the full width, so it is a readable player instead of several small ones. The channel list marks the one playing.',
    ],
  },
  {
    version: 'Beta V 6.07',
    date: 'August 1, 2026',
    notes: [
      'Fixed the biggest cause of streams flicking on and off: the portal’s own status check was allowed to stop a channel from playing. A round-the-clock channel now always tries to play, and the player itself decides — it shows the stream when it is on and YouTube’s own message when it is not.',
      'A channel that broadcasts 24/7 no longer gets labelled “Offline” on a failed check. It says the status is unconfirmed and lets the player speak for itself.',
      'Fixed Bloomberg’s tile showing “LIVE NOW” when the channel was off air.',
    ],
  },
  {
    version: 'Beta V 6.06',
    date: 'August 1, 2026',
    notes: [
      'Fixed the Federal Reserve countdown overlapping the tile’s own name when four streams are open side by side.',
      'Bloomberg Television’s tile now shows “Live now — this channel does not allow its stream to play outside YouTube” with a Watch on YouTube button, instead of the “This video is unavailable” box. Bloomberg blocks embedding on their end; no website can play that stream, so the tile now says so rather than looking broken.',
    ],
  },
  {
    version: 'Beta V 6.05',
    date: 'August 1, 2026',
    notes: [
      'Bloomberg Television blocks its live stream from playing on other websites — that is their setting, not a fault here, and no site can play it. Its tile now says so plainly and gives you a “Watch on YouTube” button, instead of showing the “This video is unavailable” box that looks like something is broken.',
      'Any other channel that restricts embedding gets the same treatment automatically. Channels that allow it, like Yahoo Finance, are unaffected.',
    ],
  },
  {
    version: 'Beta V 6.04',
    date: 'August 1, 2026',
    notes: [
      'Fixed the streams showing “This video is unavailable” again. Detecting whether a channel is live now works, but the portal was using that lookup to pick which video to play and getting the wrong one — it goes back to the channel player that works, and uses a specific video only when it is certain which one.',
      'Live status stays accurate: the header count and the LIVE badges now reflect what is actually broadcasting.',
    ],
  },
  {
    version: 'Beta V 6.03',
    date: 'August 1, 2026',
    notes: [
      'A stream that is playing no longer says “Offline” underneath it. When the portal cannot confirm a channel’s status it now says so plainly instead of claiming the channel is off air — the player itself is the answer.',
      'The “0 live” count is hidden when the portal has not managed to check any channel, rather than reading as “nothing is on” next to a stream that is visibly playing.',
      'Added a second way of finding a channel’s live stream, using the same player page the browser uses. The first method appears to be refused by YouTube from the server, which is why status was coming back blank.',
      'The Federal Reserve tile keeps its countdown when the Fed’s status is unknown — but on meeting day it tries to play instead, so the press conference is never hidden behind the countdown.',
    ],
  },
  {
    version: 'Beta V 6.02',
    date: 'August 1, 2026',
    notes: [
      'Fixed a stream disappearing when you refreshed the page. The portal re-checks whether a channel is live every 90 seconds, and a refresh landing in that gap was blanking a stream that was playing perfectly well. It now keeps showing the stream while it re-checks in the background.',
      'Fixed streams taking a long time to appear after a refresh — the wall now waits a moment for a real answer on first load instead of showing empty tiles until the next check.',
      'A channel the portal cannot reach no longer reads as “not live right now”. It says nothing and keeps trying to play, rather than claiming a channel is off air when it never managed to look.',
    ],
  },
  {
    version: 'Beta V 6.01',
    date: 'August 1, 2026',
    notes: [
      'Fixed the stream wall showing “This video is unavailable” on tiles that should have been playing. The portal now finds the channel’s actual live video and plays that, instead of asking YouTube to guess from the channel alone.',
      'A tile starts playing on its own within a few minutes of a channel going live — no reloading the page to catch the start of something.',
      'The Federal Reserve tile now shows the countdown to the next FOMC rate decision and how long ago the last one was, instead of an empty player. It swaps itself for the stream when the Fed goes live, and picks up the Fed’s scheduled waiting room beforehand so it rolls straight into the press conference.',
      'Yahoo Finance, Bloomberg and Reuters are all marked 24/7 now. The Fed is the only channel that isn’t, because it only broadcasts around meetings.',
      'The starter channels ship with their real YouTube IDs, so a new desk’s tiles work immediately rather than waiting on a lookup.',
    ],
  },
  {
    version: 'Beta V 6.00',
    date: 'August 1, 2026',
    notes: [
      'Market News: removed the “N streams open” count from the live streams header — the open streams are right there on screen.',
    ],
  },
  {
    version: 'Beta V 5.99',
    date: 'August 1, 2026',
    notes: [
      'Fixed: the Kraken account on the Trade Desk was still called "Andrew’s Trades", sitting next to "Andrew’s OANDA" — two cards that did not say which was which.',
      'Naming a connection after its platform is now a rule the portal keeps, not a one-off rename. Any account whose name does not say which platform it is gets it added, whenever it is created or renamed, and every name is checked again each time the portal restarts.',
      'A name you have chosen that already says the platform is left exactly as you wrote it. Manual entries are left alone entirely — those are named after the prop firm, not a platform.',
    ],
  },
  {
    version: 'Beta V 5.98',
    date: 'August 1, 2026',
    notes: [
      'The Trade Desk now trades crypto. Connect a Kraken key and it appears beside your OANDA account with its own ticket — market, limit and stop orders, a protective order attached on fill, live prices, and every attempt written to the order journal.',
      'Kraken is spot only, on purpose. A buy commits the full cash cost and a sell disposes of coins you already hold — the desk never asks Kraken for leverage, so no order it sends can be liquidated. Your Kraken key does not need margin permission.',
      'New Holdings panel: what your crypto accounts actually own, priced live. Spot leaves you a balance rather than a position, so pressing Sell fills the ticket in with that coin and waits for you to confirm, exactly like any other order.',
      'Kraken attaches one protective order to an entry, not two. Set a stop or a target and the ticket says so plainly instead of quietly dropping the other at the exchange.',
      'Size chips on a crypto ticket are amounts of money — $100, $500, $1,000 — because that is how a coin is actually bought. Sizes now print at the precision they need, so 0.00042 of a bitcoin no longer reads as zero.',
      'Broker connections are named for whose they are and where they are: "Andrew’s OANDA", "Andrew’s Kraken". Existing ones were renamed to match, and each account card names its venue.',
      'The Working orders panel no longer sits empty on the desk. It appears when you actually have a limit or stop order resting, which is also where you cancel one.',
    ],
  },
  {
    version: 'Beta V 5.97',
    date: 'August 1, 2026',
    notes: [
      'Fixed the trader picker on Trade Analysis: the list of traders opened leftward and disappeared behind the sidebar, so you could not read or click most of the names. It now opens to the right of the button, fully on screen.',
    ],
  },
  {
    version: 'Beta V 5.96',
    date: 'August 1, 2026',
    notes: [
      'Market News: tidied the screen — the description under the title and the note about live status being sample data are gone.',
      'The stream wall no longer has a “1 up / 2 up / 3 up” layout row. How many streams play side by side is simply how many channels you open from the list on the right, fitted to your screen width.',
    ],
  },
  {
    version: 'Beta V 5.95',
    date: 'August 1, 2026',
    notes: [
      'Fixed: the four channels the stream wall starts with (Yahoo Finance, Bloomberg, the Federal Reserve, Reuters) could get stuck on \u201cchannel ID is still being looked up\u201d and never start playing.',
      'The portal now looks up a missing channel ID on its own, in the background, whenever you open Market News — no YouTube key needed. Give it a few seconds and the stream starts playing by itself.',
      'A channel that genuinely cannot be found is retried at most once every half hour rather than on every refresh.',
    ],
  },
  {
    version: 'Beta V 5.94',
    date: 'July 31, 2026',
    notes: [
      'You can now add your own channels to the Market News stream wall. Paste a YouTube channel link, give it a name if you want, and it joins the wall.',
      'Channels belong to the whole trading team — add one and every teammate sees it. Which streams you keep open, which one is docked in the corner, and which ones alert you stay your own.',
      'Any link form works: youtube.com/@name, youtube.com/channel/..., or the older /c/ and /user/ addresses. A /channel/ link starts playing straight away; the others take a moment to look up the first time.',
      'The wall starts with Yahoo Finance, Bloomberg, the Federal Reserve and Reuters. None of them are fixed any more — remove any you do not want with the \u00d7 beside it.',
      'The read-only demo can watch the wall but cannot change what the desk sees.',
    ],
  },
  {
    version: 'Beta V 5.93',
    date: 'July 31, 2026',
    notes: [
      'New: My Portal ▸ Feature Access. You now choose which optional parts of the portal you want. Advanced Trading — the trading desk — is opt-in, and Funded Account sits under it as a second tick. Everyone already using the portal keeps everything they had.',
      'Turning a feature off only hides it. Nothing is deleted, and switching it back on brings the workspace back exactly as it was.',
      'The market-watching screens moved into a new Markets workspace that everybody gets with no opt-in: the Live Wall board, Market Data and Market News. Charts, watchlists, headlines, the economic calendar and price alerts are all there.',
      'The Live Wall now serves both. Without Advanced Trading you get the board — charts, watchlist, news, calendar — on one saved layout. With it you also get the Positions view, the desk tiles and your named presets, on the same screen as before.',
      'A feature you have not turned on still shows in the sidebar, dimmed with a padlock; clicking it takes you to Feature Access.',
      'The first time you turn on Advanced Trading it states plainly that the desk places real orders through your own broker, and asks you to confirm. The Funded role is retired — anyone can now opt into the challenge tracker themselves.',
    ],
  },
  {
    version: 'Beta V 5.92',
    date: 'July 30, 2026',
    notes: [
      'Adding a YouTube channel to the Market News stream wall now accepts the address straight from the browser bar, in any form — a /channel/ link, an @handle link, a bare @handle, or the older /c/ and /user/ links.',
      'A /channel/ link already contains the channel ID, so the portal now reads it out of the address instead of looking it up. That channel starts playing immediately, uses none of the daily YouTube allowance, and works even with no YouTube key set.',
      'Fixed: pasting anything other than an @handle link used to be silently misread — a /channel/ address became the nonsense handle \u201cchannel\u201d, which wasted a lookup, failed, and was then ignored for six hours.',
    ],
  },
  {
    version: 'Beta V 5.91',
    date: 'July 31, 2026',
    notes: [
      'The red dot on Admin ▸ Bug Reports now means what it says: a report is still waiting on a person — not resolved, and nobody has replied to the reporter’s latest message yet.',
      'It clears the moment you reply or mark the report resolved, so a handled report can no longer leave the dot stuck on after a relaunch. The assistant’s own intake reply does not count as an answer.',
    ],
  },
  {
    version: 'Beta V 5.90',
    date: 'July 31, 2026',
    notes: [
      'Indices, gold, crypto — and shares, when they arrive — now get their own version of the per-pip figure: what the trade is worth per point. 10 units of the S&P reads “$10.00 / point”, 100 ounces of gold reads “$100.00 / point”.',
      'A point is one whole unit of price: the index going 5,000 to 5,001, or a dollar of share price. Currency pairs keep pips, so nothing about an FX ticket changed.',
      'The spread and the stop/target distances follow the same unit, so a stop on bitcoin now reads “$677.50 · 1,355 pts” instead of a bare dollar figure, and big numbers get their thousands separator.',
    ],
  },
  {
    version: 'Beta V 5.89',
    date: 'July 31, 2026',
    notes: [
      'The Trade Desk’s size box now tells you what the trade is worth per pip — 10,000 units of EUR/USD reads “$1.00 / pip”, 100,000 reads “$10.00 / pip”. It is worked out from the live quote, so a pair that isn’t quoted in your account currency is converted properly rather than assumed.',
      'Pips only show up where a pip actually exists. On gold, an index or crypto the desk now shows the raw price move and the money instead of labelling it in pips — the spread and the stop/target readings too, not just the new line.',
      'The quick-size buttons match the instrument as well: thousands for currency pairs, fractions for anything that trades in fractions, and never a size the broker would reject as too big or too small.',
    ],
  },
  {
    version: 'Beta V 5.88',
    date: 'July 31, 2026',
    notes: [
      'Tidied up the Trade Desk. Prices on the ticket now carry the instrument’s own decimal places, so the two sides of a quote line up instead of reading 1.153 next to 1.15335.',
      'The bid/ask boxes and the Buy/Sell buttons were two controls doing the same job — they are now one. Pick a side by clicking its price, with the spread in pips between them.',
      'The ticket is shorter, so the Review button sits on screen on a laptop instead of below the fold. Size and risk share a row, and the summary reads as a compact block.',
      'The desk’s open book, working orders and sent orders now share the wide right-hand column instead of stacking under the ticket where they ran off the bottom of the page.',
      'Fixed the size box being squeezed to a few characters on a phone, and an account with nothing open no longer prints its balance twice.',
    ],
  },
  {
    version: 'Beta V 5.87',
    date: 'July 31, 2026',
    notes: [
      'The Live Wall presets are a dropdown now. They used to sit above the board as a row of buttons that wrapped onto three or four lines on a phone once you had a few saved — now it is one line: the preset you have open, and a tap to switch.',
      'The menu opens inside the portal, in the desk’s own colours, rather than handing you the phone’s built-in picker wheel. It marks which preset you are on and which one is your default.',
      'Edit layout moved up beside it, so the whole bar is one row and the board starts higher up the screen.',
    ],
  },
  {
    version: 'Beta V 5.86',
    date: 'July 31, 2026',
    notes: [
      'New: the Trade Desk places trades. Connect your own OANDA account under Connections and you can send market, limit and stop orders — with a stop and target attached — straight from the portal.',
      'The screen that used to be called Trade Desk is now Trade Analysis. Nothing about it changed: the Trade Log, Live Brokers and History views are all still there, under the new name.',
      'Beside the ticket sits the desk’s open book — every position your team currently holds, yours and your teammates’, so you size a trade knowing what the desk is already in. Click any instrument to load it into the ticket.',
      'Size a trade from the risk you are willing to take: set a stop, type the amount, and the desk works the size out. The stop and target boxes read in your account currency and in pips, priced off the live quote rather than assumed to be dollars.',
      'Nothing is sent on the first click. The ticket goes to a review panel that states the order in one sentence with the amount at risk, and a live account says so in red before you confirm.',
      'Your own open positions carry Close and Stop/Target controls. Teammates’ positions are watch-only — the desk only ever trades the account you connected yourself.',
      'Resting limit and stop orders are listed with a Cancel button, and “Sent orders” keeps the record of everything the desk sent, including the ones the broker refused and why.',
    ],
  },
  {
    version: 'Beta V 5.85',
    date: 'July 31, 2026',
    notes: [
      'The Market News stream wall now carries five channels that broadcast around the clock — Bloomberg Television, Yahoo Finance, Sky News, DW News and Al Jazeera English — so there is always something playing beside the headlines. They are marked 24/7 in the channel list.',
      'The Federal Reserve, the ECB and Reuters stay on the list for the times they do broadcast. Arm the bell on those and you get buzzed when a press conference starts rather than watching a dark tile.',
      'The channel list is now the same curated set for everyone instead of something each person builds. That is what keeps the live status working no matter how many people use the portal — the cost of checking a channel is shared by everybody watching it.',
      'Your own setup still saves: which streams you have open, how they are laid out, which one is docked to the corner, and which channels buzz you.',
    ],
  },
  {
    version: 'Beta V 5.83',
    date: 'July 30, 2026',
    notes: [
      'Market News live streams now show real status: a channel that is actually broadcasting gets a LIVE badge, its stream title and its viewer count, and goes back to offline on its own when the stream ends.',
      'Turn the bell on for a channel and your phone buzzes the moment it goes live — useful for catching the start of a Fed press conference without watching for it.',
      'Channels you added by handle now resolve themselves, so they start embedding the player here instead of only linking out to YouTube.',
      'Offline channels name their most recent broadcast, so you can see what you missed.',
      'This needs a YouTube key on the server. Without one nothing is invented — every channel simply reads offline and the screen says the live figures are sample.',
    ],
  },
  {
    version: 'Beta V 5.82',
    date: 'July 30, 2026',
    notes: [
      'Market News is rebuilt around two things: the headline feed and a live-stream wall. Headlines are grouped by recency (last hour, earlier today, yesterday, then by day), newest first, with the instruments each story mentions.',
      'You can now watch news channels inside the portal — open as many as you want and lay them out 1-up through 6-up, so a Fed press conference plays right beside the headlines instead of in another tab. One stream can be docked to a floating corner player.',
      'Follow, add and remove your own YouTube channels from Manage channels; a channel ID embeds the player, a handle links out until the ID is resolved. Your channel list and layout are saved to your account.',
      'Filter the feed by topic (Federal Reserve, EUR/USD, Metals, Crypto, Indices, Rates & yields) or by source, with a Sources rail that shows what each feed carries.',
      'The AI overview, the "how it could affect us" note and the impact dots are gone — the feed states plainly that it is informational only, not investment advice. The economic calendar now lives on Market Data.',
    ],
  },
  {
    version: 'Beta V 5.81',
    date: 'July 30, 2026',
    notes: [
      'Market Data now shows real prices for FX and crypto, quoted from OANDA: EUR/USD, GBP/USD, USD/JPY, USD/CAD, AUD/USD, the dollar index, Bitcoin and Ethereum.',
      'Those rows also carry real changes over all five periods — 1 day, 1 week, 1 month, year to date and 1 year — worked out from daily closing prices rather than estimated.',
      'The dollar index is not something a broker quotes, so it is calculated from the six currencies and weights the official index uses. The row says so instead of crediting a publisher it did not come from.',
      'Every figure still waiting on a data source now carries a grey Sample dot, and the notice at the top of the screen names exactly which groups are live and counts the rest — so it is clear at a glance which numbers you can trade off.',
      'Prices refresh at most once a minute and the last good reading stays on screen if a refresh fails, so the board never blanks out.',
    ],
  },
  {
    version: 'Beta V 5.80',
    date: 'July 29, 2026',
    notes: [
      'New section: Advanced Trading \u25b8 Market Data, sitting just above Market News. One screen for every rate, print and price the desk watches — policy rates, inflation, jobs, the Treasury curve, FX, commodities, crypto, indices, liquidity, and the four trading sessions.',
      'A bar across the top counts down to the next Federal Reserve decision and press conference, with the last meeting, the current target range, and what the market has priced for the next two meetings.',
      'The board is yours to arrange: pin the numbers you care about to the strip at the top, drag them into the order you want, remove anything you never look at, and add your own metric for anything the feeds do not carry. Every removal can be undone, and your arrangement is saved to your account rather than the browser.',
      'Each series shows five changes side by side — 1 day, 1 week, 1 month, year to date, 1 year — plus who publishes it, when it was last revised, and when it is next due. A due date inside a week is highlighted.',
      'A second view carries the Forex Factory release calendar: actual against forecast and previous, grouped by day in Eastern Time, with past releases dimmed below and a plain-language explanation of what the bigger releases actually are.',
      'The series figures on this first release are placeholder values from the design and the screen says so at the top. The economic calendar, the session open/closed readings and the Fed countdown are all real.',
    ],
  },
  {
    version: 'Beta V 5.79',
    date: 'July 29, 2026',
    notes: [
      'Design notes only: the repo now carries an up-to-date description of the portal\'s layout — the sidebar, the top bar, the colours and the standard cards and buttons — for use when mocking up new screens in a design tool. Nothing in the portal itself changed.',
    ],
  },
  {
    version: 'Beta V 5.78',
    date: 'July 29, 2026',
    notes: [
      'VTS AI now answers the same way everywhere in the portal: the answer first, no preamble or padding, bullets for lists, numbered steps for anything done in order, and short paragraphs instead of blocks of text.',
      'It states an assumption and keeps going rather than stopping to ask, and only asks when the missing detail would change the answer. It no longer compliments the question or describes its own reply.',
      'This covers Ask VTS AI, the study tutor, the Market News and challenge briefs, the study-guide builder, the To Do command bar and the support chat.',
      'Admin ▸ AI Instructions has a new "Response style" box at the top holding all of it. Editing that one box changes the voice of every AI reply in the portal at once.',
    ],
  },
  {
    version: 'Beta V 5.77',
    date: 'July 29, 2026',
    notes: [
      'Deleting a trade is no longer limited to the trader who placed it. The team leader can now remove any trade on the desk, and can hand that out to a teammate with a new "Delete trades" permission in My Portal ▸ Trading Team — the same checkbox list that already covers invites, badges and the rest.',
      'The permission covers putting a trade back too: anyone who can delete a teammate\'s trade can restore it from Deleted Trades. Correcting the numbers on a teammate\'s closed trade is still admins only.',
      'Everyone else is unchanged — without the permission you still only see a delete button on your own rows, and nobody can reach a trade outside their own team.',
    ],
  },
  {
    version: 'Beta V 5.76',
    date: 'July 29, 2026',
    notes: [
      'The Employee Portal navigation has moved out of the left sidebar and into the bar across the top of the page. The sidebar and its collapse button are gone, so every screen now gets the full width of the window.',
      'The top bar never scrolls sideways and never shortens a label to "…". When the window is too narrow to fit everything on one line, the bar gets taller and the buttons move onto a second or third line instead, so every name stays readable in full.',
    ],
  },
  {
    version: 'Beta V 5.75',
    date: 'July 29, 2026',
    notes: [
      'History rows now show how long each trade was held, under its open and close times — "held 4h", "held 36m", and so on.',
      'A trade held longer than a day reads in days rather than hours, so a four-day swing shows "held 4d" instead of "held 96h". This applies anywhere a held time is shown, including the Trade Log cards.',
    ],
  },
  {
    version: 'Beta V 5.74',
    date: 'July 29, 2026',
    notes: [
      'Every position now shows the time and date it opened — and, once it is done, the time and date it closed. On a Live Wall card they sit in the bottom-right corner, just to the left of the "5h 18m ago" reading that was already there.',
      'The same stamps are on the Trade Log (both card and row views), History, Manual Trades, the Deleted Trades list, the Master board\'s positions tile and the broker connection editor. The Trade Log and History date columns used to show only a date; they now show the open time with the close time beneath it.',
      'A closed trade also reads how long it was held, in place of how long it has been open.',
      'The iPhone home-screen widget shows the open time above the "ago" reading too.',
      'Times are Eastern, the same clock the desk uses everywhere else. Hover any stamp for the full date, year and seconds.',
    ],
  },
  {
    version: 'Beta V 5.73',
    date: 'July 28, 2026',
    notes: [
      'Employee Portal sign-in codes can now be sent through Resend, over the same kind of secure web connection the rest of the site uses. The previous method needed a mail port that most hosting providers block outright, which is why codes were not arriving.',
      'The old mail settings still work where they are supported, so nothing needs changing on a host that allows them.',
    ],
  },
  {
    version: 'Beta V 5.72',
    date: 'July 28, 2026',
    notes: [
      'Opening the Employee Portal now always starts a sign-in from the beginning. Leaving part-way through and coming back used to drop you on the code screen, still waiting on a code that had usually expired by then.',
      'The sign-in button says "Signing you in…" while it works, rather than "Checking…".',
      'A mail setting left blank in the deployment config is now treated as not set at all, instead of overriding the built-in default with an empty value — which could stop sign-in codes sending, or in one case stop the site starting.',
    ],
  },
  {
    version: 'Beta V 5.71',
    date: 'July 28, 2026',
    notes: [
      'Fixed the Employee Portal hanging on "Checking…" and then failing to load when the mail server does not answer. Signing in waits for the code to be sent, and that wait was unbounded — a mail server that accepted the connection and then went quiet held the sign-in open for up to two minutes, until the browser gave up.',
      'The wait is now capped at ten seconds. A mail server that is unreachable or misconfigured gets you the "code could not be emailed" notice instead of a broken page, which is what was always intended.',
    ],
  },
  {
    version: 'Beta V 5.70',
    date: 'July 28, 2026',
    notes: [
      'Maintenance only: added a behind-the-scenes check that confirms each broker trade is recorded once and that the desk’s trade counts and P/L match the broker. Nothing in the portal itself changed.',
    ],
  },
  {
    version: 'Beta V 5.69',
    date: 'July 28, 2026',
    notes: [
      'Fixed the Trade Desk showing two records for every broker position. Trades captured live were being stored a second time by the closed-trade import, so trade counts and realized P/L were both inflated.',
      'The duplicates have been merged away. Each trade now keeps one record, with the exit price and P/L taken from the broker’s own fill rather than the last price the desk polled before the position closed.',
      'Broker history keeps correcting itself: where the live feed could only estimate how a trade ended, the broker’s record now replaces that estimate on the next sync.',
    ],
  },
  {
    version: 'Beta V 5.68',
    date: 'July 28, 2026',
    notes: [
      'Setup notes only: the deployment guide now records how to connect the mail account that sends the Employee Portal sign-in codes. Nothing about the portal itself changed.',
    ],
  },
  {
    version: 'Beta V 5.67',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal now signs you in with a six-digit code emailed to your work address instead of an authenticator app. There is nothing to set up: enter your password and the code arrives in your inbox.',
      'New "Remember this device for 30 days" option on the code screen. A remembered browser skips the emailed code next time — your password is still required every time.',
      'The Security screen lists every device you have remembered and lets you forget any of them; a portal administrator can forget all of someone\'s at once.',
      'Authenticator apps and printed recovery codes are gone, along with the setup walkthrough.',
    ],
  },
  {
    version: 'Beta V 5.66',
    date: 'July 27, 2026',
    notes: [
      'Removed the in-app wording editor (the floating icon that let a founder rewrite site text live) from both the main portal and the Employee Portal. All coded text is now fixed directly in the source — the same wording as before, just no longer changeable from the browser.',
    ],
  },
  {
    version: 'Beta V 5.65',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal sign-in page drops the line under its heading about being a separate area with its own session. The heading and the form carry the point on their own.',
    ],
  },
  {
    version: 'Beta V 5.64',
    date: 'July 27, 2026',
    notes: [
      'Developers can add a headshot for anyone in the Employee Portal. Each person on the photo roster now carries an Add link — or Replace and Remove once they have one — so the directory can be filled in without waiting on everybody individually.',
      'Only founder-level accounts get this; a portal admin still manages records but not faces. Every photo set on someone else’s behalf is written to the activity log with who did it and who it was about.',
    ],
  },
  {
    version: 'Beta V 5.63',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal takes headshots. Drop a photo onto the Overview card, or pick a file, and it appears beside your name in the directory. It is cropped square and resized in the browser before it is sent, so a large photo off a phone is fine.',
      'A roster beside the dropzone shows who has a photo and who does not, with a count of how many are still missing — a nudge, not a leaderboard.',
      'You can set where you are working today — in office, remote, or away — and it shows against your name in the directory. Only you can change your own.',
    ],
  },
  {
    version: 'Beta V 5.62',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal has a task list. Everyone gets a “My tasks” card on their Overview — add something you need to remember, give it a due date, tick it off. Completed items go grey and drop below the open ones rather than disappearing.',
      'Portal administrators can assign a task to one person or to everyone at once. Assigning to everyone gives each person their own copy, so one person ticking it off does not clear it for anybody else.',
      'Your tasks are yours. Nobody — administrators included — can see what you have and have not ticked off.',
    ],
  },
  {
    version: 'Beta V 5.61',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal has its new look. It is now a light, calm site — warm sand background, white cards, a deep green header and terracotta buttons — rather than the dark terminal styling it borrowed from the trading portal. The two are different tools for different jobs, and they no longer have to share a palette.',
      'The Employee Portal row in the main sidebar picks up the same terracotta, so the link previews where it leads.',
    ],
  },
  {
    version: 'Beta V 5.60',
    date: 'July 27, 2026',
    notes: [
      'The Employee Portal now uses its own typefaces — Source Sans for the interface and Source Serif for headings — the first piece of its new design landing. The fonts are served from the portal itself, not a font network, so nothing about the page reaches outside the company.',
    ],
  },
  {
    version: 'Beta V 5.59',
    date: 'July 27, 2026',
    notes: [
      'Developers can now reword the Employee Portal in place. A pencil button sits in the lower-right corner of the employee site; turning it on highlights every piece of wording the software itself is built from, and clicking one opens a small editor to rewrite it, reset it to the built-in text, or hide it entirely. Changes are live for everyone straight away — no deploy.',
      'Only developers see the pencil. HR administrators of the employee portal do not; managing people and documents is a different job from changing the words the site is written in. Every change is written to the employee activity log with the key, the new wording, and who made it.',
      'The editor only ever touches wording that is coded into the site. Names, document titles, announcement text, counts, dates and times are deliberately not editable — they come from the data, and a rewrite must never be able to contradict them.',
    ],
  },
  {
    version: 'Beta V 5.58',
    date: 'July 26, 2026',
    notes: [
      'The Employee Portal now has its own row at the very top of the sidebar, above Workspaces, and opens in a new tab — so the main portal stays exactly where you left it. It replaces the section that briefly sat under My Portal.',
      'Suggestions moved from the Admin Portal to the Developer Portal. Anyone can still send one from Site Help ▸ Suggestion; reading and acting on the queue is now developer-level.',
    ],
  },
  {
    version: 'Beta V 5.57',
    date: 'July 26, 2026',
    notes: [
      'New Employee Portal, at its own address: vitalistradingsystems.com/employee. It is a genuinely separate site rather than another workspace — its own page, its own bundle, and its own sign-in. Being signed in to the main portal does not sign you in there, and vice versa.',
      'Inside it: an Overview of your employment record, a staff Directory, internal Announcements and Documents, and a Security section showing your active sessions and a full log of activity on your account. Portal administrators also get a People screen for granting access and keeping records up to date.',
      'Entry requires a second factor. The first time you sign in you are walked through pairing an authenticator app and given ten single-use recovery codes. Sessions there are short — eight hours at most, and they end after thirty minutes idle.',
      'You get in from My Portal ▸ Employee Portal, which explains what to expect and opens the site. The section only appears for accounts that a founder has granted the new Employee role AND that sign in with a @vitalistradingsystems.com email — both are required, and both are re-checked at the door. The read-only demo can never reach it.',
    ],
  },
  {
    version: 'Beta V 5.56',
    date: 'July 25, 2026',
    notes: [
      'The “Dave Ramsey’s Money Principles” study game now phrases every question as “According to Dave Ramsey, …,” so each one clearly attributes the idea to him. Your progress on the game is unchanged.',
    ],
  },
  {
    version: 'Beta V 5.55',
    date: 'July 25, 2026',
    notes: [
      'New built-in Study Game: “Dave Ramsey’s Money Principles” — 50 plain-English questions on the core ideas of his approach (the Baby Steps order, the debt snowball, budgeting, investing, insurance, mortgages, and the millionaire study). It’s built to teach the concepts, not just quiz labels.',
      'Like the other built-in games it lives in Browse Study Games — add it to your list to play, take as a practice test, or track progress. Educational only, and not affiliated with or endorsed by Dave Ramsey or Ramsey Solutions.',
    ],
  },
  {
    version: 'Beta V 5.54',
    date: 'July 24, 2026',
    notes: [
      'Study games now carry a short disclaimer across the Study Game, Practice Tests, and Progress screens: the content is educational only — not financial, investment, legal, or tax advice — and any third-party method, brand, or person a game names is referenced to teach about it, not because the game is affiliated with or endorsed by them.',
    ],
  },
  {
    version: 'Beta V 5.53',
    date: 'July 24, 2026',
    notes: [
      'Study Game now separates your games from the portal’s built-in ones: your team’s games appear in violet, the portal’s ready-made games in blue.',
      'The built-in example games no longer crowd the list on day one — a new “Browse Study Games” button opens a gallery where you add just the ones you want to your study games (and remove them any time).',
      'Renamed the section heading from “Your team’s study games” to “Your study games.”',
    ],
  },
  {
    version: 'Beta V 5.51',
    date: 'July 24, 2026',
    notes: [
      'Renamed the Trading workspace to “Advanced Trading.”',
      'Introduced a new Investments workspace — a read-only, long-term portfolio tracker for the layman: 401(k), IRA, ESA, and general holdings, connected read-only through a secure aggregator or entered by hand. It displays and educates only; it never places trades or moves money, and it carries no buy/sell advice.',
      'Laid the Investments foundation with its sidebar sections — Portfolio Overview, Accounts, Holdings, Allocation, Performance, Dividends & Income, Contributions & Goals, and Projections — each marked “Coming Soon” while we build them.',
      'Added an Investment Holdings summary to My Portal that will combine your active Advanced Trading positions with your long-term investment portfolio — Coming Soon.',
    ],
  },
  {
    version: 'Beta V 5.50',
    date: 'July 24, 2026',
    notes: [
      'Added a Message Templates section to the Admin Portal — a shared library of reusable text-message and email templates admins can copy and paste wherever they need them.',
      'Right-click any template (or use its Copy button) to copy it to your clipboard; email templates also offer a “copy subject only” option.',
      'Software developers can add, edit, and delete templates; every admin can view and copy them.',
    ],
  },
  {
    version: 'Beta V 5.49',
    date: 'July 23, 2026',
    notes: [
      'Refined the Terms and Rules: automated copying — webhooks, bots, or order-routing that relay or copy someone else’s trades — is prohibited, and any trade you place must be entered by you manually in your own broker account. (Paying someone to place or copy trades, and soliciting others to copy yours, remain prohibited.)',
      'Clarified in the Terms and Rules that being able to add trades manually, edit your information, and delete trades is by design — so you can keep records that are accurate for your own goals — and that because of that flexibility the data is not verified and is not proof of performance.',
      'Updated the contact address in the Terms and Privacy Policy to support@vitalistradingsystems.com.',
      'Because these documents changed, everyone is asked to review and accept them once more.',
    ],
  },
  {
    version: 'Beta V 5.48',
    date: 'July 23, 2026',
    notes: [
      'Added a Terms of Service and a Privacy Policy, plus a plain-English “Rules & Conduct” overview — all three now live in Site Help.',
      'Everyone is asked to review and accept the Terms and Privacy Policy once before continuing into the portal. You can reopen the full documents any time from Site Help.',
      'Reinforced throughout that VTS Portal is an informational and educational tool only — not financial, investment, or trading advice — and that trade figures can be edited, so they are for your own and your team’s reference and must never be used to solicit others or prove performance.',
      'The built-in AI assistants now clearly decline requests for personalized financial or investment advice and will not help work around platform rules; AI and support conversations may be reviewed by the admins.',
    ],
  },
  {
    version: 'Beta V 5.47',
    date: 'July 23, 2026',
    notes: [
      'Trade metrics CSV export now includes the exact open and close times for each trade, in two new “Open Time” and “Close Time” columns. Times are shown in Eastern Time (the same clock the rest of the portal uses for sessions and market hours), so an export reads the same no matter where you are. Still-open trades leave the close time blank.',
    ],
  },
  {
    version: 'Beta V 5.46',
    date: 'July 23, 2026',
    notes: [
      'New built-in Study Games so new members can see how Studies works right away: “Market Terminology 101” (a plain-English glossary of orders, quotes, and trading vocabulary — educational only, not financial advice), “How Study Games Work” (levels, streaks, scoring, and leaderboards, taught by playing), and “VTS Portal 101” (a quick tour of the workspaces and where to find things).',
      'These show up automatically for every team (and any new team), tagged “Built-in.” You can play them like any other game, but they can’t be edited or removed.',
    ],
  },
  {
    version: 'Beta V 5.45',
    date: 'July 23, 2026',
    notes: [
      'The iPhone positions widget now adapts to its size: Large shows full position cards (a single one shows all the detail), Medium shows a clean compact list of everyone’s trades, and Small shows just your own top position in a tidy layout instead of a cramped, cut-off card.',
      'Regenerate the script from My Portal ▸ Settings ▸ Home-screen widget and re-paste it into Scriptable to get the size-aware layouts.',
    ],
  },
  {
    version: 'Beta V 5.44',
    date: 'July 23, 2026',
    notes: [
      'Performance: the Live Wall and the iPhone widgets now share one live snapshot per team instead of each polling the brokers separately. Several teammates and widgets open at once no longer multiply the load on OANDA/Kraken — everyone reads the same fresh feed. No visible change to your positions; it just scales cleanly as more people (and widgets) come online.',
    ],
  },
  {
    version: 'Beta V 5.43',
    date: 'July 23, 2026',
    notes: [
      'The iPhone open-positions widget now refreshes as often as iOS allows — the script asks for a ~5-minute refresh instead of the slower default. (iOS caps how often any Home Screen widget can update, so it lands around every 5–15 minutes when you’re using your phone; tap the widget to open the app for real-time.)',
      'If you already added the widget, regenerate the script from My Portal ▸ Settings ▸ Home-screen widget and paste the new version into Scriptable to pick up the faster refresh.',
    ],
  },
  {
    version: 'Beta V 5.42',
    date: 'July 23, 2026',
    notes: [
      'New: put your team’s open positions on your iPhone Home Screen. In My Portal ▸ Settings, open the “Home-screen widget” card to generate a personal read-only token and copy a ready-made Scriptable script.',
      'Add one widget per teammate — set each widget’s Parameter to a person’s handle to see just their open positions, styled like the Live Wall card. Leave it blank to show the whole team.',
      'The widget token is read-only (it can’t place trades or expose broker keys) and can be revoked anytime from the same card.',
    ],
  },
  {
    version: 'Beta V 5.41',
    date: 'July 22, 2026',
    notes: [
      'Fixed a mobile bug where rotating your phone (portrait ↔ landscape) while playing a study game — or on any screen — kicked you back out to the start. The app was rebuilding the whole screen when the layout switched between the phone and wide views; it now keeps your place, so an in-progress game, test, or half-filled form survives a rotation.',
    ],
  },
  {
    version: 'Beta V 5.40',
    date: 'July 22, 2026',
    notes: [
      'The "Unrealized PF" card on the Trade Log and Live Wall metrics is now "Projected PF" — your profit factor if every open position closed right now at its current price. It folds each open trade\'s live P/L into your realized totals, so it always reads a real number (e.g. 0.95) instead of the old "∞" you saw when all open positions were green. (The realized Profit Factor is unchanged.)',
    ],
  },
  {
    version: 'Beta V 5.39',
    date: 'July 22, 2026',
    notes: [
      'Fixed the Unrealized Profit Factor on the Trade Log and Live Wall metrics: when every open position is currently in the green there are no open losses to divide by, so it now reads "—" instead of an "∞" that made an all-green open book look like an infinite track record. It still shows a real number as soon as any open position is underwater. (The realized Profit Factor is unchanged.)',
    ],
  },
  {
    version: 'Beta V 5.37',
    date: 'July 21, 2026',
    notes: [
      'Price alerts now cover crypto. Set an alert on BTC, ETH, SOL and other major coins (e.g. BTC/USDT crosses above 70000) right alongside forex, metals and indices.',
      'Crypto alerts work without any broker connection — prices come from a live public feed. (Forex, metals and index alerts still need an OANDA connection to fire.)',
    ],
  },
  {
    version: 'Beta V 5.36',
    date: 'July 21, 2026',
    notes: [
      'New: create your own price alerts inside the portal. In Trading ▸ Trading Alerts, open the "Price alerts" card to get buzzed when a market crosses a price you set (e.g. EUR/USD crosses above 1.1000) — covers OANDA forex, metals and indices.',
      'You can also set one straight from a chart: click the 🔔 on any Live Wall chart tile to add an alert for that symbol.',
      'Alerts are personal — each one buzzes only you (phone push + Pushover) and lands in your own Trading Alerts feed. Choose one-shot or repeat-on-every-cross. Turn on phone alerts for a device to actually buzz.',
    ],
  },
  {
    version: 'Beta V 5.35',
    date: 'July 21, 2026',
    notes: [
      'Strategy Sessions ▸ "All open market hours" now includes the Sunday-evening open. For EUR/USD (and other forex) it fills Sunday 5:00 PM–11:59 PM, Monday–Thursday full days, and Friday to 5:00 PM — matching the real trading week instead of starting at Monday 12:00 AM.',
      'Index and commodity futures similarly get their Sunday-evening open (6:00 PM ET). Stocks stay Mon–Fri and crypto stays 24/7.',
    ],
  },
  {
    version: 'Beta V 5.34',
    date: 'July 20, 2026',
    notes: [
      'Developer Portal ▸ Sidebar Layout: reordering the sections inside a workspace is now obvious. Click any workspace row to open it and reorder its sections with their own up/down arrows — the section arrows no longer hide behind a stray chevron.',
      'New "Expand all / Collapse all" control opens every workspace at once, so you can rearrange sub-sections across the whole sidebar without clicking each one open.',
    ],
  },
  {
    version: 'Beta V 5.33',
    date: 'July 20, 2026',
    notes: [
      'Admins can now reply to a bug report. Open a report in Admin ▸ Bug Reports and use the new reply box to write back to the reporter — it posts into the same thread and pings them with a notification.',
      'Once an admin replies, the reporter can answer back in Site Help ▸ Report a bug, turning the ticket into a two-way conversation (the AI intake steps aside once a human is on the thread).',
      'The support/bug assistant is now named VTS AI everywhere it appears.',
    ],
  },
  {
    version: 'Beta V 5.32',
    date: 'July 20, 2026',
    notes: [
      'Support chat (the corner bubble ▸ Support tab) now remembers your conversations. Closing the bubble no longer throws away an in-progress request — reopen it and pick up right where you left off.',
      'Your previous support requests are listed at the top of the Support tab. Tap one to reopen the whole thread, with a Draft / In progress / Sent status on each.',
      'Anything you typed but didn’t send is saved as a draft and restored when you reopen that request. Once a request has been sent to the admins you can still add a follow-up in the same thread.',
    ],
  },
  {
    version: 'Beta V 5.31',
    date: 'July 20, 2026',
    notes: [
      'Market News board window: dropped the All / Med+ / High impact toggle. The window now shows every headline regardless of impact — each story still carries its High / Med / Low badge so you can tell at a glance.',
      'Live Wall ▸ Master: while editing the layout there’s now a little breathing room below the grid, so the bottom-row window’s resize handle no longer sits jammed against the footer and can be dragged down to grow.',
    ],
  },
  {
    version: 'Beta V 5.29',
    date: 'July 20, 2026',
    notes: [
      'Trade Desk settings are now per trader. Each trader’s break-even buffer, per-instrument buffers, and “ignore test trades” floor shape their own view of the desk.',
      'The team leader and the Chief Analyst / Chief Strategist (and admins) can now change any teammate’s Trade Desk settings — open Settings and use the new “Whose settings” picker at the top to choose a member. Everyone else edits only their own.',
    ],
  },
  {
    version: 'Beta V 5.28',
    date: 'July 20, 2026',
    notes: [
      'Developer Portal ▸ Sidebar Layout: a new tool to reorganize the sidebar. Reorder the workspaces and the sections inside each one with up/down arrows, then Save to apply the new order for everyone. Reset restores the built-in order. New sections added in future updates always appear automatically at the bottom of their group.',
    ],
  },
  {
    version: 'Beta V 5.27',
    date: 'July 20, 2026',
    notes: [
      'Emails are now editable by admins: open Admin ▸ Users and tap the pencil next to anyone’s email to change their sign-in address. This fixes older accounts whose email showed a doubled “…@vitalistradingsystems.com@vitalistradingsystems.com” — just edit it down to the correct address and Save.',
    ],
  },
  {
    version: 'Beta V 5.26',
    date: 'July 20, 2026',
    notes: [
      'Pushover (custom alert sound): App Store and Google Play icons now sit to the right of the Disconnect button. Tap either to jump straight to the Pushover app’s store listing to install it.',
    ],
  },
  {
    version: 'Beta V 5.25',
    date: 'July 20, 2026',
    notes: [
      'Display names are now editable by admins: open Admin ▸ Users and tap the pencil next to anyone’s name to rename them. You could already rename yourself from Account settings.',
      'People are now shown by their display name across the portal — the “@username” handle no longer trails the name on the Users list, team rosters, and pending invites.',
      'Live Wall ▸ Desk Metrics: the whole-desk / per-trader picker is now a clean, on-theme dropdown (no more clashing native menu) and lists traders by display name.',
      'My Portal ▸ Trading Team reads cleaner on a phone — each member’s actions (Badge, Make leader, Remove) now sit on their own row instead of crowding the name.',
    ],
  },
  {
    version: 'Beta V 5.24',
    date: 'July 20, 2026',
    notes: [
      'Study Game: new Practice mode toggle. Flip it on to drill questions freely — you still see whether you’re right and can talk each one through with VTS AI, but nothing counts toward your score, level, streak, or the leaderboard. A revealed answer shows “Practice — not counted” instead of a lifetime change.',
      'Study Game now keeps your place. Switch tabs, background the app, or relaunch and you land right back on the exact question you were on — even one you’ve already answered but not yet moved past — so you can revisit the explanation or keep chatting it through instead of jumping to a fresh one. Your practice-mode choice sticks too.',
    ],
  },
  {
    version: 'Beta V 5.23',
    date: 'July 19, 2026',
    notes: [
      'New Deleted Trades section (under Trading). Removing a trade from the Trade Log or History no longer throws it away — it moves here, out of your stats, and one tap restores it. Great for clearing test trades without fear of losing a real one.',
      'Unrealized Profit Factor: both the Trade Log and the Live Wall Metrics tile now show a profit factor for your open book (winners’ open gains ÷ losers’ open losses), each with its size-scaled reading beneath — just like the realized one.',
      'Live Wall Metrics tile can now scope to one trader: use the picker in the tile header to switch between the whole desk and any individual.',
      '“Count trades since” is now in Trade Desk ▸ Settings (and still on each connection), so it’s easy to find. Pick the date your real trading began per account.',
      'Profit Factor now always shows the scaled figure beneath the raw one — the Deck/Tape and Scaled-PF toggles have left the Trade Log header. Deck vs Tape moved to My Portal ▸ Preferences (new).',
      'Fixed a missing-glyph box on the Export button.',
    ],
  },
  {
    version: 'Beta V 5.22',
    date: 'July 19, 2026',
    notes: [
      'Trade Log now shows Unrealized P/L. A new card totals the live open P/L across your open positions, and every open trade shows its running P/L instead of a dash — so when your account is up on an open winner but flat on closed trades, the log reads green instead of looking like a loss. Realized P/L is still closed-only; the two sit side by side.',
      'Live Wall: new “Metrics” tile. Add it from the board’s edit bar to pin your desk’s headline numbers — realized, unrealized, and net P/L, win rate, profit factor (raw + scaled), and trade count — right next to your charts and positions.',
      'Broker connections: the “Count trades since” date is now front-and-center on each connection (no more digging into Edit). Pick the date your real trading began and it saves on the spot.',
    ],
  },
  {
    version: 'Beta V 5.21',
    date: 'July 19, 2026',
    notes: [
      'Broker connections now have a “Count trades since” date. Set it on a connection (Edit) to mark your real start on that account — an earlier learning/practice phase that you funded, traded, and withdrew no longer pollutes your Trade Log and History. Trades opened before the date are left out of every stat (win rate, profit factor, realized P/L, pips) and are never re-imported from the broker. Admins can set it per trader from Team connections. Leave it blank to count everything, exactly as before.',
      'Trade Desk Settings: new “Ignore test trades” floor. Broker fills under the units you set (e.g. the 1-unit orders you place to check a connection) drop out of the Trade Log and History entirely — stats and list. Hand-logged trades always count. Set 0 to keep everything.',
      'Trade Log: new “⚖ Scaled PF” toggle. Profit factor with every trade scaled to the same lot size (per-unit P/L), so a couple of outsized positions can’t prop up — or sink — the ratio. Both the raw and scaled readings show at a glance, and the scaled figure is in the CSV export.',
    ],
  },
  {
    version: 'Beta V 5.20',
    date: 'July 19, 2026',
    notes: [
      'Study Creation now does CSV. Study games and flashcard sets each get an “Import CSV” option (with a downloadable template) that reads a spreadsheet directly — no AI needed — and every game and set has an “Export CSV” button. Edit your content in Excel or Google Sheets and round-trip it: export, tweak, re-import.',
    ],
  },
  {
    version: 'Beta V 5.19',
    date: 'July 19, 2026',
    notes: [
      'Study Creation: new “Audit answers” button on any study game. VTS AI reviews every question one by one for problems — above all a wrong answer key, plus missing/duplicate correct options and ambiguous wording — and flags the ones to look at, with a one-tap fix to adopt the answer it thinks is right.',
      'Study Game: correcting a question’s answer key now re-scores the attempt you just made. If your original pick becomes the right answer, the miss is un-counted — your streak, level, and lifetime accuracy update to match.',
    ],
  },
  {
    version: 'Beta V 5.18',
    date: 'July 19, 2026',
    notes: [
      'Study Game: spot a flawed question mid-play and fix it on the spot. After answering, tap “Something wrong? Fix this question” to change the marked correct answer (if the key was wrong) or delete the question outright. Fixes save for the whole team instantly. Only the game’s creator or an admin sees these controls.',
    ],
  },
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
