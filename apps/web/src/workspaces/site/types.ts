// The marketing page's document types, from the renderer that draws it.
//
// The renderer is plain JavaScript in apps/marketing (it runs on the site's
// own server, which has no build step) and describes itself in render.d.mts;
// this re-exports those so the editor's code reads the same names the
// portfolio editor uses. `LinkBehavior` is the portfolio's name for what the
// renderer calls `Behavior`.
export type {
  Behavior as LinkBehavior,
  Item,
  ItemKind,
  Link,
  Model,
  Section,
  SectionType,
} from '../../../../marketing/render/render.mjs';
