# Handoff: Vitalis Trading Systems — Employee Portal (+ developer inline copy editing)

## Overview
A remote-first internal staff site for Vitalis Trading Systems, served separately from
the trading portal (own page, bundle, session, and `/api/employee/*` namespace).
It centers on a company calendar, an employee directory with headshots, company news,
and personal tasks. It deliberately contains **no payroll/HR-system surfaces** (no PTO
balances, paydays, timesheets, or benefits enrollment) — those live in the separate
payroll system.

Second deliverable in this bundle: a **developer-only inline copy-editing mode** that
lets a developer reword, reset, or hide any hardcoded string in place, live.

## About the design files
The files here are **design references created in HTML** — prototypes that show the
intended look and behavior. They are not production code to copy. Recreate them in the
target codebase's environment (React + TS here) using its existing patterns, component
library, and API client. Where these prototypes fake data or persistence, wire the real
thing.

## Fidelity
**High fidelity.** Colors, type, spacing, and interaction states are final. Match them
pixel-for-pixel. Anything not specified (focus rings, disabled states, error toasts)
should follow the same visual language.

---

## Screens / views

### 1. Home (`Vitalis Connect Portal v2.dc.html`)
Purpose: landing screen — what's happening today, who's around, what I owe.

Layout, top to bottom, page background `#f5f2ec`, min content width 1320px:

**Masthead** — 96px tall, background `#0f3d3a`, horizontal padding 28px, flex row, gap 24px.
- Left cluster (gap 18px): wordmark image, 68px tall, width auto; 1px × 38px divider
  `rgba(255,255,255,.22)`; label "Employee Portal" in Source Serif 4 600, 17px,
  `#e5ded2`, letter-spacing .2px, nowrap.
- Spacer, then search field: `rgba(255,255,255,.1)` fill, 1px `rgba(255,255,255,.22)`
  border, radius 6px, padding 9px 12px, width 300px; placeholder 13px `#b6c6c2`
  "Search people, policies, forms".
- Right cluster (gap 22px): "Notifications" 13.5px/600 `#e5ded2` with a count pill
  **beside** it (never overlapping) — min-width 19px, height 19px, radius 10px,
  `#c25a38` fill, 11px/700 white, padding 0 5px; 1px divider; avatar 36px circle;
  name 13.5px/700 white over role 11.5px `#a9bbb7`; caret ▾ 10px `#a9bbb7`.

**Tab bar** — white, bottom border 1px `#e3ddd3`, padding 0 28px, gap 4px.
Items: Home · Calendar · Directory · Company news · Documents · Training (Training
carries a "1" pill). Each item padding 15px 14px 13px, 13.5px, nowrap, `flex:none`,
3px bottom border. Active: border `#c25a38`, text `#0f3d3a`, weight 700.
Inactive: transparent border, `#6e7a78`, weight 600.

**Content well** — padding 24px 28px 44px, vertical gap 18px.

**Hero** — full-width, height 272px, radius 6px, 1px `#e3ddd3`, overflow hidden.
Photo fills it; overlay gradient `linear-gradient(90deg, rgba(13,45,42,.93) 0%,
rgba(13,45,42,.62) 52%, rgba(13,45,42,.08) 100%)` with `pointer-events:none`.
Text block padded 0 34px, centered vertically, gap 11px:
- Eyebrow: date, 11.5px/700, letter-spacing .9px, uppercase, `#e8a87c`.
- Title: Source Serif 4 700, 32px, line-height 1.2, white, max-width 470px.
- Blurb: 14.5px, line-height 1.6, `#dfe6e2`, max-width 440px.
- Buttons (gap 10px, both nowrap, `flex:none`, radius 5px, padding 11px 19px):
  primary `#c25a38` white 13.5px/700 (hover `#a94a2c`); secondary transparent with
  1px `rgba(255,255,255,.45)` border, white 13.5px/600 (hover fill `rgba(255,255,255,.12)`).

**Main grid** — `grid-template-columns: 1.55fr 1fr`, gap 18px, `align-items:start`.

