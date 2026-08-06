# Cosmetic overhaul — handoff to Claude Design

Everything needed to brief Claude Design on restyling VTS Terminal, and the hard
line around what it may not touch.

**What to hand over:** this file, `current-state.html`, `tokens.css`, and
`AUDIT.md` — all four are in this folder. `current-state.html` is the important
one: it is the terminal's real look today, self-contained, no CDN. Open it or
screenshot it so the tool designs inside the actual chrome rather than a guess at
it.

---

## The paste-ready opening message

Copy everything between the rules into Claude Design as the first message, and
attach the four files.

---

> I want a cosmetic overhaul of a private trading terminal called **VTS
> Terminal** — a dark, dense, pro-terminal web app. It works exactly the way I
> want it to. **Nothing about how it behaves may change.** I want it to look more
> professional and more user-friendly.
>
> I've attached four files:
>
> - `current-state.html` — the app as it looks today, self-contained. The shell
>   (sidebar + top bar + content) followed by a gallery of every recurring
>   component. Start here.
> - `tokens.css` — the live design tokens, plus the scales that don't exist yet.
> - `AUDIT.md` — a measured diagnosis of what actually looks unfinished.
> - `HANDOFF.md` — this brief, including the constraints.
>
> **The diagnosis, in one line:** the app has two parallel palettes and no shared
> component layer. 63% of colour decisions bypass the token set, there are 25
> font sizes, 17 border radii and 12 surface-tint alphas, all written inline
> across 191 files. Seven greys are doing the job of two; three reds are doing the
> job of one. Nothing is ugly on its own — it just reads as slightly off
> everywhere at once.
>
> **What I want back, in this order:**
>
> 1. **One settled palette.** Keep the token *names* in `tokens.css` — they're
>    referenced by name throughout the code, so changing a value is a one-line
>    change and renaming one is a 191-file change. Give me new values if the
>    current ones are wrong, and tell me which of the shadow literals in
>    `AUDIT.md` collapse onto which token.
> 2. **A type scale, a radius scale and an elevation scale** — six or seven steps
>    each, not twenty-five. `tokens.css` has a placeholder shape for these at the
>    bottom; set the real values.
> 3. **Restyled components,** as HTML/CSS I can port back: card, stat tile, trade
>    card, table, buttons, inputs, chips and provenance tags, empty state,
>    dropdown/modal, the sidebar row and the top bar. The trade card matters most
>    — it's the signature component and it's the worst offender.
>
> **Constraints — these are hard:**
>
> - **Dark only.** There is no light mode and I don't want one.
> - **Dense on purpose.** This is a trading terminal, not a marketing site. Don't
>   trade information density for whitespace. If a screen shows twelve figures
>   today it shows twelve after.
> - **Left sidebar navigation, 248px, collapsing to 72px.** No top tabs, no
>   bottom tab bar, no breadcrumb that looks like a URL — routing is state-based
>   and the URL never changes.
> - **Two typefaces, both self-hosted: IBM Plex Sans and IBM Plex Mono.** No CDN,
>   no webfont service — the terminal makes no external requests. Every figure,
>   time, ticker and version is mono. You may propose a different pair, but say
>   so explicitly, because it's a dependency change.
> - **One accent per workspace, nine of them, backgrounds never themed.** The
>   shell is one navy everywhere; a workspace is signalled by its accent only.
> - **Green means long/positive, red means short/negative.** Don't spend those two
>   colours on anything else.
> - **Gold `#EBCB74` = Premium, icy gem `#B9F2FF` = Max.** These mark what a
>   feature costs and appear in the sidebar, tile pickers and rails. They must
>   stay visually distinct from `#6C9EFF`, which signals market-watching.
> - **Don't add explanatory captions, tips, or "how to use this" copy.** The app
>   deliberately has none. Empty states and legal disclaimers are not tips and
>   stay.
> - **Don't invent figures.** Any number in a mockup is sample data and must be
>   marked as such.
> - Text inputs are floored at 16px on touch devices so iOS never zooms on focus.
>   Don't design a smaller mobile input.
>
> **Where to push hardest:** hierarchy and rhythm. The app is dense and that's
> correct, but everything currently sits at one visual weight — 12px, 12.5px and
> 13px are used almost interchangeably 839 times, so nothing leads. I want a
> clear first read on every screen (the figure that matters), a clear second read
> (its context), and quiet metadata — without removing anything.
>
> Start by showing me the palette and the three scales before you restyle
> components, so I can react to the foundation first.

