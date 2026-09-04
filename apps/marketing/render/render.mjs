// The marketing page as a FUNCTION OF A DOCUMENT.
//
// vitalistradingsystems.com was one hand-written HTML file. It still looks
// exactly like that file — `npm run verify:marketing-render` renders the seed
// through this and compares it with `src/index.html`, so the page cannot drift
// from what it was without a check going red — but the words now live in a
// document the Site Editor on the private portal can change, and this is the
// one function that turns that document into the page.
//
// PLAIN JAVASCRIPT, NO DEPENDENCIES, NO DOM. It runs in three places and has to
// suit all of them: the marketing server renders it per request from the model
// it last read off the portal; the portal's preview page runs it in the browser
// on every keystroke; the check above runs it in Node against a file. A React
// renderer would have needed a build step in a service that has none.
//
// EVERY VALUE IS ESCAPED ON THE WAY IN. The document is written by one person
// in a password-protected editor, and it is still escaped, because the day the
// editor grows a second author is not the day to discover the renderer trusted
// the first.

/** @typedef {'link' | 'download' | 'preview'} Behavior */
/**
 * @typedef {Object} Link
 * @property {string} label
 * @property {string} href
 * @property {boolean} [ghost]      outlined rather than filled
 * @property {Behavior} [behavior]  what a click does; absent means go there
 */
/**
 * @typedef {Object} Item
 * @property {'card' | 'image' | 'video' | 'text' | 'callout'} [kind]
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [imgSrc]
 * @property {string} [videoUrl]
 * @property {string} [href]
 * @property {string} [linkLabel]
 * @property {Behavior} [behavior]
 */
/**
 * @typedef {Object} Section
 * @property {string} id
 * @property {'hero' | 'grid' | 'boundary' | 'early'} type
 * @property {boolean} [hidden]
 * @property {boolean} [anchor]   emit the id on the element (a link target)
 * @property {string} [eyebrow]
 * @property {string} [h1]
 * @property {string} [h1Em]      the second, gold line of the headline
 * @property {string} [title]
 * @property {string} [lede]
 * @property {string} [body]
 * @property {string} [fine]
 * @property {Link[]} [buttons]
 * @property {Item[]} items
 */
/**
 * @typedef {Object} Model
 * @property {{ title: string, description: string, ogTitle: string, ogDescription: string }} head
 * @property {{ mark: string, markEm: string, links: Link[] }} bar
 * @property {Section[]} sections
 * @property {{ copyright: string, fine: string }} footer
 */

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The id of a YouTube video, read out of whatever was pasted. Every shape a
 * share button produces, and a bare id; null for anything else, so a wrong
 * link draws a slot that says so rather than an embed of nothing.
 */