Left column (gap 18px):
1. **Company calendar card.** White, 1px `#e3ddd3`, radius 6px. Header padding
   14px 16px, bottom border 1px `#ece7de`: serif 17px/700 title, a segmented
   "This week / Everything" toggle (1px `#ded7cb`, radius 5px, items 12.5px/600
   padding 6px 12px; selected = `#0f3d3a` fill, white text), and an "Add event"
   link 12.5px/600 `#c25a38`. Body is a 296px / 1fr split:
   - Month picker: ‹ July 2026 › header; 7-column day-name row (10.5px/700 `#9aa3a0`);
     35 day cells, height 36px, radius 4px, 12.5px tabular numerals, gap 2px.
     Selected day = `#0f3d3a` fill + white 700; today = 1px `#0f3d3a` border +
     `#0f3d3a` 700; in-month = `#4c5a58`; outside = `#cfd4cf`. A 4px category dot
     sits 4px from the cell bottom when that day has an event.
     Below a 1px `#ece7de` rule: "CATEGORIES" label (11px/700, .8px tracking) and
     legend rows (8px dot + 12.5px `#4c5a58`).
   - Event list: title + count row, then rows separated by 1px `#f0ece4` top borders.
     Each row: 44px date column (uppercase 10.5px/700 `#9aa3a0` day-of-week over
     serif 19px/700 day number), title 14px/600, meta 12.5px `#6e7a78`, a category
     tag (11px/700 uppercase, radius 3px, category color at 8% fill / 20% border),
     host 12px `#9aa3a0`, and an RSVP button on the right (radius 5px, padding
     7px 14px, 12.5px/600): default `#0f3d3a` fill white text; attending
     `#eef4f1` fill, 1px `#bcd6c9`, `#2f7d5b` text, label "Attending".
     Empty state: 1px `#ece7de`, `#faf8f4` fill, radius 6px, padding 22px, centered
     13px `#6e7a78`.
2. **Employee photos card.** Header has serif 17px/700 title, a 12.5px `#6e7a78`
   explainer, and a right-aligned count chip ("N still need a photo", 12px/700
   uppercase `#c25a38` on `#fbeee8` with 1px `#f0d5c8`, radius 4px, padding 5px 9px).
   Body: 250px upload dropzone (2px dashed `#cfd8d5`, radius 6px, `#f7f9f8` fill,
   centered: 52px circle glyph, 13.5px/700 heading, 12px `#6e7a78` guidance
   "Square JPG or PNG, at least 400×400", and a `#0f3d3a` "Choose a file" button)
   next to a 5-column roster grid, gap 14px: 84px circular avatar, first name +
   last initial 12.5px/600, and a state caption 10.5px/700 uppercase —
   `#2f7d5b` "Photo added" or `#c25a38` "Needs photo".
3. **Employee directory card.** Header: serif 17px/700 title + search input
   (`#faf8f4` fill, 1px `#ded7cb`, radius 5px, padding 8px 11px, 13px, width 250px),
   filtering on name, title, and department. Column header row: grid
   `2fr 1.4fr 1fr 1fr`, padding 10px 16px, `#faf8f4` fill, 11px/700 uppercase
   `#6e7a78` — Employee · Title · Department · Working. Body rows: same grid,
   padding 11px 16px, 1px `#f0ece4` bottom border, hover `#fbfaf7`; 36px avatar +
   name 13.5px/600 over email 11.5px `#9aa3a0`; title/department 13px `#4c5a58`;
   status = 8px dot + 12.5px label, nowrap (In office `#2f7d5b`, Away `#9aa3a0`,
   Remote `#7a6a9e`). Empty state 13px `#6e7a78`, padding 26px.

Right column (gap 18px):
1. **My tasks** — header title + "N open"; rows padding 12px 16px with a 17px
   checkbox (radius 3px, 1px `#c3ccc8`; checked `#2f7d5b` fill with white ✓),
   title 13.5px (600 when open; `#9aa3a0` + line-through when done), due date
   11.5px `#9aa3a0`.
2. **Company news** — serif header, 150px photo, lead story (14px/600 + 11.5px
   `#9aa3a0` meta), then 3 rows separated by 1px `#f0ece4`, hover `#fbfaf7`.
3. **Quick actions** — uppercase 11px/700 label, then rows: 1px `#e8e2d8`,
   radius 5px, padding 11px 12px, 13px/600, right-side → glyph, hover `#faf8f4`
   with border `#d6cdbf`. Items: Upload your photo · Update your profile ·
   Employee handbook · Add a calendar event · Team contact list · Contact HR.
4. **Birthdays & milestones** — `#0f3d3a` card, radius 6px, padding 16px:
   uppercase 11px/700 `#e8a87c` label, then 32px avatar + name 13px/600 white
   over note 11.5px `#a9bbb7`.

**Footer** — 1px `#e3ddd3` top border, padding-top 14px, 11.5px: left
"© 2026 Vitalis Trading Systems LLC. All rights reserved. Confidential." `#9aa3a0`,
right version label `#b3b9b5`.

### 2. Copy-edit mode (`Employee Portal — Copy Edit Mode.dc.html`)
The same portal chrome with the developer editing layer switched on. Use this file as
the behavioral reference; the written spec you supplied is authoritative for the API and
access rules. What the prototype pins down visually:

