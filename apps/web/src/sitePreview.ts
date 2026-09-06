// The marketing page, rendered on its own, as its own page — the Site Editor's
// preview pane and the View Site screen both frame this.
//
// A SECOND HTML ENTRY RATHER THAN A COMPONENT ON A SCREEN, for the reason the
// portfolio admin settled: the page's layout is decided by `clamp(…vw…)` and a
// media query, both of which resolve against the VIEWPORT. Inside the portal's
// main column a 390px "phone" frame would still be laid out against the whole
// window, so every responsive decision would be shown wrong. As its own
// document in an iframe it gets its own viewport.
//
// IT IS THE SITE'S OWN RENDERER AND THE SITE'S OWN STYLESHEET, imported from
// apps/marketing — so what is drawn here is what the site draws, and there is
// no second renderer to drift. File addresses are pointed at the portal's
// public file route, because /files/ is the site's proxy and does not exist
// on this origin.
//
// THE EDITOR POSTS ITS WORKING STATE IN; opened on its own it fetches the draft
// (or, with ?published=1, what is live). A posted document always wins over a
// fetched one, and the origin is checked because a page in an iframe can be
// sent a message by anybody who can reach it.
import { renderMarketingBody, validateMarketing } from '../../marketing/render/render.mjs';
import type { Model } from '../../marketing/render/render.mjs';
import '../../marketing/src/styles.css';
// The slideshow's own script, so a preview slideshow moves the way the site's
// does. It is the site's file: what the site links is what is imported here.
import { mountSlideshows } from '../../marketing/src/slideshow.js';

const SITE = 'marketing';
const FILES = `/api/public/site/${SITE}/files/`;
const params = new URLSearchParams(window.location.search);
const published = params.has('published');

let posted = false;

function draw(model: Model) {
  const y = window.scrollY;
  document.body.innerHTML = renderMarketingBody(model, { files: FILES });
  mountSlideshows(document.body);
  if (model.head?.title) document.title = model.head.title;
  // A re-render on every keystroke must not throw the reader back to the top.
  window.scrollTo(0, y);
}

window.addEventListener('message', (e: MessageEvent) => {
  if (e.origin !== window.location.origin) return;
  const data = e.data as { type?: string; model?: unknown } | null;
  if (data?.type !== 'vts-site-model') return;
  if (validateMarketing(data.model) !== null) return;
  posted = true;
  draw(data.model as Model);
});

// Tell the opener the page is listening — the editor may have posted before
// this script ran, and a frame that stays blank until the next keystroke reads
// as broken.
window.parent?.postMessage({ type: 'vts-site-preview-ready' }, window.location.origin);

void (async () => {
  try {
    const res = await fetch(published ? `/api/public/site/${SITE}/content` : `/api/site-editor/${SITE}`, {
      credentials: 'include',
    });
    if (!res.ok) return;
    const body = (await res.json()) as { model?: unknown };
    if (!posted && validateMarketing(body.model) === null) draw(body.model as Model);
  } catch {
    // Nothing to draw. The editor will post, or the pane stays empty, and an
    // empty pane is a better failure than a page of the wrong words.
  }
})();
