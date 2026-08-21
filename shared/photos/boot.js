// Early theme init (runs immediately in <head>) + app boot after auth.
// External file because the page CSP forbids inline scripts.
(function () {
  'use strict';
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme:dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) { /* default light */ }

  document.addEventListener('DOMContentLoaded', function () {
    // requireAuth redirects to ../index.html when signed out.
    if (window.requireAuth) {
      window.requireAuth(function () { window.PhotosApp.boot(); });
    }
  });
})();