- **Floating pencil**, `position:fixed; right:26px; bottom:26px`, 52px circle,
  `z-index:55`, shadow `0 8px 24px rgba(13,45,42,.26)`. Off state: white fill,
  1.5px `#0f3d3a` border, `#0f3d3a` glyph. On state: `#c25a38` fill, 1px `#a94a2c`
  border, white glyph. Rendered only when `me.isDeveloper` is true (never on
  `isPortalAdmin`).
- **Mode banner**, fixed top 18px, centered, `#0f3d3a` pill, radius 999px,
  padding 9px 12px 9px 18px, shadow `0 10px 30px rgba(13,45,42,.28)`: 8px `#e8a87c`
  dot, 13px `#f0ece2` text "Editing wording — click any highlighted text to change it",
  and a `#c25a38` "Done" pill (12.5px/700, padding 6px 14px).
- **Editable-string highlight** (only while the mode is on): `outline:1px dashed
  #c25a38`, `outline-offset:2px`, `background:rgba(194,90,56,.09)`, `border-radius:4px`,
  `cursor:pointer`. Hidden strings additionally render struck-through at 50% opacity so
  they stay discoverable.
- **Editor popover**, `z-index:70`, width 320px, white, 1px `#e3ddd3`, radius 12px,
  padding 14px, shadow `0 18px 44px rgba(13,45,42,.22)`, `popIn .18s ease`. Contents:
  "EDIT WORDING" 10.5px/700 uppercase `#c25a38` + × close; the copy id in a mono 11px
  chip (`#f5f2ec` fill, 1px `#e8e2d8`, radius 4px); a 3-row textarea (1px `#ded7cb`,
  radius 6px, padding 9px 10px, 13.5px/1.5); an 11.5px `#9aa3a0` hint line; then
  **Save** (`#0f3d3a` fill, white 12.5px/700, radius 6px), **Reset** (white, 1px
  `#ded7cb`, `#4c5a58`), and right-aligned **Hide** (white, 1px `#f0d5c8`, `#c25a38`) —
  which becomes **Restore** (`#eef4f1` fill, 1px `#bcd6c9`, `#2f7d5b`) for an
  already-hidden string.
- **Anchoring:** the popover opens below the clicked element (10px offset), flips above
  when it would overflow the viewport bottom, and clamps horizontally to a 14px gutter.
  On narrow screens render it as a bottom sheet pinned to the viewport bottom, full
  width minus 14px gutters, with the same internals.

Prototype simplifications to replace with real implementation:
- Overrides are held in component state; production must load `GET /api/employee/copy`
  once at mount and resolve every `T`/`useCopy` against it, then optimistically update
  local state after a successful write.
- Writes must go through the existing API client (`PUT`/`DELETE
  /api/employee/copy/:key`) so the session cookie and `x-vts-employee-csrf` header are
  attached; hide = save the sentinel `[[vts:hidden]]`; empty or default-equal values
  `DELETE` instead of `PUT`.
- `isDeveloper` is hardcoded true in the prototype; read it from
  `GET /api/employee/session`. Server-side enforcement is the real gate.
- Wrap **every** developer-authored string in `T`/`useCopy`; never wrap database
  content, live figures, interpolated strings, or markup-bearing paragraphs.
  Ids: `emp.<screen>.<slug>`, lowercase and dotted. The prototype's `DEFAULTS` map
  lists the ids already assigned (`emp.home.greeting`, `emp.calendar.title`,
  `emp.quick.photo`, …) — keep those exact ids.

---

## Interactions & behavior
- **Tab bar** — selecting a tab swaps the content region; active styling as above.
- **Calendar** — clicking a day filters the event list to that date and sets the list
  title to "July D, 2026"; the segmented control switches between the current week and
  all upcoming events and clears the day filter. "Add event" opens the create-event flow
  (not designed yet — ask before inventing it).
- **RSVP** — optimistic toggle per event between "RSVP" and "Attending".
- **Directory search** — client-side substring filter over name + title + department,
  case-insensitive, with the empty state above.
- **Tasks** — checkbox toggles completion; completed items go struck-through and grey and
  the "N open" counter decrements.
- **Photo upload** — dropzone accepts drag-and-drop and click-to-browse; on success the
  employee's avatar updates everywhere on the page and their caption flips to
  "Photo added". Validate square-ish images ≥400×400; reject other types with an inline
  error in the portal's voice.
- **Copy-edit mode** — as specified above; outside the mode the wrapper must add no
  markup, no wrapper element styling, and no layout effect.
- **Motion** — screen fade-in `fadeIn .25s ease`; popover `popIn .18s ease`. No hover
  transforms anywhere; hover states are colour/border swaps only.
