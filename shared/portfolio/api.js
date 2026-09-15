// api.js — Supabase data layer for the portfolio workspace.
//
// Every table here is gated by RLS on public.is_owner(). A signed-in non-owner
// gets zero rows and a denied write; anon does not even hold the table grant.
// Nothing in this file is a security boundary — the database is.

window.PFApi = (function () {
  'use strict';
  var sb = null;

  function init(client) { sb = client; }

  function fail(ctx, error) {
    console.error('[portfolio] ' + ctx, error);
    throw new Error(ctx + ': ' + (error.message || 'request failed'));
  }

  // ---- snapshot (read-only) -------------------------------------------
  async function latestSnapshot() {
    var r = await sb.from('portfolio_snapshots')
      .select('id, as_of, label, data')
      .order('as_of', { ascending: false })
      .limit(1);
    if (r.error) fail('load snapshot', r.error);
    return r.data && r.data.length ? r.data[0] : null;
  }

  // ---- plan ------------------------------------------------------------
  async function planFor(snapshotId) {
    var r = await sb.from('portfolio_plans')
      .select('*').eq('snapshot_id', snapshotId)
      .order('id', { ascending: true }).limit(1);
    if (r.error) fail('load plan', r.error);
    if (r.data && r.data.length) return r.data[0];

    var c = await sb.from('portfolio_plans')
      .insert({ snapshot_id: snapshotId, name: 'Working plan', status: 'draft' })
      .select().single();
    if (c.error) fail('create plan', c.error);
    return c.data;
  }

  async function updatePlan(planId, patch) {
    var r = await sb.from('portfolio_plans').update(patch)
      .eq('id', planId).select().single();
    if (r.error) fail('update plan', r.error);
    return r.data;
  }

  // ---- entries ---------------------------------------------------------
  async function entries(planId) {
    var r = await sb.from('portfolio_plan_entries')
      .select('*').eq('plan_id', planId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (r.error) fail('load entries', r.error);
    return r.data || [];
  }

  async function addEntry(planId, row) {
    var r = await sb.from('portfolio_plan_entries')
      .insert(Object.assign({ plan_id: planId }, row)).select().single();
    if (r.error) fail('add entry', r.error);
    return r.data;
  }

  async function updateEntry(id, patch) {
    var r = await sb.from('portfolio_plan_entries').update(patch)
      .eq('id', id).select().single();
    if (r.error) fail('update entry', r.error);
    return r.data;
  }

  async function deleteEntry(id) {
    var r = await sb.from('portfolio_plan_entries').delete().eq('id', id);
    if (r.error) fail('delete entry', r.error);
  }

  // ---- notes -----------------------------------------------------------
  async function notes(planId) {
    var r = await sb.from('portfolio_notes')
      .select('*').eq('plan_id', planId)
      .order('created_at', { ascending: false });
    if (r.error) fail('load notes', r.error);
    return r.data || [];
  }

  async function addNote(planId, body, symbol) {
    var r = await sb.from('portfolio_notes')
      .insert({ plan_id: planId, body: body, symbol: symbol || null })
      .select().single();
    if (r.error) fail('add note', r.error);
    return r.data;
  }

  async function deleteNote(id) {
    var r = await sb.from('portfolio_notes').delete().eq('id', id);
    if (r.error) fail('delete note', r.error);
  }

  return { init: init, latestSnapshot: latestSnapshot, planFor: planFor,
           updatePlan: updatePlan, entries: entries, addEntry: addEntry,
           updateEntry: updateEntry, deleteEntry: deleteEntry,
           notes: notes, addNote: addNote, deleteNote: deleteNote };
})();
