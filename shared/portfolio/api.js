// api.js — Supabase data layer.
//
// Every table is gated by RLS on public.is_owner(); a signed-in non-owner gets
// zero rows and a denied write, and anon holds no grant at all. Nothing here is
// a security boundary — the database is.

window.PFApi = (function () {
  'use strict';
  var sb = null;

  function init(client) { sb = client; }
  function fail(ctx, error) {
    console.error('[portfolio] ' + ctx, error);
    throw new Error(ctx + ': ' + (error.message || 'request failed'));
  }
  async function one(q, ctx) {
    var r = await q; if (r.error) fail(ctx, r.error); return r.data;
  }

  // ---- snapshots (read-only) ------------------------------------------
  async function latestSnapshot() {
    var d = await one(sb.from('portfolio_snapshots')
      .select('id, as_of, label, data')
      .order('as_of', { ascending: false }).limit(1), 'load snapshot');
    return d && d.length ? d[0] : null;
  }
  async function snapshotIndex() {
    return await one(sb.from('portfolio_snapshot_index').select('*'),
      'load snapshot index');
  }
  async function snapshot(id) {
    return await one(sb.from('portfolio_snapshots')
      .select('id, as_of, label, data').eq('id', id).single(), 'load snapshot');
  }

  // ---- scenarios -------------------------------------------------------
  async function plans(snapshotId) {
    var rows = await one(sb.from('portfolio_plans').select('*')
      .eq('snapshot_id', snapshotId).eq('archived', false)
      .order('is_primary', { ascending: false })
      .order('id', { ascending: true }), 'load scenarios');
    if (rows.length) return rows;
    var made = await one(sb.from('portfolio_plans').insert({
      snapshot_id: snapshotId, name: 'Scenario A', status: 'draft',
      is_primary: true }).select().single(), 'create scenario');
    return [made];
  }
  async function createPlan(snapshotId, name) {
    return await one(sb.from('portfolio_plans').insert({
      snapshot_id: snapshotId, name: name, status: 'draft' })
      .select().single(), 'create scenario');
  }
  async function updatePlan(id, patch) {
    return await one(sb.from('portfolio_plans').update(patch).eq('id', id)
      .select().single(), 'update scenario');
  }
  async function archivePlan(id) {
    return await one(sb.from('portfolio_plans').update({ archived: true })
      .eq('id', id).select().single(), 'archive scenario');
  }

  // ---- entries ---------------------------------------------------------
  async function entries(planId) {
    return await one(sb.from('portfolio_plan_entries').select('*')
      .eq('plan_id', planId).order('sort_order', { ascending: true })
      .order('id', { ascending: true }), 'load entries');
  }
  async function addEntry(planId, row) {
    return await one(sb.from('portfolio_plan_entries')
      .insert(Object.assign({ plan_id: planId }, row)).select().single(),
      'add entry');
  }
  async function updateEntry(id, patch) {
    return await one(sb.from('portfolio_plan_entries').update(patch)
      .eq('id', id).select().single(), 'update entry');
  }
  async function deleteEntry(id) {
    await one(sb.from('portfolio_plan_entries').delete().eq('id', id),
      'delete entry');
  }

  // ---- targets ---------------------------------------------------------
  async function targets(planId) {
    return await one(sb.from('portfolio_targets').select('*')
      .eq('plan_id', planId).order('sort_order', { ascending: true })
      .order('id', { ascending: true }), 'load targets');
  }
  async function upsertTarget(planId, row) {
    return await one(sb.from('portfolio_targets')
      .upsert(Object.assign({ plan_id: planId }, row),
              { onConflict: 'plan_id,kind,key' }).select().single(),
      'save target');
  }
  async function updateTarget(id, patch) {
    return await one(sb.from('portfolio_targets').update(patch).eq('id', id)
      .select().single(), 'update target');
  }
  async function deleteTarget(id) {
    await one(sb.from('portfolio_targets').delete().eq('id', id), 'delete target');
  }

  // ---- constraints -----------------------------------------------------
  async function constraints(planId) {
    return await one(sb.from('portfolio_constraints').select('*')
      .eq('plan_id', planId).order('sort_order', { ascending: true })
      .order('id', { ascending: true }), 'load constraints');
  }
  async function addConstraint(planId, row) {
    return await one(sb.from('portfolio_constraints')
      .insert(Object.assign({ plan_id: planId }, row)).select().single(),
      'add constraint');
  }
  async function updateConstraint(id, patch) {
    return await one(sb.from('portfolio_constraints').update(patch).eq('id', id)
      .select().single(), 'update constraint');
  }
  async function deleteConstraint(id) {
    await one(sb.from('portfolio_constraints').delete().eq('id', id),
      'delete constraint');
  }

  // ---- notes -----------------------------------------------------------
  async function notes(planId) {
    return await one(sb.from('portfolio_notes').select('*')
      .eq('plan_id', planId).order('created_at', { ascending: false }),
      'load notes');
  }
  async function addNote(planId, body, symbol) {
    return await one(sb.from('portfolio_notes')
      .insert({ plan_id: planId, body: body, symbol: symbol || null })
      .select().single(), 'add note');
  }
  async function deleteNote(id) {
    await one(sb.from('portfolio_notes').delete().eq('id', id), 'delete note');
  }

  // ---- settings (single owner row) ------------------------------------
  async function settings() {
    var d = await one(sb.from('portfolio_settings').select('profile').eq('id', 1),
      'load settings');
    return (d && d.length ? d[0].profile : null) || {};
  }
  async function saveSettings(patch) {
    // Merge, don't replace: the column is a single JSONB blob, so an update
    // built from three form fields would silently drop every other key.
    var cur = await settings();
    var next = Object.assign({}, cur, patch);
    var d = await one(sb.from('portfolio_settings').update({ profile: next })
      .eq('id', 1).select('profile').single(), 'save settings');
    return d.profile;
  }

  // ---- live quotes -----------------------------------------------------
  // Proxied through an owner-gated edge function: the page CSP only permits
  // this origin, and the symbol list itself reveals holdings.
  // items: [{symbol, asset_class}] — the asset_class is what lets the server
  // route SOL-the-coin away from SOL-the-stock and decline to price cash.
  async function quotes(items) {
    var s = await sb.auth.getSession();
    var token = s.data && s.data.session && s.data.session.access_token;
    if (!token) throw new Error('no session');
    var r = await fetch(window.SUPABASE_URL + '/functions/v1/portfolio-quotes', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items }),
    });
    if (!r.ok) throw new Error('quotes unavailable (' + r.status + ')');
    return await r.json();
  }

  return { init: init, latestSnapshot: latestSnapshot,
           snapshotIndex: snapshotIndex, snapshot: snapshot,
           plans: plans, createPlan: createPlan, updatePlan: updatePlan,
           archivePlan: archivePlan,
           entries: entries, addEntry: addEntry, updateEntry: updateEntry,
           deleteEntry: deleteEntry,
           targets: targets, upsertTarget: upsertTarget,
           updateTarget: updateTarget, deleteTarget: deleteTarget,
           constraints: constraints, addConstraint: addConstraint,
           updateConstraint: updateConstraint, deleteConstraint: deleteConstraint,
           notes: notes, addNote: addNote, deleteNote: deleteNote,
           settings: settings, saveSettings: saveSettings,
           quotes: quotes };
})();
