# VTS Terminal — design brief (current shell)

Paste this whole file into a design tool before asking it to design any terminal
screen. `docs/design/portal-shell.html` is the same thing as a working page —
open it, screenshot it, or attach it so the tool can see the chrome it is
designing inside.

Keep this file current when the shell changes. Everything in it is taken from
`apps/web/src/theme/*` and `apps/web/src/components/{Sidebar,TopBar,Portal}.tsx`.

---

## Read this first — what is NOT the design any more

Older mockups of this app show a **horizontal top-bar nav**: a gold `VITALIS`
wordmark on the left, then workspace tabs across the bar (`Trading`, `Kia Sales`,
`Studies`, `To Do`, `Wealth`, `Finance`), a `v2.4.1` pill beside them, and a
second row of section tabs beneath. **That template is dead.** Do not design
against it.

Specifically, none of these exist:

- **No horizontal workspace tabs.** Navigation is a left sidebar.
- **No second row of section tabs.** Sections are the sidebar's lower list.
- **No version pill in the header.** The version sits in the sidebar footer.
- **Kia Sales, Wealth, Finance, Personal Finance, Vitalis Wealth Management, the
  standalone To-Do workspace** — all removed. Do not reintroduce or reference them.
- **"Ask Claude"** — the button is **Ask VTS AI**. In user-facing copy the AI is
  always "VTS AI", never "Claude", "Anthropic", or a model name.
- **Per-workspace backgrounds.** The background is one navy everywhere; a
  workspace is signalled by its accent only.

---

## The shell

A two-column CSS grid, full viewport height, no page scroll — only the content
column scrolls.

```
┌──────────────┬────────────────────────────────────────────┐
│              │  top bar · 64px                            │
│  sidebar     ├────────────────────────────────────────────┤
│  248px       │  content (this is the only scroller)       │
│  (72px when  │                                            │
│  collapsed)  │  ─ footer strip at the end of the content ─│
└──────────────┴────────────────────────────────────────────┘
```

- Grid: `grid-template-columns: 248px 1fr` → `72px 1fr` collapsed, `.18s ease`.
- Page height `100vh`, `overflow: hidden`; the content column is `overflow-y: auto`.
- Routing is state-based. The URL never changes, there is no deep-linking and no
  browser back/forward. Do not design URL bars, breadcrumb links that look like
  routes, or "copy link to this view" affordances.

### Sidebar (`Sidebar.tsx`)

Background `#071021`, `border-right: 1px solid #152139`, padding `22px 16px 18px`,
`gap: 22px`, its own scroller. Top to bottom:

1. **Brand** — the Vitalis wordmark image, 148px wide (`/brand/vitalis-wordmark.png`),
   with a 30×30 collapse button (`panel-left-close`) to its right. Collapsed, the
   brand becomes the mono text `VTS` in gold and the toggle centres beneath it.
2. **Employee Portal row** *(conditional)* — a standalone row **above** the
   workspaces list, in the employee site's terracotta `#C25A38`, with an
   `external-link` glyph. It is not a workspace and not a section: it is a link to
   a separate website that opens in a new tab. Only shown to users with the
   `employee` role **and** a company-domain email.
3. **`WORKSPACES`** label, then one row per workspace the user may see.
4. **The current workspace's group label** (e.g. `ADVANCED TRADING`), then one row
   per section of that workspace.
5. **Footer**, pinned to the bottom above a hairline: `VTS Terminal` in mono +
   the version pill (gold text, gold-tinted border, e.g. `Beta V 5.78`).

Nav row spec — the same row for both tiers:

| | |
|---|---|
| Padding / radius / gap | `9px 10px` · `8px` · `11px` |
| Type | 13.5px, weight 500 (600 when active) |
| Icon | 16px Lucide, stroke 1.75, round caps |
| Resting | text `#93A5C9`, icon `#5E7098`, transparent bg |
| Hover | text `#E9EFFB`, bg `rgba(255,255,255,.03)` |
| **Active workspace** | bg `rgba(255,255,255,.045)`, text `#E9EFFB`, **icon in that workspace's accent** |
| **Active section** | bg `linear-gradient(180deg, accent@16%, accent@8%)`, **text and icon both in the accent** |
| Optional count | mono 11px, `#5E7098`, right-aligned |
| Optional activity dot | 8px solid red `#F0596E` with a glow, blinking, at the row's end |

