// photo-api client: authenticated fetch + batched presigned-URL requests.
// Every call carries the user's Supabase JWT; the server enforces owner-only.
(function () {
  'use strict';
  var BASE = SUPABASE_URL + '/functions/v1/photo-api/';

  function getToken(force) {
    var auth = window.adminSupabase.auth;
    // getSession() hands back whatever is in storage. When the background
    // refresh has failed — which it does in this app, because the private pages
    // run in an iframe and parent + frame contend on the same navigator.locks
    // entry — that is an *expired* access_token, and photo-api answers 401.
    // `force` asks GoTrue for a new one with the refresh token.
    var p = force && auth.refreshSession
      ? auth.refreshSession().then(function (r) {
          return r.data && r.data.session ? r : auth.getSession();
        })
      : auth.getSession();
    return p.then(function (r) {
      return r.data && r.data.session ? r.data.session.access_token : null;
    }).catch(function () { return null; });
  }

  function send(path, opts, token) {
    var headers = { 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body || undefined,
    });
  }

  function call(path, opts) {
    opts = opts || {};
    return getToken(false).then(function (t) {
      if (!t) return refreshAndRetry(path, opts);
      return send(path, opts, t).then(function (res) {
        // One forced refresh before believing a 401: a stale token looks exactly
        // like being signed out, and telling a signed-in owner to sign in again
        // is the bug, not the session.
        if (res.status === 401) return refreshAndRetry(path, opts);
        return res;
      });
    }).then(function (res) {
      if (!res.ok) { var e = new Error('api ' + res.status); e.status = res.status; throw e; }
      return res.json();
    });
  }

  function refreshAndRetry(path, opts) {
    return getToken(true).then(function (t) {
      if (!t) { var e = new Error('signed out'); e.status = 401; throw e; }
      return send(path, opts, t);
    });
  }

  // ---- thumb URL batching (<=200 per call), cached until near expiry ----
  var cache = Object.create(null);   // id -> {url, exp}
  var waiting = Object.create(null); // id -> [resolve...]
  var queue = [];
  var timer = null;

  function thumb(id) {
    var c = cache[id];
    if (c && c.exp > Date.now() + 10000) return Promise.resolve(c.url);
    return new Promise(function (resolve) {
      if (!waiting[id]) { waiting[id] = []; queue.push(id); }
      waiting[id].push(resolve);
      if (!timer) timer = setTimeout(flush, 120);
    });
  }

  function flush() {
    timer = null;
    if (!queue.length) return;
    var ids = queue.splice(0, 200);
    if (queue.length) timer = setTimeout(flush, 30);
    call('sign', { method: 'POST', body: JSON.stringify({ kind: 'thumb', ids: ids }) })
      .then(function (r) {
        var exp = Date.now() + Math.max(60, (r.expires_in || 900) - 60) * 1000;
        ids.forEach(function (id) {
          var u = r.urls[id] || null;
          if (u) cache[id] = { url: u, exp: exp };
          (waiting[id] || []).forEach(function (fn) { fn(u); });
          delete waiting[id];
        });
      })
      .catch(function () {
        ids.forEach(function (id) {
          (waiting[id] || []).forEach(function (fn) { fn(null); });
          delete waiting[id];
        });
      });
  }

  window.PhotoAPI = {
    library: function () { return call('library'); },
    search: function (q) { return call('search?q=' + encodeURIComponent(q)); },
    photo: function (id) { return call('photo/' + id); },
    people: function () { return call('people'); },
    updatePerson: function (id, patch) {
      return call('people/' + id, { method: 'POST', body: JSON.stringify(patch) });
    },
    setTier: function (id, tier) {
      return call('photo/' + id + '/tier', { method: 'POST', body: JSON.stringify({ tier: tier }) });
    },
    thumb: thumb,
    dropCached: function (id) { delete cache[id]; },
  };
})();
