// workspace.js — Tab 2. Why the plan looks the way it does.
//
// Read-only by design. The decisions are reached in conversation and written
// here by pf.py; this tab explains them. It previously offered editable
// targets that recomputed nothing, which made it look like a calculator that
// was simply broken. The two things still yours to set are your own tax
// situation and the lock, because neither is plan content.
//
// The organising idea is the account. Cash cannot move between tax buckets, so
// every account has to fund its own buys — which means "why this trade" and
// "why in this account" are the same question, and it is the question this tab
// has to answer.

window.PFWorkspace = (function () {
  'use strict';
  var C = window.PFCharts, A = window.PFApi, T = window.PFTax;
  var S, plans = [], plan, rows = [], tgts = [], cons = [], noteList = [];
  var root, rate = 0.188, quotes = null;
  var profile = {}, rates = null, setupOpen = false;

  // Harvesting losses against realised gains is simply what you would do, so
  // it is applied rather than offered as an unexplained toggle. It shows up as
  // a line in the tax breakdown instead.
  var useHarvest = true;

  var esc = C.esc, money = C.money;
  var toast = function (m) { window.PortfolioApp.toast(m); };
  var locked = function () { return plan.status !== 'draft'; };
  var acct = function (k) {
    return S.accounts[k].label.replace('Robinhood ', 'RH ').replace('Schwab ', ''); };
  var px = function (p) { return (quotes && quotes[p.symbol]) || p.price; };

  function posFor(a, s) {
    return S.positions.find(function (p) {
      return p.account === a && p.symbol === s; }) || null;
  }
  // A buy is frequently into something not owned yet, which is most of what
  // rebalancing is. Those entries have no position to measure against, so the
  // amount is taken at face value and a price is only needed to derive shares.
  function resolve(e) {
    var p = posFor(e.account, e.symbol);
    if (e.amount === null || e.amount === undefined)
      return { usd: null, shares: null, frac: 0, pos: p, isNew: !p };

    var a = Number(e.amount);
    if (!p) {
      // price comes from the entry override, else a live quote, else unknown
      var q = e.price || (quotes && quotes[e.symbol]) || null;
      if (e.unit === 'usd')    return { usd: a, shares: q ? a / q : null,
                                        frac: 0, pos: null, isNew: true };
      if (e.unit === 'shares') return { usd: q ? a * q : null, shares: a,
                                        frac: 0, pos: null, isNew: true };
      // a percentage of a position you do not hold has no meaning
      return { usd: null, shares: null, frac: 0, pos: null, isNew: true,
               badUnit: true };
    }

    var price = px(p);
    var shares = e.unit === 'pct' ? p.qty * a / 100
               : e.unit === 'shares' ? a
               : (price ? a / price : 0);
    return { usd: shares * price, shares: shares,
             frac: p.qty ? shares / p.qty : 0, pos: p, isNew: false };
  }
  function entryTax(e) {
    var r = resolve(e);
    if (!r.pos || e.action !== 'sell') return { tax: 0, gain: 0, known: true };
    return T.sell(r.pos, Math.min(1, r.frac), rate);
  }
  function totals() {
    var trims = rows.filter(function (e) { return e.action === 'sell'; })
      .map(function (e) {
        var r = resolve(e);
        return { position: r.pos, frac: Math.min(1, r.frac) };
      }).filter(function (t) { return t.position; });
    return T.scenario(S, trims, rate, useHarvest);
  }

  // ---------- tax profile ----------
  // 18.8% is not an assumption about your income, it is the long-term
  // capital-gains rate: 15% bracket plus the 3.8% NIIT surcharge that applies
  // over $200k single / $250k MFJ. Your ORDINARY marginal rate is a different
  // and higher number, and it is what traditional-IRA withdrawals cost.
  function taxSection() {
    var r = rates || T.deriveRates(profile.income, profile.filing, profile.state);
    var d = T.deferredLiability(S, r.ordinary, 0);
    var unset = !r.configured;
    var st = r.state;
    return '<div class="sec" style="margin-top:0"><div class="sec__h">' +
      '<h2>Tax profile</h2><span class="hint">Drives every figure below</span>' +
      '</div>' +
      (unset ? '<div class="warn">No income on file, so every rate below is a ' +
        'placeholder. Enter it and save.</div>' : '') +
      '<div class="row" style="margin-bottom:14px">' +
      '<label class="faint" style="font-size:12.5px">Income' +
        '<input class="f num" id="tx-income" type="number" step="1000" ' +
        'value="' + (r.configured ? r.income : '') + '" placeholder="225000" ' +
        'style="width:120px;margin-left:8px"></label>' +
      '<label class="faint" style="font-size:12.5px">Filing' +
        '<select class="f" id="tx-filing" style="width:150px;margin-left:8px">' +
        '<option value="single"' + (r.filing === 'single' ? ' selected' : '') +
          '>Single</option>' +
        '<option value="mfj"' + (r.filing === 'mfj' ? ' selected' : '') +
          '>Married filing jointly</option></select></label>' +
      // Residency is really a question about the settlement date: a sale that
      // closes while you are a Texas resident is not California-source income.
      '<label class="faint" style="font-size:12.5px">Resident when sold' +
        '<select class="f" id="tx-state" style="width:210px;margin-left:8px">' +
        '<option value="TX"' + (st === 'TX' ? ' selected' : '') +
          '>Texas — no state income tax</option>' +
        '<option value="CA"' + (st === 'CA' ? ' selected' : '') +
          '>California — gains taxed as income</option></select></label>' +
      '<button class="btn" id="tx-save">Save</button>' +
      '</div>' +
      '<div class="metrics" style="padding-bottom:18px">' +
        '<div class="metric"><div class="k">Long-term capital gains</div>' +
          '<div class="v sm">' + (r.ltcg * 100).toFixed(1) + '%</div>' +
          '<div class="n">' + (r.ltcgBase * 100).toFixed(0) + '% bracket' +
            (r.niit ? ' + 3.8% NIIT' : '') +
            (r.stateRate ? ' + ' + (r.stateRate * 100).toFixed(1) + '% ' + st : '') +
            ' — taxable sales</div></div>' +
        '<div class="metric"><div class="k">Ordinary marginal</div>' +
          '<div class="v sm">' + (r.ordinary * 100).toFixed(1) + '%</div>' +
          '<div class="n">traditional-IRA withdrawals, short-term gains</div></div>' +
        '<div class="metric"><div class="k">Deferred liability</div>' +
          '<div class="v sm r">' + money(d.tax) + '</div>' +
          '<div class="n">owed on the ' + money(d.balance) +
            ' traditional IRA</div></div>' +
      '</div>' +
      '<div class="faint" style="font-size:12px;margin:-6px 0 4px">' +
        'Federal brackets are 2026 estimates; California’s are too, though ' +
        'at this income every published table puts you in the 9.3% band.</div></div>';
  }

  // ---------- scenario bar ----------
  function scenarioBar() {
    var opts = plans.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === plan.id ? ' selected' : '') +
        '>' + esc(p.name) + '</option>'; }).join('');
    return '<div class="row" style="margin:2px 0 14px">' +
      '<select class="f" id="scn" style="width:260px">' + opts + '</select>' +
      '<span class="badge ' + (locked() ? 'b-locked' : 'b-draft') + '">' +
        (locked() ? 'locked' : 'draft') + '</span>' +
      '<span style="margin-left:auto"></span>' +
      (locked()
        ? '<button class="btn outline" id="unlock">Reopen</button>'
        : '<button class="btn" id="lock">Lock this plan</button>') +
      '</div>';
  }

  // ---------- headline ----------
  function metricsStrip() {
    var t = totals();
    var cells = [
      ['Raised', money(t.proceeds), 'from ' + rows.filter(function (e) {
        return e.action === 'sell'; }).length + ' sales', ''],
      ['Gain realised', money(t.gain), 'on the taxable sales only', ''],
      ['Losses applied', '−' + money(t.offset),
        money(t.pool) + ' available', t.offset ? 'g' : ''],
      ['Taxable gain', money(t.taxable), 'after the offset', ''],
      ['Tax', money(t.tax), (rate * 100).toFixed(1) + '% all-in',
        t.tax ? 'r' : ''],
      ['Net after tax', money(t.proceeds - t.tax), 'available to redeploy', ''],
    ];
    return '<div class="metrics">' + cells.map(function (c) {
      return '<div class="metric"><div class="k">' + c[0] + '</div>' +
        '<div class="v sm ' + c[3] + '">' + c[1] + '</div>' +
        '<div class="n">' + c[2] + '</div></div>'; }).join('') + '</div>';
  }

  // ---------- the account panels: the point of this tab ----------
  // Each account is its own closed system. What it can buy is limited by what
  // it sold, and what it SHOULD hold is decided by how that account is taxed.
  var PLACEMENT = {
    roth: ['Tax-free, permanently', 'Nothing here is ever taxed again — ' +
      'not the trades, not the growth, not the withdrawal. So this is where ' +
      'the highest expected return belongs, because it is the only account ' +
      'where compounding is never shared with the IRS.'],
    pretax: ['Free to trade, taxed on the way out', 'Rebalancing costs nothing, ' +
      'but every dollar withdrawn is ordinary income — on the whole balance, ' +
      'not just the gain. Growth here is worth less after tax than identical ' +
      'growth in a Roth, which is why the moonshots are not here.'],
    taxable: ['Every sale is a taxable event', 'Turnover costs real money here, ' +
      'so this is where the things you will not need to sell belong: lower ' +
      'volatility, broad exposure, hedges.'],
  };

  function accountPanels() {
    var RANK = { roth: 0, pretax: 1, taxable: 2 };
    var rank = function (k) {
      var r = RANK[S.accounts[k].tax_class];
      return r === undefined ? 2 : r;
    };
    var order = Object.keys(S.accounts).sort(function (a, b) {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return a === 'rh_crypto' ? -1 : b === 'rh_crypto' ? 1 : 0;
    });

    var blocks = order.map(function (k) {
      var mine = rows.filter(function (e) { return e.account === k; });
      if (!mine.length) return '';
      var cls = S.accounts[k].tax_class || 'taxable';
      var place = PLACEMENT[cls] || PLACEMENT.taxable;

      var raised = 0, spent = 0, tax = 0;
      mine.forEach(function (e) {
        var r = resolve(e);
        if (e.action === 'sell' && r.usd > 0) {
          raised += r.usd;
          var tx = entryTax(e); if (tx.known) tax += Math.max(0, tx.tax);
        }
        if (e.action === 'buy' && r.usd > 0) spent += r.usd;
      });

      var bal = S.positions.filter(function (p) { return p.account === k; })
        .reduce(function (s, p) { return s + p.qty * px(p); }, 0);

      var flow = [
        ['Balance', money(bal), ''],
        ['Raised', money(raised), ''],
        ['Tax', tax ? money(tax) : 'none', tax ? 'r' : 'g'],
        ['Redeployed', money(spent), ''],
        ['Not redeployed', money(raised - tax - spent), ''],
      ].map(function (c) {
        return '<div class="metric"><div class="k">' + c[0] + '</div>' +
          '<div class="v sm ' + c[2] + '">' + c[1] + '</div></div>'; }).join('');

      return '<div class="acct">' +
        '<div class="acct__h"><h3>' + esc(S.accounts[k].label) + '</h3>' +
          '<span class="badge b-' + cls + '">' + place[0] + '</span></div>' +
        '<p class="acct__why">' + place[1] +
          (S.accounts[k].tax_note ? ' <span class="faint">' +
            esc(S.accounts[k].tax_note) + '</span>' : '') + '</p>' +
        '<div class="metrics acct__flow">' + flow + '</div>' +
        tradeTable(mine) +
        '</div>';
    }).join('');

    return '<div class="sec"><div class="sec__h"><h2>Why these trades, in these accounts</h2>' +
      '<span class="hint">Each account funds its own buys</span></div>' +
      '<div class="warn warn--calm">Cash cannot move between tax buckets — ' +
      'a Roth cannot be topped up from a sale in the brokerage. The one legal ' +
      'crossing here is Robinhood Crypto → Robinhood Individual, because ' +
      'both are taxable accounts you own outright.</div>' +
      blocks + '</div>';
  }

  function tradeTable(list) {
    var order = { sell: 0, hold: 1, buy: 2 };
    var sorted = list.slice().sort(function (a, b) {
      return (order[a.action] || 0) - (order[b.action] || 0); });
    return '<div class="scroll"><table class="t t--why"><thead><tr>' +
      '<th style="width:58px">Action</th><th style="width:34%">Position</th>' +
      '<th class="num" style="width:96px">Value</th>' +
      '<th class="num" style="width:96px">Tax</th>' +
      '<th>Why here</th></tr></thead><tbody>' +
      sorted.map(function (e) {
        var r = resolve(e), tx = entryTax(e);
        var val = r.usd === null ? '<span class="faint">—</span>' : money(r.usd);
        var taxCell = e.action !== 'sell' ? '<span class="faint">—</span>'
          : !tx.known ? '<span class="faint">unknown basis</span>'
          : tx.tax ? '<span class="r">' + money(tx.tax) + '</span>'
          : '<span class="g">none</span>';
        return '<tr><td><b class="act act--' + e.action + '">' +
            e.action.toUpperCase() + '</b></td>' +
          '<td><b>' + esc(e.symbol) + '</b>' +
            (r.shares ? ' <span class="faint">' +
              r.shares.toLocaleString('en-US', { maximumFractionDigits: 3 }) +
              ' sh</span>' : '') +
            rangeChip(e.symbol, r.pos ? px(r.pos) : e.price) + '</td>' +
          '<td class="num mono">' + val + '</td>' +
          '<td class="num mono">' + taxCell + '</td>' +
          '<td class="why">' + esc(e.rationale || e.note || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ---------- valuation context ----------
  // Answers "am I buying the peak?" without a paragraph: a low-high line with
  // a dot where the trade price sits.
  function metricFor(sym) {
    var m = S.metrics && S.metrics.symbols;
    return (m && m[sym]) || null;
  }
  // Price is not stored with the metrics — it comes from the same pipeline as
  // everything else (entry price for a new buy, live quote or snapshot price
  // for something held), so the dot cannot drift from the value beside it.
  function rangeChip(sym, price) {
    var m = metricFor(sym);
    if (!m || !(m.hi_52 > m.lo_52) || !(price > 0)) return '';
    var f = Math.max(0, Math.min(1, (price - m.lo_52) / (m.hi_52 - m.lo_52)));
    var hot = f > 0.92 ? ' rng--hot' : f < 0.25 ? ' rng--cold' : '';
    var pe = m.pe === null || m.pe === undefined ? 'no earnings'
           : m.pe < 0 ? 'unprofitable'
           : 'P/E ' + Number(m.pe).toFixed(1);
    return '<span class="rng' + hot + '" title="' + esc(sym) + ' ' + money(price) +
      ' — 52-week range ' + money(m.lo_52) + ' to ' + money(m.hi_52) + ', ' +
      (f * 100).toFixed(0) + '% of the way up. ' + pe + '">' +
      '<span class="rng__dot" style="left:' + (f * 100).toFixed(1) + '%"></span>' +
      '</span>';
  }

  // ---------- what the plan is buying into ----------
  // Sorted by position in the 52-week range so the entries near the top of
  // their year sort to the top of the list. This is the "am I buying the
  // peak?" question, and it is a question about the buys specifically.
  function buyQuality() {
    var buys = rows.filter(function (e) { return e.action === 'buy'; })
      .map(function (e) {
        var r = resolve(e), m = metricFor(e.symbol);
        var price = r.pos ? px(r.pos) : e.price;
        if (!m || !(m.hi_52 > m.lo_52) || !(price > 0)) return null;
        return { sym: e.symbol, usd: r.usd || 0, price: price, m: m,
                 f: Math.max(0, Math.min(1, (price - m.lo_52) / (m.hi_52 - m.lo_52))) };
      }).filter(Boolean)
      .sort(function (a, b) { return b.f - a.f; });
    if (!buys.length) return '';

    var hot = buys.filter(function (b) { return b.f > 0.92; });
    var rowsHtml = buys.map(function (b) {
      var pe = b.m.pe === null || b.m.pe === undefined
             ? '<span class="faint">no earnings</span>'
             : b.m.pe < 0 ? '<span class="r">unprofitable</span>'
             : Number(b.m.pe).toFixed(0);
      return '<tr><td><b>' + esc(b.sym) + '</b></td>' +
        '<td class="num mono faint">' + money(b.usd) + '</td>' +
        '<td style="width:44%"><span class="rng rng--wide' +
          (b.f > 0.92 ? ' rng--hot' : b.f < 0.25 ? ' rng--cold' : '') +
          '" title="' + money(b.m.lo_52) + ' to ' + money(b.m.hi_52) + '">' +
          '<span class="rng__dot" style="left:' + (b.f * 100).toFixed(1) +
          '%"></span></span></td>' +
        '<td class="num mono">' + (b.f * 100).toFixed(0) + '%</td>' +
        '<td class="num mono">' + pe + '</td></tr>';
    }).join('');

    return '<div class="sec"><div class="sec__h"><h2>What you are buying into</h2>' +
      '<span class="hint">Where each buy sits in its own 52-week range</span></div>' +
      (hot.length ? '<div class="warn">' + hot.length + ' of these ' +
        (hot.length === 1 ? 'is' : 'are') + ' being bought within a few percent ' +
        'of a 52-week high: <b>' + hot.map(function (b) { return esc(b.sym); })
        .join('</b>, <b>') + '</b>. Not a reason not to buy — but worth ' +
        'knowing you are not getting a discount.</div>' : '') +
      '<div class="scroll"><table class="t"><thead><tr><th>Position</th>' +
      '<th class="num">Size</th><th>52-week low to high</th>' +
      '<th class="num">In range</th><th class="num">P/E</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' +
      '<div class="faint" style="font-size:12px;margin-top:10px">Fundamentals ' +
      'as of ' + esc((S.metrics && S.metrics.as_of) || '—') + '. A high P/E is ' +
      'not automatically bad and a low one is not automatically cheap; this is ' +
      'context, not a verdict.</div></div>';
  }

  // ---------- targets, constraints, notes: read-only ----------
  function currentWeights(kind) {
    var d = {}, tot = 0;
    function add(k, v) { d[k] = (d[k] || 0) + v; tot += v; }
    S.positions.forEach(function (p) {
      add(kind === 'theme' ? p.theme
        : kind === 'asset_class' ? p.asset_class : p.symbol, p.qty * px(p));
    });
    // Options were excluded here but included by the other two tabs, so the
    // same rollup disagreed with itself across the app.
    (S.options || []).forEach(function (o) {
      add(kind === 'theme' ? o.theme
        : kind === 'asset_class' ? 'options' : o.underlying, o.market_value);
    });
    return { d: d, tot: tot || 1 };
  }

  function targetsSection() {
    if (!tgts.length) return '';
    var byKind = {};
    tgts.forEach(function (t) { (byKind[t.kind] = byKind[t.kind] || []).push(t); });
    return Object.keys(byKind).map(function (kind) {
      var cw = currentWeights(kind);
      return '<div class="sec"><div class="sec__h"><h2>Targets by ' +
        esc(kind.replace('_', ' ')) + '</h2>' +
        '<span class="hint">Where the plan is aiming</span></div>' +
        '<div class="scroll"><table class="t"><thead><tr><th>What</th>' +
        '<th class="num">Now</th><th class="num">Target</th>' +
        '<th class="num">Gap</th><th>Why</th></tr></thead><tbody>' +
        byKind[kind].map(function (t) {
          var cur = (cw.d[t.key] || 0) / cw.tot * 100;
          var gap = (t.target_pct === null ? 0 : t.target_pct - cur);
          var g = Math.abs(gap) < 0.5 ? 'faint' : gap < 0 ? 'neg' : 'pos';
          return '<tr><td><b>' + esc(t.key) + '</b></td>' +
            '<td class="num mono">' + cur.toFixed(1) + '%</td>' +
            '<td class="num mono">' + (t.target_pct === null ? '—' :
              Number(t.target_pct).toFixed(1) + '%') + '</td>' +
            '<td class="num mono ' + g + '">' + (gap > 0 ? '+' : '') +
              gap.toFixed(1) + '</td>' +
            '<td class="why">' + esc(t.note || '') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }).join('');
  }

  function constraintsSection() {
    if (!cons.length) return '';
    return '<div class="sec"><div class="sec__h"><h2>Constraints</h2>' +
      '<span class="hint">Things the plan has to respect</span></div>' +
      '<ul class="tips">' + cons.map(function (c) {
        return '<li><b>' + esc(c.label) + '</b>' +
          (c.amount ? ' — ' + money(c.amount) : '') +
          (c.due_date ? ' <span class="faint">by ' + esc(c.due_date) + '</span>' : '') +
          '</li>'; }).join('') + '</ul></div>';
  }

  function notesSection() {
    if (!noteList.length) return '';
    return '<div class="sec"><div class="sec__h"><h2>Notes</h2>' +
      '<span class="hint">Recorded during the session</span></div>' +
      noteList.map(function (n) {
        return '<div class="note"><div class="note__d">' +
          esc(String(n.created_at).slice(0, 10)) + '</div>' +
          '<div>' + esc(n.body) + '</div></div>'; }).join('') + '</div>';
  }

  // ---------- render ----------
  function render() {
    if (!plan) {
      root.innerHTML = '<div class="empty">No scenario open.</div>';
      return;
    }
    if (!rows.length) {
      root.innerHTML = scenarioBar() + emptyState();
      wireScenario();
      return;
    }
    var r = rates || T.deriveRates(profile.income, profile.filing, profile.state);
    var summary = '<b>Setup</b> your tax situation' +
      '<span class="sum">' + (r.ltcg * 100).toFixed(1) + '% LTCG · ' +
      (r.ordinary * 100).toFixed(1) + '% ordinary · ' + r.state + '</span>';

    root.innerHTML = scenarioBar() + metricsStrip() +
      '<details class="setup"' + (setupOpen || !r.configured ? ' open' : '') + '>' +
        '<summary>' + summary + '</summary>' +
        '<div class="setup__body">' + taxSection() + '</div>' +
      '</details>' +
      accountPanels() + buyQuality() + targetsSection() +
      constraintsSection() + notesSection();

    wireScenario();
    wireSetup();
  }

  // A scenario with nothing in it should look like a place a plan will go,
  // not like a broken page.
  function emptyState() {
    function ghost(title, note) {
      return '<div class="sec ghost"><div class="sec__h"><h2>' + title + '</h2>' +
        '<span class="hint">' + note + '</span></div>' +
        '<div class="ghost__bars"><i style="width:72%"></i><i style="width:54%"></i>' +
        '<i style="width:38%"></i><i style="width:23%"></i></div></div>';
    }
    return '<div class="empty empty--lead">Nothing recorded in this scenario yet.' +
      '<div class="faint" style="margin-top:6px">Decisions are worked out in a ' +
      'session and written here — then this tab explains them.</div></div>' +
      ghost('Why these trades, in these accounts', 'per-account reasoning') +
      ghost('Targets', 'where the plan is aiming');
  }

  function wireScenario() {
    var q = function (s) { return root.querySelector(s); };
    var sel = q('#scn');
    if (sel) sel.addEventListener('change', function () {
      window.PortfolioApp.switchScenario(Number(sel.value)); });
    var lock = q('#lock');
    if (lock) lock.addEventListener('click', function () { guard(async function () {
      if (!rows.length) { toast('Nothing to lock'); return; }
      plan = await A.updatePlan(plan.id,
        { status: 'locked', locked_at: new Date().toISOString() });
      render(); window.PortfolioApp.planChanged(); toast('Locked');
    }); });
    var un = q('#unlock');
    if (un) un.addEventListener('click', function () { guard(async function () {
      plan = await A.updatePlan(plan.id, { status: 'draft', locked_at: null });
      render(); window.PortfolioApp.planChanged(); toast('Reopened');
    }); });
  }

  function wireSetup() {
    var q = function (s) { return root.querySelector(s); };
    var d = root.querySelector('details.setup');
    if (d) d.addEventListener('toggle', function () { setupOpen = d.open; });
    var save = q('#tx-save');
    if (save) save.addEventListener('click', function () { guard(async function () {
      var inc = parseFloat(q('#tx-income').value);
      profile = await A.saveSettings({
        income: isNaN(inc) ? null : inc,
        filing: q('#tx-filing').value,
        state: q('#tx-state').value });
      setupOpen = true;
      window.PortfolioApp.profileChanged(profile);
      toast('Saved');
    }); });
  }

  function guard(fn) {
    return fn().catch(function (e) { toast(e.message || String(e)); });
  }

  function mount(el, snap, allPlans, curPlan, e, t, c, n) {
    root = el; S = snap; plans = allPlans; plan = curPlan;
    rows = e; tgts = t; cons = c; noteList = n;
    render();
  }
  function setQuotes(q) { quotes = q; if (root) render(); }
  function setProfile(p, r) {
    profile = p || {}; rates = r;
    // Explicit null test. `if (r.ltcg)` silently kept the 18.8% default
    // whenever the derived rate was a genuine 0%, so the page taxed at one
    // rate while displaying another.
    if (r && r.ltcg != null) rate = r.ltcg;
    if (root) render();
  }
  function state() {
    return { plan: plan, rows: rows, targets: tgts, constraints: cons,
             resolve: resolve, rate: rate, useHarvest: useHarvest,
             quotes: quotes, profile: profile, rates: rates };
  }
  return { mount: mount, state: state, setQuotes: setQuotes,
           setProfile: setProfile };
})();
