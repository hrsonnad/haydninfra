# Customization Guide

Active conventions for haydns.ai. Written for agents and developers working in this codebase.

---

## CSS Variables

Admin pages and the shell are styled using CSS custom properties. Two layers of variables are in use:

### Base theme variables (`shared/admin.css`)

| Variable | Purpose |
|----------|---------|
| `--aap-primary` | Primary accent color |
| `--aap-primary-hover` | Hover state for primary |
| `--aap-bg` | Page background |
| `--aap-surface` | Card/panel background |
| `--aap-border` | Border color |
| `--aap-text` | Body text |
| `--aap-text-muted` | Secondary/muted text |
| `--aap-danger` | Error/destructive actions |

> **Note on `--aap-*` prefix:** The `aap` prefix is a legacy artifact from this repo's AlpacApps template origin. These variable names are kept as-is because `shared/auth.js` injects HTML that references them directly. Do not rename them — always define `--aap-*` vars when theming a page.

### Tailwind CSS v4

Used for utility classes on admin pages that link `styles/tailwind.out.css`.

- Source: `styles/tailwind.css` (CSS-first config, no `tailwind.config.js`)
- Output: `styles/tailwind.out.css` (committed — this is what gets served)
- Build: `npm run css:build`
- Watch: `npm run css:watch`

Always rebuild and commit `tailwind.out.css` after changing `tailwind.css`.

---

## Dark Mode

Dark mode is class-based: the `dark` class is toggled on `<html>`.

- **Detection:** reads `localStorage` key `theme` (`"light"`, `"dark"`, or `"system"`)
- **Toggle:** `shared/theme.js` exports `toggleTheme()` and applies `html.dark`
- **Anti-flash:** `shared/theme.js` should be loaded in `<head>` (inline or as early script) to set the class before paint
- **CSS pattern:** use `html.dark` selectors in stylesheets, or `dark:` variants in Tailwind

```css
/* Example */
.card { background: var(--aap-surface); }
html.dark .card { background: #1e1e2e; }
```

---

## Shell Architecture

`index.html` is the single-page shell that hosts the entire site:

- **Sidebar:** Tree nav with collapsible sections. All site navigation is defined here as HTML links.
- **Content area:** An `<iframe>` that loads the active page. Navigation clicks set `iframe.src`.
- **State:** Active link tracking, sidebar collapse state stored in `localStorage`.

### Adding a page to the shell

1. Create your HTML file (in `admin/`, `public/`, or root)
2. Add a `<li>` link to the tree nav in `index.html` pointing to the new file
3. The shell iframe will load it when clicked

### Adding a public page

Public pages also need a row in the `public_pages` Supabase table (managed via `admin/public-pages.html`). This controls visibility and metadata for public-facing content.

---

## Adding Admin Pages

1. Create `admin/your-page.html`
2. Load the standard scripts in `<head>`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
   <script src="../shared/supabase.js"></script>
   <script src="../shared/auth.js"></script>
   ```
3. Call `requireAuth(callback)` before rendering any data
4. Link `../styles/tailwind.out.css` and `../shared/admin.css` for styling
5. Add the page to the tree nav in `index.html`

---

## Auth Pattern

`shared/auth.js` handles all auth UI automatically when loaded. No manual setup needed beyond loading the scripts and calling `requireAuth()` on protected pages.

- `requireAuth(callback)` — redirects to login if not authenticated, then calls `callback` with the session
- `window.adminSupabase` — the initialized Supabase client, available after scripts load

---

## Conventions

1. Use toast notifications, not `alert()`
2. Filter archived items client-side (`is_archived = false`)
3. All data is private — no public views (RLS enforced)
4. Client-side image compression for uploads > 500KB
5. Push immediately after changes — GitHub Pages goes live on `git push`
