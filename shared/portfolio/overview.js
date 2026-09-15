// overview.js — Tab 1. A plain statement of what is held, nothing more.
// Deliberately non-prescriptive: no concentration scoring, no targets, no
// suggestions. Those belong on tabs 2 and 3.

window.PFOverview = (function () {
  'use strict';
  var C = window.PFCharts;
  var S = null, root = null;
  var mode = 'consolidated';          // consolidated | byaccount
  var expanded = {};                  // symbol -> bool
  var sortKey = 'market_value', sortDir = -1;

  var money = function (n) {
    return (n < 0 ? '-$' : '$') +
      Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };
  var money2 = function (n) {
    return (n < 0 ? '-$' : '$') +
      Math.abs(n).toLocaleString('en-US',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var esc = function (s) { return C.esc(s); };
  var acctShort = function (k) {
    return S.accounts[k].label.replace('Robinhood ', 'RH ')
                              .replace('Schwab ', '');
  };

  // ---- derived views ---------------------------------------------------
  function consolidated() {
    var by = {};
    S.positions.forEach(function (p) {
      var e = by[p.symbol] || (by[p.symbol] = {
        symbol: p.symbol, name: p.name, theme: p.theme,
        asset_class: p.asset_class, qty: 0, price: p.price,
        market_value: 0, cost_basis: 0, basis_known: true, legs: []
      });
      e.qty += p.qty;
      e.market_value += p.market_value;
      if (p.cost_basis === null) e.basis_known = false;
      else e.cost_basis += p.cost_basis;
      e.legs.push(p);
    });
    return Object.values(by).map(function (e) {
      e.gain = e.basis_known ? e.market_value - e.cost_basis : null;
      e.pct = e.market_value / S.total_value * 100;
      e.n = e.legs.length;
      return e;
    });
  }

  function rollup(key) {
    var d = {};
    S.positions.forEach(function (p) { d[p[key]] = (d[p[key]] || 0) + p.market_value; });
    (S.options || []).forEach(function (o) {
      var k = key === 'theme' ? o.theme : (key === 'account' ? o.account : 'options');
      d[k] = (d[k] || 0) + o.market_value;
    });
    return Object.entries(d).map(function (e) { return { label: e[0], value: e[1] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  // ---- render ----------------------------------------------------------
  function stats() {
    var cons = consolidated();
    var known = S.positions.filter(function (p) { return p.cost_basis !== null; });
    var kmv = known.reduce(function (s, p) { return s + p.market_value; }, 0);
    var kcb = known.reduce(function (s, p) { return s + p.cost_basis; }, 0);
    var cells = [
      ['Total value', money(S.total_value), S.as_of],
      ['Accounts', String(Object.keys(S.accounts).length), 'across 2 brokers'],
      ['Positions', String(S.positions.length +
        ((S.options || []).length)), 'incl. options'],
      ['Unique holdings', String(cons.length), 'distinct symbols'],
      ['Unrealised G/L', (kcb ? (kmv - kcb >= 0 ? '+' : '') + money(kmv - kcb) : '—'),
        kcb ? 'on ' + money(kmv) + ' with basis' : 'basis unknown'],
    ];
    return '<div class="pf-stats">' + cells.map(function (c) {
      return '<div><div class="k">' + c[0] + '</div><div class="v">' + c[1] +
        '</div><div class="n">' + esc(c[2]) + '</div></div>';
    }).join('') + '</div>';
  }

  function charts() {
    var byAcct = rollup('account').map(function (r) {
      return { label: acctShort(r.label), value: r.value }; });
    var byClass = rollup('asset_class').map(function (r) {
      return { label: r.label.replace(/_/g, ' '), value: r.value }; });
    var top = consolidated().sort(function (a, b) {
      return b.market_value - a.market_value; }).slice(0, 10)
      .map(function (e) {
        return { label: e.symbol, value: e.market_value,
                 note: e.pct.toFixed(1) + '%' };
      });

    return '<div class="pf-grid3">' +
      '<div class="pf-panel"><div class="pf-pad"><h2 class="pf-h" ' +
        'style="margin:0 0 6px">By account</h2></div>' +
        C.donut(byAcct, { centerTop: money(S.total_value), centerSub: 'total' }) +
        C.legend(byAcct, S.total_value) + '</div>' +
      '<div class="pf-panel"><div class="pf-pad"><h2 class="pf-h" ' +
        'style="margin:0 0 6px">By asset class</h2></div>' +
        C.donut(byClass, { centerTop: byClass.length + '', centerSub: 'classes' }) +
        C.legend(byClass, S.total_value) + '</div>' +
      '<div class="pf-panel"><div class="pf-pad"><h2 class="pf-h" ' +
        'style="margin:0 0 10px">Ten largest holdings</h2>' +
        C.hbars(top, { width: 430, mono: false }) + '</div></div>' +
      '</div>';
  }

  function tableConsolidated() {
    var rows = consolidated().sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (x === null) x = -Infinity; if (y === null) y = -Infinity;
      if (typeof x === 'string') return sortDir * x.localeCompare(y);
      return sortDir * (x - y);
    });
    var head = [['symbol', 'Symbol', 0], ['name', 'Name', 0], ['theme', 'Theme', 0],
      ['qty', 'Qty', 1], ['market_value', 'Value', 1], ['pct', 'Weight', 1],
      ['cost_basis', 'Cost basis', 1], ['gain', 'Unreal. G/L', 1],
      ['n', 'Accounts', 1]];

    var html = '<thead><tr>' + head.map(function (h) {
      return '<th class="s ' + (h[2] ? 'num' : '') + '" data-k="' + h[0] + '">' +
        h[1] + (sortKey === h[0] ? (sortDir < 0 ? ' ▾' : ' ▴') : '') + '</th>';
    }).join('') + '</tr></thead><tbody>';

    rows.forEach(function (e) {
      var open = !!expanded[e.symbol];
      html += '<tr data-sym="' + e.symbol + '"' +
        (e.n > 1 ? ' style="cursor:pointer"' : '') + '>' +
        '<td class="sym">' + (e.n > 1 ? (open ? '▾ ' : '▸ ') : '') + e.symbol + '</td>' +
        '<td class="dim">' + esc(e.name) + '</td>' +
        '<td><span class="tag">' + esc(e.theme) + '</span></td>' +
        '<td class="num dim">' + e.qty.toLocaleString('en-US',
          { maximumFractionDigits: 4 }) + '</td>' +
        '<td class="num">' + money2(e.market_value) + '</td>' +
        '<td class="num dim">' + e.pct.toFixed(2) + '%</td>' +
        '<td class="num dim">' + (e.basis_known ? money2(e.cost_basis) :
          '<span class="faint">—</span>') + '</td>' +
        '<td class="num ' + (e.gain === null ? 'faint' : e.gain >= 0 ? 'pos' : 'neg') +
          '">' + (e.gain === null ? '—' : (e.gain >= 0 ? '+' : '') + money2(e.gain)) +
          '</td>' +
        '<td class="num ' + (e.n > 1 ? '' : 'faint') + '">' + e.n + '</td></tr>';

      if (open) {
        e.legs.sort(function (a, b) { return b.market_value - a.market_value; })
          .forEach(function (p) {
            html += '<tr class="pf-sub"><td>' + esc(acctShort(p.account)) + '</td>' +
              '<td>' + (p.trades_taxable
                ? '<span class="badge b-tax">taxable</span>'
                : '<span class="badge b-free">tax-free</span>') + '</td>' +
              '<td></td>' +
              '<td class="num">' + p.qty.toLocaleString('en-US',
                { maximumFractionDigits: 6 }) + '</td>' +
              '<td class="num">' + money2(p.market_value) + '</td>' +
              '<td class="num">' + p.pct_of_total.toFixed(2) + '%</td>' +
              '<td class="num">' + (p.cost_basis === null ? '—' : money2(p.cost_basis)) + '</td>' +
              '<td class="num">' + (p.gain === null ? '—' :
                (p.gain >= 0 ? '+' : '') + money2(p.gain)) + '</td>' +
              '<td></td></tr>';
          });
      }
    });

    var tv = rows.reduce(function (s, e) { return s + e.market_value; }, 0);
    html += '</tbody><tfoot><tr><td colspan="4" class="dim">' + rows.length +
      ' holdings</td><td class="num">' + money(tv) +
      '</td><td colspan="4"></td></tr></tfoot>';
    return html;
  }

  function tableByAccount() {
    var html = '<thead><tr><th>Symbol</th><th>Name</th><th>Account</th>' +
      '<th>Tax</th><th class="num">Qty</th><th class="num">Price</th>' +
      '<th class="num">Value</th><th class="num">Weight</th>' +
      '<th class="num">Unreal. G/L</th></tr></thead><tbody>';
    Object.keys(S.accounts).forEach(function (a) {
      var rows = S.positions.filter(function (p) { return p.account === a; })
        .sort(function (x, y) { return y.market_value - x.market_value; });
      var sub = rows.reduce(function (s, p) { return s + p.market_value; }, 0);
      html += '<tr class="pf-sub"><td colspan="6"><b>' +
        esc(S.accounts[a].label) + '</b> ' +
        (S.accounts[a].trades_taxable
          ? '<span class="badge b-tax">taxable</span>'
          : '<span class="badge b-free">tax-free</span>') +
        '</td><td class="num"><b>' + money(sub) + '</b></td><td colspan="2"></td></tr>';
      rows.forEach(function (p) {
        html += '<tr><td class="sym">' + p.symbol + '</td>' +
          '<td class="dim">' + esc(p.name) + '</td>' +
          '<td class="dim" style="font-size:11px">' + esc(acctShort(p.account)) + '</td>' +
          '<td>' + (p.trades_taxable ? '<span class="badge b-tax">tax</span>'
                                     : '<span class="badge b-free">free</span>') + '</td>' +
          '<td class="num dim">' + p.qty.toLocaleString('en-US',
            { maximumFractionDigits: 4 }) + '</td>' +
          '<td class="num dim">' + money2(p.price) + '</td>' +
          '<td class="num">' + money2(p.market_value) + '</td>' +
          '<td class="num dim">' + p.pct_of_total.toFixed(2) + '%</td>' +
          '<td class="num ' + (p.gain === null ? 'faint' : p.gain >= 0 ? 'pos' : 'neg') +
            '">' + (p.gain === null ? '—' :
              (p.gain >= 0 ? '+' : '') + money2(p.gain)) + '</td></tr>';
      });
    });
    return html + '</tbody>';
  }

  function render() {
    root.innerHTML =
      stats() +
      '<h2 class="pf-h">Allocation</h2>' + charts() +
      '<h2 class="pf-h">Holdings</h2>' +
      '<div class="pf-row" style="margin-bottom:8px">' +
        '<button class="chip' + (mode === 'consolidated' ? ' on' : '') +
          '" data-mode="consolidated">Consolidated</button>' +
        '<button class="chip' + (mode === 'byaccount' ? ' on' : '') +
          '" data-mode="byaccount">By account</button>' +
        '<span class="faint" style="font-size:11.5px">' +
          (mode === 'consolidated'
            ? 'Positions held in more than one account are summed — click a row to expand.'
            : 'Every position, grouped by the account that holds it.') +
        '</span></div>' +
      '<div class="pf-panel pf-scroll"><table class="pf-t" id="pf-hold">' +
        (mode === 'consolidated' ? tableConsolidated() : tableByAccount()) +
      '</table></div>';

    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { mode = b.dataset.mode; render(); });
    });
    if (mode === 'consolidated') {
      root.querySelectorAll('#pf-hold th[data-k]').forEach(function (th) {
        th.addEventListener('click', function () {
          if (sortKey === th.dataset.k) sortDir = -sortDir;
          else { sortKey = th.dataset.k; sortDir = -1; }
          render();
        });
      });
      root.querySelectorAll('#pf-hold tbody tr[data-sym]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          var s = tr.dataset.sym;
          expanded[s] = !expanded[s];
          render();
        });
      });
    }
  }

  function mount(el, snapshot) { root = el; S = snapshot; render(); }
  return { mount: mount };
})();