Collapsed (72px): icons only, centred, label shown as a dark tooltip on hover.

### Top bar (`TopBar.tsx`)

64px tall, background `#071021` (same as the rail), `border-bottom: 1px solid
#152139`, padding `0 24px 0 28px`, `gap: 14px`. Left to right:

- Hamburger (`panel-left-open`) — **phone only**.
- **Breadcrumb**, 13px: `team name › workspace › **section**` with `chevron-right`
  separators; only the section is bold and full-brightness. On a phone, just the
  section. This is the bar's only navigational content — no tabs.
- **Search** (desktop) — 240px, panel background, `⌘K` chip. Visual affordance
  only; the shortcut is not wired yet.
- **Clock** — live time + date, Eastern, mono.
- **`Ask VTS AI`** — the one gold-gradient button in the shell (`gem` icon —
  the Max tier's own glyph, since VTS AI is a Max feature — dark `#241A05`
  text). Opens a slide-over panel. On a phone it collapses to the icon alone.
- **Bell** — 36×36 icon button with a red count bubble for unread in-terminal
  notifications.
- **Avatar** — 32px circle, ringed in the current workspace accent; opens the
  account menu.

### Content column

- Screen title: `h2`, 19px, weight 700, pure white. Optional 12.5px `#93A5C9`
  subtitle beneath it. Screen-level actions sit at the right of that same header row.
- The content area may carry a very faint accent tint over the navy; the base is
  always `#050B18`.
- A footer strip closes the scroll: `© 2026 Vitalis Trading Systems LLC. All
  rights reserved. Confidential.` on the left; Terms · Privacy · Rules and the
  viewer's access label on the right, all 10.5px `#5E7098`.

---

## Tokens

Copy these verbatim — they are `theme/tokens.ts` (`C`) and the CSS variables in
`styles/global.css`.

```css
--bg:      #050B18;  /* app background            */
--side:    #071021;  /* sidebar AND top bar       */
--panel:   #0A1426;  /* cards                     */
--panel-2: #0C1930;  /* nested panels, footers    */

--line:    #152139;  /* default border / divider  */
--line-2:  #1E2E52;  /* stronger border, inputs   */
--hover:   #24365F;  /* card border on hover      */

--text:    #E9EFFB;  /* primary text              */
--muted:   #93A5C9;  /* secondary text            */
--faint:   #5E7098;  /* labels, metadata          */

--gold:      #EBCB74;  /* primary action, active nav */
--gold-2:    #C9A24B;  /* gold gradient bottom stop  */
--gold-text: #241A05;  /* text on a gold button      */
--green:     #2FC77E;  /* long / positive / live     */
--red:       #F0596E;  /* short / negative / high    */
--amber:     #E5A43B;  /* warnings                   */
```

Gold gradient (primary buttons, the active workspace switcher):
`linear-gradient(180deg, #EBCB74, #C9A24B)`.

Accent tints are the accent hex at low alpha — `rgba(r,g,b,0.16)` and `0.08` for
the active-section pill, `0.12` for a tinted chip, `0.35–0.4` for a tinted border.

### Workspace accents

The **only** thing that changes between workspaces. Backgrounds never do.

| Workspace | Accent | Icon | Sidebar group label |
|---|---|---|---|
| My Terminal *(pinned first)* | `#34D399` emerald | `briefcase` | My Terminal |
| Advanced Trading | `#EBCB74` gold | `candlestick-chart` | Advanced Trading |
| Investments | `#2DD4BF` teal | `landmark` | Investments |
| Studies | `#B69CFF` violet | `graduation-cap` | Studies |
| Admin Terminal *(admins)* | `#E0708F` rose | `shield-check` | Administration |
| Developer Terminal *(founder)* | `#F5A524` amber | `crown` | Developer |
| Site Help *(everyone)* | `#6C9EFF` blue | `life-buoy` | Help & support |

### Type

- **UI:** IBM Plex Sans (self-hosted, weights 400/600/700).
- **Numbers, times, tickers, versions, keyboard hints:** IBM Plex Mono (400/600).
  Every figure on a screen is mono — a price or P&L set in the sans face is wrong.
- Sizes in use: 19 title · 13.5 nav · 13 breadcrumb · 12.5 body/buttons ·
  11–11.5 metadata · 10.5 labels/footer · 9.5–10 chips and pills.
- Section labels are uppercase, ~10.5px, `letter-spacing: 1.4px`, weight 600, `#5E7098`.
- **No CDN.** Fonts are self-hosted; the terminal makes no external requests.

