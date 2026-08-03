// Posts by VTS Development, checked into the repository.
//
// This is how Claude Code writes to the Developer Blog. It edits the repo; it
// has no session and no way to reach production at runtime, so a post it makes
// is an entry here, and the deploy that carries the entry publishes it
// (seedDevBlog, on boot).
//
// Rules for anything added here:
//   • `key` is permanent and unique. It identifies the post forever — changing
//     it publishes a second copy rather than editing the first.
//   • Editing `title` or `body` updates the live post on the next deploy.
//   • BE BRIEF. A few sentences. Say what changed and what it means; do not
//     explain the implementation, list the files, or write a summary of a
//     summary. The owner reads this board to think about ideas, not to review a
//     diff — a long post is not thoroughness here, it is noise.

export interface SeededPost {
  /** Permanent, unique. Never change it on an existing post. */
  key: string;
  title: string;
  body: string;
  pinned?: boolean;
}

export const SEEDED_POSTS: SeededPost[] = [
  {
    key: 'welcome',
    title: 'What this board is for',
    pinned: true,
    body: [
      'This is the idea board. Post half-formed thoughts, things to try, and questions to come back to — nothing here has to be finished.',
      '',
      'Posts marked VTS Development come from Claude Code. They arrive with a deploy rather than in real time, so treat them as notes left between sessions.',
    ].join('\n'),
  },
  {
    key: 'live-wall-central-2026-08',
    title: 'The Live Wall is now the whole terminal',
    body: [
      'Nineteen new tiles, so the wall can show anything the terminal knows: your money, your trades, your list, your study progress, your team. It leads My Terminal and is what a sign-in opens on.',
      '',
      'Two things worth a decision from you. Free accounts get three built-in layouts — Markets, Trading Desk, My Terminal — and those are placeholders I picked; tell me what belongs on each and I will set them. And the tile list is now long enough that the picker is the main way anyone discovers a feature, so what sits at the top of each group matters more than it used to.',
    ].join('\n'),
  },
];
