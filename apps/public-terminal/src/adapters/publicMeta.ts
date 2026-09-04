export interface PatchNote{version:string;date:string;notes:string[]}
// The public terminal's own version and its historical archive. Separate from the
// private terminal's `meta/version` (replaced at the build seam) because they are
// different products on different release trains.
export const APP_VERSION='Public Candidate V 2.8';
export const PATCH_NOTES:PatchNote[]=[
 {version:'Public Candidate V 2.8',date:'September 4, 2026',notes:[
  'On a phone the Live Wall no longer leaves empty space under its tiles. The chart and the live-stream slot draw at a proper height, and the watchlist tape takes only the height it needs.',
 ]},
 {version:'Public Candidate V 2.7',date:'August 30, 2026',notes:[
  'Beta access is for people aged 18 or over in the United States. That is now said on the request form before you type an address in, and you confirm it on the acceptance screen.',
  'We do not check your age or where you are, and we do not ask for a birthdate — you tell us, and we keep a record that you did. An account opened on a statement that turns out to be untrue may be closed.',
  'The documents have moved to a new version, so you will be asked to accept once more.',
 ]},
 {version:'Public Candidate V 2.6',date:'August 30, 2026',notes:[
  'There is now a dedicated address for privacy requests: privacy@vitalistradingsystems.com. Use it to ask what we hold about you or to have it deleted. Everything else — questions, bugs, anything about the terminal — still goes to support@vitalistradingsystems.com.',
  'The Privacy Policy has moved to a new version, so you will be asked to accept once more. That is deliberate: the address you would write to has changed, and we do not alter a document you have already agreed to without telling you.',
 ]},
 {version:'Public Candidate V 2.5',date:'August 30, 2026',notes:[
  'Before you use the terminal we now ask you to read four short statements about what it is and is not, and to tick a box. The Terms of Service and Privacy Policy are readable from that screen rather than linked away to.',
  'We record which version you accepted and when. If either document changes we will ask again — we cannot alter what you agreed to without telling you.',
  'You will only see it once unless the documents change. Signing out and deleting your account both stay available if you would rather not accept.',
 ]},
 {version:'Public Candidate V 2.4',date:'August 30, 2026',notes:[
  'Beta-access requests are now deleted automatically — six months after they are made, or the moment the person is let in, whichever comes first. Nothing about the terminal changes for you; what changes is that the address is no longer kept once it has nothing left to do.',
  'Spent sign-in material is cleared on the same schedule: expired sessions, used codes, rotated device tokens and finished deletion links. Being signed in, and a browser you asked us to remember, are unaffected.',
 ]},
 {version:'Public Candidate V 2.3',date:'August 29, 2026',notes:[
  'The demo can read a trade off a screenshot. Paste or upload a photo of a platform on Manual Trades and the trade is logged \u2014 an open position that then runs on the Live Wall, a whole history at once, or the close of one you are already in.',
  'No AI reads your image in the demo. The reading is a stored example and the screen says so beside the result. The sample is deliberately not flattering: the history import brings in a loser, skips a duplicate rather than double-counting it, and ignores a row that was never a trade.',
 ]},
 {version:'Public Candidate V 2.2',date:'August 29, 2026',notes:[
  'You can delete your account from Settings. We email you a link to confirm; it works once and expires after an hour, and ignoring it cancels the request. Confirming removes your account and everything in it, with no grace period and nothing kept to stop you signing up again.',
 ]},
 {version:'Public Candidate V 2.1',date:'August 29, 2026',notes:[
  'Preferences no longer offers to hide you from a leaderboard. There are no leaderboards here \u2014 nothing you do is visible to any other person \u2014 and the screen was saying otherwise.',
 ]},
 {version:'Public Candidate V 2.0',date:'August 29, 2026',notes:[
  'The beta-access form asks for an email address and nothing else. The optional note is gone \u2014 a free-text box on a form that mentions trading invites people to volunteer their broker and their account size, which is personal data nobody asked for.',
  'The address you are asked for is the only thing kept. Your IP is no longer stored by that form.',
 ]},
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
