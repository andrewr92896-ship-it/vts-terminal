# Cosmetic audit — what actually makes the terminal look unfinished

Measured against the tree at `cb1afcc` (Beta V 6.80). Every number here came from
counting the source, not from an impression. Re-run the commands at the bottom to
refresh them.

The short version: **the terminal has two parallel palettes and no shared
component layer.** Nothing is broken and nothing is ugly on its own — but a grey
that is `#9fb0d6` on one screen and `#93A5C9` on the next, a green that is
`#35c47b` here and `#2FC77E` there, reads as "slightly off" everywhere at once.
That is the whole gap between this and looking professional.

---

## 1. Two palettes, not one

`theme/tokens.ts` (`C`) is documented as the single source of truth. It isn't the
one most screens use.

| | count |
|---|---|
| Colour set through the token set (`C.text`, `C.muted`, …) | **764** |
| Colour hardcoded as a hex literal in a `.tsx` | **1,298** |
| **Share of colour decisions that bypass the tokens** | **63%** |

And the literals are not arbitrary — they are a *second, near-miss palette* that
shadows the first:

| role | token (`C`) | shadow literal | uses |
|---|---|---|---|
| primary text | `#E9EFFB` | `#eef3ff` | 126 |
| primary text (alt) | `#E9EFFB` | `#dfe7fa` | 61 |
| secondary text | `#93A5C9` | `#9fb0d6` | 47 |
| secondary text (alt) | `#93A5C9` | `#8ea3cc` | 45 |
| faint / metadata | `#5E7098` | `#7488b5` | 66 |
| faint (alt) | `#5E7098` | `#6f84b0` | 24 |
| positive / long | `#2FC77E` | `#35c47b` | 24 |
| negative / short | `#F0596E` | `#ef5468` | 38 |
| negative (alt) | `#F0596E` | `#ffb4ab` | 90 |
| warning | `#E5A43B` | `#e0a23a` | 19 |

Seven different greys are doing the job of two. Three reds are doing the job of
one. None of the differences is large enough to look deliberate — they just look
like nobody was in charge.

### The clearest single example

`workspaces/trading/TradeCard.tsx` is the terminal's signature component — it
renders on the Live Wall, the Trade Log, Trade History, the Trade Desk and the
funded book. It **does not import `theme/tokens` at all.** It declares its own:

```ts
const GOLD   = '#EBCB74';            // matches
const GREEN  = '#35c47b';            // token is #2FC77E
const RED    = '#ef5468';            // token is #F0596E
const TEXT   = '#eef3ff';            // token is #E9EFFB
const MUTED  = '#9fb0d6';            // token is #93A5C9
const FAINT  = '#6f84b0';            // token is #5E7098
const CARD   = 'rgba(13,31,68,.5)';  // token is #0A1426
const BORDER = '#16294f';            // token is #152139
const MONO   = "'IBM Plex Mono', monospace";  // token is C.mono
```

Every trade on screen is therefore drawn in a slightly different palette from the
panel it sits inside. This is the highest-leverage single file in the overhaul.

---

## 2. No shared component layer

There is exactly one primitives module, `workspaces/investments/ui.tsx`
(`Card`, `StatTile`, `Empty`, `Bar`, `Disclaimer`, `primaryBtn`, `ghostBtn`,
`inputStyle`, …) — and it is scoped to the Investments workspace. It is a good
module; it is also the model for what the other eight workspaces do not have.

Everywhere else, a card is re-declared inline. **70 files** independently define
something card-shaped (radius 10 or 12 + a border + a background).

Note that even the good module has already drifted from the documented pattern:
`portal-shell.md` says a card is `#0A1426`, while `investments/ui.tsx` `panel` is
`linear-gradient(180deg,rgba(9,26,42,.5),rgba(6,18,30,.6))`.

---

## 3. No type scale

**1,880** inline `fontSize` declarations across **25** distinct values:

```
12.5(337) 13(259) 12(243) 11(210) 11.5(193) 10.5(137) 10(117) 9.5(83)
14(44) 15(42) 13.5(40) 9(36) 8.5(23) 19(21) 16(18) 22(13) 18(12) 20(9)
15.5(8) 8(5) 17(5) 28(4) 24(4) 21(4) 14.5(4)
```

`12`, `12.5` and `13` together account for 839 declarations and are visually
indistinguishable from one another. A scale of six or seven steps would cover
every one of these.

## 4. No radius or elevation scale

**17** distinct `borderRadius` values: `8(181) 7(86) 10(65) 6(51) 12(48) 5(44)
4(39) 999(28) 9(21) 14(17) 3(8) 16(5) 99(3) 2(3) 13(1) 11(1) 0(1)`.

Note `999` and `99` are both in use for "pill" — the same intent written two ways
31 times.

Surface tints are similarly unrationalised — `rgba(255,255,255,α)` appears at
twelve different alphas: `.05(83) .04(19) .06(16) .03(15) .02(6) .08(5) .07(3)
.10(2) .22(2) .14(1) .18(1) .42(1)`.

---

## 5. The handoff docs were stale

`docs/design/portal-shell.md` and `.html` are the files a design tool is meant to
be given. Both predate two whole workspaces:

- **Finances** (`#4ADE80`, `piggy-bank`) — Net Worth, Budget
- **News** (`#93B4FF`, `newspaper`) — Market News, World, Politics

The `.html` mentions neither. The `.md`'s workspace table and section list both
omit them, still show Net Worth under My Terminal and Market News under My
Terminal, and still place the Live Wall below the paid rows when it is now pinned
to the top of My Terminal. Both files have been brought back into step as part of
this bundle.

---

## What this means for the overhaul

The work is **not** "redesign 191 files". It is:

1. **Settle one palette** and delete the shadow one (~1,300 literals → tokens).
2. **Publish a type scale, a radius scale and an elevation scale**, and round the
   25/17/12 sets onto them.
3. **Promote `investments/ui.tsx` to a shared `src/ui/` module** and adopt it in
   the other eight workspaces, starting with `TradeCard`.

Steps 1 and 2 are mechanical and carry no behaviour. Step 3 is a refactor that
touches imports and JSX structure but no logic, no routing key, and no server
call. See `HANDOFF.md` for how this is scoped for Claude Design, and
`current-state.html` for what all of it looks like today.

---

## Re-running the numbers

From `apps/web/src`:

```bash
# token vs literal
grep -rhoE "\bC\.(text|muted|faint|line|line2|panel|panel2|gold|gold2|green|red|amber|side|bg|hover|info|violet|mono|sans)\b" --include=*.tsx . | wc -l
grep -rhoE "#[0-9a-fA-F]{6}\b" --include=*.tsx . | wc -l

# the shadow palette
grep -rhoE "#[0-9a-fA-F]{6}\b" --include=*.tsx . | tr 'A-F' 'a-f' | sort | uniq -c | sort -rn | head -25

# scales
grep -rhoE "fontSize: ?[0-9.]+"     --include=*.tsx . | grep -oE "[0-9.]+" | sort -n | uniq -c | sort -rn
grep -rhoE "borderRadius: ?[0-9]+"  --include=*.tsx . | grep -oE "[0-9]+"  | sort -n | uniq -c | sort -rn
grep -rhoE "rgba\(255,255,255,\.[0-9]+\)" --include=*.tsx . | sort | uniq -c | sort -rn
```

(One file, `workspaces/studies/FlashcardEditor.tsx`, contains embedded binary and
is skipped by grep — its counts are not included above.)
