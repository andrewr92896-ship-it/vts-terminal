# Employee Portal — developer inline copy editing

*(Verbatim spec as supplied by the product owner. Authoritative for API, access rules,
ids, and CSP constraints.)*

## Context

This is the Vitalis Trading Systems Employee Portal — an internal staff site
served at vitalistradingsystems.com/employee. It is a separate website from the
main trading portal: its own page, its own bundle, its own session, its own API
namespace under /api/employee/*. Nothing here shares state with the main portal.

I need you to design and build a developer-only inline copy-editing mode for it,
matching a mechanism the main portal already has. The goal: any hardcoded string
in the portal — screen titles, subtitles, blurbs, button labels, empty states,
placeholders, captions — can be reworded live by a developer, in place, without
a code change or deploy.

## The interaction

**A floating pencil button, lower-right corner.** Circular, ~44px, fixed
position, sitting above the page content. Visible ONLY to developers (see
Access below). Everyone else never sees it and never knows it exists.

**Clicking the pencil toggles "edit wording" mode.** While it's on:

- The button changes to a clearly "active" state (filled rather than outlined).
- Every editable string on the page becomes visibly highlighted — a subtle tinted
  background plus a dashed outline, so a developer can see at a glance exactly
  which text is editable and which is live data.
- A small banner appears (top center, or wherever fits your layout) reading
  something like "Editing wording — click any highlighted text to change it,"
  with a Done button that exits the mode.

**Clicking a highlighted string opens a small editor popover**, anchored right
next to the text that was clicked (below it if there's room, above if not,
clamped to the viewport so it never renders off-screen). The popover contains:

- A textarea pre-filled with the string's current value.
- **Save** — stores the new wording. Everyone sees it immediately.
- **Reset** — clears the override; the string reverts to the version coded into
  the app.
- **Hide** — makes the string render as nothing at all for every user. Not
  blank space: the element disappears. This is for removing a piece of copy
  entirely, not just rewording it.
- Cancel / click-outside closes without saving.

Behaviors that matter:
- Saving a blank value, or a value identical to the coded default, clears the
  override rather than storing it.
- A hidden string still shows to a developer in edit mode, rendered
  struck-through and faded, so it stays discoverable and can be clicked to
  restore.
- Outside edit mode the wrapper renders the resolved text with NO extra markup
  and no layout effect whatsoever. It must be invisible in every sense when the
  mode is off.

## Access — developers only

Not admins. Not HR/portal admins. Developers, meaning users holding the
`founder` or `software_developer` role on their underlying account.

The employee session endpoint (GET /api/employee/session) returns a `me` object.
Gate the pencil on a boolean `isDeveloper` on that object. Do not gate on
`isPortalAdmin` — that flag means "HR administrator of this portal" and is a
different, broader group.

The server is the real enforcer; the pencil's visibility is only UI. Assume the
write endpoint rejects anyone who isn't a developer regardless of what the UI
shows.

## The wrapper component

The portal already has a read-only version of this. There is a component:

    <T id="emp.docs.title">Documents</T>

and a hook form for plain-string contexts like placeholders:

    const ph = useCopy('emp.docs.title_ph', 'e.g. Expense policy');

`T` resolves the id against a map of overrides loaded once at startup, falling
back to the bundled text passed as children. Extend these — do not replace them
— so that in edit mode they become clickable targets. Also add a `text={expr}`
prop form for cases where the default comes from a variable rather than a
literal child.

**ID naming:** globally unique, lowercase, dotted, namespaced `emp.` for this
portal — `emp.<screen>.<slug>`. Examples: `emp.home.greeting`,
`emp.calendar.title`, `emp.directory.search_placeholder`,
`emp.tasks.empty`.

**Wrap by default.** Every coded string in every screen you build should be
wrapped. This is the standing expectation, not an opt-in.

**Never wrap:**
- User- or company-created data — a person's name, a document title someone
  typed, an announcement body, a calendar event name
- Live figures — dates, times, counts, headcounts, due dates
- Interpolated strings that splice in a variable
- Paragraphs containing embedded markup

If it came out of a database it is not editable copy. If it was typed by a
developer into a .tsx file, it is.

## API contract

Reading (already exists):

    GET /api/employee/copy
    → { copy: { "emp.docs.title": "Files", ... } }

Load this once when the portal mounts and resolve every `T` against it. Treat a
failure as non-fatal — fall back to bundled defaults and render normally.

Writing (needs to be added — see note at the end):

    PUT    /api/employee/copy/:key    body { value: string }   → saves
    DELETE /api/employee/copy/:key                             → clears

Both require the employee session cookie AND the CSRF token echoed in the
`x-vts-employee-csrf` header, exactly like every other write in this portal.
The existing API client already attaches that header on non-GET requests — use
it, don't hand-roll fetch calls.

To hide a string, save the exact sentinel value `[[vts:hidden]]`. The renderer
checks for it and renders nothing.

Keep local state in sync optimistically after a successful save so the page
updates instantly without a refetch.

## Hard constraints

This page runs under a strict Content Security Policy:
`script-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`,
`base-uri 'none'`, `object-src 'none'`.

- No inline `<script>`, no `eval`, no CDN links, no external fonts or images.
- Everything must be bundled and same-origin. Inline `style` attributes are fine.
- The page is served `no-store` and is deliberately not a PWA — don't add a
  service worker, manifest, or install prompt.

## Visual direction

Match the portal's existing design language — cream/off-white page background,
deep forest-green header and primary surfaces, terracotta as the action accent,
serif headings against a clean sans body.

The editing chrome should feel like a considered part of that system, not a
bolted-on dev tool: the terracotta accent for the active pencil and the
highlight tint, generous rounding, a soft shadow on the popover. It should look
like something you'd ship, because a developer using it is still looking at the
real site.

Make it work on a phone too — the popover should become a bottom sheet rather
than a floating card on narrow screens.

---

## Notes from design

- The prototype `Employee Portal — Copy Edit Mode.dc.html` in this bundle implements the
  full interaction against in-memory state: pencil on/off, highlight treatment, banner,
  anchored popover with Save / Reset / Hide / Restore, the `[[vts:hidden]]` sentinel,
  and the struck-through-in-edit-mode rendering of hidden strings. Its `DEFAULTS` map
  holds the copy ids already assigned for the home screen — keep those ids.
- Prototype gaps to close in implementation: real `GET /api/employee/copy` load at
  mount, writes through the existing API client (`PUT`/`DELETE` with the
  `x-vts-employee-csrf` header), `isDeveloper` read from `GET /api/employee/session`,
  click-outside-to-close, and the narrow-screen bottom sheet.
- The prototype loads fonts from Google and uses the `image-slot` placeholder for
  photography; under the portal's CSP both must be self-hosted and bundled.