---

## Sections, by workspace

The sidebar's lower list. Sections a user lacks the role for are simply absent.

- **My Terminal** — Investment Holdings · Net Worth · Trading Team · Preferences · Settings
- **Advanced Trading** — Live Wall · Trading Alerts · Trade Desk · Trade Analysis ·
  Deleted Trades · Strategy Sessions · Manual Trades · Funded *(role-gated)* ·
  Market Data · Market News · To Do
- **Investments** — Portfolio Overview · Accounts · Holdings · Allocation ·
  Performance · Dividends & Income · Contributions & Goals · Projections
  *(all currently "Coming Soon" placeholders)*
- **Studies** — Subjects · Study Game · Flashcards · Practice Tests ·
  Study Presentations · Progress · Study Creation
- **Admin Terminal** — Users · Teams · Badges · Message Templates · Patch Notes ·
  Early Access · Bug Reports · Support
- **Developer Terminal** — AI Instructions · Site Wording · Sidebar Layout ·
  Suggestions · View as role
- **Site Help** — How to · Announcements · Patch notes · Report a bug ·
  Suggestion · Rules & Conduct · Terms of Service · Privacy Policy

The founder can reorder workspaces and the sections within a workspace from
**Developer Terminal ▸ Sidebar Layout**, so treat the order above as the default,
not a constant.

---

## Component patterns

Reuse these rather than inventing new ones.

```
card          bg #0A1426 · 1px #152139 · radius 12 · padding 16
              (hover: border #24365F)
panel         bg #0C1930 · 1px #152139 · radius 10 · padding 14px 16px
input         bg rgba(255,255,255,.03) · 1px #1E2E52 · radius 7 · 12.5px · padding 9px 11px
chip          9.5px/700 · #93A5C9 · 1px #1E2E52 · radius 5 · padding 2px 7px
gold button   gradient · #0C2768 or #241A05 text · 700 · 12px · radius 7 · padding 8px 14px
ghost button  bg rgba(255,255,255,.05) · 1px #1E2E52 · #DFE7FA · 11.5px/600 · radius 7
icon button   36×36 · bg rgba(255,255,255,.02) · 1px #1E2E52 · radius 8
tile label    10px/700 uppercase · letter-spacing .8px · #5E7098, often with a
              6px status dot ahead of it (green = live)
figure        mono · ~25px/600 · with a small faint unit suffix
delta         mono · 11px · ▲ green / ▼ red, then faint metadata
```

Interaction rules:

- One gold action per view. Everything secondary is a ghost button.
- Borders carry the structure; shadows are used only on floating layers
  (dropdowns, tooltips, modals — `0 16px 40px rgba(0,0,0,.5)`).
- Green/red mean long/positive and short/negative. Do not spend them on anything else.
- Radii: 12 cards · 10 panels/dropdowns · 8 rows, buttons, icon buttons · 7 inputs
  and small buttons · 5–6 chips.
- Transitions are short — `.15s` colour, `.18s` layout.

---

## Responsive

- Breakpoints: phone ≤ 480px, tablet ≤ 768px.
- **Phone:** the rail becomes a 264px off-canvas drawer behind the top-bar
  hamburger, over a `rgba(0,0,0,.55)` scrim. There is **no bottom tab bar**.
  The top bar keeps the section name, the Ask VTS AI icon, the bell and the avatar.
- Every text input is floored at 16px on touch devices site-wide, so iOS never
  zooms on focus. Do not design a smaller mobile input.

---

## Copy conventions

- Plain, terminal-style voice. Short labels, sentence case, no marketing tone.
- The AI is **VTS AI** everywhere a user can read it.
- All times and dates are **Eastern**, and every position shows when it opened
  and — once closed — when it closed.
- Advice-flavoured surfaces carry an "informational only, not investment advice"
  disclaimer.
- Any figure shown must be real. Never mock a number into a shipping screen
  without marking it sample data.

---

## Two things that are deliberately different

- **`/employee` (the Employee Portal)** does not use any of this. It is a separate
  website with its own warm-sand palette, forest masthead, terracotta action colour,
  Source Sans/Serif type and a **top-bar** nav. If the design is for that surface,
  use `docs/design/employee-portal/` instead of this file.
- **Studies** recolours live to the learner's Study-Game level, so its accent is
  the one that moves at runtime.
