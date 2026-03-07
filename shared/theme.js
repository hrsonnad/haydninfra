// shared/theme.js — Dark mode initialization, toggle, and system preference listener
(function () {
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

    function init() {
        // Class already set by anti-flash inline script — just sync icons and listeners
        applyTheme(currentTheme());
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
            if (!localStorage.getItem('theme')) applyTheme(e.matches ? 'dark' : 'light');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
