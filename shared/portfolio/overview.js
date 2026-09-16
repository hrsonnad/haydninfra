// overview.js — Tab 1. What is held, and nothing about what to do with it.

window.PFOverview = (function () {
  'use strict';
  var C = window.PFCharts, T = window.PFTax;
  var S = null, root = null, quotes = null, rates = null;
  var mode = 'consolidated', open = {}, curveFor = null, showAll = false;
  var SMALL = 0.005;   // under 0.5% of the book
  var sortKey = 'market_value', sortDir = -1;

  var esc = C.esc;
  var money = C.money;
  var money2 = function (n) {
    return (n < 0 ? '-$' : '$') + Math.abs(n)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var acct = function (k) {
    return S.accounts[k].label.replace('Robinhood ', 'RH ').replace('Schwab ', '');
  };

  // Three states, because "tax-free" was wrong on the traditional IRA: free to
  // trade inside, but the whole balance is taxed as ordinary income on exit.
  function classBadge(cls) {
    if (cls === 'roth') return '<span class="badge b-free">tax-free</span>';
    if (cls === 'pretax') return '<span class="badge b-defer">deferred</span>';
    return '<span class="badge b-tax">taxable</span>';
  }
  function badge(p) { return classBadge(p.tax_class); }
  function acctBadge(a) { return classBadge(S.accounts[a].tax_class); }
  // live price when we have one, snapshot price otherwise
  var px = function (p) {
    return (quotes && quotes[p.symbol]) ? quotes[p.symbol] : p.price;
  };
  var mv = function (p) { return p.qty * px(p); };
  var total = function () {
    return S.positions.reduce(function (s, p) { return s + mv(p); }, 0) +
      (S.options || []).reduce(function (s, o) { return s + o.market_value; }, 0);
  };

  function consolidated() {
    var by = {};
    S.positions.forEach(function (p) {
      var e = by[p.symbol] || (by[p.symbol] = {
        symbol: p.symbol, name: p.name, theme: p.theme, qty: 0,
        market_value: 0, cost_basis: 0, basis_known: true, legs: [] });
      e.qty += p.qty; e.market_value += mv(p);
      if (p.cost_basis === null) e.basis_known = false;
      else e.cost_basis += p.cost_basis;
      e.legs.push(p);
    });
    var tot = total();
    return Object.keys(by).map(function (k) {
      var e = by[k];
      e.gain = e.basis_known ? e.market_value - e.cost_basis : null;
      e.pct = e.market_value / tot * 100;
      e.n = e.legs.length;
      return e;
    });
  }

  function rollup(key) {
    var d = {};
    S.positions.forEach(function (p) { d[p[key]] = (d[p[key]] || 0) + mv(p); });
    (S.options || []).forEach(function (o) {
      var k = key === 'theme' ? o.theme : o.account;
      d[k] = (d[k] || 0) + o.market_value;
    });
    return Object.keys(d).map(function (k) { return { label: k, value: d[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  // ---- sections --------------------------------------------------------
  function metrics() {
    var tot = total();
    var known = S.positions.filter(function (p) { return p.cost_basis !== null; });
    var kmv = known.reduce(function (s, p) { return s + mv(p); }, 0);
    var kcb = known.reduce(function (s, p) { return s + p.cost_basis; }, 0);
    var gl = kmv - kcb;

    // Three classes, not two. A traditional IRA is free to REBALANCE but is
    // not tax-free: the whole balance is taxed as ordinary income on the way
    // out, so lumping it in with the Roths overstates what the money is worth.
    var cls = { roth: 0, pretax: 0, taxable: 0 };
    S.positions.forEach(function (p) { cls[p.tax_class || 'taxable'] += mv(p); });
    var ordRate = (rates && rates.ordinary) || 0;
    var deferred = cls.pretax * ordRate;

    // Three headline figures only. The tax split is a breakdown, not a peer of
    // the total, so it reads as one strip rather than four competing metrics.
    var head = [
      ['Total value', money(tot), consolidated().length + ' holdings · ' +
        Object.keys(S.accounts).length + ' accounts', ''],
      ['Unrealised gain', (gl >= 0 ? '+' : '') + money(gl),
        'on ' + money(kmv) + ' with known basis', gl >= 0 ? 'g' : 'r'],
    ];
    if (ordRate) {
      head.push(['Net of deferred tax', money(tot - deferred),
        money(deferred) + ' owed on the traditional IRA', '']);
    }

    var split = [
      ['Tax-free', cls.roth, 'Roth — no tax on trades or withdrawal'],
      ['Tax-deferred', cls.pretax, ordRate
        ? 'ordinary income on withdrawal, ' + (ordRate * 100).toFixed(0) + '%'
        : 'ordinary income on withdrawal'],
      ['Taxable', cls.taxable, 'capital gains on sale'],
    ];
    var maxSplit = Math.max(cls.roth, cls.pretax, cls.taxable) || 1;

    return '<div class="metrics">' + head.map(function (c) {
        return '<div class="metric"><div class="k">' + c[0] + '</div>' +
          '<div class="v ' + c[3] + '">' + c[1] + '</div>' +
          '<div class="n">' + esc(c[2]) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="taxsplit">' + split.map(function (r) {
        return '<div><div class="k">' + r[0] + ' <b>' + money(r[1]) + '</b>' +
          '<span class="faint"> · ' + (r[1] / tot * 100).toFixed(0) + '%</span></div>' +
          '<div class="tsbar"><i style="width:' + (r[1] / maxSplit * 100) +
            '%"></i></div>' +
          '<div class="n">' + esc(r[2]) + '</div></div>';
      }).join('') + '</div>';
  }

  // Long tails make a donut unreadable, so anything past the top slices is
  // folded into one "Other" wedge rather than rendered as slivers.
  function capped(list, n, tot) {
    if (list.length <= n) return list;
    var head = list.slice(0, n);
    var rest = list.slice(n).reduce(function (s, r) { return s + r.value; }, 0);
    if (rest > tot * 0.002) head.push({ label: 'Other', value: rest });
    return head;
  }

  function allocation() {
    var tot = total();
    var byA = rollup('account').map(function (r) {
      return { label: acct(r.label), value: r.value }; });
    var byT = capped(rollup('theme'), 7, tot);
    var top = consolidated().sort(function (a, b) {
      return b.market_value - a.market_value; }).slice(0, 8)
      .map(function (e) { return { label: e.symbol, value: e.market_value,
        note: money(e.market_value) + '  ' + e.pct.toFixed(1) + '%' }; });

    return '<div class="sec"><div class="sec__h"><h2>Allocation</h2></div>' +
      '<div class="grid3">' +
        '<div><div class="chart-cap">By account</div>' +
          C.donut(byA, { centerTop: money(tot), centerSub: 'total' }) +
          C.legend(byA, tot) + '</div>' +
        '<div><div class="chart-cap">By theme, looking through funds</div>' +
          C.donut(byT, { centerTop: String(rollup('theme').length),
                         centerSub: 'themes' }) +
          C.legend(byT, tot) + '</div>' +
        '<div><div class="chart-cap">Largest holdings</div>' +
          C.hbars(top, { width: 430, labelW: 58, valW: 132, mono: true }) +
        '</div>' +
      '</div></div>';
  }

  function curveRow(p) {
    // Explicit null test: a genuine 0% LTCG is falsy and must not fall back.
    var rate = (rates && rates.ltcg != null) ? rates.ltcg : 0.188;
    var pts = T.curve(p, rate, 24);
    var marks = [0.25, 0.5, 0.75].map(function (f) {
      var r = T.sell(p, f, rate);
      return { x: r.shares, y: Math.max(0, r.tax),
               label: (f * 100) + '% → tax ' + money(r.tax) }; });
    var half = T.sell(p, 0.5, rate), all = T.sell(p, 1, rate);
    return '<tr class="detail"><td colspan="9"><div class="curve">' +
      '<h4>Tax cost of trimming ' + esc(p.symbol) + ' in ' + esc(acct(p.account)) +
      '</h4>' +
      '<div class="grid2" style="gap:24px;align-items:center">' +
      '<div>' + C.line(pts, {
        width: 430, height: 170, marks: marks,
        fmtY: function (v) { return '$' + Math.round(v / 100) / 10 + 'k'; },
        fmtX: function (v) { return v.toFixed(0) + 'sh'; } }) + '</div>' +
      '<div style="font-size:13px">' +
        '<div class="faint" style="margin-bottom:8px">Selling highest-cost-basis ' +
          'lots first, at ' + (rate * 100).toFixed(1) + '% long-term federal.</div>' +
        '<table class="t" style="font-size:12.5px"><tbody>' +
        [0.25, 0.5, 1].map(function (f) {
          var r = T.sell(p, f, rate);
          return '<tr><td class="dim">' + (f * 100) + '%</td>' +
            '<td class="num">' + money(r.proceeds) + '</td>' +
            '<td class="num ' + (r.gain >= 0 ? '' : 'pos') + '">' +
              (r.gain >= 0 ? '+' : '') + money(r.gain) + '</td>' +
            '<td class="num">' + money(r.tax) + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        '<div class="faint" style="margin-top:8px">' + p.lots.length +
          ' lots · avg basis $' + p.lots_avg_cps.toFixed(2) + ' · ' +
          p.lots_coverage_pct.toFixed(1) + '% covered</div>' +
      '</div></div></div></td></tr>';
  }

  function holdings() {
    var head = [['symbol', 'Symbol', 0], ['name', 'Name', 0], ['theme', 'Theme', 0],
      ['qty', 'Qty', 1], ['market_value', 'Value', 1], ['pct', 'Weight', 1],
      ['cost_basis', 'Cost basis', 1], ['gain', 'Unrealised', 1],
      ['n', 'Accts', 1]];
    var all = consolidated();
    var tot = total();
    var hidden = showAll ? [] : all.filter(function (e) {
      return e.market_value < tot * SMALL; });
    var rows = (showAll ? all : all.filter(function (e) {
      return e.market_value >= tot * SMALL; })).sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (x === null) x = -Infinity; if (y === null) y = -Infinity;
      if (typeof x === 'string') return sortDir * x.localeCompare(y);
      return sortDir * (x - y);
    });

    var html = '<thead><tr>' + head.map(function (h) {
      return '<th class="s ' + (h[2] ? 'num' : '') + '" data-k="' + h[0] + '">' +
        h[1] + (sortKey === h[0] ? (sortDir < 0 ? ' ↓' : ' ↑') : '') + '</th>';
    }).join('') + '</tr></thead><tbody>';

    rows.forEach(function (e) {
      var isOpen = !!open[e.symbol];
      html += '<tr class="click" data-sym="' + e.symbol + '">' +
        '<td class="sym">' + e.symbol + '</td>' +
        '<td class="dim">' + esc(e.name) + '</td>' +
        '<td class="tag">' + esc(e.theme) + '</td>' +
        '<td class="num dim">' + e.qty.toLocaleString('en-US',
          { maximumFractionDigits: 4 }) + '</td>' +
        '<td class="num">' + money2(e.market_value) + '</td>' +
        '<td class="num dim">' + e.pct.toFixed(2) + '%</td>' +
        '<td class="num dim">' + (e.basis_known ? money2(e.cost_basis) : '—') + '</td>' +
        '<td class="num ' + (e.gain === null ? 'faint' : e.gain >= 0 ? 'pos' : 'neg') +
          '">' + (e.gain === null ? '—' :
            (e.gain >= 0 ? '+' : '') + money2(e.gain)) + '</td>' +
        '<td class="num ' + (e.n > 1 ? '' : 'faint') + '">' + e.n + '</td></tr>';

      if (isOpen) {
        e.legs.slice().sort(function (a, b) { return mv(b) - mv(a); })
          .forEach(function (p) {
            var hasLots = p.tax_model === 'lots' && p.lots;
            html += '<tr class="sub' + (hasLots ? ' click' : '') + '"' +
              (hasLots ? ' data-curve="' + p.account + '|' + p.symbol + '"' : '') +
              '><td>' + esc(acct(p.account)) +
                (hasLots ? ' <span class="faint">· tax curve</span>' : '') + '</td>' +
              '<td>' + badge(p) + '</td>' +
              '<td></td>' +
              '<td class="num">' + p.qty.toLocaleString('en-US',
                { maximumFractionDigits: 6 }) + '</td>' +
              '<td class="num">' + money2(mv(p)) + '</td>' +
              '<td class="num">' + (mv(p) / total() * 100).toFixed(2) + '%</td>' +
              '<td class="num">' + (p.cost_basis === null ? '—' :
                money2(p.cost_basis)) + '</td>' +
              '<td class="num">' + (p.gain === null ? '—' :
                (p.gain >= 0 ? '+' : '') + money2(p.gain)) + '</td>' +
              '<td></td></tr>';
            if (curveFor === p.account + '|' + p.symbol && hasLots) {
              html += curveRow(p);
            }
          });
      }
    });
    html += '</tbody>';
    if (hidden.length) {
      var hv = hidden.reduce(function (s, e) { return s + e.market_value; }, 0);
      html += '<tfoot><tr><td colspan="9" class="dim">' + hidden.length +
        ' holdings under ' + (SMALL * 100).toFixed(1) + '% hidden · ' +
        money(hv) + ' total <button class="btn" id="show-all" ' +
        'style="padding:2px 8px;font-size:12.5px">Show all</button>' +
        '</td></tr></tfoot>';
    } else if (showAll) {
      html += '<tfoot><tr><td colspan="9" class="dim">' +
        '<button class="btn" id="show-less" style="padding:2px 8px;' +
        'font-size:12.5px">Hide small positions</button></td></tr></tfoot>';
    }
    return html;
  }

  function byAccount() {
    var html = '<thead><tr><th>Symbol</th><th>Name</th><th>Tax</th>' +
      '<th class="num">Qty</th><th class="num">Price</th><th class="num">Value</th>' +
      '<th class="num">Weight</th><th class="num">Unrealised</th>' +
      '</tr></thead><tbody>';
    var tot = total();
    Object.keys(S.accounts).forEach(function (a) {
      var rows = S.positions.filter(function (p) { return p.account === a; })
        .sort(function (x, y) { return mv(y) - mv(x); });
      var sub = rows.reduce(function (s, p) { return s + mv(p); }, 0);
      html += '<tr class="sub"><td colspan="5" style="padding-left:12px">' +
        '<b style="color:var(--ink)">' + esc(S.accounts[a].label) + '</b> ' +
        acctBadge(a) +
        '</td><td class="num"><b>' + money(sub) + '</b></td>' +
        '<td class="num">' + (sub / tot * 100).toFixed(1) + '%</td><td></td></tr>';
      rows.forEach(function (p) {
        html += '<tr><td class="sym">' + p.symbol + '</td>' +
          '<td class="dim">' + esc(p.name) + '</td>' +
          '<td>' + badge(p) + '</td>' +
          '<td class="num dim">' + p.qty.toLocaleString('en-US',
            { maximumFractionDigits: 4 }) + '</td>' +
          '<td class="num dim">' + money2(px(p)) + '</td>' +
          '<td class="num">' + money2(mv(p)) + '</td>' +
          '<td class="num dim">' + (mv(p) / tot * 100).toFixed(2) + '%</td>' +
          '<td class="num ' + (p.gain === null ? 'faint' : p.gain >= 0 ? 'pos' : 'neg') +
            '">' + (p.gain === null ? '—' :
              (p.gain >= 0 ? '+' : '') + money2(p.gain)) + '</td></tr>';
      });
    });
    return html + '</tbody>';
  }

  // Grouping by theme is the look-through view: IBIT, ARKB and native BTC all
  // land under Bitcoin because they are the same bet. Expanding a group is
  // what keeps that honest -- you can always see which ticker, in which
  // account, makes up the number.
  function byTheme() {
    var tot = total(), groups = {};
    S.positions.forEach(function (p) {
      (groups[p.theme] = groups[p.theme] || []).push(
        { symbol: p.symbol, account: p.account, qty: p.qty, value: mv(p) });
    });
    (S.options || []).forEach(function (o) {
      (groups[o.theme] = groups[o.theme] || []).push(
        { symbol: o.underlying + ' call', account: o.account, qty: o.contracts,
          value: o.market_value });
    });

    var list = Object.keys(groups).map(function (k) {
      var legs = groups[k].sort(function (a, b) { return b.value - a.value; });
      return { theme: k, legs: legs,
               value: legs.reduce(function (s2, l) { return s2 + l.value; }, 0) };
    }).sort(function (a, b) { return b.value - a.value; });

    var html = '<thead><tr><th>Exposure</th><th>Held as</th>' +
      '<th class="num">Value</th><th class="num">% of book</th>' +
      '<th class="num">Tickers</th></tr></thead><tbody>';

    list.forEach(function (g) {
      var isOpen = !!open['th:' + g.theme];
      var syms = {};
      g.legs.forEach(function (l) { syms[l.symbol] = 1; });
      var names = Object.keys(syms);
      html += '<tr class="click" data-sym="th:' + g.theme + '">' +
        '<td class="sym">' + esc(g.theme) + '</td>' +
        '<td class="dim">' + esc(names.slice(0, 4).join(', ')) +
          (names.length > 4 ? ' +' + (names.length - 4) : '') + '</td>' +
        '<td class="num">' + money2(g.value) + '</td>' +
        '<td class="num dim">' + (g.value / tot * 100).toFixed(2) + '%</td>' +
        '<td class="num ' + (names.length > 1 ? '' : 'faint') + '">' +
          names.length + '</td></tr>';
      if (isOpen) {
        g.legs.forEach(function (l) {
          html += '<tr class="sub"><td>' + esc(l.symbol) + '</td>' +
            '<td>' + esc(acct(l.account)) + '</td>' +
            '<td class="num">' + money2(l.value) + '</td>' +
            '<td class="num">' + (l.value / tot * 100).toFixed(2) + '%</td>' +
            '<td class="num dim">' + l.qty.toLocaleString('en-US',
              { maximumFractionDigits: 6 }) + '</td></tr>';
        });
      }
    });
    return html + '</tbody>';
  }

  // What is actually inside each account. The donuts above show how big each
  // account is; this shows what it is made of, on a shared scale so the two
  // readings agree. A colour is tied to a symbol, not to a position in a list,
  // so the same holding keeps its colour across accounts.
  function accountBreakdown() {
    var ci = {}, n = 0;
    function idx(sym) { if (!(sym in ci)) ci[sym] = n++; return ci[sym]; }

    var groups = Object.keys(S.accounts).map(function (k) {
      var here = S.positions.filter(function (p) { return p.account === k; })
        .map(function (p) { return { label: p.symbol, value: mv(p) }; });
      (S.options || []).forEach(function (o) {
        if (o.account === k) here.push(
          { label: o.underlying + ' call', value: o.market_value }); });

      var tot = here.reduce(function (a, b) { return a + b.value; }, 0);
      here.sort(function (a, b) { return b.value - a.value; });

      // Anything under 3% of its own account becomes one "other" block rather
      // than a row of slivers nobody can read or hover.
      var big = here.filter(function (x) { return x.value >= tot * 0.03; });
      var rest = here.length - big.length;
      var restV = here.slice(big.length)
        .reduce(function (a, b) { return a + b.value; }, 0);
      var segs = big.map(function (x) {
        return { label: x.label, value: x.value, ci: idx(x.label) }; });
      if (restV > 0) segs.push({ label: rest + ' smaller', value: restV,
                                 ci: 0, muted: true });

      return { label: acct(k), tag: TAX_TAG[S.accounts[k].tax_class] || '',
               segs: segs, total: tot };
    }).filter(function (g) { return g.total > 1; })
      .sort(function (a, b) { return b.total - a.total; });

    return '<div class="sec"><div class="sec__h"><h2>Account by account</h2>' +
      '<span class="hint">Bar length is account size · hover any block</span>' +
      '</div>' + C.stackedRows(groups, { width: 880 }) + '</div>';
  }

  var TAX_TAG = { roth: 'tax-free', pretax: 'taxed on withdrawal',
                  taxable: 'taxed on sale' };

  function render() {
    root.innerHTML = metrics() + allocation() + accountBreakdown() +
      '<div class="sec"><div class="sec__h"><h2>Holdings</h2>' +
        '<span class="hint">' + (mode === 'consolidated'
          ? 'Summed across accounts — click a row to see where it sits'
          : mode === 'bytheme'
          ? 'Funds counted as what they track — click to see the tickers and accounts'
          : 'Every position, grouped by account') + '</span>' +
        '<span class="right">' +
          '<button class="chip' + (mode === 'consolidated' ? ' on' : '') +
            '" data-mode="consolidated">Consolidated</button>' +
          '<button class="chip' + (mode === 'bytheme' ? ' on' : '') +
            '" data-mode="bytheme">By exposure</button>' +
          '<button class="chip' + (mode === 'byaccount' ? ' on' : '') +
            '" data-mode="byaccount">By account</button>' +
        '</span></div>' +
      '<div class="scroll"><table class="t" id="hold">' +
        (mode === 'consolidated' ? holdings()
          : mode === 'bytheme' ? byTheme() : byAccount()) +
      '</table></div></div>' +
      '<div id="pf-history"></div>';

    root.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { mode = b.dataset.mode; render(); });
    });
    root.querySelectorAll('#hold th[data-k]').forEach(function (th) {
      th.addEventListener('click', function () {
        if (sortKey === th.dataset.k) sortDir = -sortDir;
        else { sortKey = th.dataset.k; sortDir = -1; }
        render();
      });
    });
    root.querySelectorAll('#hold tr[data-sym]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        open[tr.dataset.sym] = !open[tr.dataset.sym]; render();
      });
    });
    var sa = root.querySelector('#show-all'), sl = root.querySelector('#show-less');
    if (sa) sa.addEventListener('click', function () { showAll = true; render(); });
    if (sl) sl.addEventListener('click', function () { showAll = false; render(); });
    root.querySelectorAll('#hold tr[data-curve]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        e.stopPropagation();
        curveFor = curveFor === tr.dataset.curve ? null : tr.dataset.curve;
        render();
      });
    });
    wireDonuts();
    if (window.PFHistory) window.PFHistory.mount(root.querySelector('#pf-history'));
  }

  // Cross-highlight between a donut arc and its legend row. The page CSP has
  // no 'unsafe-inline', so this has to be addEventListener from a loaded file
  // rather than an on* attribute -- same pattern as the buttons above.
  function wireDonuts() {
    root.querySelectorAll('.grid3 > div').forEach(function (panel) {
      var svg = panel.querySelector('svg');
      var legend = panel.querySelector('.legend');
      if (!svg || !legend) return;
      var arcs = svg.querySelectorAll('[data-i]');
      var legs = legend.querySelectorAll('[data-i]');
      function focus(i) {
        arcs.forEach(function (a) {
          a.classList.toggle('dim', i !== null && a.dataset.i !== String(i)); });
        legs.forEach(function (l) {
          l.classList.toggle('on', i !== null && l.dataset.i === String(i)); });
      }
      function bind(el) {
        el.addEventListener('mouseenter', function () { focus(el.dataset.i); });
      }
      arcs.forEach(bind); legs.forEach(bind);
      panel.addEventListener('mouseleave', function () { focus(null); });
    });
  }

  function setQuotes(q) { quotes = q; if (root) render(); }
  function setRates(r) { rates = r; if (root) render(); }
  function mount(el, snapshot) { root = el; S = snapshot; render(); }
  return { mount: mount, setQuotes: setQuotes, setRates: setRates,
           total: total };
})();
