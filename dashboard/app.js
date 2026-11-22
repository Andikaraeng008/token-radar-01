/* Token Launch Radar, model radar-3. Renders window.RADAR: sortable,
   filterable board, live-token view, and a detail dialog per protocol with
   the model's full equation, the revenue cross-check and the farm plan. */
(function () {
  var D = window.RADAR;
  if (!D) { document.getElementById('lede').textContent = 'No radar data (data.js missing).'; return; }

  var rowsEl = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('cat');
  var chainEl = document.getElementById('chain');
  var viewEl = document.getElementById('view');
  var dlg = document.getElementById('detail');
  var dlgBody = document.getElementById('detail-body');
  var sortKey = 'rank', sortDir = 1;

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  document.getElementById('lede').textContent =
    D.board_size + ' pre-token protocols ranked by what a launch would be worth, from a snapshot of ' +
    D.as_of + ' (floor $' + (D.floor_usd / 1e6) + 'M, watchlist ' + D.watchlist_size + '). Top: ' +
    D.rows[0].name + ' at ' + money(D.rows[0].implied_value_usd) + '.';
  document.getElementById('model-note').textContent =
    'Revenue data: ' + D.revenue_source + ', as of ' + D.revenue_as_of + '. ' +
    D.rows.filter(function (r) { return r.ann_rev_usd !== null; }).length +
    ' of ' + D.board_size + ' rows record revenue; the rest carry a neutral 1.00 revenue quality.';

  var cats = {}, chains = {};
  D.rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    (r.chains || []).forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) { catEl.add(new Option(c, c)); });
  Object.keys(chains).sort().forEach(function (c) { chainEl.add(new Option(c, c)); });

  function filtered() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catEl.value, ch = chainEl.value;
    var list = (viewEl.value === 'live' ? D.live : D.rows).filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (ch && !(r.chains || []).indexOf(ch) >= 0) return false;
      if (q && (r.name + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    list.sort(function (a, b) {
      var av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });
    return list;
  }

  function render() {
    var list = filtered();
    var live = viewEl.value === 'live';
    rowsEl.innerHTML = list.map(function (r) {
      var rev = r.ann_rev_usd !== undefined ? r.ann_rev_usd : null;
      var rpt = r.rev_per_tvl !== undefined && r.rev_per_tvl !== null ? (r.rev_per_tvl * 100).toFixed(2) + '%' : '—';
      var imp = live ? (r.mcap_usd !== null && r.mcap_usd !== undefined ? money(r.mcap_usd) : '—') : money(r.implied_value_usd);
      var rq = (!live && r.revenue_quality !== undefined)
        ? '<span class="sub">rev quality ' + r.revenue_quality.toFixed(2) + '×</span>' : '';
      var audit = (!live && r.audit_count !== undefined)
        ? (r.audit_count > 0
          ? '<span class="pill">' + r.audit_count + ' audit' + (r.audit_count > 1 ? 's' : '') + '</span>'
          : '<span class="pill none">no audit listed</span>') : '';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + (live ? '—' : r.rank) + '</td>' +
        '<td><b>' + esc(r.name) + '</b>' + rq + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (live ? '—' : money(rev)) + '</td>' +
        '<td class="num">' + (live ? '—' : rpt) + '</td>' +
        '<td class="num"><b>' + imp + '</b> ' + audit + '</td></tr>';
    }).join('');
    countEl.textContent = list.length + ' of ' + (live ? D.live_size : D.board_size) +
      (live ? ' live-token protocols (market value, never ranked)' : ' ranked pre-token protocols');
  }

  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
      render();
    });
  });
  [qEl, catEl, chainEl, viewEl].forEach(function (el) { el.addEventListener('input', render); });
  rowsEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });

  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function farmSteps(r) {
    var cap = capitalFor(r.tvl_usd);
    var hold = r.age_days === null ? 30 : r.age_days < 180 ? 60 : r.age_days < 365 ? 45 : 30;
    var chain = (r.chains && r.chains[0]) || 'its main chain';
    var c = (r.category || '').toLowerCase(), act;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) act = 'Lend $' + cap + ' of USDC on ' + r.name + ' (' + chain + ') and leave the deposit working.';
    else if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) act = 'Add $' + cap + ' of liquidity to ' + r.name + '\u2019s main pool on ' + chain + ' and leave it in place.';
    else if (c.indexOf('bridge') >= 0) act = 'Move $' + cap + ' of USDC to ' + chain + ' through ' + r.name + ', then put the bridged funds to work in its app.';
    else if (c.indexOf('stak') >= 0) act = 'Stake $' + cap + ' of the chain\u2019s staking asset via ' + r.name + ' and hold the receipt token.';
    else if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) act = 'Post $' + cap + ' of USDC as margin on ' + r.name + ' and open a single small hedged position.';
    else if (c.indexOf('prediction') >= 0) act = 'Fund an account with $' + cap + ' and take one position in a ' + r.name + ' market.';
    else if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) act = 'Deposit $' + cap + ' into a ' + r.name + ' vault on ' + chain + ' and hold the shares.';
    else if (c.indexOf('stable') >= 0) act = 'Mint or deposit $' + cap + ' of the stable asset through ' + r.name + ' on ' + chain + '.';
    else if (c.indexOf('rwa') >= 0) act = 'Mint $' + cap + ' of the protocol\u2019s yield-bearing asset on ' + chain + ' and hold it.';
    else if (c.indexOf('insurance') >= 0) act = 'Buy $' + cap + ' of cover from ' + r.name + ' on ' + chain + ' and keep the policy active.';
    else act = 'Deposit $' + cap + ' of USDC into ' + r.name + ' on ' + chain + ' and leave the position open.';
    return [
      ['Start with a fresh wallet that holds only the funds you mean to farm, and keep its seed phrase offline.', 'under $3 of gas', '5 minutes'],
      [act, '$' + cap + ' of capital, about $' + (cap >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'],
      ['Do one qualifying action every week, like a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Keep the position open for at least ' + hold + ' days so it is counted in more than one snapshot.', 'the $' + cap + ' stays in the position', hold + ' days'],
      ['Before withdrawing, open the protocol\u2019s own points or rewards page and claim only through the link it publishes.', 'free to check, never pay to claim', '10 minutes'],
      ['Log the wallet, the dates and every transaction, so you can repeat the position or unwind it cleanly.', 'nothing but the log', '5 minutes'],
    ];
  }

  function openDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var rev = r.ann_rev_usd, rq = r.revenue_quality;
    var cross = r.revenue_anchored_usd !== null && r.revenue_anchored_usd !== undefined
      ? money(r.revenue_anchored_usd) + ' at the category P/S of ' + r.category_ps.toFixed(1) + '×'
      : 'no revenue recorded, so no cross-check';
    var auditNote = r.audit_count > 0
      ? r.audit_count + ' audit' + (r.audit_count > 1 ? 's' : '') + ' listed by DefiLlama.'
      : 'No audit listed by DefiLlama. That is a missing record, not proof of no audit &mdash; check the protocol\u2019s own docs before farming.';
    dlgBody.innerHTML =
      '<h2>#' + r.rank + ' &mdash; ' + esc(r.name) + '</h2>' +
      '<p class="meta">' + esc(r.category || 'Uncategorized') + ' &middot; ' + esc((r.chains || []).join(', ') || 'no chain listed') +
      ' &middot; tracked ' + (r.age_days !== null ? r.age_days + ' days' : 'for an unknown time') + ' with no token</p>' +
      '<div class="eq">' + money(r.tvl_usd) + ' TVL &times; cat. multiple &times; growth &times; maturity &times; ' +
      '<span class="hl">revenue quality ' + rq.toFixed(2) + '×</span> = <span class="hl">' + money(r.implied_value_usd) + '</span></div>' +
      '<dl class="kv">' +
      '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day TVL change</dt><dd>' + (r.change_7d !== null ? (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%' : 'not reported') + '</dd></div>' +
      '<div><dt>Annualized revenue</dt><dd>' + money(rev) + ' <span class="sub">30d + 90d windows to 14 Nov 2026</span></dd></div>' +
      '<div><dt>Revenue / TVL</dt><dd>' + (r.rev_per_tvl !== null ? (r.rev_per_tvl * 100).toFixed(2) + '%' : 'no revenue recorded') + '</dd></div>' +
      '<div><dt>Revenue-anchored value</dt><dd>' + cross + '</dd></div>' +
      '<div><dt>Implied value</dt><dd><b>' + money(r.implied_value_usd) + '</b></dd></div>' +
      '</dl>' +
      '<p class="warn">' + auditNote + '</p>' +
      '<h3>How to farm it</h3><ol>' +
      farmSteps(r).map(function (s) {
        return '<li>' + esc(s[0]) + ' <span class="cost">Cost: ' + esc(s[1]) + '. Time: ' + esc(s[2]) + '.</span></li>';
      }).join('') + '</ol>';
    dlg.showModal();
  }

  /* Deep links: #detail=<slug> opens a protocol, #cat=<category> filters
     the board, so a row can be shared and screenshotted as a real URL. */
  (function deepLink() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    var cat = p.get('cat');
    if (cat) {
      var opt = Array.prototype.filter.call(catEl.options, function (o) { return o.value === cat; })[0];
      if (opt) catEl.value = cat;
    }
    var slug = p.get('detail');
    if (slug) {
      render();
      openDetail(slug);
      return;
    }
  })();

  render();
})();
