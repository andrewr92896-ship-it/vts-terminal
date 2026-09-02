// The marketing renderer reproduces the hand-written page.
//
// THIS IS WHAT "THE LANDING PAGE DID NOT CHANGE" MEANS. The words moved out of
// src/index.html into a document the Site Editor can change; this renders the
// seed of that document and compares it with the file, so the page cannot
// drift from what it was without this going red. Whitespace between tags is
// collapsed on both sides, because that is what a browser does with it — a
// line break the source wrapped a sentence over is not a difference anybody
// can see.
//
//   npm run verify:marketing-render

import { readFileSync } from 'node:fs';
import {
  referencedFiles,
  renderMarketing,
  validateMarketing,
  youtubeId,
} from '../apps/marketing/render/render.mjs';
import { MARKETING_SEED } from '../apps/marketing/render/seed.mjs';

let pass = 0,
  fail = 0;
const ok = (cond, label, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};

const norm = (html) =>
  html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s+>/g, '>')
    .trim();

console.log('\nA. THE SEED IS THE PAGE');
const file = readFileSync(new URL('../apps/marketing/src/index.html', import.meta.url), 'utf8');
const rendered = renderMarketing(MARKETING_SEED);
const same = norm(rendered) === norm(file);
ok(same, 'the seed renders to exactly what src/index.html contains');
if (!same) {
  const a = norm(rendered),
    b = norm(file);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  console.log(
    `    first difference at ${i}:\n    rendered: …${a.slice(Math.max(0, i - 60), i + 80)}\n    file:     …${b.slice(Math.max(0, i - 60), i + 80)}`,
  );
}
ok(validateMarketing(MARKETING_SEED) === null, 'and the seed passes its own validation');
ok(!rendered.includes('viewer.js'), 'no script is linked when nothing on the page previews a file');

console.log('\nB. VALUES ARE ESCAPED');
const evil = structuredClone(MARKETING_SEED);
evil.sections[0].h1 = '<script>alert(1)</script>';
evil.head.title = 'a"b';
const out = renderMarketing(evil);
ok(!out.includes('<script>alert'), 'markup typed into a field is escaped');
ok(out.includes('<title>a&quot;b</title>'), 'and so is a quote in an attribute');

console.log('\nC. BLOCKS');
const withBlocks = structuredClone(MARKETING_SEED);
withBlocks.sections[1].items.push(
  { kind: 'video', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', title: 'Walkthrough' },
  { kind: 'image', imgSrc: '/files/shot.png', title: 'The board' },
  { kind: 'video', videoUrl: 'https://example.com/nope' },
  { kind: 'text', body: 'A paragraph.' },
  { kind: 'callout', title: 'Note', body: 'Boxed.' },
);
withBlocks.sections[2].items.push({ title: 'Under the boundary', body: 'A card in a panel section.' });
const html = renderMarketing(withBlocks);
ok(html.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'a pasted YouTube link becomes an embed');
ok(html.includes('Not a YouTube link'), 'and one that is not says so instead of embedding nothing');
ok(html.includes('<img src="/files/shot.png"'), 'an image block draws its picture');
ok(html.includes('<figcaption>The board</figcaption>'), 'with its caption');
ok(html.includes('<div class="grid blocks">'), 'blocks under a panel section land in a grid of their own');
ok(referencedFiles(withBlocks).join() === 'shot.png', 'referenced files are listed by slug', referencedFiles(withBlocks).join());
const previewed = renderMarketing(withBlocks, { files: '/api/public/site/marketing/files/' });
ok(previewed.includes('src="/api/public/site/marketing/files/shot.png"'), 'the preview can point file addresses at the portal route');
ok(!renderMarketing(withBlocks).includes('/api/public/'), 'and the site itself never does');

console.log('\nD. LINK BEHAVIOUR');
const links = structuredClone(MARKETING_SEED);
links.sections[3].buttons = [
  { label: 'Deck', href: '/files/deck.pdf', behavior: 'preview' },
  { label: 'Save', href: '/files/deck.pdf', behavior: 'download' },
];
const l = renderMarketing(links);
ok(l.includes('data-preview'), 'preview marks the link for the viewer');
ok(l.includes('viewer.js'), 'and links the viewer script, only then');
ok(l.includes('href="/files/deck.pdf" download'), 'download asks the browser to save');
ok(
  /href="https:\/\/app\.vitalistradingsystems\.com"[^>]*>Sign in/.test(l) && !/app\.vitalistradingsystems\.com"[^>]*target=/.test(l),
  "the site's own addresses open in place",
);

console.log('\nE. YOUTUBE ADDRESSES');
for (const [input, want] of [
  ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
  ['youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://vimeo.com/123', null],
  ['https://www.youtube.com/watch?v=short', null],
  ['', null],
]) {
  ok(youtubeId(input) === want, `${JSON.stringify(input)} → ${want}`, String(youtubeId(input)));
}

console.log('\nF. VALIDATION');
ok(validateMarketing({}) !== null, 'an empty object is refused');
const dup = structuredClone(MARKETING_SEED);
dup.sections[1].id = 'hero';
ok(/repeats/.test(validateMarketing(dup) ?? ''), 'a repeated section id is refused by name');
const noItems = structuredClone(MARKETING_SEED);
delete noItems.sections[1].items;
ok(validateMarketing(noItems) !== null, 'a section with no items list is refused');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
