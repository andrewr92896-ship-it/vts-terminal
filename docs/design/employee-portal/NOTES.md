# Employee Portal design handoff — implementation notes

The files beside this one are the design handoff for the Employee Portal
(`/employee`), produced in Claude Design. `README.md` is the full spec — tokens,
type scale, layout, interaction states. `copy-editing-spec.md` is the
developer-copy-editing feature spec.

Kept in the repo because the design lands in stages, and each stage needs the
same reference. Only the durable parts are here: the spec, and the wordmark
assets. The interactive `.dc.html` prototypes and their runtime (`support.js`,
`image-slot.js`, ~200 KB) are **not** committed — they are large, and the written
spec is authoritative for everything they demonstrate.

## Where the implementation has got to

**Done — developer inline copy editing** (Beta V 5.59). Built to
`copy-editing-spec.md`: the floating pencil, edit mode, the anchored popover with
Save / Reset / Hide, the `[[vts:hidden]]` sentinel, `isDeveloper` on the session,
and `PUT|DELETE /api/employee/copy/:key`. See the Employee Portal section of
`CLAUDE.md` for how it works.

**Done — typography** (Beta V 5.60). Source Sans 3 and Source Serif 4 are
self-hosted via `@fontsource` in `src/employee/fonts.css` and exposed as
`EMP.sans` / `EMP.serif`. They are imported only from the employee entry, so the
main portal's bundle is unaffected. Serif is for headings only.

**Not started — the palette.** The design moves the portal from the current
dark navy to a light warm-sand page (`#f5f2ec`) with a forest masthead
(`#0f3d3a`) and terracotta accent (`#c25a38`). That is a full inversion: every
surface, border and text token flips. `src/employee/theme.ts` currently spreads
the main portal's `C` tokens, so the change is mostly confined to that file plus
`ui.tsx` — but it also needs the eight hardcoded dark-assuming values in the
employee screens revisited (white-alpha button fills, the sign-in radial
gradient, popover shadows).

**Not started — the new Home screen and its data.** The design's home screen
assumes several domains that do not exist behind `/employee` yet: a company
calendar with per-user RSVP, personal tasks, employee headshot upload with a
"still needs a photo" roster, working status (in office / away / remote),
birthdays and milestones, and a Training section. Each needs its own tables and
routes. Company news exists as `employee_announcements` but has no lead image.

## Decisions taken that depart from the handoff

- **The copy-editing chrome does not use terracotta.** The spec styles it in the
  new palette, which belongs to a portal that does not exist yet; on today's navy
  surface it would read as a mistake. It is built from the accent tokens instead,
  so it looks right now and inherits the new palette automatically when the
  reskin lands.
- **Enum value labels are not editable copy.** Employment type, employee status
  and document category labels feed both the display and the `<select>` pickers.
  Making one side editable would silently desync them from the other.
- **The editor's own chrome is not editable.** Hiding the Save button would
  break the editor.

## Open questions for the owner

- **"Add event" was never designed** (the handoff says so explicitly and asks not
  to invent it). The calendar stage needs that flow specified.
- **The wordmark is low-resolution.** `assets/vitalis-wordmark.png` is 520×175
  and the cream version was regenerated from it. A vector original should replace
  both before the reskin ships.
- **Photography.** Every image in the design is a placeholder. Real team photos
  need to be supplied, and under the portal's CSP they must be served from the
  app's own origin — no CDN.
