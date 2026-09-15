// history.js — snapshot history and "what would that composition be worth now".
//
// Every saved snapshot keeps its own prices, so any two can price each other.
// Holding composition A constant and re-pricing it at B's prices answers what
// the older allocation would have done, which is the only honest way to compare
// portfolio states without a separate price history table.

window.PFHistory = (function () {
  'use strict';
  var C = window.PFCharts;
  var A = window.PFApi;
  var index = [], current = null, cache = {}, pick = null, quotes = null;
  var root = null, open = false;

  var money = C.money, esc = C.esc;
  var pctf = function (n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; };

  // price map from a snapshot's own positions
  function priceMap(data) {
    var m = {};
    (data.positions || []).forEach(function (p) { m[p.symbol] = p.price; });
    return m;
  }

  // value composition `data` using `prices`; symbols with no price keep their own
  function valueAt(data, prices) {
    var total = 0, priced = 0, missing = [];
    (data.positions || []).forEach(function (p) {
      var px = prices[p.symbol];
      if (px === undefined) { total += p.market_value; missing.push(p.symbol); }
      else { total += p.qty * px; priced += p.qty * px; }
    });
    (data.options || []).forEach(function (o) { total += o.market_value; });
    return { total: total, priced: priced, missing: missing };
  }

  async function ensure(id) {
    if (cache[id]) return cache[id];
    var snap = await A.snapshot(id);
    cache[id] = snap;
    return snap;
  }

  function summary() {
    if (!pick || !current) return '';
    var base = cache[pick];
    if (!base) return '<div class="faint" style="font-size:12.5px">Loading…</div>';

    // today's prices: live quotes when we have them, else the current snapshot
    var today = Object.assign({}, priceMap(current.data), quotes || {});
    var was = base.data.total_value;
    var now = valueAt(base.data, today);
    var cur = valueAt(current.data, today);

    var d = now.total - was;
    var dPct = was ? d / was * 100 : 0;
    var curWas = current.data.total_value;
    var curD = cur.total - curWas;
    var curDPct = curWas ? curD / curWas * 100 : 0;

    var rows = [
      ['Composition of ' + base.as_of, was, now.total, dPct],
      ['Composition of ' + current.as_of, curWas, cur.total, curDPct],
    ];

    return '<div class="grid2" style="gap:28px;margin-top:6px">' +
      '<div><table class="t"><thead><tr><th>Composition</th>' +
      '<th class="num">As saved</th><th class="num">At today\'s prices</th>' +
      '<th class="num">Change</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="dim">' + esc(r[0]) + '</td>' +
          '<td class="num dim">' + money(r[1]) + '</td>' +
          '<td class="num">' + money(r[2]) + '</td>' +
          '<td class="num ' + (r[3] >= 0 ? 'pos' : 'neg') + '">' +
            pctf(r[3]) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (now.missing.length ? '<div class="faint" style="font-size:12px;' +
        'margin-top:10px">No current price for ' +
        esc(now.missing.slice(0, 6).join(', ')) +
        (now.missing.length > 6 ? ' +' + (now.missing.length - 6) + ' more' : '') +
        ' — those are held at their saved value.</div>' : '') +
      '</div>' +
      '<div><div class="faint" style="font-size:12.5px;margin-bottom:10px">' +
        'Same prices applied to both compositions, so the difference is ' +
        'allocation alone.</div>' +
        C.hbars([
          { label: base.as_of, value: Math.max(0, now.total), note: pctf(dPct) },
          { label: current.as_of, value: Math.max(0, cur.total), note: pctf(curDPct) },
        ], { width: 380, labelW: 86 }) +
      '</div></div>';
  }

  function render() {
    if (!index.length) { root.innerHTML = ''; return; }
    root.innerHTML = '<div class="sec"><div class="sec__h">' +
      '<h2>History</h2>' +
      '<span class="hint">' + index.length + ' saved snapshot' +
        (index.length === 1 ? '' : 's') + '</span>' +
      '<span class="right"><button class="btn outline" id="hist-toggle">' +
        (open ? 'Hide' : 'Compare compositions') + '</button></span></div>' +
      (open ? '<div class="row" style="margin-bottom:14px">' +
        '<span class="faint" style="font-size:12.5px">Re-price the composition ' +
        'saved on</span><select class="f" id="hist-pick" style="width:190px">' +
        index.map(function (s) {
          return '<option value="' + s.id + '"' +
            (String(s.id) === String(pick) ? ' selected' : '') + '>' +
            esc(s.as_of) + ' · ' + money(s.total_value) + '</option>';
        }).join('') + '</select>' +
        '<span class="faint" style="font-size:12.5px">at today\'s prices</span>' +
        '</div>' + summary() : '');

    var t = root.querySelector('#hist-toggle');
    if (t) t.addEventListener('click', async function () {
      open = !open;
      if (open && !pick && index.length) { pick = index[0].id; await ensure(pick); }
      render();
    });
    var sel = root.querySelector('#hist-pick');
    if (sel) sel.addEventListener('change', async function () {
      pick = sel.value; await ensure(pick); render();
    });
  }

  async function init(currentSnapshot) {
    current = currentSnapshot;
    cache[current.id] = current;
    try { index = await A.snapshotIndex(); } catch (e) { index = []; }
  }
  function setQuotes(q) { quotes = q; if (root && open) render(); }
  function mount(el) { root = el; render(); }

  return { init: init, mount: mount, setQuotes: setQuotes };
})();
