// app.js — tab controller and boot sequence.

window.PortfolioApp = (function () {
  'use strict';
  var snapshot = null, plan = null, entries = [], notes = [];
  var current = 'overview', mounted = {};

  function el(id) { return document.getElementById(id); }

  function toast(msg) {
    var wrap = el('pf-toast');
    var d = document.createElement('div');
    d.textContent = msg;
    wrap.appendChild(d);
    requestAnimationFrame(function () { d.classList.add('show'); });
    setTimeout(function () {
      d.classList.remove('show');
      setTimeout(function () { d.remove(); }, 250);
    }, 2200);
  }

  function gateFail(msg) {
    var m = el('pf-gate-msg');
    m.textContent = msg;
    m.className = 'pf-gate__msg err';
    var s = document.querySelector('.pf-gate__spin');
    if (s) s.style.display = 'none';
  }

  function show(tab) {
    current = tab;
    ['overview', 'workspace', 'plan'].forEach(function (t) {
      el('view-' + t).hidden = (t !== tab);
    });
    document.querySelectorAll('.pf-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    // tab 3 is derived from tab 2, so always re-render it on entry
    if (tab === 'plan') mountPlan();
    if (tab === 'workspace' && !mounted.workspace) mountWorkspace();
  }

  function mountWorkspace() {
    window.PFWorkspace.mount(el('view-workspace'), snapshot, plan, entries, notes);
    mounted.workspace = true;
  }

  function mountPlan() {
    var st = window.PFWorkspace.state();
    window.PFPlan.mount(el('view-plan'), snapshot,
      st.plan || plan, st.rows || entries, st.resolve);
  }

  function planChanged() { if (current === 'plan') mountPlan(); }

  async function boot(user, sb) {
    // Access is settled by this point; the gate now covers the data load, so
    // say so — otherwise a stall here reads as an auth problem.
    var gm = el('pf-gate-msg');
    if (gm) gm.textContent = 'Loading portfolio…';

    window.PFApi.init(sb);
    try {
      snapshot = await window.PFApi.latestSnapshot();
    } catch (e) {
      gateFail('Could not load portfolio data. ' + e.message);
      return;
    }
    if (!snapshot) {
      // RLS returns zero rows rather than an error for a signed-in non-owner,
      // so an empty result here means "not authorised", not "no data".
      gateFail('This workspace is restricted to its owner. ' +
               'Signed in as ' + (user && user.email ? user.email : 'unknown') + '.');
      return;
    }

    try {
      plan = await window.PFApi.planFor(snapshot.id);
      entries = await window.PFApi.entries(plan.id);
      notes = await window.PFApi.notes(plan.id);
    } catch (e) {
      gateFail('Loaded the snapshot but could not open the plan. ' + e.message);
      return;
    }

    var data = snapshot.data;
    data.as_of = data.as_of || snapshot.as_of;
    el('pf-asof').textContent = 'as of ' + data.as_of + ' · ' +
      (snapshot.label || '');

    window.PFOverview.mount(el('view-overview'), data);
    mounted.overview = true;
    // keep a reference for the other tabs
    snapshot = Object.assign({}, snapshot, { data: data });
    window.PFWorkspace.mount(el('view-workspace'), data, plan, entries, notes);
    mounted.workspace = true;

    el('pf-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.pf-tab');
      if (b) show(b.dataset.tab);
    });

    el('pf-gate').hidden = true;
    el('pf-app').hidden = false;
  }

  return { boot: boot, toast: toast, planChanged: planChanged };
})();
