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

  var TAX_TAG = { roth: 'tax-free', pretax: 'taxed on withdrawal',
                  taxable: 'taxed on sale' };

  function leftoverCash() {
    var cash = {};
    rows.forEach(function (e) {
      if (e.action === 'hold') return;
      var r = resolve(e);
      if (r.usd === null) return;
      var pos = S.positions.find(function (x) {
        return x.account === e.account && x.symbol === e.symbol; });
      if (e.action === 'sell') {
        cash[e.account] = (cash[e.account] || 0) + r.usd;
        var tx = pos ? T.sell(pos, Math.min(1, r.frac), rate) : null;
        if (tx && tx.known) cash[e.account] -= Math.max(0, tx.tax);
      } else {
        cash[e.account] = (cash[e.account] || 0) - r.usd;
      }
    });
    // The single legal crossing: both accounts are taxable and owned outright.
    if (cash.rh_crypto > 0) {
      cash.rh_individual = (cash.rh_individual || 0) + cash.rh_crypto;
      cash.rh_crypto = 0;
    }
    return cash;
  }

  function accountStructure(a) {
    // Options are included on both sides so an account's total here matches
    // the same account on the Overview; excluding them made the brokerage read
    // $618 lighter on this tab than on that one. No entry touches them, so
    // they carry through unchanged.
    var opts = (S.options || []).map(function (o) {
      return { account: o.account, symbol: o.underlying + ' call',
               market_value: o.market_value }; });
    var base = S.positions.map(function (p) {
      return Object.assign({}, p, { market_value: p.qty * px(p) });
    }).concat(opts);
    var after = a.after.concat(opts);
    var ci = {}, n = 0, cashBy = leftoverCash();
    function idx(sym) { if (!(sym in ci)) ci[sym] = n++; return ci[sym]; }

    // Same folding rule as the Overview: holdings under 3% of their own
    // account collapse into one block that names its contents on hover, so a
    // small position is never simply invisible.
    function pack(list, k, extraCash) {
      var here = list.filter(function (p) {
        return p.account === k && p.market_value > 1; })
        .map(function (p) { return { label: p.symbol, value: p.market_value }; });
      if (extraCash > 1) here.push({ label: 'cash', value: extraCash });
      here.sort(function (x, y) { return y.value - x.value; });
      var tot = here.reduce(function (s2, x) { return s2 + x.value; }, 0);
      var big = here.filter(function (x) { return x.value >= tot * 0.03; });
      var small = here.slice(big.length);
      var restV = small.reduce(function (s2, x) { return s2 + x.value; }, 0);
      var segs = big.map(function (x) {
        return { label: x.label, value: x.value, ci: idx(x.label),
                 tip: x.label + '  ' + money(x.value) + '  ' +
                      (x.value / (tot || 1) * 100).toFixed(1) + '% of this account' };
      });
      if (restV > 0) segs.push({
        label: small.length + ' smaller', value: restV, ci: 0, muted: true,
        tip: small.length + ' under 3% of this account — ' + money(restV) +
          '\n' + small.map(function (x) {
            return x.label + '  ' + money(x.value); }).join('\n') });
      return { segs: segs, total: tot };
    }

    var groups = Object.keys(S.accounts).map(function (k) {
      var b = pack(base, k, 0), af = pack(after, k, cashBy[k] || 0);
      return { label: S.accounts[k].label.replace(' (from Inherited)', ' (inh)')
                 .replace(' (Inherited)', ' (inh)').replace(' (Brokerage)', ''),
               tag: TAX_TAG[S.accounts[k].tax_class] || '',
               series: [{ name: 'now', segs: b.segs, total: b.total },
                        { name: 'after', segs: af.segs, total: af.total }] };
    }).filter(function (g) {
      return g.series[0].total > 1 || g.series[1].total > 1; });

    return '<div class="sec"><div class="sec__h"><h2>Account structure</h2>' +
      '<span class="hint">Each account before and after, same scale · ' +
      'hover any block</span></div>' +
      C.stackedRows(groups, { width: 880 }) + '</div>';
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

  // Grouped by account, because that is the unit you actually execute against:
  // you log into one broker and do everything there. Phase order is preserved
  // WITHIN each account (losses, then gains, then buys), and a running cash
  // line shows the proceeds funding the purchases — which is the constraint
  // that makes each account a closed system.
  function sequence() {
    var CLS_RANK = { roth: 0, pretax: 1, taxable: 2 };
    // The crypto account funds the brokerage, so it has to go first among the
    // taxable pair regardless of anything else.
    var XFER_FROM = 'rh_crypto', XFER_TO = 'rh_individual';

    var used = {}, step = 0, incoming = {};
    var accounts = Object.keys(S.accounts).filter(function (k) {
      return rows.some(function (e) { return e.account === k; }); })
      .sort(function (a, b) {
        // `|| 2` here would rank roth (0) as taxable — the falsy-zero trap.
        var ra = CLS_RANK[S.accounts[a].tax_class];
        var rb = CLS_RANK[S.accounts[b].tax_class];
        if (ra === undefined) ra = 2;
        if (rb === undefined) rb = 2;
        if (ra !== rb) return ra - rb;
        if (a === XFER_FROM) return -1;
        if (b === XFER_FROM) return 1;
        return 0;
      });

    function posOf(e) {
      return S.positions.find(function (x) {
        return x.account === e.account && x.symbol === e.symbol; }) || null;
    }
    function phase(e) {
      var p = posOf(e);
      if (e.action === 'buy') return 3;
      if (e.action === 'hold') return 4;
      if (!p || !p.trades_taxable) return 0;               // free to sell
      var tx = T.sell(p, Math.min(1, resolve(e).frac), rate);
      return (tx.known && tx.gain < 0) ? 1 : 2;            // losses before gains
    }

    var blocks = accounts.map(function (k) {
      var a = S.accounts[k];
      var mine = rows.filter(function (e) { return e.account === k; })
        .map(function (e) { return { e: e, ph: phase(e) }; })
        .sort(function (x, y) { return x.ph - y.ph; });
      if (!mine.length) return '';

      // Accounts are walked in funding order, so a transfer booked by an
      // earlier account is already waiting here as opening cash.
      var cash = incoming[k] || 0, items = [], holds = [];
      if (cash > 1) {
        items.push('<li class="xfer"><b>' + money(cash) + ' arrives</b> from ' +
          esc(acct(XFER_FROM)) + '<span class="run">' + money(cash) + '</span>' +
          '<div class="sub">Settled proceeds from the crypto sales, ready to ' +
          'deploy.</div></li>');
        step++;
      }
      mine.forEach(function (m, i) {
        var e = m.e, r = resolve(e), pos = posOf(e), f = [];
        if (e.action === 'hold') {
          holds.push(esc(e.symbol));
          return;
        }
        used[e.id] = true;
        var tx = e.action === 'sell' && pos
          ? T.sell(pos, Math.min(1, r.frac), rate) : null;

        if (pos && pos.trades_taxable && pos.tax_model === 'lots')
          f.push('lot picker, highest basis first');
        if (e.symbol === 'BTC') f.push('coin-denominated order, not dollars');
        if (pos && pos.broker === 'Robinhood' && pos.trades_taxable &&
            pos.asset_class !== 'crypto') f.push('app only, not web');
        if (pos && pos.broker === 'Schwab' && pos.trades_taxable)
          f.push('elect specific-ID at or before the sale');
        if (pos && pos.asset_class === 'private_alt') f.push('thin — use a limit order');
        if (!pos && e.action === 'buy') f.push('new position');
        if (!pos && r.usd === null) f.push('no price recorded');
        if (e.action === 'sell' && !pos) f.push('not currently held — check this line');

        var amt = r.usd === null ? 0 : r.usd;
        if (e.action === 'sell') { cash += amt; if (tx && tx.known) cash -= Math.max(0, tx.tax); }
        else cash -= amt;

        step++;
        items.push('<li><b>' + (e.action === 'sell' ? 'Sell' : 'Buy') + ' ' +
          (r.shares ? r.shares.toLocaleString('en-US',
            { maximumFractionDigits: 4 }) + ' ' : '') + esc(e.symbol) + '</b>' +
          (r.usd !== null ? ' <span class="faint">≈ ' + money(r.usd) +
            (tx && tx.known && tx.tax ? ', tax ' + money(tx.tax) : '') +
            '</span>' : '') +
          '<span class="run">' + money(cash) + '</span>' +
          (e.rationale || e.note
            ? '<div class="sub">' + esc(e.rationale || e.note) + '</div>' : '') +
          (f.length ? '<div class="sub flags">' + f.join(' · ') + '</div>' : '') +
          '</li>');

        // The transfer is a real action with a real settlement delay, so it
        // earns a step of its own rather than being implied by two balances.
        var nxt = mine[i + 1];
        if (k === XFER_FROM && (!nxt || nxt.e.action !== 'sell') && cash > 1) {
          step++;
          incoming[XFER_TO] = (incoming[XFER_TO] || 0) + cash;
          items.push('<li class="xfer"><b>Transfer ' + money(cash) + '</b> to ' +
            esc(acct(XFER_TO)) + '<span class="run">' + money(0) + '</span>' +
            '<div class="sub">Both accounts are taxable, so this is the one ' +
            'move of cash between accounts the plan can legally make.</div></li>');
          cash = 0;
        }
      });

      var cls = a.tax_class || 'taxable';
      var free = cls !== 'taxable';
      return '<div class="sec seq"><div class="sec__h">' +
        '<h2>' + esc(a.label) + '</h2>' +
        '<span class="badge b-' + cls + '">' +
          (free ? 'sales are untaxed' : 'sales are taxable') + '</span>' +
        '</div>' +
        (holds.length ? '<div class="seq__hold">Leave alone: <b>' +
          holds.join('</b>, <b>') + '</b></div>' : '') +
        '<ol class="steps steps--run" style="counter-reset:s ' +
          (step - items.length) + '">' +
        items.join('') + '</ol>' +
        '<div class="seq__end">' + (Math.abs(cash) < 1
          ? 'Ends with nothing left over.'
          : cash > 0 ? money(cash) + ' left as cash in this account.'
                     : money(-cash) + ' more needed than the sales raise.') +
        '</div></div>';
    }).join('');

    var missed = rows.filter(function (e) {
      return !used[e.id] && e.action !== 'hold'; });
    return '<div class="sec"><div class="sec__h"><h2>What to do, account by account</h2>' +
      '<span class="hint">' + step + ' steps · cash column runs down the page</span>' +
      '</div><div class="warn warn--calm">Work one account at a time, top to ' +
      'bottom. Within each, sells come before buys because the proceeds are ' +
      'what pays for them — and cash cannot cross between accounts except ' +
      'where a transfer step says so.</div></div>' + blocks +
      (missed.length ? '<div class="warn">' + missed.length +
        ' entries could not be placed in the sequence: ' +
        missed.map(function (e) { return esc(e.symbol); }).join(', ') +
        '</div>' : '');
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
      '<div class="faint" style="font-size:12px;margin-top:18px">Long-term ' +
      'federal rates plus the state rate set on the Rebalance tab. A planning ' +
      'record, not tax or investment advice.</div></div>';
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
    C.tips(root);
  }

  function mount(el, snap, st) {
    root = el; S = snap; plan = st.plan; rows = st.rows; tgts = st.targets;
    cons = st.constraints; resolve = st.resolve; rate = st.rate;
    useHarvest = st.useHarvest; quotes = st.quotes;
    render();
  }
  return { mount: mount };
})();
