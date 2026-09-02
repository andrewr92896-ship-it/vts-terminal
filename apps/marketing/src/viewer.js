// The file viewer — only linked when a link on the page is set to "preview".
//
// A résumé or a deck that downloads on click sends a reader off to a file
// manager; shown in place, with the download arrow one press away, they stay
// on the page. No dependencies, and the href is still on the link, so with
// scripts off the file simply opens.
(function () {
  'use strict';
  function open(href, label) {
    var overlay = document.createElement('div');
    overlay.className = 'viewer';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', label || 'File');
    var isImage = /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(href);
    var isPdf = /\.pdf(\?|#|$)/i.test(href);
    var body = isImage
      ? '<img src="' + href + '" alt="">'
      : isPdf
        ? '<iframe src="' + href + '" title="' + (label || 'File') + '"></iframe>'
        : '<p class="viewer-note">This file cannot be shown here.</p>';
    overlay.innerHTML =
      '<div class="viewer-box">' +
      '<div class="viewer-bar"><span>' +
      (label || '') +
      '</span><span>' +
      '<a class="viewer-dl" href="' + href + '" download title="Download" aria-label="Download">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>' +
      '</a><button type="button" class="viewer-close" aria-label="Close">×</button></span></div>' +
      '<div class="viewer-body">' + body + '</div></div>';
    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.closest('.viewer-close')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-preview]');
    if (!a) return;
    e.preventDefault();
    open(a.getAttribute('href'), a.textContent.trim());
  });
})();
