// The image slideshow — one slide in the frame at a time, moved by the arrows,
// the keys, a swipe, or a thumbnail. Linked only when the page carries one.
//
// It runs in two places: on the site as `<script type="module">`, where it
// mounts itself once the document is parsed, and inside the portal's preview,
// which imports `mountSlideshows` and calls it after every re-render. Same
// file, so the two cannot behave differently. No dependencies, no autoplay.
//
// With scripts off the first slide shows and the rest stay hidden: the markup
// is a list of figures with every one but the first `hidden`, so nothing here
// is needed for the page to be readable — only to move.

const SWIPE_PX = 40;

function mountOne(root) {
  if (root.dataset.mounted) return;
  root.dataset.mounted = '1';
  const slides = Array.from(root.querySelectorAll('.slide'));
  const count = slides.length;
  if (count === 0) return;
  const stage = root.querySelector('.stage');
  const text = root.querySelector('.slide-text');
  const counter = root.querySelector('.counter');
  const thumbs = Array.from(root.querySelectorAll('.thumbs button'));
  let index = Math.max(0, slides.findIndex((s) => !s.hidden));

  function show(to) {
    index = ((to % count) + count) % count;
    slides.forEach((s, i) => {
      s.hidden = i !== index;
    });
    const cur = slides[index];
    if (text) {
      const title = cur.dataset.title || '';
      const caption = cur.dataset.caption || '';
      text.innerHTML = '';
      if (title) {
        const b = document.createElement('strong');
        b.textContent = title;
        text.appendChild(b);
      }
      if (caption) {
        const c = document.createElement('span');
        c.textContent = caption;
        text.appendChild(c);
      }
    }
    if (counter) counter.textContent = index + 1 + ' / ' + count;
    thumbs.forEach((b, i) => {
      if (i === index) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  root.querySelectorAll('.nav.prev').forEach((b) => b.addEventListener('click', () => show(index - 1)));
  root.querySelectorAll('.nav.next').forEach((b) => b.addEventListener('click', () => show(index + 1)));
  thumbs.forEach((b, i) => b.addEventListener('click', () => show(i)));

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(count - 1);
    else return;
    e.preventDefault();
  });

  // A swipe ends on the same link a tap does, so the click that follows it
  // would open the image on every swipe. `swiped` marks that click as spent
  // and clears itself a tick later, so a release with no click cannot leave
  // the next tap spent.
  if (stage) {
    let start = null;
    let swiped = false;
    stage.addEventListener('pointerdown', (e) => {
      swiped = false;
      start = { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener('pointerup', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
      swiped = true;
      setTimeout(() => {
        swiped = false;
      }, 0);
      show(dx < 0 ? index + 1 : index - 1);
    });
    stage.addEventListener('pointercancel', () => {
      start = null;
    });
    stage.addEventListener(
      'click',
      (e) => {
        if (!swiped) return;
        swiped = false;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  }

  show(index);
}

/** Wire every slideshow under `root`. Safe to call again after a re-render. */
export function mountSlideshows(root = document) {
  root.querySelectorAll('.slideshow').forEach(mountOne);
}

// On the site the page is parsed before a module script runs, so this is the
// mount. The preview imports the function and calls it itself.
if (typeof document !== 'undefined' && !document.currentScript?.dataset?.manual) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountSlideshows());
  else mountSlideshows();
}