---

## Constraints, in more detail than the chat message carries

If Claude Design pushes back or asks, these are the reasons.

### Nothing functional may change

The overhaul is colour, type, spacing, radius, elevation and internal component
layout. It is **not** an information-architecture change. Specifically off the
table:

- **Sidebar order.** `theme/nav.ts` is the only source of it and there is no
  runtime override — deliberately, since two sources disagree and the stored one
  wins silently. Sections stack Max → Premium → free within each workspace, with
  one exception: the Live Wall is pinned to the top of My Terminal.
- **Section keys.** Every `key` in `theme/nav.ts` is a screen key that
  `Portal.tsx` switches on, that `DEFAULT_SCREEN` names, and that in-app links
  and `howto.<screen>` wording are keyed to. **Rename a label, never a key.**
- **What is free vs paid.** Tier marks are drawn from `FEATURE_TIER` server-side.
  A designer may restyle the mark; they may not decide what carries one.
- **Which screens exist.** No merging two screens into one, no splitting one into
  two, no new sections.
- **Routing.** State-based, no URL, no deep links, no back/forward.

### The demo, privacy mode and the honesty rules

Three behaviours look like styling but are load-bearing, and a restyle must
preserve all three:

- **Privacy mode** (the top-bar eye) replaces every money figure with `•••••`.
  Any new money component needs to respect it.
- **A null is an em dash, never `$0`.** "We don't know" and "it's worth nothing"
  must never render the same.
- **Provenance tags are not decoration.** `Live price` / `Your price · 3d ago` /
  `Sample` distinguish a figure read from a broker from one typed in months ago
  from one invented for a first-run preview. They may be restyled; they may not
  be dropped for looking noisy.

### Surfaces that are out of scope

- **`/employee` — the Employee Portal.** A separate site with its own bundle,
  sign-in and design language entirely (warm sand, forest masthead, terracotta,
  Source Sans/Serif, top-bar nav). It shares nothing with the terminal but the
  icon component. Spec is in `docs/design/employee-portal/`. Leave it alone.
- **The Live Wall's drag-resize grid.** Tiles can be restyled; the grid mechanics
  (four-corner resize, the locked workspace frame, the phone one-column flatten)
  are behaviour.
- **Embedded third-party widgets** — TradingView charts and watchlists, YouTube
  live streams. They render inside iframes and are deliberately exempt from the
  terminal's zoom. Their internals cannot be styled.

---

## How the result gets applied

Worth knowing when judging what to ask for, because it decides whether a proposal
is cheap or expensive.

The app styles with **inline React styles**, not CSS classes and not a framework.
So:

- **Changing a token value is one line** in `apps/web/src/theme/tokens.ts` and its
  mirror in `apps/web/src/styles/global.css`. Cheap.
- **Changing a token name is a change in every file that reads it** (`C.faint`
  alone appears 163 times). Expensive, and the reason the brief asks for values
  rather than names.
- **Collapsing the shadow palette is ~1,300 mechanical find-and-replaces** onto
  the token set. Tedious but safe — no behaviour rides on a hex literal.
- **Adopting a shared primitives module is the real refactor.** There is one
  today, `workspaces/investments/ui.tsx`, scoped to one workspace. Promoting it
  to `apps/web/src/ui/` and adopting it in the other eight is what makes the next
  restyle cost one file instead of seventy. It touches imports and JSX structure
  but no logic, no routing key and no server call.

A sensible order of work once the design comes back:

1. Land the new token values and the three scales. Nothing else changes.
2. Collapse the shadow literals onto the tokens, workspace by workspace.
3. Promote the primitives module and adopt it, starting with `TradeCard.tsx`.
4. Restyle the shell (`Sidebar.tsx`, `TopBar.tsx`) last — it is the most visible
   and the best understood, so it benefits from the scales being settled first.

Each of those four is independently shippable and independently revertable.

---

## Reference files already in the repo

- `docs/design/portal-shell.md` — the shell brief, and the authority on what is
  *no longer* the design. Updated alongside this bundle.
- `docs/design/portal-shell.html` — the shell as a static page. Updated too.
- `docs/design/market-news/` — a worked example of this same handoff shape for
  one screen (`current-state.html` + `tokens.css` + sample data).
- `docs/design/employee-portal/` — the separate surface, for contrast.
