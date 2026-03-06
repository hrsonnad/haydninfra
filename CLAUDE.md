# CLAUDE.md - [Your Project Name]

This file provides context for Claude (AI assistant) when working on this codebase.

> **IMPORTANT: You have direct database access!**
> Always run SQL migrations directly using `psql` - never ask the user to run SQL manually.

> **IMPORTANT: Push changes immediately!**
> This is a GitHub Pages site - changes only go live after pushing.
> Always `git push` as soon as changes are ready.

> **IMPORTANT: First-time setup!**
> Run `/setup-alpacapps-infra` to set up the full infrastructure interactively.
> If the Supabase CLI is not installed or linked, run:
> `npm install -g supabase && supabase login && supabase link --project-ref YOUR_REF`

## Project Overview

[Your project] is a [type of system] for [purpose]. It manages [core entities].

**Tech Stack:**
- Frontend: Next.js 16 (React 19, TypeScript, Tailwind CSS)
- Backend: Supabase (PostgreSQL + Storage + Auth)
- Hosting: GitHub Pages (static export)
- i18n: Dictionary-based multi-language support

**Live URLs:**
- Public site: https://USERNAME.github.io/REPO/
- Intranet: https://USERNAME.github.io/REPO/en/intranet/

## Deployment

Push to main and it's live. No build step, no PR process.
**For Claude:** Always push changes immediately.

## Shared Files

- `shared/supabase.js` — Supabase client init (URL + anon key as globals)
- `shared/auth.js` — Auth module: profile button, login modal, page guard
- `shared/admin.css` — Admin styles: layout, tables, modals, badges (themeable via `--aap-*` CSS vars)

### Auth System (`shared/auth.js`)

Provides login/profile functionality on all pages:

- **Profile button**: Auto-inserts into nav bar. Shows person icon when logged out, initials avatar when logged in.
- **Login modal**: Email/password via `supabase.auth.signInWithPassword()`. Opens on profile icon click.
- **Dropdown menu**: When logged in, clicking avatar shows dropdown with "Admin" link and "Sign Out".
- **Page guard**: Admin pages call `requireAuth(callback)` — redirects to `../index.html` if not authenticated.
- **Supabase client**: Exposed as `window.adminSupabase` for admin page data access.

**Script loading order on every page:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="shared/supabase.js"></script>
<script src="shared/auth.js"></script>
```

**`shared/supabase.js` must export globals** (auth.js reads these):
```javascript
var SUPABASE_URL = 'https://YOUR_REF.supabase.co';
var SUPABASE_ANON_KEY = 'your-anon-key';
```

### Admin Pages (`admin/`)

- All admin pages are in `admin/` directory with `<meta name="robots" content="noindex, nofollow">`
- Each page loads `shared/admin.css` and calls `requireAuth()`:
```javascript
requireAuth(function(user, supabase) {
    // Page is authenticated — load data using supabase client
});
```
- Admin topbar nav links between admin sub-pages
- CRUD pattern: `admin-table` for listing, `admin-modal` for add/edit forms
- CSS classes are themeable via `--aap-*` custom properties

## Supabase Details

- Project ID: `YOUR_PROJECT_REF`
- URL: `https://YOUR_PROJECT_REF.supabase.co`
- Anon key is in `src/lib/supabase.ts` and `shared/supabase.js`

### Direct Database Access (for Claude)

```bash
psql "postgres://postgres.YOUR_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres" -c "SQL HERE"
```

### Supabase CLI Access (for Claude)

```bash
supabase functions deploy <function-name>
supabase functions logs <function-name>
supabase secrets set KEY=value
```

Run these directly. If CLI not installed, install and link first.

## Key Files

- `src/lib/supabase.ts` — Supabase client (Next.js app)
- `shared/supabase.js` — Supabase client (vanilla JS pages)
- `next.config.ts` — basePath must match GitHub repo name
- `src/i18n/config.ts` — supported locales
- `src/i18n/dictionaries/*.json` — translation files
- `src/contexts/auth-context.tsx` — authentication

## External Services

### Email (Resend)
- API key stored as Supabase secret: `RESEND_API_KEY`

### SMS (Telnyx)
- Config in `telnyx_config` table
- Edge functions: `send-sms`, `telnyx-webhook` (deploy with `--no-verify-jwt`)

### Payments (Square)
- Config in `square_config` table
- Edge function: `process-square-payment`

### E-Signatures (SignWell)
- Config in `signwell_config` table
- Edge function: `signwell-webhook` (deploy with `--no-verify-jwt`)

## Conventions

1. Use toast notifications, not alert()
2. Filter archived items client-side
3. Don't expose personal info in public views
4. Client-side image compression for files > 500KB
