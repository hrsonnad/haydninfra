// workspace.js — Tab 2. A place to RECORD the rebalancing decisions we work
// out in conversation, plus a running notes log.
//
// Intentionally not a model: it does not propose trims, optimise anything, or
// second-guess an entry. It resolves each recorded amount into dollars purely
// so the line reads back sensibly, and it totals the columns. The thinking
// happens elsewhere; this is the ledger.

window.PFWorkspace = (function () {
  'use strict';
  var C = window.PFCharts, A = window.PFApi;
  var S = null, plan = null, rows = [], noteList = [], root = null;
  var esc = function (s) { return C.esc(s || ''); };
  var money = function (n) {
    return (n < 0 ? '-$' : '$') +
      Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  function posFor(account, symbol) {
    return S.positions.find(function (p) {
      return p.account === account && p.symbol === symbol; }) || null;
  }

  // Resolve a recorded amount into dollars / shares for display only.
  function resolve(e) {
    var p = posFor(e.account, e.symbol);
    if (!p || e.amount === null || e.amount === undefined) {
      return { usd: null, shares: null, pos: p };
    }
    var a = Number(e.amount);
    if (e.unit === 'pct')    return { usd: p.market_value * a / 100,
                                      shares: p.qty * a / 100, pos: p };
    if (e.unit === 'shares') return { usd: a * p.price, shares: a, pos: p };
    return { usd: a, shares: p.price ? a / p.price : null, pos: p };
  }

  function toast(m) { window.PortfolioApp.toast(m); }
  var locked = function () { return plan.status !== 'draft'; };

  // ---- header ----------------------------------------------------------
  function header() {
    var st = plan.status;
    return '<div class="pf-panel pf-pad" style="margin-bottom:14px">' +
      '<div class="pf-row" style="justify-content:space-between">' +
        '<div class="pf-row">' +
          '<input class="f" id="pf-plan-name" value="' + esc(plan.name) +
            '" style="width:230px;font-weight:600"' + (locked() ? ' disabled' : '') + '>' +
          '<span class="badge b-' + (st === 'draft' ? 'draft' : 'locked') + '">' +
            st + '</span>' +
          (plan.locked_at ? '<span class="faint" style="font-size:11px">locked ' +
            new Date(plan.locked_at).toLocaleString() + '</span>' : '') +
        '</div>' +
        '<div class="pf-row">' +
          (locked()
            ? '<button class="btn" id="pf-unlock">Reopen as draft</button>'
            : '<button class="btn primary" id="pf-lock">Lock plan &rarr;</button>') +
        '</div>' +
      '</div>' +
      '<textarea class="f" id="pf-plan-summary" placeholder="What this plan is ' +
        'trying to achieve — the reasoning, in your words." style="margin-top:9px"' +
        (locked() ? ' disabled' : '') + '>' + esc(plan.summary) + '</textarea>' +
      '</div>';
  }

  // ---- entries ---------------------------------------------------------
  function entryTable() {
    if (!rows.length) {
      return '<div class="pf-panel"><div class="empty">No entries yet. ' +
        'Add the first decision below as we work through it.</div></div>';
    }
    var tSell = 0, tBuy = 0;
    var body = rows.map(function (e) {
      var r = resolve(e);
      if (r.usd !== null) { if (e.action === 'sell') tSell += r.usd;
                            else if (e.action === 'buy') tBuy += r.usd; }
      var opts = function (list, cur) {
        return list.map(function (v) {
          return '<option value="' + esc(v[0]) + '"' +
            (v[0] === cur ? ' selected' : '') + '>' + esc(v[1]) + '</option>';
        }).join('');
      };
      var accts = Object.keys(S.accounts).map(function (k) {
        return [k, S.accounts[k].label.replace('Robinhood ', 'RH ')
                                      .replace('Schwab ', '')]; });
      var syms = S.positions.filter(function (p) { return p.account === e.account; })
        .map(function (p) { return [p.symbol, p.symbol]; });
      if (!syms.some(function (s) { return s[0] === e.symbol; }))
        syms.unshift([e.symbol, e.symbol]);
      var d = locked() ? ' disabled' : '';

      return '<tr data-id="' + e.id + '">' +
        '<td><select class="f" data-fld="account"' + d + '>' +
          opts(accts, e.account) + '</select></td>' +
        '<td><select class="f" data-fld="symbol"' + d + '>' +
          opts(syms, e.symbol) + '</select></td>' +
        '<td><select class="f" data-fld="action"' + d + '>' +
          opts([['sell', 'Sell'], ['buy', 'Buy'], ['hold', 'Hold']], e.action) +
          '</select></td>' +
        '<td><input class="f num" type="number" step="any" data-fld="amount" ' +
          'value="' + (e.amount === null ? '' : e.amount) + '" style="width:82px"' + d + '></td>' +
        '<td><select class="f" data-fld="unit" style="width:74px"' + d + '>' +
          opts([['pct', '%'], ['shares', 'shares'], ['usd', '$']], e.unit) +
          '</select></td>' +
        '<td class="num ' + (e.action === 'sell' ? 'neg' : e.action === 'buy' ? 'pos' : 'faint') +
          '">' + (r.usd === null ? '<span class="faint">—</span>' :
            (e.action === 'sell' ? '−' : e.action === 'buy' ? '+' : '') + money(r.usd)) +
          '</td>' +
        '<td class="num faint" style="font-size:11px">' +
          (r.shares === null ? '—' : r.shares.toLocaleString('en-US',
            { maximumFractionDigits: 4 }) + ' sh') + '</td>' +
        '<td>' + (r.pos ? (r.pos.trades_taxable
          ? '<span class="badge b-tax">taxable</span>'
          : '<span class="badge b-free">tax-free</span>') :
          '<span class="faint" style="font-size:10.5px">not held</span>') + '</td>' +
        '<td><input class="f" data-fld="note" value="' + esc(e.note) +
          '" placeholder="why"' + d + '></td>' +
        '<td>' + (locked() ? '' :
          '<button class="icon" data-del="' + e.id + '" title="Remove">×</button>') +
          '</td></tr>';
    }).join('');

    return '<div class="pf-panel pf-scroll"><table class="pf-t">' +
      '<thead><tr><th>Account</th><th>Symbol</th><th>Action</th>' +
      '<th class="num">Amount</th><th>Unit</th><th class="num">Value</th>' +
      '<th class="num">Shares</th><th>Tax</th><th style="width:26%">Note</th>' +
      '<th></th></tr></thead><tbody>' + body + '</tbody>' +
      '<tfoot><tr><td colspan="5" class="dim">' + rows.length + ' entries</td>' +
      '<td class="num">' + (tSell ? '−' + money(tSell) : '—') +
        (tBuy ? ' / +' + money(tBuy) : '') + '</td>' +
      '<td colspan="4"></td></tr></tfoot></table></div>';
  }

  function addBar() {
    if (locked()) return '';
    var accts = Object.keys(S.accounts).map(function (k) {
      return '<option value="' + k + '">' +
        esc(S.accounts[k].label.replace('Robinhood ', 'RH ').replace('Schwab ', '')) +
        '</option>'; }).join('');
    return '<div class="pf-panel pf-pad" style="margin-top:8px">' +
      '<div class="pf-row">' +
        '<select class="f" id="add-acct" style="width:180px">' + accts + '</select>' +
        '<select class="f" id="add-sym" style="width:110px"></select>' +
        '<select class="f" id="add-action" style="width:90px">' +
          '<option value="sell">Sell</option><option value="buy">Buy</option>' +
          '<option value="hold">Hold</option></select>' +
        '<input class="f num" id="add-amt" type="number" step="any" ' +
          'placeholder="amount" style="width:96px">' +
        '<select class="f" id="add-unit" style="width:84px">' +
          '<option value="pct">%</option><option value="shares">shares</option>' +
          '<option value="usd">$</option></select>' +
        '<input class="f" id="add-note" placeholder="note (optional)" style="flex:1;min-width:150px">' +
        '<button class="btn primary" id="add-go">Add entry</button>' +
      '</div></div>';
  }

  function notesPanel() {
    return '<h2 class="pf-h">Notes log</h2>' +
      '<div class="pf-panel pf-pad">' +
        '<textarea class="f" id="note-body" placeholder="Record a decision, a ' +
          'constraint, a question to come back to…"></textarea>' +
        '<div class="pf-row" style="margin-top:8px;justify-content:flex-end">' +
          '<button class="btn primary" id="note-add">Add note</button></div>' +
      '</div>' +
      '<div class="pf-panel" style="margin-top:10px">' +
        (noteList.length ? noteList.map(function (n) {
          return '<div class="note-item"><div class="meta">' +
            new Date(n.created_at).toLocaleString() +
            (n.symbol ? ' · <b>' + esc(n.symbol) + '</b>' : '') +
            ' <button class="icon" data-delnote="' + n.id + '" title="Delete">×</button>' +
            '</div><div class="body">' + esc(n.body) + '</div></div>';
        }).join('') : '<div class="empty">No notes yet.</div>') +
      '</div>';
  }

  // ---- wiring ----------------------------------------------------------
  function syncSymbolOptions() {
    var a = root.querySelector('#add-acct'), s = root.querySelector('#add-sym');
    if (!a || !s) return;
    s.innerHTML = S.positions.filter(function (p) { return p.account === a.value; })
      .sort(function (x, y) { return y.market_value - x.market_value; })
      .map(function (p) { return '<option value="' + p.symbol + '">' +
        p.symbol + '</option>'; }).join('');
  }

  function render() {
    root.innerHTML = header() +
      '<h2 class="pf-h">Plan entries</h2>' +
      '<div class="faint" style="font-size:11.5px;margin-bottom:8px">' +
        'A record of what we decide, not a calculator. Values resolve against ' +
        'the ' + esc(S.as_of) + ' snapshot so each line reads back in dollars.' +
      '</div>' +
      entryTable() + addBar() + notesPanel();

    syncSymbolOptions();
    var q = function (s) { return root.querySelector(s); };

    if (q('#add-acct')) q('#add-acct').addEventListener('change', syncSymbolOptions);
    if (q('#add-go')) q('#add-go').addEventListener('click', async function () {
      var amt = parseFloat(q('#add-amt').value);
      try {
        var r = await A.addEntry(plan.id, {
          account: q('#add-acct').value, symbol: q('#add-sym').value,
          action: q('#add-action').value, unit: q('#add-unit').value,
          amount: isNaN(amt) ? null : amt, note: q('#add-note').value || null,
          sort_order: rows.length
        });
        rows.push(r); toast('Entry added'); render();
      } catch (e) { toast(e.message); }
    });

    root.querySelectorAll('tbody [data-fld]').forEach(function (el) {
      el.addEventListener('change', async function () {
        var id = Number(el.closest('tr').dataset.id);
        var fld = el.dataset.fld;
        var val = el.value;
        if (fld === 'amount') val = val === '' ? null : parseFloat(val);
        if (fld === 'note') val = val || null;
        var patch = {}; patch[fld] = val;
        try {
          var upd = await A.updateEntry(id, patch);
          var i = rows.findIndex(function (r) { return r.id === id; });
          rows[i] = upd; toast('Saved'); render();
        } catch (e) { toast(e.message); }
      });
    });

    root.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = Number(b.dataset.del);
        try {
          await A.deleteEntry(id);
          rows = rows.filter(function (r) { return r.id !== id; });
          toast('Removed'); render();
        } catch (e) { toast(e.message); }
      });
    });

    if (q('#note-add')) q('#note-add').addEventListener('click', async function () {
      var b = q('#note-body').value.trim();
      if (!b) return;
      try {
        var n = await A.addNote(plan.id, b);
        noteList.unshift(n); toast('Note added'); render();
      } catch (e) { toast(e.message); }
    });
    root.querySelectorAll('[data-delnote]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = Number(b.dataset.delnote);
        try {
          await A.deleteNote(id);
          noteList = noteList.filter(function (n) { return n.id !== id; });
          toast('Note deleted'); render();
        } catch (e) { toast(e.message); }
      });
    });

    ['#pf-plan-name', '#pf-plan-summary'].forEach(function (sel) {
      var el = q(sel); if (!el || el.disabled) return;
      el.addEventListener('blur', async function () {
        var patch = sel === '#pf-plan-name' ? { name: el.value }
                                            : { summary: el.value };
        try { plan = await A.updatePlan(plan.id, patch); toast('Saved'); }
        catch (e) { toast(e.message); }
      });
    });

    if (q('#pf-lock')) q('#pf-lock').addEventListener('click', async function () {
      if (!rows.length) { toast('Add at least one entry before locking'); return; }
      try {
        plan = await A.updatePlan(plan.id,
          { status: 'locked', locked_at: new Date().toISOString() });
        toast('Plan locked — execution plan is ready on tab 3');
        render(); window.PortfolioApp.planChanged();
      } catch (e) { toast(e.message); }
    });
    if (q('#pf-unlock')) q('#pf-unlock').addEventListener('click', async function () {
      try {
        plan = await A.updatePlan(plan.id, { status: 'draft', locked_at: null });
        toast('Reopened as draft'); render(); window.PortfolioApp.planChanged();
      } catch (e) { toast(e.message); }
    });
  }

  function mount(el, snapshot, planRow, entryRows, notes) {
    root = el; S = snapshot; plan = planRow; rows = entryRows; noteList = notes;
    render();
  }
  function state() { return { plan: plan, rows: rows, resolve: resolve }; }
  return { mount: mount, state: state };
})();