- **Responsive** — designed at ≥1320px. Below ~1100px stack the 1.55fr/1fr grid to a
  single column, drop the directory to two columns (Employee + Working), and collapse
  the photo roster to 3 across. The copy popover becomes a bottom sheet.

## State
```
nav: string                    // active tab
calendarView: 'This week' | 'Everything'
selectedDay: number | null     // day-of-month filter
directoryQuery: string
rsvp: Record<eventId, boolean>
tasksDone: Record<taskId, boolean>
copy: Record<copyId, string>   // overrides from GET /api/employee/copy
editingCopy: boolean           // pencil toggle
openCopyId: string | null      // popover target
copyDraft: string
me: { isDeveloper: boolean, ... }  // GET /api/employee/session
```
Data needed: employees (name, title, department, working status, avatar url), calendar
events (date, title, time/location meta, category, host, attendees), news posts, tasks,
milestones, copy overrides, session.

## Design tokens
Colors
```
--page-bg        #f5f2ec   warm sand page
--surface        #ffffff   cards
--forest         #0f3d3a   masthead, primary buttons, selected day, dark card
--forest-hover   #0b2e2c
--terracotta     #c25a38   accent: active tab, links, badges, primary CTA
--terracotta-hi  #a94a2c   hover
--apricot        #e8a87c   accent on dark surfaces
--cream          #f0ece2 / #e5ded2   text on forest
--text           #23302f
--text-muted     #6e7a78
--text-faint     #9aa3a0
--text-on-dark   #a9bbb7 / #dfe6e2 / #b6c6c2
--border         #e3ddd3   card borders
--border-inner   #ece7de / #f0ece4   dividers
--border-field   #ded7cb / #e8e2d8
--fill-subtle    #faf8f4 / #fbfaf7 / #f7f9f8
--success        #2f7d5b   in office / done / attending
--success-bg     #eef4f1   border #bcd6c9
--chip-warn-bg   #fbeee8   border #f0d5c8
category: company #0f3d3a · training #6b7a2e · social #c25a38 · optional-in-person #7a6a9e
```
Type — Source Sans 3 (400/600/700) for UI, Source Serif 4 (600/700) for headings.
Scale: 32 hero · 19 date numeral · 17 card title · 14.5 hero blurb · 14 event title ·
13.5 body/controls · 13 secondary · 12.5 meta/buttons · 12 counts · 11.5 captions ·
11 uppercase labels (.8px tracking) · 10.5 micro labels (.4–.6px tracking).
Numerals use `font-variant-numeric: tabular-nums`.

Spacing — page gutters 28px, card padding 16px, card header padding 14px 16px,
section gap 18px, grid gap 13–18px, row padding 11–12px.
Radius — 3px tags · 4px day cells/chips · 5px buttons/inputs · 6px cards · 12px popover
· 999px pills. Shadows — only on floating chrome: pencil
`0 8px 24px rgba(13,45,42,.26)`, banner `0 10px 30px rgba(13,45,42,.28)`, popover
`0 18px 44px rgba(13,45,42,.22)`.

Voice — sentence case, second person, no emoji, no exclamation marks; times state the
zone ("9:00 – 10:00 AM ET"); empty states teach by example; legal line
"© 2026 Vitalis Trading Systems LLC. All rights reserved. Confidential."

## Assets
- `assets/vitalis-wordmark-cream.png` — the shipping masthead mark: the Vitalis
  wordmark recolored to cream `#f0ece2` for the forest bar.
- `assets/vitalis-wordmark.png` — original gold-on-dark wordmark (520×175). Low
  resolution; **request a vector/high-res original** before shipping, then regenerate
  the cream version from it.
- `assets/vitalis-wordmark-navy.png`, `assets/vitalis-wordmark-teal.png` — alternate
  tints, unused.
- All photography in the prototypes is a drop-in placeholder (`image-slot.js`). Supply
  real team photography; the design assumes candid, warmly lit group and headshot
  images. **Under the portal's CSP everything must be same-origin and bundled** — no
  CDN fonts or images: self-host Source Sans 3 / Source Serif 4 and serve photos from
  the app's own origin.

## Files in this bundle
- `Vitalis Connect Portal v2.dc.html` — the portal home screen (primary reference).
- `Employee Portal — Copy Edit Mode.dc.html` — the developer copy-editing layer.
- `Vitalis Connect Portal.dc.html` — earlier exploration, superseded; kept for context.
- `copy-editing-spec.md` — the verbatim feature spec (authoritative for API, access,
  ids, and CSP constraints).
- `assets/`, `image-slot.js`, `support.js` — assets and the runtime the prototypes
  need to open in a browser.

Open the `.dc.html` files directly in a browser to interact with them.
