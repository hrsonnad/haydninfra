// workspace.js — Tab 2. Where the rebalancing gets recorded.
//
// Not a model: it does not propose trims or optimise anything. It holds the
// targets we are aiming at, the constraints we have to respect, the decisions
// we reach, and the notes behind them — and prices each decision so the line
// reads back honestly. Sections re-render independently so editing one field
// does not rebuild the tab under your cursor.

window.PFWorkspace = (function () {
  'use strict';
  var C = window.PFCharts, A = window.PFApi, T = window.PFTax;
  var S, plans = [], plan, rows = [], tgts = [], cons = [], noteList = [];
  var root, rate = 0.188, useHarvest = true, quotes = null;
  var profile = {}, rates = null, setupOpen = false;

  var esc = C.esc, money = C.money;
  var toast = function (m) { window.PortfolioApp.toast(m); };
  var locked = function () { return plan.status !== 'draft'; };
  var acct = function (k) {
    return S.accounts[k].label.replace('Robinhood ', 'RH ').replace('Schwab ', ''); };
  var px = function (p) { return (quotes && quotes[p.symbol]) || p.price; };

  // Only worth flagging provenance when the list actually mixes the two.
  function mixedSources() {
    var c = 0, h = 0;
    rows.forEach(function (e) { if (e.source === 'claude') c++; else h++; });
    return c > 0 && h > 0;
  }

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
    var r = rates || T.deriveRates(profile.income || 0, profile.filing);
    var st = Number(profile.state_rate || 0);
    var d = T.deferredLiability(S, r.ordinary, st / 100);
    return '<div class="sec" style="margin-top:0"><div class="sec__h">' +
      '<h2>Tax profile</h2><span class="hint">Drives every figure below</span>' +
      '</div><div class="row" style="margin-bottom:14px">' +
      '<label class="faint" style="font-size:12.5px">Income' +
        '<input class="f num" id="tx-income" type="number" step="1000" ' +
        'value="' + (profile.income || '') + '" placeholder="225000" ' +
        'style="width:120px;margin-left:8px"></label>' +
      '<label class="faint" style="font-size:12.5px">Filing' +
        '<select class="f" id="tx-filing" style="width:150px;margin-left:8px">' +
        '<option value="single"' + (r.filing === 'single' ? ' selected' : '') +
          '>Single</option>' +
        '<option value="mfj"' + (r.filing === 'mfj' ? ' selected' : '') +
          '>Married filing jointly</option></select></label>' +
      '<label class="faint" style="font-size:12.5px">State %' +
        '<input class="f num" id="tx-state" type="number" step="0.1" ' +
        'value="' + (profile.state_rate || '') + '" placeholder="0" ' +
        'style="width:74px;margin-left:8px"></label>' +
      '<button class="btn" id="tx-save">Save</button>' +
      '</div>' +
      '<div class="metrics" style="padding-bottom:18px">' +
        '<div class="metric"><div class="k">Long-term capital gains</div>' +
          '<div class="v sm">' + ((r.ltcg + st / 100) * 100).toFixed(1) + '%</div>' +
          '<div class="n">' + (r.ltcgBase * 100).toFixed(0) + '% bracket' +
            (r.niit ? ' + 3.8% NIIT' : '') +
            (st ? ' + ' + st + '% state' : '') + ' — taxable sales</div></div>' +
        '<div class="metric"><div class="k">Ordinary marginal</div>' +
          '<div class="v sm">' + ((r.ordinary + st / 100) * 100).toFixed(1) + '%</div>' +
          '<div class="n">traditional-IRA withdrawals, short-term gains</div></div>' +
        '<div class="metric"><div class="k">Deferred liability</div>' +
          '<div class="v sm r">' + money(d.tax) + '</div>' +
          '<div class="n">owed on the ' + money(d.balance) +
            ' traditional IRA</div></div>' +
      '</div>' +
      '<div class="faint" style="font-size:12px;margin:-6px 0 4px">' +
        'Brackets are 2026 estimates. Override the rate used for this scenario ' +
        'in the selector below if they are off.</div></div>';
  }

  // ---------- scenarios ----------
  function scenarioBar() {
    return '<div class="row" style="margin-bottom:22px">' +
      '<select class="f" id="scn" style="width:220px">' +
        plans.map(function (p) {
          return '<option value="' + p.id + '"' +
            (p.id === plan.id ? ' selected' : '') + '>' + esc(p.name) +
            (p.status !== 'draft' ? ' · ' + p.status : '') + '</option>';
        }).join('') + '</select>' +
      '<button class="btn" id="scn-new">New scenario</button>' +
      (plans.length > 1 ? '<button class="btn danger" id="scn-del">Archive</button>' : '') +
      '<span style="margin-left:auto"></span>' +
      '<label class="faint" style="font-size:12.5px"><input type="checkbox" ' +
        'id="harv"' + (useHarvest ? ' checked' : '') + '> apply harvest</label>' +
      (locked()
        ? '<button class="btn outline" id="unlock">Reopen</button>'
        : '<button class="btn filled" id="lock">Lock scenario</button>') +
      '</div>';
  }

  function metrics() {
    var t = totals();
    var cells = [
      ['Proceeds', money(t.proceeds), rows.filter(function (e) {
        return e.action === 'sell'; }).length + ' sells', ''],
      ['Gain realised', t.gain ? (t.gain >= 0 ? '+' : '') + money(t.gain) : '—',
        t.nUnknown ? t.nUnknown + ' without basis' : '', ''],
      ['Harvest applied', t.offset ? '−' + money(t.offset) : '—',
        money(t.pool) + ' available', t.offset ? 'g' : ''],
      ['Tax', money(t.tax), (rate * 100).toFixed(1) + '% federal', t.tax ? 'r' : ''],
      ['Net after tax', money(t.proceeds - t.tax), '', ''],
    ];
    return '<div class="metrics" style="padding-bottom:20px">' +
      cells.map(function (c) {
        return '<div class="metric"><div class="k">' + c[0] + '</div>' +
          '<div class="v sm ' + c[3] + '">' + c[1] + '</div>' +
          (c[2] ? '<div class="n">' + esc(c[2]) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
  }

  // ---------- targets ----------
  function currentWeights(kind) {
    var d = {}, tot = 0;
    S.positions.forEach(function (p) {
      var k = kind === 'theme' ? p.theme
            : kind === 'asset_class' ? p.asset_class : p.symbol;
      var v = p.qty * px(p);
      d[k] = (d[k] || 0) + v; tot += v;
    });
    return { d: d, tot: tot || 1 };
  }

  function targetsSection() {
    var byKind = {};
    tgts.forEach(function (t) { (byKind[t.kind] = byKind[t.kind] || []).push(t); });
    var body = '';
    Object.keys(byKind).forEach(function (kind) {
      var w = currentWeights(kind);
      body += byKind[kind].map(function (t) {
        var cur = (w.d[t.key] || 0) / w.tot * 100;
        var gap = t.target_pct === null ? null : t.target_pct - cur;
        return '<tr data-tid="' + t.id + '">' +
          '<td class="dim">' + esc(t.key) +
            ' <span class="tag">' + esc(t.kind) + '</span></td>' +
          '<td class="num dim">' + cur.toFixed(1) + '%</td>' +
          '<td class="num"><input class="f num" type="number" step="any" ' +
            'data-tf="target_pct" value="' + (t.target_pct === null ? '' : t.target_pct) +
            '" style="width:66px"' + (locked() ? ' disabled' : '') + '></td>' +
          '<td class="num ' + (gap === null ? 'faint' : Math.abs(gap) < 0.5 ? 'faint'
            : gap < 0 ? 'neg' : 'pos') + '">' +
            (gap === null ? '—' : (gap > 0 ? '+' : '') + gap.toFixed(1)) + '</td>' +
          '<td><input class="f" data-tf="note" value="' + esc(t.note) +
            '" placeholder="why"' + (locked() ? ' disabled' : '') + '></td>' +
          '<td>' + (locked() ? '' : '<button class="icon" data-tdel="' + t.id +
            '">×</button>') + '</td></tr>';
      }).join('');
    });

    var themes = Object.keys(currentWeights('theme').d).sort();
    return '<div class="sec"><div class="sec__h"><h2>Targets</h2>' +
      '<span class="hint">What this scenario is aiming at</span></div>' +
      (body ? '<div class="scroll"><table class="t"><thead><tr>' +
        '<th>What</th><th class="num">Current</th>' +
        '<th class="num">Target</th><th class="num">Gap (pp)</th>' +
        '<th>Note</th><th></th>' +
        '</tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="empty">No targets set.</div>') +
      (locked() ? '' : '<div class="row" style="margin-top:14px">' +
        '<select class="f" id="tg-kind" style="width:120px">' +
          '<option value="theme">theme</option><option value="symbol">symbol</option>' +
          '<option value="asset_class">asset class</option></select>' +
        '<input class="f" id="tg-key" list="tg-keys" placeholder="e.g. Tesla" ' +
          'style="width:170px">' +
        '<datalist id="tg-keys">' + themes.map(function (t) {
          return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
        '<input class="f num" id="tg-pct" type="number" step="any" ' +
          'placeholder="target %" style="width:110px">' +
        '<button class="btn" id="tg-add">Add target</button></div>') +
      '</div>';
  }

  // ---------- constraints ----------
  function constraintsSection() {
    var body = cons.map(function (c) {
      return '<tr data-cid="' + c.id + '">' +
        '<td class="tag">' + esc(c.kind.replace('_', ' ')) + '</td>' +
        '<td><input class="f" data-cf="label" value="' + esc(c.label) + '"' +
          (locked() ? ' disabled' : '') + '></td>' +
        '<td class="num"><input class="f num" type="number" step="any" ' +
          'data-cf="amount" value="' + (c.amount === null ? '' : c.amount) +
          '" style="width:100px"' + (locked() ? ' disabled' : '') + '></td>' +
        '<td><input class="f" type="date" data-cf="due_date" value="' +
          (c.due_date || '') + '" style="width:140px"' +
          (locked() ? ' disabled' : '') + '></td>' +
        '<td>' + (locked() ? '' : '<button class="icon" data-cdel="' + c.id +
          '">×</button>') + '</td></tr>';
    }).join('');

    return '<div class="sec"><div class="sec__h"><h2>Constraints</h2>' +
      '<span class="hint">Cash the portfolio has to produce, and what is off ' +
      'the table</span></div>' +
      (body ? '<div class="scroll"><table class="t"><thead><tr><th>Kind</th>' +
        '<th>What</th><th class="num">Amount</th><th>By</th><th></th></tr></thead>' +
        '<tbody>' + body + '</tbody></table></div>'
        : '<div class="empty">No constraints recorded.</div>') +
      (locked() ? '' : '<div class="row" style="margin-top:14px">' +
        '<select class="f" id="cn-kind" style="width:140px">' +
          '<option value="cash_need">cash need</option>' +
          '<option value="untouchable">untouchable</option>' +
          '<option value="note">note</option></select>' +
        '<input class="f" id="cn-label" placeholder="description" style="flex:1;min-width:180px">' +
        '<input class="f num" id="cn-amt" type="number" step="any" ' +
          'placeholder="amount" style="width:120px">' +
        '<input class="f" id="cn-date" type="date" style="width:150px">' +
        '<button class="btn" id="cn-add">Add</button></div>') +
      '</div>';
  }

  // ---------- entries ----------
  function entriesSection() {
    var opts = function (list, cur) {
      return list.map(function (v) {
        return '<option value="' + esc(v[0]) + '"' +
          (v[0] === cur ? ' selected' : '') + '>' + esc(v[1]) + '</option>';
      }).join('');
    };
    var accts = Object.keys(S.accounts).map(function (k) { return [k, acct(k)]; });

    var body = rows.map(function (e) {
      var r = resolve(e), tx = entryTax(e), d = locked() ? ' disabled' : '';

      return '<tr data-id="' + e.id + '">' +
        '<td><select class="f" data-fld="account" style="width:158px"' + d +
          '>' + opts(accts, e.account) + '</select></td>' +
        '<td><input class="f" data-fld="symbol" list="held-' + e.account +
          '" value="' + esc(e.symbol) + '" style="width:86px;font-family:var(--mono)"' +
          d + '></td>' +
        '<td><select class="f" data-fld="action" style="width:82px"' + d + '>' +
          opts([['sell', 'Sell'], ['buy', 'Buy'], ['hold', 'Hold']], e.action) +
          '</select></td>' +
        '<td><input class="f num" type="number" step="any" data-fld="amount" ' +
          'value="' + (e.amount === null ? '' : e.amount) + '" style="width:84px"' +
          d + '></td>' +
        '<td><select class="f" data-fld="unit" style="width:80px"' + d + '>' +
          opts([['pct', '%'], ['shares', 'sh'], ['usd', '$']], e.unit) +
          '</select></td>' +
        '<td class="num">' + (r.usd === null
          ? '<span class="neg" title="' + (r.badUnit
              ? 'a percentage of a position you do not hold has no meaning'
              : 'no price for this symbol — set one') + '">' +
            (r.badUnit ? 'use $ or shares' : 'needs price') + '</span>'
          : money(r.usd)) + '</td>' +
        '<td class="num ' + (!r.pos || !r.pos.trades_taxable ? 'faint'
          : tx.known ? (tx.tax ? 'neg' : 'faint') : 'neg') + '">' +
          (e.action !== 'sell' ? '$0'
            : !r.pos ? '—' : !r.pos.trades_taxable ? '$0'
            : tx.known ? money(tx.tax) : '?') + '</td>' +
        '<td>' + (r.pos ? (r.pos.trades_taxable
          ? '<span class="badge b-tax">taxable</span>'
          : '<span class="badge b-free">free</span>')
          : '<span class="badge b-new">new</span>') +
          (mixedSources() && e.source === 'claude'
            ? ' <span class="badge b-claude">claude</span>' : '') +
          '</td>' +
        '<td>' + (r.isNew
          ? '<input class="f" data-fld="theme" value="' + esc(e.theme) +
            '" placeholder="theme" style="width:104px" list="themes"' + d + '>'
          : '<span class="tag">' + esc(r.pos ? r.pos.theme : '') + '</span>') +
          '</td>' +
        '<td><input class="f" data-fld="note" value="' + esc(e.note) +
          '" placeholder="why"' + d + '></td>' +
        '<td>' + (locked() ? '' : '<button class="icon" data-del="' + e.id +
          '">×</button>') + '</td></tr>';
    }).join('');

    var lists = Object.keys(S.accounts).map(function (a) {
      return '<datalist id="held-' + a + '">' +
        S.positions.filter(function (p) { return p.account === a; })
          .sort(function (x, y) { return y.market_value - x.market_value; })
          .map(function (p) { return '<option value="' + p.symbol + '">'; })
          .join('') + '</datalist>';
    }).join('') + '<datalist id="themes">' +
      Object.keys(S.positions.reduce(function (m, p) {
        m[p.theme] = 1; return m; }, {})).sort().map(function (t) {
          return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';

    return lists + '<div class="sec"><div class="sec__h"><h2>Decisions</h2>' +
      '<span class="hint">Priced against ' + esc(S.as_of) +
      (quotes ? ' with live quotes' : '') + '</span></div>' +
      (rows.length ? '<div class="scroll"><table class="t"><thead><tr>' +
        '<th>Account</th><th>Symbol</th><th>Action</th><th class="num">Amount</th>' +
        '<th>Unit</th><th class="num">Value</th><th class="num">Tax</th>' +
        '<th></th><th>Theme</th><th style="width:26%">Note</th><th></th>' +
      '</tr></thead><tbody>' +
        body + '</tbody></table></div>'
        : '<div class="empty">Nothing recorded yet.</div>') +
      (locked() ? '' : '<div class="row" style="margin-top:14px">' +
        '<select class="f" id="ad-acct" style="width:170px">' +
          accts.map(function (a) { return '<option value="' + a[0] + '">' +
            esc(a[1]) + '</option>'; }).join('') + '</select>' +
        '<input class="f" id="ad-sym" list="held-' + Object.keys(S.accounts)[0] +
          '" placeholder="symbol" style="width:104px;font-family:var(--mono)">' +
        '<select class="f" id="ad-action" style="width:86px">' +
          '<option value="sell">Sell</option><option value="buy">Buy</option>' +
          '<option value="hold">Hold</option></select>' +
        '<input class="f num" id="ad-amt" type="number" step="any" ' +
          'placeholder="amount" style="width:100px">' +
        '<select class="f" id="ad-unit" style="width:80px">' +
          '<option value="pct">%</option><option value="shares">sh</option>' +
          '<option value="usd">$</option></select>' +
        '<input class="f" id="ad-note" placeholder="note" style="flex:1;min-width:140px">' +
        '<button class="btn filled" id="ad-go">Add</button></div>') +
      '</div>';
  }

  function notesSection() {
    return '<div class="sec"><div class="sec__h"><h2>Notes</h2></div>' +
      '<textarea class="f" id="nt-body" rows="2" style="min-height:44px" ' +
        'placeholder="Record a decision, a constraint, something to come ' +
        'back to…"></textarea>' +
      '<div class="row" style="margin-top:10px;justify-content:flex-end">' +
        '<button class="btn filled" id="nt-add">Add note</button></div>' +
      (noteList.length ? '<div style="margin-top:8px">' + noteList.map(function (n) {
        return '<div class="note"><div class="meta">' +
          new Date(n.created_at).toLocaleString() +
          ' <button class="icon" data-ndel="' + n.id + '">×</button></div>' +
          '<div class="body">' + esc(n.body) + '</div></div>';
      }).join('') + '</div>' : '') + '</div>';
  }

  // ---------- wiring ----------
  function syncSyms() {
    var a = root.querySelector('#ad-acct'), s = root.querySelector('#ad-sym');
    if (!a || !s) return;
    s.setAttribute('list', 'held-' + a.value);
  }
  async function guard(fn) { try { await fn(); } catch (e) { toast(e.message); } }

  function render() {
    var r = rates || T.deriveRates(profile.income || 0, profile.filing);
    var st = Number(profile.state_rate || 0) / 100;
    var summary = '<b>Setup</b> tax profile, targets, constraints' +
      '<span class="sum">' + ((r.ltcg + st) * 100).toFixed(1) + '% LTCG · ' +
      tgts.length + ' targets · ' + cons.length + ' constraints</span>';
    root.innerHTML = scenarioBar() + metrics() +
      '<details class="setup"' + (setupOpen ? ' open' : '') + '>' +
        '<summary>' + summary + '</summary>' +
        '<div class="setup__body">' + taxSection() + targetsSection() +
          constraintsSection() + '</div>' +
      '</details>' +
      entriesSection() + notesSection();
    syncSyms();
    var q = function (s) { return root.querySelector(s); };
    var det = root.querySelector('details.setup');
    if (det) det.addEventListener('toggle', function () { setupOpen = det.open; });

    q('#scn').addEventListener('change', function () {
      window.PortfolioApp.switchScenario(Number(q('#scn').value)); });
    q('#scn-new').addEventListener('click', function () { guard(async function () {
      var name = 'Scenario ' + String.fromCharCode(65 + plans.length);
      var p = await A.createPlan(S._snapshotId, name);
      window.PortfolioApp.scenarioAdded(p);
    }); });
    if (q('#scn-del')) q('#scn-del').addEventListener('click', function () {
      guard(async function () {
        await A.archivePlan(plan.id);
        window.PortfolioApp.scenarioArchived(plan.id);
      }); });
    q('#harv').addEventListener('change', function () {
      useHarvest = q('#harv').checked; render(); window.PortfolioApp.planChanged(); });

    q('#tx-save').addEventListener('click', function () { guard(async function () {
      var inc = parseFloat(q('#tx-income').value);
      var stt = parseFloat(q('#tx-state').value);
      profile = await A.saveSettings({
        income: isNaN(inc) ? null : inc,
        filing: q('#tx-filing').value,
        state_rate: isNaN(stt) ? null : stt });
      window.PortfolioApp.profileChanged(profile);
      toast('Tax profile saved');
    }); });
    if (q('#lock')) q('#lock').addEventListener('click', function () {
      guard(async function () {
        if (!rows.length) { toast('Record at least one decision first'); return; }
        plan = await A.updatePlan(plan.id, { status: 'locked',
          locked_at: new Date().toISOString() });
        toast('Locked — execution plan ready'); render();
        window.PortfolioApp.planChanged();
      }); });
    if (q('#unlock')) q('#unlock').addEventListener('click', function () {
      guard(async function () {
        plan = await A.updatePlan(plan.id, { status: 'draft', locked_at: null });
        render(); window.PortfolioApp.planChanged();
      }); });

    // targets
    if (q('#tg-add')) q('#tg-add').addEventListener('click', function () {
      guard(async function () {
        var key = q('#tg-key').value.trim(); if (!key) return;
        var pct = parseFloat(q('#tg-pct').value);
        var t = await A.upsertTarget(plan.id, { kind: q('#tg-kind').value, key: key,
          target_pct: isNaN(pct) ? null : pct, sort_order: tgts.length });
        var i = tgts.findIndex(function (x) { return x.id === t.id; });
        if (i >= 0) tgts[i] = t; else tgts.push(t);
        render(); window.PortfolioApp.planChanged();
      }); });
    root.querySelectorAll('[data-tf]').forEach(function (el) {
      el.addEventListener('change', function () { guard(async function () {
        var id = Number(el.closest('tr').dataset.tid), f = el.dataset.tf;
        var v = f === 'target_pct' ? (el.value === '' ? null : parseFloat(el.value))
                                   : (el.value || null);
        var patch = {}; patch[f] = v;
        var t = await A.updateTarget(id, patch);
        tgts[tgts.findIndex(function (x) { return x.id === id; })] = t;
        render(); window.PortfolioApp.planChanged();
      }); }); });
    root.querySelectorAll('[data-tdel]').forEach(function (b) {
      b.addEventListener('click', function () { guard(async function () {
        var id = Number(b.dataset.tdel);
        await A.deleteTarget(id);
        tgts = tgts.filter(function (x) { return x.id !== id; });
        render(); window.PortfolioApp.planChanged();
      }); }); });

    // constraints
    if (q('#cn-add')) q('#cn-add').addEventListener('click', function () {
      guard(async function () {
        var label = q('#cn-label').value.trim(); if (!label) return;
        var amt = parseFloat(q('#cn-amt').value);
        var c = await A.addConstraint(plan.id, { kind: q('#cn-kind').value,
          label: label, amount: isNaN(amt) ? null : amt,
          due_date: q('#cn-date').value || null, sort_order: cons.length });
        cons.push(c); render(); window.PortfolioApp.planChanged();
      }); });
    root.querySelectorAll('[data-cf]').forEach(function (el) {
      el.addEventListener('change', function () { guard(async function () {
        var id = Number(el.closest('tr').dataset.cid), f = el.dataset.cf;
        var v = f === 'amount' ? (el.value === '' ? null : parseFloat(el.value))
                               : (el.value || null);
        var patch = {}; patch[f] = v;
        var c = await A.updateConstraint(id, patch);
        cons[cons.findIndex(function (x) { return x.id === id; })] = c;
      }); }); });
    root.querySelectorAll('[data-cdel]').forEach(function (b) {
      b.addEventListener('click', function () { guard(async function () {
        var id = Number(b.dataset.cdel);
        await A.deleteConstraint(id);
        cons = cons.filter(function (x) { return x.id !== id; });
        render();
      }); }); });

    // entries
    if (q('#ad-acct')) q('#ad-acct').addEventListener('change', syncSyms);
    if (q('#ad-go')) q('#ad-go').addEventListener('click', function () {
      guard(async function () {
        var amt = parseFloat(q('#ad-amt').value);
        var e = await A.addEntry(plan.id, {
          account: q('#ad-acct').value, symbol: q('#ad-sym').value,
          action: q('#ad-action').value, unit: q('#ad-unit').value,
          amount: isNaN(amt) ? null : amt, note: q('#ad-note').value || null,
          source: 'haydn', sort_order: rows.length });
        rows.push(e); render(); window.PortfolioApp.planChanged();
      }); });
    root.querySelectorAll('[data-fld]').forEach(function (el) {
      el.addEventListener('change', function () { guard(async function () {
        var id = Number(el.closest('tr').dataset.id), f = el.dataset.fld;
        var v = el.value;
        if (f === 'amount') v = v === '' ? null : parseFloat(v);
        if (f === 'note' || f === 'theme') v = v || null;
        if (f === 'symbol') v = (v || '').trim().toUpperCase();
        if (f === 'price') v = v === '' ? null : parseFloat(v);
        var patch = {}; patch[f] = v;
        var u = await A.updateEntry(id, patch);
        rows[rows.findIndex(function (r) { return r.id === id; })] = u;
        render(); window.PortfolioApp.planChanged();
      }); }); });
    root.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { guard(async function () {
        var id = Number(b.dataset.del);
        await A.deleteEntry(id);
        rows = rows.filter(function (r) { return r.id !== id; });
        render(); window.PortfolioApp.planChanged();
      }); }); });

    // notes
    q('#nt-add').addEventListener('click', function () { guard(async function () {
      var b = q('#nt-body').value.trim(); if (!b) return;
      var n = await A.addNote(plan.id, b);
      noteList.unshift(n); render();
    }); });
    root.querySelectorAll('[data-ndel]').forEach(function (b) {
      b.addEventListener('click', function () { guard(async function () {
        var id = Number(b.dataset.ndel);
        await A.deleteNote(id);
        noteList = noteList.filter(function (n) { return n.id !== id; });
        render();
      }); }); });
  }

  function mount(el, snap, allPlans, curPlan, e, t, c, n) {
    root = el; S = snap; plans = allPlans; plan = curPlan;
    rows = e; tgts = t; cons = c; noteList = n;
    render();
  }
  function setQuotes(q) { quotes = q; if (root) render(); }
  function setProfile(p, r) {
    profile = p || {}; rates = r;
    // default the scenario rate to the derived LTCG rate
    if (r && r.ltcg) rate = r.ltcg + (Number(profile.state_rate || 0) / 100);
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
