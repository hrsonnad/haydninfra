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


  // ---- account structure + money flow ---------------------------------
  var ACCT_COLOR = { rh_individual: '#8ab4f8', rh_crypto: '#c58af9',
                     schwab_trad_inh: '#fdd663', schwab_roth_inh: '#81c995',
                     rh_roth: '#78d9ec' };

  function accountStructure(a) {
    var base = S.positions.map(function (p) {
      return Object.assign({}, p, { market_value: p.qty * px(p) }); });
    var ci = {}, n = 0;
    function idx(sym) { if (!(sym in ci)) ci[sym] = n++; return ci[sym]; }

    var groups = Object.keys(S.accounts).map(function (k) {
      function pack(list) {
        return list.filter(function (p) { return p.account === k &&
            p.market_value > 1; })
          .sort(function (x, y) { return y.market_value - x.market_value; })
          .map(function (p) { return { label: p.symbol, value: p.market_value,
                                       ci: idx(p.symbol) }; });
      }
      var b = pack(base), af = pack(a.after);
      var cashHere = k === 'rh_individual' ? a.cash : 0;
      if (cashHere > 1) af.push({ label: 'cash', value: cashHere, ci: idx('cash') });
      return { label: S.accounts[k].label.replace(' (from Inherited)', ' (inh)')
                 .replace(' (Inherited)', ' (inh)').replace(' (Brokerage)', ''),
               tag: S.accounts[k].tax_class,
               before: b, after: af,
               beforeTotal: b.reduce(function (s, x) { return s + x.value; }, 0),
               afterTotal: af.reduce(function (s, x) { return s + x.value; }, 0) };
    }).filter(function (g) { return g.beforeTotal > 1 || g.afterTotal > 1; });

    return '<div class="sec"><div class="sec__h"><h2>Account structure</h2>' +
      '<span class="hint">Each account before and after, same scale</span></div>' +
      C.stackedCompare(groups, { width: 880 }) + '</div>';
  }

  function moneyFlow(a) {
    var nodes = [], links = [], seen = {};
    function node(id, label, col, color, sub) {
      if (seen[id]) return id;
      seen[id] = 1;
      nodes.push({ id: id, label: label, col: col, color: color, sub: sub || null });
      return id;
    }
    // Middle column: the account. Everything has to pass through it, which is
    // the point — proceeds cannot cross from one tax bucket into another.
    var ownSells = {}, xferIn = {}, xferOut = {};
    rows.forEach(function (e) {
      if (e.action !== 'sell') return;
      var r = resolve(e);
      if (r.usd > 0) ownSells[e.account] = (ownSells[e.account] || 0) + r.usd;
    });
    // crypto proceeds move into the brokerage: the one legitimate crossing,
    // because both sides are taxable
    var XF = ownSells.rh_crypto || 0;
    if (XF > 0) { xferOut.rh_crypto = XF; xferIn.rh_individual = XF; }

    Object.keys(S.accounts).forEach(function (k) {
      var sub = null;
      if (xferIn[k]) sub = money(xferIn[k]) + ' of that came from crypto';
      else if (xferOut[k]) sub = 'all transferred to the brokerage';
      node('A|' + k, S.accounts[k].label.replace('Robinhood ', 'RH ')
        .replace('Schwab ', ''), 1, ACCT_COLOR[k] || '#9aa0a6', sub);
    });

    var TINY = 1200, tinySell = {}, tinyBuy = {};

    // Money that simply stays put. Without it the node height is trade volume,
    // which contradicts the balance chart directly above and makes a big
    // untouched account (the RH Roth) look like it is not in the plan at all.
    var soldOf = {};
    rows.forEach(function (e) {
      if (e.action !== 'sell') return;
      var r = resolve(e);
      if (r.usd > 0) soldOf[e.account + '|' + e.symbol] =
        (soldOf[e.account + '|' + e.symbol] || 0) + r.usd;
    });
    var retained = {};
    S.positions.forEach(function (p) {
      var keep = Math.max(0, p.qty * px(p) - (soldOf[p.account + '|' + p.symbol] || 0));
      if (keep > 1) retained[p.account] = (retained[p.account] || 0) + keep;
    });

    rows.forEach(function (e) {
      if (e.action === 'hold') return;
      var r = resolve(e);
      if (!r.usd || r.usd <= 0) return;
      var col = ACCT_COLOR[e.account] || '#9aa0a6';
      if (e.action === 'sell') {
        if (r.usd < TINY) { tinySell[e.account] = (tinySell[e.account] || 0) + r.usd; return; }
        var sid = 'S|' + e.account + '|' + e.symbol;
        node(sid, e.symbol, 0, col);
        links.push({ from: sid, to: 'A|' + e.account, value: r.usd,
                     color: col, label: 'sell ' + e.symbol });
      } else {
        if (r.usd < TINY) { tinyBuy[e.account] = (tinyBuy[e.account] || 0) + r.usd; return; }
        var bid = 'B|' + e.account + '|' + e.symbol;
        node(bid, e.symbol, 2, col);
        links.push({ from: 'A|' + e.account, to: bid, value: r.usd,
                     color: col, label: 'buy ' + e.symbol });
      }
    });
    Object.keys(tinySell).forEach(function (k) {
      var id = 'S|' + k + '|tiny'; node(id, 'small positions', 0, ACCT_COLOR[k]);
      links.push({ from: id, to: 'A|' + k, value: tinySell[k],
                   color: ACCT_COLOR[k], label: 'small positions' });
    });
    Object.keys(tinyBuy).forEach(function (k) {
      var id = 'B|' + k + '|tiny'; node(id, 'other buys', 2, ACCT_COLOR[k]);
      links.push({ from: 'A|' + k, to: id, value: tinyBuy[k],
                   color: ACCT_COLOR[k], label: 'other buys' });
    });

    Object.keys(retained).forEach(function (k) {
      var lid = 'R|' + k, rid = 'K|' + k;
      node(lid, 'held', 0, '#dadce0', 'not traded');
      node(rid, 'still held', 2, '#dadce0', null);
      links.push({ from: lid, to: 'A|' + k, value: retained[k],
                   color: '#9aa0a6', opacity: '.20', label: 'retained' });
      links.push({ from: 'A|' + k, to: rid, value: retained[k],
                   color: '#9aa0a6', opacity: '.20', label: 'retained' });
    });

    // The two flows that are not a sell or a buy, and are easy to miss.
    var xfer = XF;
    if (xfer > 0) {
      links.push({ from: 'A|rh_crypto', to: 'A|rh_individual', value: xfer,
                   color: ACCT_COLOR.rh_crypto,
                   label: 'transfer crypto proceeds to brokerage' });
    }
    (cons || []).filter(function (c) { return c.kind === 'cash_need' && c.amount; })
      .forEach(function (c, i) {
        var id = 'B|withdraw|' + i;
        node(id, 'withdrawal', 2, '#f28b82');
        links.push({ from: 'A|schwab_trad_inh', to: id, value: Number(c.amount),
                     color: '#f28b82', label: c.label });
      });

    if (!links.length) return '';
    return '<div class="sec"><div class="sec__h"><h2>Where the money goes</h2>' +
      '<span class="hint">Full book, not just the trades — grey is money that ' +
      'stays put. Proceeds stay inside their own account. The one ' +
      'crossing is crypto into the brokerage — both are taxable, so the ' +
      'brokerage node is larger than what the brokerage itself sold</span>' +
      '</div>' +
      C.sankey(nodes, links, { width: 900, labelW: 130,
        headers: ['Sold', 'Account', 'Bought'] }) + '</div>';
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
      comparison(a) + '</div>' + accountStructure(a) + moneyFlow(a) +
      sequence() + tips();
  }

  function mount(el, snap, st) {
    root = el; S = snap; plan = st.plan; rows = st.rows; tgts = st.targets;
    cons = st.constraints; resolve = st.resolve; rate = st.rate;
    useHarvest = st.useHarvest; quotes = st.quotes;
    render();
  }
  return { mount: mount };
})();