export function youtubeId(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const ID = /^[\w-]{11}$/;
  if (ID.test(s)) return s;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  const ok = (v) => (v && ID.test(v) ? v : null);
  if (host === 'youtu.be') return ok(u.pathname.slice(1).split('/')[0]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') return ok(u.searchParams.get('v'));
    const m = /^\/(embed|shorts|live|v)\/([\w-]{11})(?:[/?#]|$)/.exec(u.pathname);
    if (m) return ok(m[2]);
  }
  return null;
}

/** Every uploaded file the model points at, by slug. Walks the whole document. */
export function referencedFiles(model) {
  const found = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      const m = /^\/files\/([^/?#]+)/.exec(v);
      if (m) found.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(model);
  return [...found].sort();
}

/**
 * The attributes a link carries for its behaviour.
 *
 *   link      an http(s) address opens in a new tab; anything else in place.
 *   download  the browser saves it. Works because /files is same-origin.
 *   preview   a small script on the page opens it in a viewer with a download
 *             arrow (viewer.js). Marked with data-preview; the href is still
 *             there, so with scripts off it simply opens.
 */
function linkAttrs(link) {
  const href = fileHref(link.href);
  const b = link.behavior;
  let out = ` href="${esc(href)}"`;
  if (b === 'download') out += ' download';
  else if (b === 'preview') out += ' data-preview';
  else if (/^https?:\/\//i.test(href) && !/vitalistradingsystems\.com/i.test(href)) {
    out += ' target="_blank" rel="noopener noreferrer"';
  }
  return out;
}

/**
 * Where /files/<slug> resolves. On the site it is /files/, served by the site's
 * own proxy; the portal's preview page runs on the portal's origin, where the
 * same files are at the public API route, so it hands in that prefix. Set per
 * render and read by the two places a file address is written out.
 */
let filesBase = '/files/';
const fileHref = (href) =>
  String(href ?? '').startsWith('/files/') ? filesBase + String(href).slice('/files/'.length) : String(href ?? '');

const button = (l, indent) =>
  `${indent}<a class="button${l.ghost ? ' ghost' : ''}"${linkAttrs(l)}>${esc(l.label)}</a>`;

// ---------------------------------------------------------------- blocks

/**
 * A site-wide block, in the page's own vocabulary. A card is the grid's own
 * article; the rest carry classes styles.css defines for them. Anything with a
 * kind the renderer does not know draws nothing rather than something broken.
 */
function block(it, indent) {
  const i = indent;
  const kind = it.kind ?? 'card';
  switch (kind) {
    case 'card': {
      const lines = [`${i}<article>`];
      if (it.title) lines.push(`${i}  <h2>${esc(it.title)}</h2>`);
      if (it.body) lines.push(`${i}  <p>${esc(it.body)}</p>`);
      if (it.href) lines.push(`${i}  <a class="more"${linkAttrs(it)}>${esc(it.linkLabel || 'Open')} →</a>`);
      lines.push(`${i}</article>`);
      return lines.join('\n');
    }
    case 'image': {
      const src = fileHref(it.imgSrc);
      const lines = [`${i}<figure class="media">`];
      lines.push(
        src
          ? `${i}  <img src="${esc(src)}" alt="${esc(it.title ?? '')}" loading="lazy">`
          : `${i}  <div class="slot">Image to come</div>`,
      );
      if (it.title) lines.push(`${i}  <figcaption>${esc(it.title)}</figcaption>`);
      lines.push(`${i}</figure>`);
      return lines.join('\n');
    }
    case 'video': {
      const id = youtubeId(it.videoUrl);
      const url = String(it.videoUrl ?? '').trim();
      const lines = [`${i}<figure class="media">`];
      lines.push(
        id
          ? `${i}  <div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(it.title || 'Video')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
          : `${i}  <div class="slot">${url ? 'Not a YouTube link' : 'Video to come'}</div>`,
      );
      if (it.title) lines.push(`${i}  <figcaption>${esc(it.title)}</figcaption>`);
      lines.push(`${i}</figure>`);
      return lines.join('\n');
    }
    case 'text':
      return `${i}<p class="text">${esc(it.body ?? '')}</p>`;
    case 'callout': {
      const lines = [`${i}<div class="callout">`];
      if (it.title) lines.push(`${i}  <h2>${esc(it.title)}</h2>`);
      if (it.body) lines.push(`${i}  <p>${esc(it.body)}</p>`);
      lines.push(`${i}</div>`);
      return lines.join('\n');
    }
    default:
      return '';
  }
}

/** Blocks under a section that is not itself a grid: laid out as one. */
function blocks(items, indent) {
  const list = (items ?? []).filter((it) => it && typeof it === 'object');
  if (!list.length) return '';
  return [`${indent}<div class="grid blocks">`, ...list.map((it) => block(it, `${indent}  `)).filter(Boolean), `${indent}</div>`].join(
    '\n',
  );
}

// ---------------------------------------------------------------- sections

function sectionOpen(s, cls) {
  const id = s.anchor === false ? '' : ` id="${esc(s.id)}"`;
  return `    <section${id} class="${cls}">`;
}

function hero(s) {
  const out = [sectionOpen(s, 'hero')];
  if (s.eyebrow) out.push(`      <p class="eyebrow">${esc(s.eyebrow)}</p>`);
  if (s.h1 || s.h1Em) {
    out.push(`      <h1>${esc(s.h1 ?? '')}${s.h1Em ? `<br><em>${esc(s.h1Em)}</em>` : ''}</h1>`);
  }
  if (s.lede) out.push(`      <p class="lede">`, `        ${esc(s.lede)}`, `      </p>`);
  if (s.buttons?.length) {
    out.push(`      <div class="cta">`, ...s.buttons.map((l) => button(l, '        ')), `      </div>`);
  }
  if (s.fine) out.push(`      <p class="fine">${esc(s.fine)}</p>`);
  const extra = blocks(s.items, '      ');
  if (extra) out.push(extra);
  out.push(`    </section>`);
  return out.join('\n');
}

function grid(s) {
  const out = [sectionOpen(s, 'grid')];
  for (const it of s.items ?? []) {
    const b = block(it, '      ');
    if (b) out.push(b);
  }
  out.push(`    </section>`);
  return out.join('\n');
}

function panel(s, cls) {
  const out = [sectionOpen(s, cls)];
  if (s.title) out.push(`      <h2>${esc(s.title)}</h2>`);
  if (s.body) out.push(`      <p>`, `        ${esc(s.body)}`, `      </p>`);
  if (s.buttons?.length) out.push(...s.buttons.map((l) => button(l, '      ')));
  const extra = blocks(s.items, '      ');
  if (extra) out.push(extra);
  out.push(`    </section>`);
  return out.join('\n');
}

function section(s) {
  switch (s.type) {
    case 'hero':
      return hero(s);
    case 'grid':
      return grid(s);
    case 'boundary':
      return panel(s, 'boundary');
    case 'early':
      return panel(s, 'early');
    default:
      return '';
  }
}

// ---------------------------------------------------------------- page

/**
 * The whole document.
 *
 * `stylesheet` is where styles.css is — `/styles.css` on the site, and the
 * portal's preview hands in its own copy. `scripts` is whether viewer.js is
 * linked; the preview does not want it, the site does.
 */
export function renderMarketing(model, { stylesheet = '/styles.css', scripts = true, files = '/files/' } = {}) {
  filesBase = files;
  const { head, bar, footer } = model;
  const nav = (bar.links ?? [])
    .map((l) => `      <a${l.ghost ? ' class="ghost"' : ''}${linkAttrs(l)}>${esc(l.label)}</a>`)
    .join('\n');
  const body = (model.sections ?? [])
    .filter((s) => s && !s.hidden)
    .map(section)
    .filter(Boolean)
    .join('\n\n');
  const needsViewer =
    scripts && JSON.stringify(model).includes('"behavior":"preview"');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(head.description)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${esc(head.ogTitle)}">
  <meta property="og:description" content="${esc(head.ogDescription)}">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="${esc(stylesheet)}">
  <title>${esc(head.title)}</title>${needsViewer ? '\n  <script src="/viewer.js" defer></script>' : ''}
</head>
<body>
  <header class="bar">
    <img class="mark" src="/brand/vitalis-wordmark.png" alt="${esc(bar.mark)} ${esc(bar.markEm)}" width="520" height="175">
    <nav>
${nav}
    </nav>
  </header>

  <main>
${body}
  </main>

  <footer>
    <span>${esc(footer.copyright)}</span>
    <span class="fine">
      ${esc(footer.fine)}
    </span>
  </footer>
</body>
</html>`;
}

/** The body's markup alone, for a preview that swaps the page in place. */
export function renderMarketingBody(model, { files = '/files/' } = {}) {
  const whole = renderMarketing(model, { scripts: false, files });
  const start = whole.indexOf('<body>') + '<body>'.length;
  const end = whole.lastIndexOf('</body>');
  return whole.slice(start, end);
}

/**
 * Accepted or rejected whole. Shallow on purpose — it checks the shape the
 * renderer indexes into and leaves the words alone. What it must never do is
 * let through something that makes the public page throw.
 */
export function validateMarketing(model) {
  if (!model || typeof model !== 'object') return 'Not an object.';
  for (const k of ['head', 'bar', 'footer']) {
    if (!model[k] || typeof model[k] !== 'object') return `${k} is missing.`;
  }
  if (!Array.isArray(model.bar.links)) return 'bar.links must be a list.';
  if (!Array.isArray(model.sections)) return 'sections must be a list.';
  if (model.sections.length === 0) return 'There must be at least one section.';
  const seen = new Set();
  for (const [i, s] of model.sections.entries()) {
    const where = `Section ${i + 1}`;
    if (!s || typeof s !== 'object') return `${where} is not an object.`;
    if (typeof s.id !== 'string' || !s.id.trim()) return `${where} has no id.`;
    if (seen.has(s.id)) return `${where} repeats the id "${s.id}".`;
    seen.add(s.id);
    if (typeof s.type !== 'string' || !s.type) return `${where} has no type.`;
    if (!Array.isArray(s.items)) return `${where} has no items list.`;
    for (const [j, it] of s.items.entries()) {
      if (!it || typeof it !== 'object') return `${where}, item ${j + 1} is not an object.`;
    }
  }
  return null;
}
