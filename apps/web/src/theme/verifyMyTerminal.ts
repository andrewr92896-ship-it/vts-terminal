import assert from 'node:assert/strict';
import {
  canApplyMyTerminal,
  isDefaultMyTerminal,
  myTerminalSections,
  nudgeMyTerminal,
  parseMyTerminal,
  reorderMyTerminal,
  toggleOwnRow,
  togglePinnedRow,
  MY_TERMINAL_DEFAULT,
  type MyTerminalLayout,
  type MyTerminalReach,
  type NavLike,
} from './myTerminal.js';

// My Terminal's arrangement. What is checked here is the half that cannot be
// seen by looking at the running app: what happens to somebody's board when the
// NAV CHANGES UNDER IT. That only shows up on a deploy, by which time the person
// whose board it is has already lost their arrangement.

const sec = (key: string) => ({ key, label: key, icon: 'circle' });

const NAV: NavLike = [
  { key: 'myportal', label: 'My Terminal', accent: '#0f0', sections: [sec('a'), sec('b'), sec('c')] },
  { key: 'trading', label: 'Advanced Trading', accent: '#fc0', sections: [sec('t1'), sec('t2')] },
];

// The nav a later deploy ships: one more row on My Terminal, one more elsewhere.
const NAV_LATER: NavLike = [
  { key: 'myportal', label: 'My Terminal', accent: '#0f0', sections: [sec('a'), sec('b'), sec('c'), sec('NEW')] },
  { key: 'trading', label: 'Advanced Trading', accent: '#fc0', sections: [sec('t1'), sec('t2'), sec('T-NEW')] },
];

const REACH: MyTerminalReach = { workspaces: ['myportal', 'trading'], canFunded: true, canTeams: true };
const keys = (nav: NavLike, layout: MyTerminalLayout) => myTerminalSections(nav, layout, REACH).map((s) => s.key);

const checks: Array<[string, () => void]> = [
  ['nothing arranged renders exactly as it did before ordering existed', () => {
    assert.deepEqual(keys(NAV, MY_TERMINAL_DEFAULT), ['a', 'b', 'c']);
    // A layout stored before `order` was a field at all.
    const legacy = parseMyTerminal('{"add":["t1"],"hide":["b"]}');
    assert.deepEqual(legacy.order, [], 'an absent order must read as nothing positioned');
    assert.deepEqual(keys(NAV, legacy), ['a', 'c', 't1'], 'and must render as it always did');
  }],

  ['an arrangement is what the sidebar draws', () => {
    const arranged = reorderMyTerminal(MY_TERMINAL_DEFAULT, ['c', 'a', 'b']);
    assert.deepEqual(keys(NAV, arranged), ['c', 'a', 'b']);
  }],

  ['A SECTION ADDED IN A LATER DEPLOY STILL APPEARS', () => {
    // THE ONE THAT MATTERS. This is the property the old install-wide Sidebar
    // Layout editor destroyed, and the reason it was removed: a stored value
    // that claims to be the whole list silently swallows anything added to the
    // nav afterwards, and the code change looks like it never deployed.
    const arranged = reorderMyTerminal(MY_TERMINAL_DEFAULT, ['c', 'a', 'b']);
    const after = keys(NAV_LATER, arranged);
    assert.ok(after.includes('NEW'), 'a new My Terminal row must appear on an arranged board');
    assert.deepEqual(after, ['c', 'a', 'b', 'NEW'], 'and arrives at the end, where a new row is looked for');

    // The same for somebody who has arranged AND pinned.
    const both = reorderMyTerminal(togglePinnedRow(MY_TERMINAL_DEFAULT, 't1', true), ['t1', 'a', 'b', 'c']);
    assert.deepEqual(keys(NAV_LATER, both), ['t1', 'a', 'b', 'c', 'NEW']);
  }],

  ['a key for a row that is no longer there leaves no gap', () => {
    // A section removed from the nav, or a workspace this account lost.
    const arranged = reorderMyTerminal(togglePinnedRow(MY_TERMINAL_DEFAULT, 't1', true), ['t1', 'c', 'a', 'b']);
    const narrowed: MyTerminalReach = { ...REACH, workspaces: ['myportal'] };
    assert.deepEqual(
      myTerminalSections(NAV, arranged, narrowed).map((s) => s.key),
      ['c', 'a', 'b'],
      'the unreachable pin drops out and the rest keep their order',
    );
  }],

  ['hiding a row and showing it again returns it to where it was put', () => {
    // The reason a key is KEPT rather than pruned. Losing the place would make
    // toggling a row a destructive act on an arrangement somebody built.
    let layout = reorderMyTerminal(MY_TERMINAL_DEFAULT, ['c', 'a', 'b']);
    layout = toggleOwnRow(layout, 'a', false);
    assert.deepEqual(keys(NAV, layout), ['c', 'b']);
    layout = toggleOwnRow(layout, 'a', true);
    assert.deepEqual(keys(NAV, layout), ['c', 'a', 'b'], 'it came back to its place, not to the end');
  }],

  ['the arrows move one place and stop at the ends', () => {
    const base = MY_TERMINAL_DEFAULT;
    assert.deepEqual(keys(NAV, nudgeMyTerminal(base, ['a', 'b', 'c'], 'c', -1)), ['a', 'c', 'b']);
    assert.deepEqual(keys(NAV, nudgeMyTerminal(base, ['a', 'b', 'c'], 'a', 1)), ['b', 'a', 'c']);
    // Off either end is a no-op rather than a wrap or a throw.
    assert.deepEqual(nudgeMyTerminal(base, ['a', 'b', 'c'], 'a', -1), base);
    assert.deepEqual(nudgeMyTerminal(base, ['a', 'b', 'c'], 'c', 1), base);
    assert.deepEqual(nudgeMyTerminal(base, ['a', 'b', 'c'], 'nope', 1), base, 'a key not on the board moves nothing');
  }],

  ['an arrangement counts as customized, so it can be reset', () => {
    assert.equal(isDefaultMyTerminal(MY_TERMINAL_DEFAULT), true);
    assert.equal(
      isDefaultMyTerminal(reorderMyTerminal(MY_TERMINAL_DEFAULT, ['c', 'a', 'b'])),
      false,
      'an arranged board must offer Reset, or the arrangement cannot be undone',
    );
  }],

  ['arranging can never empty the workspace', () => {
    // The rule is about the RESULT, so it has to hold for the new field too.
    const arranged = reorderMyTerminal(MY_TERMINAL_DEFAULT, ['c', 'a', 'b']);
    assert.equal(canApplyMyTerminal(NAV, arranged, REACH), true);
    const emptied: MyTerminalLayout = { add: [], hide: ['a', 'b', 'c'], order: ['c', 'a', 'b'] };
    assert.equal(canApplyMyTerminal(NAV, emptied, REACH), false);
  }],

  ['a stored arrangement is untrusted input', () => {
    assert.deepEqual(parseMyTerminal('{"add":[],"hide":[],"order":"nope"}').order, []);
    assert.deepEqual(parseMyTerminal('{"order":[1,null,"a","a",""]}').order, ['a'], 'junk dropped, duplicates collapsed');
    assert.deepEqual(parseMyTerminal('not json').order, []);
    assert.deepEqual(parseMyTerminal(null).order, []);
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try { run(); console.log(`  ok  ${name}`); }
  catch (error) { failed += 1; console.error(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : String(error)}`); }
}
if (failed > 0) { console.error(`\nMy Terminal: ${failed} check(s) failed.`); process.exit(1); }
console.log(`My Terminal: ${checks.length} checks passed.`);
