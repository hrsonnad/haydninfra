// auth.js — AlpacApps shared auth module
// Profile button, login modal, and Supabase Auth integration
// Reads config from shared/supabase.js globals (SUPABASE_URL, SUPABASE_ANON_KEY)
//
// Usage:
//   1. Include Supabase CDN + supabase.js + auth.js on every page
//   2. On public pages: auth widget auto-inserts into .site-nav__inner (or first <nav>)
//   3. On admin pages: call requireAuth(callback) to guard access
//   4. Use window.adminSupabase for authenticated Supabase calls
//
(function() {
    'use strict';

    // Wait for Supabase client — expects supabase.js to define SUPABASE_URL + SUPABASE_ANON_KEY
    if (typeof window.supabase === 'undefined') {
        console.warn('[auth] Supabase JS SDK not loaded');
        return;
    }

    // Read config from supabase.js globals (set by each project's shared/supabase.js)
    var url = window.SUPABASE_URL;
    var key = window.SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.warn('[auth] SUPABASE_URL or SUPABASE_ANON_KEY not defined. Include shared/supabase.js before auth.js.');
        return;
    }

    var sb = window.supabase.createClient(url, key);
    var currentUser = null;

    // =============================================
    // HELPERS
    // =============================================

    function getInitials(name) {
        if (!name) return '?';
        var parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name[0].toUpperCase();
    }

    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function showToast(message, type) {
        var existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%) translateY(-10px);z-index:10000;padding:14px 24px;border-radius:12px;font-size:14px;font-weight:500;font-family:inherit;max-width:90vw;text-align:center;opacity:0;transition:all 0.3s ease;box-shadow:0 8px 32px rgba(0,0,0,0.12);';
        if (type === 'success') { toast.style.background = '#f0fdf4'; toast.style.color = '#166534'; toast.style.border = '1px solid #bbf7d0'; }
        else if (type === 'error') { toast.style.background = '#fef2f2'; toast.style.color = '#991b1b'; toast.style.border = '1px solid #fecaca'; }
        else { toast.style.background = '#fffbeb'; toast.style.color = '#92400e'; toast.style.border = '1px solid #fde68a'; }
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(function() { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
        setTimeout(function() { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(-10px)'; setTimeout(function() { toast.remove(); }, 300); }, 4000);
    }

    // =============================================
    // PROFILE BUTTON (NAV)
    // =============================================

    function buildAuthWidget() {
        var wrapper = document.createElement('div');
        wrapper.className = 'auth-widget';
        wrapper.id = 'authWidget';
        return wrapper;
    }

    function renderLoggedOut(wrapper) {
        wrapper.innerHTML =
            '<button class="auth-btn" id="authLoginBtn" aria-label="Sign in" title="Sign in">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
                    '<circle cx="12" cy="7" r="4"/>' +
                '</svg>' +
            '</button>';

        wrapper.querySelector('#authLoginBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            openLoginModal();
        });
    }

    function renderLoggedIn(wrapper, user) {
        var displayName = (user.user_metadata && user.user_metadata.full_name) || user.email;
        var initials = getInitials(displayName);

        // Determine admin link path (relative to current page)
        var adminHref = 'admin/index.html';
        if (window.location.pathname.indexOf('/admin/') !== -1) {
            adminHref = 'index.html';
        }

        wrapper.innerHTML =
            '<button class="auth-avatar auth-avatar--initials" id="authAvatarBtn" aria-haspopup="true" aria-expanded="false" title="' + escapeHtml(displayName) + '">' +
                initials +
            '</button>' +
            '<div class="auth-dropdown" id="authDropdown">' +
                '<div class="auth-dropdown__user">' + escapeHtml(displayName) + '</div>' +
                '<div class="auth-dropdown__divider"></div>' +
                '<a href="' + adminHref + '" class="auth-dropdown__item">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' +
                    '<span>Admin</span>' +
                '</a>' +
                '<button class="auth-dropdown__item auth-dropdown__signout" id="authSignOutBtn">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                    '<span>Sign Out</span>' +
                '</button>' +
            '</div>';

        var avatarBtn = wrapper.querySelector('#authAvatarBtn');
        var dropdown = wrapper.querySelector('#authDropdown');

        avatarBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var isOpen = dropdown.classList.contains('auth-dropdown--open');
            dropdown.classList.toggle('auth-dropdown--open', !isOpen);
            avatarBtn.setAttribute('aria-expanded', !isOpen);
        });

        document.addEventListener('click', function() {
            dropdown.classList.remove('auth-dropdown--open');
            avatarBtn.setAttribute('aria-expanded', 'false');
        });

        wrapper.querySelector('#authSignOutBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            sb.auth.signOut().then(function() {
                currentUser = null;
                renderLoggedOut(wrapper);
                showToast('Signed out', 'success');
                // Redirect away from admin pages
                if (window.location.pathname.indexOf('/admin/') !== -1) {
                    window.location.href = '../index.html';
                }
            });
        });
    }

    // =============================================
    // LOGIN MODAL
    // =============================================

    function openLoginModal() {
        var existing = document.getElementById('authModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.className = 'auth-modal';
        modal.id = 'authModal';
        modal.innerHTML =
            '<div class="auth-modal__backdrop" id="authModalBackdrop"></div>' +
            '<div class="auth-modal__card">' +
                '<button class="auth-modal__close" id="authModalClose" aria-label="Close">&times;</button>' +
                '<div class="auth-modal__header">' +
                    '<h2 class="auth-modal__title">Sign In</h2>' +
                    '<p class="auth-modal__subtitle">Authorized administrators only</p>' +
                '</div>' +
                '<div class="auth-modal__google">' +
                    '<button type="button" class="auth-modal__google-btn" id="authGoogleBtn">' +
                        '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.4 30.2 0 24 0 14.8 0 6.9 5.4 3 13.3l7.9 6.1C12.8 13.1 18 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/><path fill="#FBBC05" d="M10.9 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.4 13.3A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8.3-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6 0-11.1-3.6-13-8.9l-8.2 6.3C6.8 42.6 14.8 48 24 48z"/></svg>' +
                        'Continue with Google' +
                    '</button>' +
                '</div>' +
                '<div class="auth-modal__divider"><span>or</span></div>' +
                '<form class="auth-modal__form" id="authLoginForm">' +
                    '<div class="auth-modal__field">' +
                        '<label for="authEmail">Email</label>' +
                        '<input type="email" id="authEmail" required autocomplete="email" placeholder="you@example.com">' +
                    '</div>' +
                    '<div class="auth-modal__field">' +
                        '<label for="authPassword">Password</label>' +
                        '<input type="password" id="authPassword" required autocomplete="current-password" placeholder="Password">' +
                    '</div>' +
                    '<div class="auth-modal__error" id="authError"></div>' +
                    '<button type="submit" class="auth-modal__submit" id="authSubmitBtn">Sign In</button>' +
                '</form>' +
            '</div>';

        document.body.appendChild(modal);
        setTimeout(function() { document.getElementById('authEmail').focus(); }, 100);

        document.getElementById('authModalBackdrop').addEventListener('click', closeLoginModal);
        document.getElementById('authModalClose').addEventListener('click', closeLoginModal);
        document.addEventListener('keydown', handleModalEsc);

        document.getElementById('authGoogleBtn').addEventListener('click', function() {
            sb.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.href }
            });
        });

        document.getElementById('authLoginForm').addEventListener('submit', function(e) {
            e.preventDefault();
            var email = document.getElementById('authEmail').value.trim();
            var password = document.getElementById('authPassword').value;
            var errorEl = document.getElementById('authError');
            var submitBtn = document.getElementById('authSubmitBtn');

            errorEl.textContent = '';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in\u2026';

            sb.auth.signInWithPassword({ email: email, password: password }).then(function(result) {
                if (result.error) {
                    errorEl.textContent = result.error.message || 'Invalid credentials';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign In';
                    return;
                }
                currentUser = result.data.user;
                closeLoginModal();
                var widget = document.getElementById('authWidget');
                if (widget) renderLoggedIn(widget, currentUser);
                showToast('Signed in successfully', 'success');
            }).catch(function() {
                errorEl.textContent = 'Something went wrong. Please try again.';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In';
            });
        });

        requestAnimationFrame(function() { modal.classList.add('auth-modal--open'); });
    }

    function closeLoginModal() {
        var modal = document.getElementById('authModal');
        if (!modal) return;
        modal.classList.remove('auth-modal--open');
        document.removeEventListener('keydown', handleModalEsc);
        setTimeout(function() { modal.remove(); }, 250);
    }

    function handleModalEsc(e) {
        if (e.key === 'Escape') closeLoginModal();
    }

    // =============================================
    // ADMIN PAGE GUARD
    // =============================================

    /**
     * Guard an admin page. If not authenticated, redirects to ../index.html.
     * @param {Function} callback - Called with (user, supabaseClient) when authenticated.
     */
    window.requireAuth = function(callback) {
        sb.auth.getSession().then(function(result) {
            if (result.data.session && result.data.session.user) {
                currentUser = result.data.session.user;
                if (callback) callback(currentUser, sb);
            } else {
                window.location.href = '../index.html';
            }
        });
    };

    // Expose supabase client for admin pages
    window.adminSupabase = sb;

    // =============================================
    // INIT
    // =============================================

    function insertAuthWidget() {
        // Look for nav container: .site-nav__inner, or first nav's first child, or first <header>
        var navInner = document.querySelector('.site-nav__inner') ||
                       (document.querySelector('nav') && document.querySelector('nav').firstElementChild);
        if (!navInner) return;

        var widget = buildAuthWidget();
        navInner.appendChild(widget);

        sb.auth.getSession().then(function(result) {
            if (result.data.session && result.data.session.user) {
                currentUser = result.data.session.user;
                renderLoggedIn(widget, currentUser);
            } else {
                renderLoggedOut(widget);
            }
        }).catch(function() {
            renderLoggedOut(widget);
        });

        // Listen for auth changes (login/logout from another tab)
        sb.auth.onAuthStateChange(function(event, session) {
            if (event === 'SIGNED_IN' && session && session.user) {
                currentUser = session.user;
                renderLoggedIn(widget, session.user);
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                renderLoggedOut(widget);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertAuthWidget);
    } else {
        insertAuthWidget();
    }
})();
