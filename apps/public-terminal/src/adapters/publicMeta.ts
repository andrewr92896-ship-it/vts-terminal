export interface PatchNote{version:string;date:string;notes:string[]}
// The public terminal's own version and its historical archive. Separate from the
// private terminal's `meta/version` (replaced at the build seam) because they are
// different products on different release trains.
export const APP_VERSION='Public Candidate V 1.9';
export const PATCH_NOTES:PatchNote[]=[
 {version:'Public Candidate V 1.9',date:'August 29, 2026',notes:[
  'The programme is called beta access rather than early access. Early access is what games and software are sold as before release; beta says what this actually is \u2014 unfinished software you are welcome to try \u2014 and promises nothing.',
 ]},
 {version:'Public Candidate V 1.8',date:'August 29, 2026',notes:[
  'Nothing is offered anywhere in the terminal. The early-access form no longer promises a free membership or months of free access after launch, and neither does the sign-in card or the marketing page — it asks for an address, says what happens to it, and stops.',
  'Premium Features is now "What\u2019s Included": a plain list of what the terminal does and what it deliberately does not, with no plans, tiers or payments named anywhere.',
 ]},
 {version:'Public Candidate V 1.7',date:'August 29, 2026',notes:[
  'The early-access form says what happens to the address it asks for: what is kept, that it is used only to tell you when Early Access opens, that it is never sold or shared, and how to have it deleted.',
 ]},
 {version:'Public Candidate V 1.6',date:'August 29, 2026',notes:[
  'The Live Wall can size its own workspace: unlock the frame with the pencil on its corner, then drag a side or step the width. Wider means more room rather than thinner tiles, and it stops before the page has to scroll sideways.',
  'The watchlist shows every symbol on its own row instead of a scrolling tape squeezed into a narrow tile, where it was clipping its own quotes.',
 ]},
 {version:'Public Candidate V 1.5',date:'August 28, 2026',notes:[
  'The demo asks whether you are on a desktop or a phone before it opens, and lays the Live Wall out to match \u2014 side by side, or one tile per row to scroll. Both are available from the wall at any time.',
  'The top bar is cleaned up on a phone: one row, the section you are on, and the time.',
  'Removed the notifications bell. It had never done anything, and there are no notifications here to open.',
  'The account circle opens Settings. It was labelled that and did nothing.',
 ]},
 {version:'Public Candidate V 1.4',date:'August 28, 2026',notes:[
  'Fixed: on a phone, tapping a workspace closed the navigation drawer, so you had to reopen it to pick the section you were going for. It stays open now, and closes when you pick a section.',
 ]},
 {version:'Public Candidate V 1.3',date:'August 28, 2026',notes:[
  'Fixed: on a phone the sidebar opened as a column of unlabelled icons. At that width it is a slide-over drawer, and a drawer has to carry its labels.',
  'Fixed: the menu button on a phone was drawing a blank square.',
 ]},
 {version:'Public Candidate V 1.2',date:'August 28, 2026',notes:[
  'The Live Wall is a board you arrange yourself: add a tile, move it, resize it, take it off.',
  'My Terminal is customizable — put any section of the terminal on it, and take off the ones you do not use.',
  'Settings became its own workspace, with Preferences under it. Market Data moved to Advanced Trading.',
  'Premium Features states the one thing that is true in pre-release: Early Access members have full access, with no tiers to choose between.',
  'Terms of Service and the Privacy Policy say plainly that they are pre-release summaries, and every subsection says how the finished document will work.',
  'Rules & Conduct expanded, led by the rules that matter most: nothing here is advice, and nothing here is for advising anybody else.',
  'Live streams show the slot a channel plays in rather than embedding a broadcast.',
  'Reading a trade off a screenshot is switched off here, and now shows a worked example of what it produces instead of only an error.',
  'The How-to guides were rewritten to say what to do rather than what a screen is.',
 ]},
 {version:'Public Candidate V 1.0',date:'August 26, 2026',notes:[
  'Expanded the portal-derived public terminal with isolated manual trade tracking, studies, news, finances, investments and help.',
  'Removed every user-created group, broker execution, administration, developer and private-organization path from the public allowlist.',
  'AI-dependent actions fail closed until the separate public provider migration is completed.',
 ]},
];
