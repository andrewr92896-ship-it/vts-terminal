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
`AGENTS.md` for how it works.

**Done — typography** (Beta V 5.60). Source Sans 3 and Source Serif 4 are
self-hosted via `@fontsource` in `src/employee/fonts.css` and exposed as
`EMP.sans` / `EMP.serif`. They are imported only from the employee entry, so the
main portal's bundle is unaffected. Serif is for headings only.

**Done — the palette** (Beta V 5.61). Warm-sand page, white cards, forest
masthead, terracotta action colour. `src/employee/theme.ts` no longer extends the
main portal's `C` tokens; it stands alone and also exports `SHADOW` and `RADIUS`
from the design's scales. Because every screen composes from those tokens plus
the `ui.tsx` primitives, the whole portal moved at once. The editing chrome now
uses the design's terracotta and forest as originally specified — the reason it
did not before (it would have clashed with the navy) no longer applies.

**Done — tasks** (Beta V 5.62). `employee_tasks` plus the "My tasks" card, built
to the design's spec. Every route is scoped to the caller: a portal admin can
*assign* work — to one person or to everyone, writing one row each so completion
is independent — but there is deliberately no endpoint that reads what anyone
else has ticked off. That would be a different, more loaded feature and nothing
in the design asks for it. The card lives on Overview for now; it moves to the
Home screen when that is built.

**Done — headshots and working status** (Beta V 5.63). The "Employee photos" card
on Overview: a drag-and-drop dropzone, the roster of who has a photo with the
design's "N still need a photo" nudge, and the in office / remote / away picker,
which reads back as a coloured dot in the directory. The photo is cropped square
and re-encoded to a 400px JPEG **in the browser** (`src/employee/image.ts`) before
it is sent, so what reaches the server is small and uniform regardless of what
came off the phone. Images live in `users.avatar` — the same column the main
portal already uses — rather than a second store, so one person has one face
across both surfaces. Working status is per-profile
(`employee_profiles.working_status`) and only ever self-set: there is no endpoint
that lets one person change another's.

**Done — a developer can add anyone's photo** (Beta V 5.64). Add / Replace /
Remove under each roster tile, founder-level only. The handoff assumes everyone
uploads their own; in practice a directory only fills up if somebody can do it on
everyone's behalf, and that is a founder power rather than an HR one — a portal
admin manages records, not faces. Every such change is audited against the person
it touched, so it stays distinguishable from a self-change.

**Not started — the rest of the Home screen and its data.** Still missing behind
`/employee`: a company calendar with per-user RSVP, birthdays and milestones, and
a Training section. Each needs its own tables and routes. Company news exists as
`employee_announcements` but has no lead image.

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
