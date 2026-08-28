export interface PatchNote{version:string;date:string;notes:string[]}
// The public terminal's own version and its historical archive. Separate from the
// private terminal's `meta/version` (replaced at the build seam) because they are
// different products on different release trains.
export const APP_VERSION='Public Candidate V 1.4';
export const PATCH_NOTES:PatchNote[]=[
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
