# Demo work order — owner instructions, 2026-08-28

**This file exists so these instructions cannot be lost to a context window.** It
is the owner's own brief, transcribed, with a checkbox per item. Any session
picking this up should work the list top to bottom and tick items only when the
change is built AND verified.

> **SCOPE.** Every item is for the **PUBLIC DEMO** unless it says otherwise.
> Exactly two items touch the private portal, and both are marked
> **[PRIVATE + DEMO]**: the customizable My Terminal workspace, and the
> workspace/subsection reorganisation.

> **CODEX'S WORK IS SCRATCHED.** The owner ran this task through GPT Codex
> earlier; it rebuilt the terminal and the marketing page from scratch instead
> of reusing what exists, which is why it was abandoned. Do not build on any of
> it. The branch `codex/public-demo-marketing-v1` and the two Railway services
> that were pointed at it are not a reference. Reuse the portal's own
> components, always.

> **THE POINT OF THE DEMO.** It is not a screenshot of a product — it is the
> product, with sample data, that a stranger can click through and use. "I want
> everything in this demo to be functional and show them that it is a working
> site, not just an empty shell." A control that appears and does nothing is a
> failure, not a shortcut.

---

## WHEN THIS LIST IS FINISHED

The owner works fast and often presses continue without reading. So when every
item below is done:

1. State, **IN ALL CAPS AND OBNOXIOUSLY**, that this concludes the demo editing
   for the current set of tasks.
2. **Do not proceed further.** Ask the owner to type an explicit acknowledgement
   — an actual typed word, not "continue" — confirming they have read that the
   demo work is complete.
3. Only act on new demo work after that acknowledgement.

---

## The list

### Copy, disclaimers and compliance

- [x] **1. Premium Features screen — no tier levels.** Replace the tier display
      with a statement that **Early Access members will have full access during
      pre-release**.

- [x] **2. Demo bar wording.** The bar currently reads "Sample data. Nothing is
      saved, and everything resets when you leave. Informational only." Add that
      **features will be available upon the release of Early Access.**

- [x] **3. Suggestions are functional, and say what they are.** Sending a
      suggestion in the demo must WORK (it lands in demo state like every other
      demo write). After sending, tell the visitor this is for demonstration
      purposes only and that **suggestions will be available to Early Access
      members**.

- [x] **4. Site Rules / Terms / Privacy carry an "incomplete, in production"
      notice**, plus whatever is needed to keep the owner covered legally while
      this demo is being shared publicly.

- [x] **5. Terms of Service and Privacy Policy — "available at launch".** The
      owner does NOT want full ToS/Privacy text published before the site is up,
      out of liability concern. These pages stay viewable, state that the real
      documents arrive at launch, and **for every subsection give a line
      explaining how it will work** — the marketing purpose.

- [x] **6. Expand Rules & Conduct** for compliance, as judged appropriate.

- [x] **7. Compliance audit of the whole demo.** Find anything questionable and
      add the right disclaimer. Includes deciding whether a "some features will
      eventually be monetised" line is needed — **the owner would rather it were
      not**, so add it only if genuinely warranted, and say where and why.
      **Decided (2026-08-28):** no monetisation line on any marketing or in-terminal
      surface. What the demo says is the true and sufficient fact — Early Access is
      full access, free, for the whole pre-release. The one place the possibility of
      future paid features is stated is the Terms of Service ▸ Fees subsection, which
      is where a reader goes looking for it and where it creates no impression that
      anything is for sale now. Nothing anywhere claims the product is free forever,
      and no payment detail is collected anywhere in the pre-release, so there is
      nothing to disclaim beyond that.

### Structure and navigation

- [x] **8. [PRIVATE + DEMO] My Terminal becomes a customizable workspace.**
      Add the ability to **add and remove sections** from My Terminal — e.g. put
      Closed Trades & Metrics on it if you want it there, and take it off again.
      This is the one substantive change that lands on the private portal too.

- [x] **9. [PRIVATE + DEMO] Settings becomes its own workspace**, with
      **Preferences underneath it**. Then use judgement on the rest: decide
      which subsections belong under Settings and which under Site Help, and
      organise them properly.

- [x] **10. Market Data moves to Advanced Trading.** It currently sits under My
      Terminal; since My Terminal is becoming a customizable workspace, Market
      Data belongs in Advanced Trading.
      **Done on the PUBLIC terminal only**, per the scope note at the top — this
      item is not marked [PRIVATE + DEMO]. Privately Market Data is still a My
      Terminal row, and moving it there is a two-line change in `theme/nav.ts`
      whenever the owner says so.

### Features the demo must actually demonstrate

- [x] **11. Live Wall is editable in the demo**, in exactly the way it is in the
      private portal — add, remove, move and resize tiles — excluding anything
      that will not be available to the public.

- [ ] **12. AI trade reading.** The public terminal will get the private
      portal's ability to have AI read a screenshot and log an active or closed
      trade. **For the demo: do not let it actually place/log the trade via AI.**
      Give the visitor the option to **see an example of what it would look
      like** if they did.

- [x] **13. Live stream placeholders.** Under Market News → Live Streams, show a
      box reading **"Live stream plays here"**, as though a video were playing.
      No actual video. **Do the same on the Live Wall.**

- [ ] **14. Admin editing inside the demo.** Give an admin ability to edit
      things directly in the demo portal — announcements, patch notes, and
      similar.

- [ ] **15. The How-to section is generic and unhelpful.** Rewrite it so it is
      actually useful.

---

## Standing rules that still apply

- The demo answers writes out of module memory and reaches no service. Nothing
  is saved; leaving resets it. That is a property of where the data lives.
- Reuse the portal's own components. Do not create a second design system, a
  second nav, or a substitute for anything real. (See the TradingView fixture
  removed in 7.63 — that is the mistake this rule exists to prevent.)
- AI fails closed in the public terminal until the provider migration. Item 12
  is an EXAMPLE of the feature, not the feature.
- A figure that could not be measured is never reported as a measured one.
- Every new reachable `api.*` call must be answered — live, demo, refused as AI,
  or named in `scripts/verify-demo-coverage.mjs` with a reason.
- `npm run verify` must pass before anything ships.
