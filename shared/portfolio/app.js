// app.js — boot, tabs, scenario switching, live quotes.

window.PortfolioApp = (function () {
  'use strict';
  var snapshot, data, plans = [], plan, entries = [], targets = [],
      constraints = [], notes = [], quotes = null, current = 'overview',
      profile = {}, rates = null;

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


  function applyProfile(p) {
    profile = p || {};
    // Pass income through unchanged — `|| 0` would erase the difference
    // between "not configured" and "zero", which is what deriveRates needs to
    // know before it reports a 0% rate as though it were an answer.
    rates = window.PFTax.deriveRates(profile.income, profile.filing, profile.state);
    window.PFOverview.setRates(rates);
    window.PFWorkspace.setProfile(profile, rates);
    planChanged();
  }
  function profileChanged(p) { applyProfile(p); }

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
    // Carry asset_class so the server can route by what a thing IS rather than
    // by what its ticker spells, and keep the snapshot price so we can reject
    // a quote that clearly belongs to a different instrument.
    var seen = {}, items = [], ref = {};
    data.positions.forEach(function (p) {
      if (ref[p.symbol] === undefined) ref[p.symbol] = p.price;
      if (seen[p.symbol]) return;
      seen[p.symbol] = 1;
      items.push({ symbol: p.symbol, asset_class: p.asset_class || '' });
    });
    var syms = items.map(function (it) { return it.symbol; });
    var btn = el('pf-refresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
    try {
      var r = await window.PFApi.quotes(items);
      quotes = plausible(r.quotes || {}, ref);
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

  // A ticker namespace collision prices the wrong instrument and says nothing
  // about it. Nothing we hold moves 5x against yesterday's close, so treat that
  // as a bad match and keep the snapshot price instead.
  function plausible(q, ref) {
    var out = {}, bad = [];
    Object.keys(q).forEach(function (sym) {
      var base = ref[sym], live = q[sym];
      if (base > 0 && (live > base * 5 || live < base / 5)) { bad.push(sym); return; }
      out[sym] = live;
    });
    if (bad.length) console.warn('quotes rejected as implausible:', bad.join(', '));
    return out;
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

    try { profile = await window.PFApi.settings(); }
    catch (e) {
      // Swallowing this rendered an unconfigured 0% tax rate that was
      // indistinguishable from a real answer.
      profile = {};
      toast('Tax profile did not load — rates shown are defaults. ' + e.message);
    }

    el('pf-asof').textContent = 'as of ' + data.as_of;

    if (window.PFHistory) await window.PFHistory.init(snapshot);
    window.PFOverview.mount(el('view-overview'), data);
    mountWorkspace();
    applyProfile(profile);

    el('pf-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.pf-tab'); if (b) show(b.dataset.tab); });
    el('pf-refresh').addEventListener('click', function () { refreshQuotes(false); });

    el('pf-gate').hidden = true;
    el('pf-app').hidden = false;

    refreshQuotes(true);   // best-effort; snapshot prices stand if it fails
  }

  return { boot: boot, toast: toast, planChanged: planChanged,
           profileChanged: profileChanged,
           switchScenario: switchScenario, scenarioAdded: scenarioAdded,
           scenarioArchived: scenarioArchived };
})();
