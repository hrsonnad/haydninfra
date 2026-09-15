// plan.js — Tab 3. What the recorded scenario does, and how to carry it out.
// Arithmetic on the decisions from tab 2 — it applies them, it does not invent
// them. Ordering is operational sequencing, not a view on what to own.

window.PFPlan = (function () {
  'use strict';
  var C = window.PFCharts, T = window.PFTax;
  var S, plan, rows = [], tgts = [], cons = [], resolve, rate = 0.188,
      useHarvest = true, quotes = null, root;

  var esc = C.esc, money = C.money;
  var acct = function (k) {
    return S.accounts[k].label.replace('Robinhood ', 'RH ').replace('Schwab ', ''); };
  var px = function (p) { return (quotes && quotes[p.symbol]) || p.price; };

  function applied() {
    var delta = {}, added = [], sell = 0, buy = 0, trims = [];
    rows.forEach(function (e) {
      if (e.action === 'hold') return;
      var r = resolve(e);
      if (r.usd === null) return;
      if (!r.pos) {
        // a buy into something not held becomes a new line in the after-state
        if (e.action !== 'buy') return;
        var a = S.accounts[e.account] || {};
        added.push({
          account: e.account, symbol: e.symbol,
          name: e.symbol + ' (new)', theme: e.theme || 'Unassigned',
          asset_class: 'us_equity', tax_class: a.tax_class || 'taxable',
          trades_taxable: !!a.trades_taxable, broker: a.broker,
          tax_model: a.trades_taxable ? 'unknown' : 'free',
          qty: r.shares || 0, price: r.shares ? r.usd / r.shares : 0,
          cost_basis: r.usd, gain: 0, market_value: r.usd, _new: true,
        });
        buy += r.usd;
        return;
      }
      var k = e.account + '|' + e.symbol;
      delta[k] = (delta[k] || 0) + (e.action === 'sell' ? -r.usd : r.usd);
      if (e.action === 'sell') { sell += r.usd;
        trims.push({ position: r.pos, frac: Math.min(1, r.frac) }); }
      else buy += r.usd;
    });
    var after = S.positions.map(function (p) {
      var d = delta[p.account + '|' + p.symbol] || 0;
      return Object.assign({}, p, {
        market_value: Math.max(0, p.qty * px(p) + d) });
    }).concat(added);
    var t = T.scenario(S, trims, rate, useHarvest);
    return { after: after, sell: sell, buy: buy, cash: sell - buy, tax: t,
             added: added };
  }

  function weights(list, cash, key) {
    var by = {};
    list.forEach(function (p) {
      var k = key ? p[key] : p.symbol;
      by[k] = (by[k] || 0) + p.market_value; });
    (S.options || []).forEach(function (o) {
      var k = key === 'theme' ? o.theme : o.underlying;
      by[k] = (by[k] || 0) + o.market_value; });
    if (cash > 0) by[key ? 'Cash' : '(cash)'] = (by[key ? 'Cash' : '(cash)'] || 0) + cash;
    var tot = Object.keys(by).reduce(function (s, k) { return s + by[k]; }, 0) || 1;
    return { by: by, total: tot };
  }

  function banner() {
    if (plan.status === 'draft') {
      return '<div class="row" style="margin-bottom:22px;color:var(--ink-2);' +
        'font-size:13px"><span class="badge b-draft">draft</span>' +
        '<span>' + esc(plan.name) + ' — tracking live as you edit tab 2.</span>' +
        '</div>';
    }
    return '<div class="row" style="margin-bottom:22px;color:var(--ink-2);' +
      'font-size:13px"><span class="badge b-locked">locked</span>' +
      '<span>' + esc(plan.name) +
      (plan.locked_at ? ' · ' + new Date(plan.locked_at).toLocaleDateString() : '') +
      '</span></div>';
  }

  function metrics(a) {
    var base = S.positions.map(function (p) {
      return Object.assign({}, p, { market_value: p.qty * px(p) }); });
    var wB = weights(base, 0), wA = weights(a.after, a.cash);
    var cB = T.concentration(wB.by), cA = T.concentration(wA.by);
    var lgA = Object.keys(wA.by).filter(function (k) {
      return k !== '(cash)' && k !== 'Cash'; })
      .sort(function (x, y) { return wA.by[y] - wA.by[x]; })[0];

    var cells = [
      ['Proceeds', money(a.sell), a.buy ? money(a.buy) + ' redeployed' : 'not redeployed', ''],
      ['Tax', money(a.tax.tax), a.tax.offset ? money(a.tax.offset) + ' harvest applied'
        : (rate * 100).toFixed(1) + '% federal', a.tax.tax ? 'r' : ''],
      ['Net cash', money(a.cash - a.tax.tax), 'after tax', ''],
      ['Largest holding', (wA.by[lgA] / wA.total * 100).toFixed(1) + '%',
        lgA + ' · was ' + cB.top1.toFixed(1) + '%',
        (wA.by[lgA] / wA.total * 100) > 25 ? 'r' : 'g'],
      ['Undeployed cash', money(a.cash),
        (a.cash / wA.total * 100).toFixed(1) + '% of the book', 
        (a.cash / wA.total * 100) > 10 ? 'r' : ''],
      ['Top 3', cA.top3.toFixed(1) + '%', 'was ' + cB.top3.toFixed(1) + '%', ''],
      ['HHI', cA.hhi.toFixed(0), 'was ' + cB.hhi.toFixed(0), ''],
    ];
    return '<div class="metrics" style="padding-bottom:12px">' +
      cells.map(function (c) {
        return '<div class="metric"><div class="k">' + c[0] + '</div>' +
          '<div class="v sm ' + c[3] + '">' + c[1] + '</div>' +
          '<div class="n">' + esc(c[2]) + '</div></div>';
      }).join('') +
      (a.tax.nUnknown ? '<div class="metric"><div class="k">Unpriced</div>' +
        '<div class="v sm r">' + a.tax.nUnknown + '</div>' +
        '<div class="n">position(s) with no basis — real tax is higher</div></div>'
        : '') + '</div>';
  }

  function comparison(a) {
    var base = S.positions.map(function (p) {
      return Object.assign({}, p, { market_value: p.qty * px(p) }); });
    var tmap = {};
    tgts.forEach(function (t) {
      if (t.target_pct !== null) tmap[t.kind + '|' + t.key] = t.target_pct; });

    function build(key) {
      var wB = weights(base, 0, key), wA = weights(a.after, a.cash, key);
      var rowsOf = Object.keys(wB.by).concat(Object.keys(wA.by))
        .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
        .map(function (k) {
          return { label: k,
                   before: (wB.by[k] || 0) / wB.total * 100,
                   after: (wA.by[k] || 0) / wA.total * 100,
                   target: tmap[(key || 'symbol') + '|' + k] };
        })
        .filter(function (x) { return x.before > 0.4 || x.after > 0.4; });

      var moved = rowsOf.filter(function (x) {
        return Math.abs(x.after - x.before) >= 0.1; })
        .sort(function (x, y) {
          return Math.abs(y.after - y.before) - Math.abs(x.after - x.before); });
      var still = rowsOf.filter(function (x) {
        return Math.abs(x.after - x.before) < 0.1; })
        .sort(function (x, y) { return y.before - x.before; });
      // What the plan changes, then enough of the unchanged book for context.
      return moved.concat(still.slice(0, Math.max(0, 9 - moved.length)));
    }

    return '<div class="grid2">' +
      '<div><div class="faint" style="font-size:12.5px;margin-bottom:12px">' +
        'Positions that move, grey now / blue after / dashed target</div>' +
        C.beforeAfter(build(null), { width: 480 }) + '</div>' +
      '<div><div class="faint" style="font-size:12.5px;margin-bottom:12px">' +
        'Themes, looking through funds</div>' +
        C.beforeAfter(build('theme'), { width: 480 }) + '</div>' +
      '</div>';
  }

  function sequence() {
    var buckets = [
      ['Tax-free accounts', 'Nothing to optimise and no tax, so these come first.',
        function (e, p) { return e.action === 'sell' && p && !p.trades_taxable; }],
      ['Taxable — losses', 'Bank losses in the same tax year as the gains they ' +
        'offset. Crypto can be repurchased immediately; equities need 30 days.',
        function (e, p) { return e.action === 'sell' && p && p.trades_taxable &&
          p.gain !== null && p.gain < 0; }],
      ['Taxable — gains', 'Pick lots explicitly; both brokers default to FIFO.',
        function (e, p) { return e.action === 'sell' && p && p.trades_taxable; }],
      ['Redeploy', 'After proceeds settle.',
        function (e) { return e.action === 'buy'; }],
    ];
    var used = {};
    var out = buckets.map(function (b) {
      var mine = rows.filter(function (e) {
        if (used[e.id]) return false;
        var p = S.positions.find(function (x) {
          return x.account === e.account && x.symbol === e.symbol; });
        if (b[2](e, p)) { used[e.id] = true; return true; }
        return false;
      });
      if (!mine.length) return '';
      return '<div class="sec"><div class="sec__h"><h2>' + esc(b[0]) + '</h2>' +
        '<span class="hint">' + b[1] + '</span></div><ol class="steps">' +
        mine.map(function (e) {
          var r = resolve(e), p = r.pos, f = [];
          var tx = e.action === 'sell' && p ? T.sell(p, Math.min(1, r.frac), rate) : null;
          if (p && p.trades_taxable && p.tax_model === 'lots')
            f.push('lot picker, highest basis first');
          if (e.symbol === 'BTC') f.push('coin-denominated order, not dollars');
          if (p && p.broker === 'Robinhood' && p.trades_taxable &&
              p.asset_class !== 'crypto') f.push('app only, not web');
          if (p && p.broker === 'Schwab' && p.trades_taxable)
            f.push('elect specific-ID at or before the sale');
          if (p && p.asset_class === 'private_alt') f.push('thin — use a limit order');
          if (!p && e.action === 'buy') f.push('new position');
          if (!p && r.usd === null) f.push('no price — set one on tab 2');
          return '<li><b>' + (e.action === 'sell' ? 'Sell' : 'Buy') + ' ' +
            (r.shares ? r.shares.toLocaleString('en-US',
              { maximumFractionDigits: 4 }) + ' ' : '') + esc(e.symbol) + '</b> in ' +
            esc(acct(e.account)) +
            (r.usd !== null ? ' <span class="faint">≈ ' + money(r.usd) +
              (tx && tx.known && tx.tax ? ', tax ' + money(tx.tax) : '') +
              '</span>' : '') +
            (e.note ? '<div class="sub">' + esc(e.note) + '</div>' : '') +
            (f.length ? '<div class="sub">' + f.join(' · ') + '</div>' : '') +
            '</li>';
        }).join('') + '</ol></div>';
    }).join('');
    return out;
  }

  function tips() {
    var t = [
      ['Limit orders on thin names', 'SPCX and the small ETFs move on a single order.'],
      ['Avoid the first and last 15 minutes', 'Spreads are widest at the open and close.'],
      ['Split large orders', 'Anything over a few percent of the book, across a session.'],
      ['Check the lot picker every time', 'Both brokers default to FIFO.'],
      ['30-day wash-sale window on equities', 'Crypto is exempt — the cleaner harvest.'],
      ['Match gains and losses in one tax year', 'A December loss does nothing for January.'],
      ['Let taxable proceeds settle', 'IRAs reinvest immediately; brokerage can take a day.'],
      ['Screenshot every taxable confirmation', 'Lot selection does not always survive to the 1099.'],
      ['Reload a fresh snapshot afterwards', 'This is priced against ' + esc(S.as_of) + '.'],
    ];
    return '<div class="sec"><div class="sec__h"><h2>Execution notes</h2></div>' +
      '<ul class="tips">' + t.map(function (x) {
        return '<li><b>' + x[0] + '</b>' + x[1] + '</li>'; }).join('') + '</ul>' +
      '<div class="faint" style="font-size:12px;margin-top:18px">Federal ' +
      'long-term rates only; state tax not modelled. A planning record, not ' +
      'tax or investment advice.</div></div>';
  }

  function render() {
    if (!rows.length) {
      root.innerHTML = banner() + '<div class="empty">Nothing recorded yet — ' +
        'add decisions on the workspace tab.</div>' + tips();
      return;
    }
    var a = applied();
    root.innerHTML = banner() + metrics(a) +
      '<div class="sec"><div class="sec__h"><h2>Before and after</h2></div>' +
      comparison(a) + '</div>' + sequence() + tips();
  }

  function mount(el, snap, st) {
    root = el; S = snap; plan = st.plan; rows = st.rows; tgts = st.targets;
    cons = st.constraints; resolve = st.resolve; rate = st.rate;
    useHarvest = st.useHarvest; quotes = st.quotes;
    render();
  }
  return { mount: mount };
})();
