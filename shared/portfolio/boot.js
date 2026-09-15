// Early theme init (runs in <head>) + app boot after auth.
// External file because the page CSP forbids inline scripts.
(function () {
  'use strict';
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (t !== 'light' &&
        window.matchMedia('(prefers-color-scheme:dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) { /* default light */ }

  document.addEventListener('DOMContentLoaded', function () {
    // requireAuth redirects to ../index.html when signed out. Being signed in
    // is necessary but NOT sufficient: every row is additionally gated by
    // public.is_owner() in RLS, so a non-owner reaches the page and sees
    // nothing. PortfolioApp.boot() surfaces that as an explicit denial rather
    // than an empty screen.
    if (window.requireAuth) {
      window.requireAuth(function (user, sb) {
        window.PortfolioApp.boot(user, sb);
      });
    } else {
      var m = document.getElementById('pf-gate-msg');
      if (m) { m.textContent = 'Auth module failed to load.'; m.className = 'pf-gate__msg err'; }
    }
  });
})();
