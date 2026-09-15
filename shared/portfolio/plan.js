// plan.js — Tab 3. What the recorded plan does to the portfolio, and how to
// actually carry it out.
//
// The before/after here is arithmetic on the entries recorded in tab 2 — it
// applies them, it does not invent or optimise them. The execution ordering is
// operational sequencing (which venue, which order type, what to do first),
// not a view on what to own.

window.PFPlan = (function () {
  'use strict';
  var C = window.PFCharts;
  var S = null, plan = null, rows = [], resolve = null, root = null;
  var esc = function (s) { return C.esc(s || ''); };
  var money = function (n) {
    return (n < 0 ? '-$' : '$') +
      Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };
  var acctShort = function (k) {
    return S.accounts[k].label.replace('Robinhood ', 'RH ').replace('Schwab ', '');
  };

  // ---- apply the plan --------------------------------------------------
  function applied() {
    var delta = {};           // "account|symbol" -> usd change
    var sell = 0, buy = 0;
    rows.forEach(function (e) {
      if (e.action === 'hold') return;
      var r = resolve(e);
      if (r.usd === null) return;
      var k = e.account + '|' + e.symbol;
      var d = e.action === 'sell' ? -r.usd : r.usd;
      delta[k] = (delta[k] || 0) + d;
      if (e.action === 'sell') sell += r.usd; else buy += r.usd;
    });

    var after = S.positions.map(function (p) {
      var d = delta[p.account + '|' + p.symbol] || 0;
      return Object.assign({}, p, {
        market_value: Math.max(0, p.market_value + d), _delta: d });
    });
    // cash raised but not redeployed sits as cash
    var net = sell - buy;
    return { after: after, sell: sell, buy: buy, net: net };
  }

  function weights(list, extraCash) {
    var by = {};
    list.forEach(function (p) { by[p.symbol] = (by[p.symbol] || 0) + p.market_value; });
    (S.options || []).forEach(function (o) {
      by[o.underlying] = (by[o.underlying] || 0) + o.market_value; });
    if (extraCash) by['(cash)'] = (by['(cash)'] || 0) + extraCash;
    var tot = Object.values(by).reduce(function (a, b) { return a + b; }, 0) || 1;
    return { by: by, total: tot };
  }

  function themeWeights(list, extraCash) {
    var by = {};
    list.forEach(function (p) { by[p.theme] = (by[p.theme] || 0) + p.market_value; });
    (S.options || []).forEach(function (o) {
      by[o.theme] = (by[o.theme] || 0) + o.market_value; });
    if (extraCash) by['Cash'] = (by['Cash'] || 0) + extraCash;
    var tot = Object.values(by).reduce(function (a, b) { return a + b; }, 0) || 1;
    return { by: by, total: tot };
  }

  // ---- render ----------------------------------------------------------
  function banner() {
    if (plan.status === 'draft') {
      return '<div class="pf-panel pf-pad" style="border-left:3px solid var(--warn);' +
        'margin-bottom:14px"><b class="neg">This plan is still a draft.</b> ' +
        '<span class="dim">Everything below reflects the entries recorded so far ' +
        'and will move as they change. Lock the plan on tab 2 when it is settled.' +
        '</span></div>';
    }
    return '<div class="pf-panel pf-pad" style="border-left:3px solid var(--accent);' +
      'margin-bottom:14px"><b class="pos">Plan locked</b> ' +
      '<span class="dim">' + esc(plan.name) +
      (plan.locked_at ? ' · ' + new Date(plan.locked_at).toLocaleString() : '') +
      '</span>' + (plan.summary ? '<div style="margin-top:6px;font-size:12.5px" ' +
        'class="dim">' + esc(plan.summary) + '</div>' : '') + '</div>';
  }

  function stats(a) {
    var wB = weights(S.positions, 0), wA = weights(a.after, a.net);
    var top = function (w) {
      return Object.values(w.by).sort(function (x, y) { return y - x; }); };
    var tb = top(wB), ta = top(wA);
    var hhi = function (w) {
      return Object.values(w.by).reduce(function (s, v) {
        return s + Math.pow(v / w.total * 100, 2); }, 0); };
    var lgB = Object.entries(wB.by).sort(function (x, y) { return y[1] - x[1]; })[0];
    var lgA = Object.entries(wA.by).sort(function (x, y) { return y[1] - x[1]; })[0];

    var cells = [
      ['Sell side', money(a.sell), rows.filter(function (e) {
        return e.action === 'sell'; }).length + ' entries'],
      ['Buy side', a.buy ? money(a.buy) : '—', rows.filter(function (e) {
        return e.action === 'buy'; }).length + ' entries'],
      ['Net to cash', money(a.net), a.net > 0 ? 'undeployed' : 'fully redeployed'],
      ['Largest holding', (lgA[1] / wA.total * 100).toFixed(1) + '%',
        lgA[0] + ' · was ' + (lgB[1] / wB.total * 100).toFixed(1) + '% (' + lgB[0] + ')'],
      ['Top 3', (ta.slice(0, 3).reduce(function (x, y) { return x + y; }, 0) /
        wA.total * 100).toFixed(1) + '%',
        'was ' + (tb.slice(0, 3).reduce(function (x, y) { return x + y; }, 0) /
        wB.total * 100).toFixed(1) + '%'],
      ['HHI', hhi(wA).toFixed(0), 'was ' + hhi(wB).toFixed(0)],
    ];
    return '<div class="pf-stats">' + cells.map(function (c) {
      return '<div><div class="k">' + c[0] + '</div><div class="v">' + c[1] +
        '</div><div class="n">' + esc(c[2]) + '</div></div>'; }).join('') + '</div>';
  }

  function comparison(a) {
    var wB = weights(S.positions, 0), wA = weights(a.after, a.net);
    var syms = Object.keys(wB.by).concat(Object.keys(wA.by))
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
      .map(function (s) {
        return { label: s,
                 before: (wB.by[s] || 0) / wB.total * 100,
                 after: (wA.by[s] || 0) / wA.total * 100 }; })
      .filter(function (x) { return x.before > 0.4 || x.after > 0.4; })
      .sort(function (x, y) { return y.before - x.before; })
      .slice(0, 12);

    var tB = themeWeights(S.positions, 0), tA = themeWeights(a.after, a.net);
    var themes = Object.keys(tB.by).concat(Object.keys(tA.by))
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
      .map(function (t) {
        return { label: t,
                 before: (tB.by[t] || 0) / tB.total * 100,
                 after: (tA.by[t] || 0) / tA.total * 100 }; })
      .filter(function (x) { return x.before > 0.4 || x.after > 0.4; })
      .sort(function (x, y) { return y.before - x.before; })
      .slice(0, 12);

    return '<div class="pf-grid2">' +
      '<div><h2 class="pf-h">Position weights</h2><div class="pf-panel pf-pad">' +
        C.beforeAfter(syms, { width: 520 }) +
        '<div class="pf-legend" style="padding:6px 0 0"><div>' +
        '<span class="sw" style="background:currentColor;opacity:.28"></span>' +
        'before</div><div><span class="sw" style="background:#3d6b96"></span>' +
        'after</div></div></div></div>' +
      '<div><h2 class="pf-h">Theme exposure</h2><div class="pf-panel pf-pad">' +
        C.beforeAfter(themes, { width: 520 }) + '</div></div>' +
      '</div>';
  }

  function accountTable(a) {
    var rowsOut = Object.keys(S.accounts).map(function (k) {
      var b = S.positions.filter(function (p) { return p.account === k; })
        .reduce(function (s, p) { return s + p.market_value; }, 0);
      var af = a.after.filter(function (p) { return p.account === k; })
        .reduce(function (s, p) { return s + p.market_value; }, 0);
      return { k: k, before: b, after: af };
    });
    return '<h2 class="pf-h">Account values</h2><div class="pf-panel pf-scroll">' +
      '<table class="pf-t"><thead><tr><th>Account</th><th>Tax</th>' +
      '<th class="num">Before</th><th class="num">After</th>' +
      '<th class="num">Change</th></tr></thead><tbody>' +
      rowsOut.map(function (r) {
        var d = r.after - r.before;
        return '<tr><td>' + esc(S.accounts[r.k].label) + '</td>' +
          '<td>' + (S.accounts[r.k].trades_taxable
            ? '<span class="badge b-tax">taxable</span>'
            : '<span class="badge b-free">tax-free</span>') + '</td>' +
          '<td class="num dim">' + money(r.before) + '</td>' +
          '<td class="num">' + money(r.after) + '</td>' +
          '<td class="num ' + (Math.abs(d) < 1 ? 'faint' : d < 0 ? 'neg' : 'pos') +
            '">' + (Math.abs(d) < 1 ? '—' : (d > 0 ? '+' : '') + money(d)) +
            '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ---- execution sequence ---------------------------------------------
  // Ordering rule: tax-free accounts first (nothing to optimise, no lot
  // picking, no tax consequence), then loss sales in taxable accounts so the
  // losses are banked in the same tax year as the gains, then gain sales with
  // explicit lot selection, then buys once cash has settled.
  function sequence() {
    var buckets = [
      { key: 'free',    title: 'Tax-free accounts — sell here first',
        why: 'No tax consequence and no lot selection needed, so nothing here ' +
             'has to be sequenced around anything else.',
        test: function (e, p) { return e.action === 'sell' && p && !p.trades_taxable; } },
      { key: 'loss',    title: 'Taxable — loss sales',
        why: 'Realise losses in the same tax year as the gains they offset. ' +
             'Crypto has no wash-sale rule, so those lots can be repurchased ' +
             'immediately; equities need a 30-day gap.',
        test: function (e, p) { return e.action === 'sell' && p && p.trades_taxable &&
                                       p.gain !== null && p.gain < 0; } },
      { key: 'gain',    title: 'Taxable — gain sales, with lot selection',
        why: 'Pick lots explicitly. Left alone both brokers default to FIFO, ' +
             'which sells your oldest and usually lowest-basis shares first.',
        test: function (e, p) { return e.action === 'sell' && p && p.trades_taxable; } },
      { key: 'buy',     title: 'Redeploy',
        why: 'After proceeds settle. Retirement accounts settle immediately for ' +
             'reinvestment; taxable proceeds may take a day.',
        test: function (e) { return e.action === 'buy'; } },
    ];

    var used = {};
    var out = buckets.map(function (b) {
      var mine = rows.filter(function (e) {
        if (used[e.id]) return false;
        var p = S.positions.find(function (x) {
          return x.account === e.account && x.symbol === e.symbol; });
        if (b.test(e, p)) { used[e.id] = true; return true; }
        return false;
      });
      if (!mine.length) return '';
      var items = mine.map(function (e) {
        var r = resolve(e);
        var p = r.pos;
        var flags = [];
        if (p && p.trades_taxable && p.tax_model === 'lots')
          flags.push('use the lot picker — highest cost basis first');
        if (e.symbol === 'BTC')
          flags.push('enter a <b>coin-denominated</b> amount; a dollar order ' +
                     'silently falls back to FIFO');
        if (p && p.broker === 'Robinhood' && p.trades_taxable &&
            p.asset_class !== 'crypto')
          flags.push('lot selection is app-only, not on web');
        if (p && p.broker === 'Schwab' && p.trades_taxable)
          flags.push('elect specific-ID at or before the sale');
        if (p && p.asset_class === 'private_alt')
          flags.push('thin book — use a limit order');
        return '<li><b>' + (e.action === 'sell' ? 'Sell' : 'Buy') + ' ' +
          (r.shares !== null ? r.shares.toLocaleString('en-US',
            { maximumFractionDigits: 4 }) + ' ' : '') + esc(e.symbol) + '</b>' +
          ' in ' + esc(acctShort(e.account)) +
          (r.usd !== null ? ' <span class="dim">≈ ' + money(r.usd) + '</span>' : '') +
          (e.note ? '<div class="sub">' + esc(e.note) + '</div>' : '') +
          (flags.length ? '<div class="sub">→ ' + flags.join(' · ') + '</div>' : '') +
          '</li>';
      }).join('');
      return '<h2 class="pf-h">' + esc(b.title) + '</h2>' +
        '<div class="faint" style="font-size:11.5px;margin-bottom:8px">' +
          b.why + '</div>' +
        '<div class="pf-panel"><ol class="steps">' + items + '</ol></div>';
    }).join('');

    return out || '<div class="pf-panel"><div class="empty">' +
      'No sell or buy entries recorded yet.</div></div>';
  }

  function practices() {
    var tips = [
      ['Never send a market order on a thin name.', 'SPCX and the small ETF ' +
        'positions can move several percent on a single order. Use a limit at ' +
        'or just inside the spread and let it work.'],
      ['Avoid the first and last fifteen minutes.', 'Spreads are widest at the ' +
        'open and the close. Mid-session fills are usually materially better.'],
      ['Break large orders up.', 'A position worth more than a few percent of ' +
        'the book is worth splitting across a session, or across days.'],
      ['Check the lot picker on every taxable sale.', 'Both brokers default to ' +
        'FIFO. On Robinhood equities the picker is app-only; on Robinhood crypto ' +
        'it works only on coin-denominated orders; on Schwab you elect specific ' +
        'ID at or before the trade.'],
      ['Mind the 30-day wash-sale window on equities.', 'Selling a stock at a ' +
        'loss and rebuying it — or a substantially identical security — within ' +
        '30 days either side disallows the loss. Crypto is not currently subject ' +
        'to this, which is why crypto losses are the cleaner harvest.'],
      ['Realise offsetting gains and losses in the same tax year.', 'A loss ' +
        'harvested in December against a gain taken in January does nothing for ' +
        'the earlier year.'],
      ['Let taxable proceeds settle before redeploying.', 'Retirement accounts ' +
        'reinvest immediately; taxable proceeds can take a day. Do not plan a ' +
        'same-day sell-and-buy chain in the brokerage account.'],
      ['Screenshot the confirmation for every taxable trade.', 'Lot selection ' +
        'does not always survive onto the 1099 cleanly. A contemporaneous record ' +
        'is what you will want at filing.'],
      ['Reconcile the snapshot afterwards.', 'Once the trades are done, take a ' +
        'fresh set of positions and reload it. This plan is priced against ' +
        esc(S.as_of) + ' and drifts from the moment you start.'],
    ];
    return '<h2 class="pf-h">Execution notes</h2><div class="pf-panel">' +
      '<ul class="tips">' + tips.map(function (t) {
        return '<li><b>' + t[0] + '</b> ' + t[1] + '</li>'; }).join('') +
      '</ul></div>' +
      '<div class="pf-panel pf-pad" style="margin-top:10px;font-size:12px" ' +
        'class="dim"><span class="faint">Tax figures anywhere in this workspace ' +
        'are federal long-term only and exclude state tax. This is a planning ' +
        'record, not tax or investment advice — worth a CPA conversation before ' +
        'executing anything of size.</span></div>';
  }

  function render() {
    if (!rows.length) {
      root.innerHTML = banner() + '<div class="pf-panel"><div class="empty">' +
        'Nothing recorded yet. Add entries on the <b>Rebalance workspace</b> tab ' +
        'and this view fills in.</div></div>' + practices();
      return;
    }
    var a = applied();
    root.innerHTML = banner() + stats(a) +
      '<h2 class="pf-h">Before &rarr; after</h2>' + comparison(a) +
      accountTable(a) +
      '<h2 class="pf-h" style="margin-top:30px">Execution sequence</h2>' +
      '<div class="faint" style="font-size:11.5px;margin-bottom:10px">' +
        'Ordered so nothing blocks anything else: free trades first, losses ' +
        'banked before gains, redeployment last.</div>' +
      sequence() + practices();
  }

  function mount(el, snapshot, planRow, entryRows, resolver) {
    root = el; S = snapshot; plan = planRow; rows = entryRows; resolve = resolver;
    render();
  }
  return { mount: mount };
})();
