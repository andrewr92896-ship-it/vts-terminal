'use strict';

(function () {
  var initialTrades = [
    { id: 1, date: '2026-08-26', symbol: 'EUR/USD', market: 'FX', side: 'Short', setup: 'Range rejection', result: 186, outcome: 'positive', entry: '1.1664', exit: '1.1631', quantity: '2 lots', tags: ['range', 'patient'], note: 'Waited for the second rejection before recording the entry context. Closed after price returned to the lower range.' },
    { id: 2, date: '2026-08-25', symbol: 'ES', market: 'Index futures', side: 'Long', setup: 'Opening range', result: 312, outcome: 'positive', entry: '6,458.25', exit: '6,464.50', quantity: '1 contract', tags: ['open', 'plan'], note: 'The journal plan called for a clean reclaim. Recorded the close when pace slowed near the next reference area.' },
    { id: 3, date: '2026-08-23', symbol: 'AAPL', market: 'Equity', side: 'Long', setup: 'Pullback continuation', result: -94, outcome: 'negative', entry: '227.14', exit: '226.20', quantity: '100 shares', tags: ['pullback', 'review'], note: 'Entry context was less clear than the written plan. Review note flags the early decision for process discussion.' },
    { id: 4, date: '2026-08-21', symbol: 'CL', market: 'Energy futures', side: 'Short', setup: 'Failed breakout', result: 0, outcome: 'flat', entry: '74.82', exit: '74.82', quantity: '1 contract', tags: ['breakout', 'flat'], note: 'Closed at the recorded entry level after the expected follow-through did not appear.' },
    { id: 5, date: '2026-08-19', symbol: 'GBP/USD', market: 'FX', side: 'Long', setup: 'Session reversal', result: -128, outcome: 'negative', entry: '1.3518', exit: '1.3499', quantity: '1 lot', tags: ['session', 'review'], note: 'The fictional record shows a clean invalidation and a concise post-close process note.' },
    { id: 6, date: '2026-08-16', symbol: 'MSFT', market: 'Equity', side: 'Short', setup: 'Gap fade', result: 142, outcome: 'positive', entry: '514.10', exit: '512.68', quantity: '100 shares', tags: ['gap', 'context'], note: 'Recorded after the gap stopped extending and the close matched the scenario captured in the journal.' },
    { id: 7, date: '2026-08-14', symbol: 'GC', market: 'Metals futures', side: 'Long', setup: 'Prior-day reclaim', result: 220, outcome: 'positive', entry: '3,381.2', exit: '3,383.4', quantity: '1 contract', tags: ['reclaim', 'levels'], note: 'Prior-day context was documented before the fictional close and compared during review.' },
    { id: 8, date: '2026-08-11', symbol: 'NVDA', market: 'Equity', side: 'Long', setup: 'Base breakout', result: -76, outcome: 'negative', entry: '182.40', exit: '181.64', quantity: '100 shares', tags: ['base', 'process'], note: 'Review note focuses on whether the base was sufficiently developed before the record was created.' }
  ];

  var state = {
    view: 'dashboard',
    masked: false,
    trades: initialTrades.map(function (trade) { return Object.assign({}, trade, { tags: trade.tags.slice() }); }),
    selectedId: null,
    extracted: false,
    photoAdded: false,
    feedback: []
  };

  var titles = { dashboard: 'Dashboard', journal: 'Journal', photo: 'Photo to log', help: 'Help & feedback' };
  var pageTitle = document.getElementById('page-title');
  var mobileMenu = document.getElementById('mobile-menu');
  var mobileNavigation = document.getElementById('mobile-navigation');

  function setView(view, moveFocus) {
    if (!titles[view]) return;
    state.view = view;
    document.querySelectorAll('[data-view-panel]').forEach(function (panel) {
      var active = panel.getAttribute('data-view-panel') === view;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    document.querySelectorAll('[data-view]').forEach(function (button) {
      var active = button.getAttribute('data-view') === view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    pageTitle.textContent = titles[view];
    mobileNavigation.hidden = true;
    mobileMenu.setAttribute('aria-expanded', 'false');
    if (view === 'journal') renderJournal();
    if (moveFocus) {
      var heading = document.querySelector('#view-' + view + ' h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }
  }

  document.querySelectorAll('[data-view]').forEach(function (button) {
    button.addEventListener('click', function () { setView(button.getAttribute('data-view'), true); });
  });
  document.querySelectorAll('[data-go]').forEach(function (button) {
    button.addEventListener('click', function () { setView(button.getAttribute('data-go'), true); });
  });
  mobileMenu.addEventListener('click', function () {
    var opening = mobileNavigation.hidden;
    mobileNavigation.hidden = !opening;
    mobileMenu.setAttribute('aria-expanded', String(opening));
  });

  var privacyToggle = document.getElementById('privacy-toggle');
  var privacyLabel = document.getElementById('privacy-label');

  function moneyText(value) {
    if (state.masked) return '••••••';
    var prefix = value > 0 ? '+' : value < 0 ? '−' : '';
    return prefix + '$' + Math.abs(value).toLocaleString('en-US');
  }

  function applyPrivacy() {
    document.querySelectorAll('[data-amount]').forEach(function (node) {
      node.textContent = state.masked ? '••••••' : node.getAttribute('data-amount');
      node.classList.toggle('is-masked', state.masked);
    });
    privacyToggle.setAttribute('aria-pressed', String(state.masked));
    privacyLabel.textContent = state.masked ? 'Show amounts' : 'Hide amounts';
    if (state.view === 'journal') renderJournal();
  }

  privacyToggle.addEventListener('click', function () {
    state.masked = !state.masked;
    applyPrivacy();
  });

  var journalBody = document.getElementById('journal-body');
  var journalSearch = document.getElementById('journal-search');
  var journalFilter = document.getElementById('journal-filter');
  var journalSort = document.getElementById('journal-sort');
  var journalCount = document.getElementById('journal-count');
  var journalEmpty = document.getElementById('journal-empty');
  var tradeDetail = document.getElementById('trade-detail');

  function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date + 'T12:00:00'));
  }

  function visibleTrades() {
    var query = journalSearch.value.trim().toLowerCase();
    var outcome = journalFilter.value;
    var trades = state.trades.filter(function (trade) {
      var haystack = [trade.symbol, trade.market, trade.setup, trade.side].concat(trade.tags).join(' ').toLowerCase();
      return (!query || haystack.indexOf(query) !== -1) && (outcome === 'all' || trade.outcome === outcome);
    });
    trades.sort(function (a, b) {
      if (journalSort.value === 'oldest') return a.date.localeCompare(b.date);
      if (journalSort.value === 'symbol') return a.symbol.localeCompare(b.symbol);
      return b.date.localeCompare(a.date);
    });
    return trades;
  }

  function renderJournal() {
    var trades = visibleTrades();
    journalBody.textContent = '';
    trades.forEach(function (trade) {
      var row = document.createElement('tr');
      if (state.selectedId === trade.id) row.className = 'is-selected';
      var result = state.masked ? '••••' : moneyText(trade.result);
      row.innerHTML =
        '<td><time datetime="' + trade.date + '">' + formatDate(trade.date) + '</time></td>' +
        '<td class="instrument-cell"><strong>' + escapeText(trade.symbol) + '</strong><span>' + escapeText(trade.market) + '</span></td>' +
        '<td><span class="side-pill">' + escapeText(trade.side) + '</span></td>' +
        '<td>' + escapeText(trade.setup) + '</td>' +
        '<td><span class="result-pill ' + trade.outcome + '">' + result + '</span></td>' +
        '<td><button class="row-button" type="button" aria-label="View ' + escapeText(trade.symbol) + ' fictional closed trade details" data-trade-id="' + trade.id + '">→</button></td>';
      journalBody.appendChild(row);
    });
    journalCount.textContent = trades.length + (trades.length === 1 ? ' record' : ' records');
    journalEmpty.hidden = trades.length !== 0;
    document.querySelectorAll('[data-trade-id]').forEach(function (button) {
      button.addEventListener('click', function () { selectTrade(Number(button.getAttribute('data-trade-id'))); });
    });
    document.getElementById('dashboard-trade-count').textContent = String(state.trades.length);
    if (state.selectedId !== null) renderDetail();
  }

  function selectTrade(id) {
    state.selectedId = id;
    renderJournal();
    renderDetail();
    if (window.innerWidth < 1051) tradeDetail.focus({ preventScroll: true });
  }

  function renderDetail() {
    var trade = state.trades.find(function (item) { return item.id === state.selectedId; });
    if (!trade) return;
    tradeDetail.setAttribute('tabindex', '-1');
    var result = state.masked ? '••••' : moneyText(trade.result);
    tradeDetail.innerHTML =
      '<span class="surface-label">Fictional demonstration data</span>' +
      '<div class="detail-head"><div><strong class="detail-symbol">' + escapeText(trade.symbol) + '</strong><div class="detail-meta">' + escapeText(trade.side) + ' · ' + escapeText(trade.market) + '</div></div>' +
      '<div class="detail-result"><strong class="result-pill ' + trade.outcome + '">' + result + '</strong><span>Recorded result</span></div></div>' +
      '<div class="detail-grid"><div><span>Closed</span><strong>' + formatDate(trade.date) + ', 2026</strong></div><div><span>Quantity</span><strong>' + escapeText(trade.quantity) + '</strong></div>' +
      '<div><span>Entry</span><strong>' + escapeText(trade.entry) + '</strong></div><div><span>Exit</span><strong>' + escapeText(trade.exit) + '</strong></div>' +
      '<div><span>Setup</span><strong>' + escapeText(trade.setup) + '</strong></div><div><span>Record</span><strong>Closed only</strong></div></div>' +
      '<div class="detail-note"><span>Review note</span><p>' + escapeText(trade.note) + '</p></div>' +
      '<div class="tags">' + trade.tags.map(function (tag) { return '<span class="tag">' + escapeText(tag) + '</span>'; }).join('') + '</div>';
  }

  [journalSearch, journalFilter, journalSort].forEach(function (control) {
    control.addEventListener(control === journalSearch ? 'input' : 'change', renderJournal);
  });

  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  var draftDefaults = { symbol: 'NQ', side: 'Long', date: '2026-08-26', quantity: '1', entry: '19862', exit: '19901', setup: 'Opening range reclaim', note: 'Waited for price to reclaim the opening range, then recorded the close after momentum slowed.' };
  var extractButton = document.getElementById('extract-button');
  var confirmDraft = document.getElementById('confirm-draft');
  var draftState = document.getElementById('draft-state');
  var draftMessage = document.getElementById('draft-message');
  var draftForm = document.getElementById('draft-form');

  function resetDraft() {
    Object.keys(draftDefaults).forEach(function (key) {
      document.getElementById('draft-' + key).value = draftDefaults[key];
    });
    state.extracted = false;
    state.photoAdded = false;
    confirmDraft.disabled = true;
    extractButton.disabled = false;
    extractButton.textContent = 'Run simulated demo extraction';
    draftState.textContent = 'Ready to preview';
    draftMessage.hidden = true;
  }

  extractButton.addEventListener('click', function () {
    state.extracted = true;
    confirmDraft.disabled = false;
    extractButton.disabled = true;
    extractButton.textContent = 'Demo extraction complete';
    draftState.textContent = 'Review fields';
    draftMessage.textContent = 'Simulated extraction complete. Adjust any field, then confirm the fictional closed record to this session’s demo journal.';
    draftMessage.hidden = false;
    document.getElementById('draft-symbol').focus();
  });

  document.getElementById('reset-draft').addEventListener('click', resetDraft);

  draftForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!state.extracted || state.photoAdded || !draftForm.reportValidity()) return;
    var entry = Number(document.getElementById('draft-entry').value);
    var exit = Number(document.getElementById('draft-exit').value);
    var quantity = Number(document.getElementById('draft-quantity').value);
    var side = document.getElementById('draft-side').value;
    var direction = side === 'Long' ? 1 : -1;
    var calculated = Math.round((exit - entry) * direction * quantity * 5);
    var outcome = calculated > 0 ? 'positive' : calculated < 0 ? 'negative' : 'flat';
    var trade = {
      id: Math.max.apply(null, state.trades.map(function (item) { return item.id; })) + 1,
      date: document.getElementById('draft-date').value,
      symbol: document.getElementById('draft-symbol').value.trim().toUpperCase(),
      market: 'Demo futures',
      side: side,
      setup: document.getElementById('draft-setup').value.trim(),
      result: calculated,
      outcome: outcome,
      entry: entry.toLocaleString('en-US'),
      exit: exit.toLocaleString('en-US'),
      quantity: quantity + (quantity === 1 ? ' contract' : ' contracts'),
      tags: ['photo preview', 'memory only'],
      note: document.getElementById('draft-note').value.trim()
    };
    state.trades.unshift(trade);
    state.photoAdded = true;
    confirmDraft.disabled = true;
    draftState.textContent = 'Added in memory';
    draftMessage.textContent = 'Added to the fictional demo journal in memory only. Reloading or leaving this page removes it.';
    draftMessage.hidden = false;
    renderJournal();
  });

  var feedbackForm = document.getElementById('feedback-form');
  var feedbackMessage = document.getElementById('feedback-message');
  var feedbackCount = document.getElementById('feedback-count');
  var savedFeedbackCount = document.getElementById('saved-feedback-count');
  var feedbackStatus = document.getElementById('feedback-status');

  feedbackMessage.addEventListener('input', function () {
    feedbackCount.textContent = feedbackMessage.value.length + ' / 400';
  });

  feedbackForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!feedbackForm.reportValidity()) return;
    state.feedback.push({ type: document.getElementById('feedback-type').value, message: feedbackMessage.value });
    savedFeedbackCount.textContent = state.feedback.length + (state.feedback.length === 1 ? ' saved this session' : ' saved this session');
    feedbackStatus.textContent = 'Demo feedback saved in memory only. Nothing was submitted or persisted.';
    feedbackStatus.hidden = false;
    feedbackForm.reset();
    feedbackCount.textContent = '0 / 400';
    feedbackMessage.focus();
  });

  renderJournal();
  applyPrivacy();
})();
