// app.js — boot, tabs, scenario switching, live quotes.

window.PortfolioApp = (function () {
  'use strict';
  var snapshot, data, plans = [], plan, entries = [], targets = [],
      constraints = [], notes = [], quotes = null, current = 'overview';

  function el(id) { return document.getElementById(id); }

  function toast(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    el('pf-toast').appendChild(d);
    requestAnimationFrame(function () { d.classList.add('show'); });
    setTimeout(function () {
      d.classList.remove('show');
      setTimeout(function () { d.remove(); }, 250);
    }, 2400);
  }

  function gateFail(msg) {
    var m = el('pf-gate-msg');
    m.textContent = msg; m.className = 'pf-gate__msg err';
    var s = document.querySelector('.pf-gate__spin');
    if (s) s.style.display = 'none';
  }

  function show(tab) {
    current = tab;
    ['overview', 'workspace', 'plan'].forEach(function (t) {
      el('view-' + t).hidden = (t !== tab); });
    document.querySelectorAll('.pf-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab); });
    if (tab === 'plan') mountPlan();
  }

  function mountPlan() {
    window.PFPlan.mount(el('view-plan'), data, window.PFWorkspace.state());
  }
  function planChanged() { if (current === 'plan') mountPlan(); }

  function mountWorkspace() {
    window.PFWorkspace.mount(el('view-workspace'), data, plans, plan,
      entries, targets, constraints, notes);
  }

  async function loadScenario(id) {
    plan = plans.find(function (p) { return p.id === id; }) || plans[0];
    entries = await window.PFApi.entries(plan.id);
    targets = await window.PFApi.targets(plan.id);
    constraints = await window.PFApi.constraints(plan.id);
    notes = await window.PFApi.notes(plan.id);
    mountWorkspace(); planChanged();
  }

  async function switchScenario(id) {
    try { await loadScenario(id); } catch (e) { toast(e.message); }
  }
  async function scenarioAdded(p) {
    plans.push(p); await switchScenario(p.id); toast('Created ' + p.name);
  }
  async function scenarioArchived(id) {
    plans = plans.filter(function (p) { return p.id !== id; });
    if (!plans.length) plans = await window.PFApi.plans(snapshot.id);
    await switchScenario(plans[0].id); toast('Archived');
  }

  async function refreshQuotes(silent) {
    var syms = data.positions.map(function (p) { return p.symbol; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var btn = el('pf-refresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
    try {
      var r = await window.PFApi.quotes(syms);
      quotes = r.quotes || {};
      var n = Object.keys(quotes).length;
      window.PFOverview.setQuotes(quotes);
      window.PFWorkspace.setQuotes(quotes);
      if (window.PFHistory) window.PFHistory.setQuotes(quotes);
      planChanged();
      el('pf-quote-note').textContent = n
        ? 'live · ' + new Date().toLocaleTimeString()
        : 'no live prices';
      if (!silent) toast(n + ' of ' + syms.length + ' priced live');
    } catch (e) {
      el('pf-quote-note').textContent = 'live prices unavailable';
      if (!silent) toast(e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh prices'; }
    }
  }

  async function boot(user, sb) {
    window.PFApi.init(sb);
    try { snapshot = await window.PFApi.latestSnapshot(); }
    catch (e) { gateFail('Could not load portfolio data. ' + e.message); return; }

    if (!snapshot) {
      // RLS returns zero rows rather than an error for a signed-in non-owner,
      // so empty means "not authorised", not "no data".
      gateFail('This workspace is restricted to its owner. Signed in as ' +
        ((user && user.email) || 'unknown') + '.');
      return;
    }

    data = snapshot.data;
    data.as_of = data.as_of || snapshot.as_of;
    data._snapshotId = snapshot.id;

    try {
      plans = await window.PFApi.plans(snapshot.id);
      plan = plans[0];
      entries = await window.PFApi.entries(plan.id);
      targets = await window.PFApi.targets(plan.id);
      constraints = await window.PFApi.constraints(plan.id);
      notes = await window.PFApi.notes(plan.id);
    } catch (e) {
      gateFail('Loaded the snapshot but could not open the scenario. ' + e.message);
      return;
    }

    el('pf-asof').textContent = 'as of ' + data.as_of;

    if (window.PFHistory) await window.PFHistory.init(snapshot);
    window.PFOverview.mount(el('view-overview'), data);
    mountWorkspace();

    el('pf-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.pf-tab'); if (b) show(b.dataset.tab); });
    el('pf-refresh').addEventListener('click', function () { refreshQuotes(false); });

    el('pf-gate').hidden = true;
    el('pf-app').hidden = false;

    refreshQuotes(true);   // best-effort; snapshot prices stand if it fails
  }

  return { boot: boot, toast: toast, planChanged: planChanged,
           switchScenario: switchScenario, scenarioAdded: scenarioAdded,
           scenarioArchived: scenarioArchived };
})();
