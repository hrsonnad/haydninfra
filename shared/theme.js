/**
 * shared/theme.js — Global dark mode
 *
 * To add dark mode to any page, include just two things:
 *
 *   1) In <head> (prevents flash of wrong theme):
 *      <script>(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})();</script>
 *
 *   2) Before </body>:
 *      <script src="path/to/shared/theme.js"></script>
 *
 * The toggle button is auto-injected — no HTML needed in the page.
 * Syncs across iframes via the storage event.
 */
(function () {
    var SUN_SVG = '<svg class="theme-sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">'
        + '<circle cx="12" cy="12" r="5"/>'
        + '<line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>'
        + '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>'
        + '<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>'
        + '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
        + '</svg>';
    var MOON_SVG = '<svg class="theme-moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
        + '</svg>';

    function createToggleBtn() {
        var btn = document.createElement('button');
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', 'Toggle dark mode');
        btn.setAttribute('onclick', 'toggleTheme()');
        btn.innerHTML = SUN_SVG + MOON_SVG;
        return btn;
    }

    function currentTheme() {
        return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.querySelectorAll('.theme-toggle').forEach(function (btn) {
            btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
            var sun = btn.querySelector('.theme-sun');
            var moon = btn.querySelector('.theme-moon');
            if (sun) sun.style.display = theme === 'dark' ? '' : 'none';
            if (moon) moon.style.display = theme !== 'dark' ? '' : 'none';
        });
        if (typeof window.onThemeChange === 'function') window.onThemeChange(theme);
    }

    window.toggleTheme = function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        applyTheme(next);
    };

    function inject() {
        // 1. Inject into every .site-nav__inner (sidebar footer, top navbars)
        document.querySelectorAll('.site-nav__inner').forEach(function (el) {
            if (!el.querySelector('.theme-toggle')) {
                el.appendChild(createToggleBtn());
            }
        });

        // 2. Inject before every hamburger button (mobile topbars) — wrap in flex group
        document.querySelectorAll('.hamburger, .admin-hamburger').forEach(function (ham) {
            var parent = ham.parentNode;
            // Already handled — parent is a flex group containing a toggle
            if (parent.dataset.themeGroup) return;
            parent.dataset.themeGroup = '1';

            var group = document.createElement('div');
            group.style.cssText = 'display:flex;align-items:center;gap:8px;';
            parent.insertBefore(group, ham);
            group.appendChild(createToggleBtn());
            group.appendChild(ham);
        });

        applyTheme(currentTheme());
    }

    // Sync theme when another frame/tab changes localStorage
    window.addEventListener('storage', function (e) {
        if (e.key === 'theme') applyTheme(e.newValue || 'light');
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
