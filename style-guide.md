# haydns.ai — Style Guide

Design reference for all pages on haydns.ai. When building a new page, match this exactly unless you have a specific reason to deviate.

---

## Aesthetic

Minimalistic, monochrome. White backgrounds, light gray borders, near-black text. No color used for decoration — only for semantic states (error, success) or interactive feedback. The feel should be calm, dense-but-airy, and tool-like.

---

## Typography

**Font:** `Outfit` (Google Fonts) — weights 300, 400, 500, 600. Always load via:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
```
Fallback stack: `system-ui, -apple-system, sans-serif`

Always enable font smoothing:
```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

**Scale:**

| Use | Size | Weight | Letter-spacing |
|-----|------|--------|----------------|
| Page h1 | 1.4rem | 600 | -0.03em |
| Section h2 | 14px | 600 | -0.02em |
| Topbar title | 13px | 500 | -0.01em |
| Body / table cells | 13px | 400 | — |
| Labels, small text | 12px | 400–500 | — |
| Uppercase section labels | 10px | 600 | 0.06em |
| Micro / mono paths | 11px | 400 | — |
| Welcome tagline | 11px | 300 | 0.08em (lowercase) |

---

## Color Tokens

Defined in `:root` on every page and in `shared/admin.css`:

```css
--text:   #1a1a1a;   /* primary text */
--text-2: #6b6b6b;   /* secondary / muted */
--text-3: #ababab;   /* dim / placeholder */
--bg:     #ffffff;   /* page background */
--hover:  rgba(0,0,0,0.04);  /* hover state */
--active: rgba(0,0,0,0.07);  /* active/selected state */
--line:   #f0f0f0;   /* borders, dividers, table rules */
```

**Semantic colors (use only for meaning, not decoration):**

| Situation | Background | Text | Border |
|-----------|------------|------|--------|
| Danger hover | `#fef2f2` | `#dc2626` | `#fca5a5` |
| Success hover | `#f0fdf4` | `#16a34a` | `#86efac` |
| Toast success | `#15803d` bg | white | — |
| Toast error | `#dc2626` bg | white | — |
| Auth sign-out hover | `rgba(220,38,38,0.06)` | `#dc2626` | — |

**aap vars** (used by `auth.js` injected markup — set these in any page using the auth system):
```css
--aap-accent: #1a1a1a;
--aap-accent-deep: #000000;
--aap-bg: #ffffff;
--aap-surface: #ffffff;
--aap-border: #f0f0f0;
--aap-text: #1a1a1a;
--aap-text-soft: #6b6b6b;
--aap-text-dim: #ababab;
--aap-text-muted: #c8c8c8;
```

---

## Border Radius

```css
--aap-radius:    6px;   /* buttons, inputs, tags, small elements */
--aap-radius-lg: 8px;   /* medium cards */
--aap-radius-xl: 10px;  /* modals, larger inputs */
/* 14px used for auth modal card */
```

---

## Shadows

```css
--aap-shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
--aap-shadow-md: 0 4px 12px rgba(0,0,0,0.07);
--aap-shadow-lg: 0 8px 24px rgba(0,0,0,0.09);
--aap-shadow-xl: 0 16px 48px rgba(0,0,0,0.11);
```

Use sparingly — only on modals, dropdown menus, and elevated cards. Most surfaces have no shadow.

---

## Transitions

- Standard: `0.15s ease`
- Tree nav items: `120ms ease`
- Modals sliding in: `0.25s cubic-bezier(0.4, 0, 0.2, 1)`

---

## Layout — Shell (index.html)

The main site is a single-page shell with a **196px left sidebar** and a **full-height content area** on the right. All pages load inside this shell's iframe panel — there is no top-level navigation on individual pages when embedded.

```
┌──────────────────────────────────────────────┐
│  Sidebar (196px)  │  Content area (flex: 1)  │
│                   │                          │
│  Brand            │  Active page / iframe    │
│  Tree nav         │                          │
│  ...              │                          │
│  [Auth widget]    │                          │
└──────────────────────────────────────────────┘
```

**Sidebar:**
- Width: 196px, `flex-shrink: 0`
- Background: `#ffffff`, no right border (public shell) or 1px `var(--line)` border (admin pages)
- Brand: 20px top/left padding, 14px, weight 600, letter-spacing -0.03em
- Auth widget: sits in `.sidebar-footer`, 12px padding, `margin-top: auto`

**Content area:**
- `flex: 1`, `overflow: hidden`
- Pages are `position: absolute; inset: 0`, displayed with `.page--active`

---

## Layout — Admin Pages

Admin pages use `.admin-shell` from `shared/admin.css`:

```
┌───────────────────────────────────────────────────┐
│  admin-sidebar (196px)  │  admin-content (flex:1) │
│                         │  admin-topbar (49px)    │
│  Brand + back link      │─────────────────────────│
│  Tree nav links         │  admin-main (scrollable)│
│  ─────────────────      │                         │
│  [Auth widget footer]   │  Page header            │
│                         │  Toolbar                │
│                         │  Content                │
└───────────────────────────────────────────────────┘
```

- Topbar: 49px height, `border-bottom: 1px solid var(--line)`, `padding: 0 28px`
- Admin main: `padding: 32px 28px`, `overflow-y: auto`
- Sidebar footer: `border-top: 1px solid var(--line)`, `padding: 12px`

---

## Navigation — Tree (Sidebar)

The sidebar uses a collapsible tree navigator:

```css
/* Container */
.tree { padding: 0 8px; flex: 1; overflow-y: auto; }

/* Item button */
.tree-btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-2);
    transition: background 120ms ease, color 120ms ease;
}
.tree-btn:hover  { background: var(--hover); color: var(--text); }
.tree-btn--active { background: var(--active); color: var(--text); font-weight: 500; }

/* Nested children (one level deep only) */
.tree-children .tree-btn {
    padding-left: 40px;
    color: var(--text-3);
}
.tree-children .tree-btn:hover  { color: var(--text-2); }
.tree-children .tree-btn--active { color: var(--text); }
```

- Chevron: 10px SVG, `color: var(--text-3)`, rotates 90deg when open (`transition: 150ms ease`)
- Locked branches show a 12px lock icon at `opacity: 0.35`, right-aligned, and don't expand when clicked unless authenticated
- Collapsed children: `max-height: 0`, expanded: `max-height: 300px` (`transition: 200ms ease`)

**Admin sidebar links** use `.admin-tree-btn` (same concept, 5px/12px padding):
- `.admin-tree-btn--muted`: italic, `color: var(--text-3)`, not interactive
- Section dividers: `height: 1px; background: var(--line); margin: 8px 4px`
- Section labels: 10px, weight 600, uppercase, 0.06em letter-spacing, `color: var(--text-3)`

---

## Buttons

**Primary** — used for the main CTA in a toolbar or modal footer:
```css
background: var(--text);   /* #1a1a1a */
color: #fff;
border: none;
border-radius: 6px;
padding: 7px 14px;
font-size: 12px;
font-weight: 500;
```
Hover: `background: #333`

**Cancel / Secondary** — for dismissals, secondary actions:
```css
border: 1px solid var(--line);
background: var(--bg);
color: var(--text-2);
border-radius: 6px;
padding: 7px 14px;
font-size: 12px;
```
Hover: `background: var(--hover)`

**Action (inline, table rows)** — small, borderless-looking buttons:
```css
padding: 4px 10px;
border-radius: 5px;
border: 1px solid var(--line);
background: var(--bg);
font-size: 11px;
font-weight: 500;
color: var(--text-2);
```
Hover: `background: var(--hover); border-color: var(--text-3); color: var(--text)`
Danger hover: `background: #fef2f2; color: #dc2626; border-color: #fca5a5`
Success hover: `background: #f0fdf4; color: #16a34a; border-color: #86efac`

Row of action buttons: `display: flex; gap: 4px; justify-content: flex-end`

---

## Forms

**Label:**
```css
font-size: 11px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.05em;
color: var(--text-3);
margin-bottom: 5px;
```

**Input / Textarea / Select:**
```css
padding: 7px 10px;
border: 1px solid var(--line);
border-radius: 5px;
font-family: inherit;
font-size: 13px;
background: var(--bg);
color: var(--text);
outline: none;
transition: border-color 0.12s;
```
Focus: `border-color: var(--text-3)`
Placeholder: `color: var(--text-3)`

**Group spacing:** `margin-bottom: 14px` between fields
**Two-column rows:** `display: grid; grid-template-columns: 1fr 1fr; gap: 8–12px`

---

## Tables

```css
.admin-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
th {
    text-align: left;
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-3);
    border-bottom: 1px solid var(--line);
}
td {
    padding: 11px 12px;
    border-bottom: 1px solid var(--line);
    color: var(--text-2);
    vertical-align: middle;
}
tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--hover); }
```

Primary column (name/title): `color: var(--text); font-weight: 500`
Monospace paths/codes: `font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; color: var(--text-3)`

---

## Modals

**Overlay:**
```css
position: fixed; inset: 0;
background: rgba(0,0,0,0.25);
backdrop-filter: blur(2px);
z-index: 200;
display: flex; align-items: center; justify-content: center;
```

**Card:**
```css
background: var(--bg);
border: 1px solid var(--line);
border-radius: 10px;
padding: 24px 28px;
max-width: 460px;
box-shadow: var(--aap-shadow-xl);
```

**Header:** `font-size: 14px; font-weight: 600; color: var(--text); letter-spacing: -0.02em; margin-bottom: 20px`

**Footer:** `display: flex; justify-content: flex-end; gap: 6px; margin-top: 20px`

**Close button:** 28px circle, top-right corner, `color: var(--text-3)`, hover: `color: var(--text); background: var(--hover)`

---

## Status Indicators

**Dot + label:**
```css
.status-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-3); }
.status-dot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
.status-dot--active::before { background: var(--text-2); }
.status-dot--archived::before { background: var(--line); }
```

---

## Toast Notifications

Use toasts, not `alert()`. Always:

```css
#toast {
    position: fixed; bottom: 20px; right: 20px; z-index: 999;
    background: var(--text); color: #fff;
    padding: 10px 16px; border-radius: 6px;
    font-size: 12px; font-family: var(--font);
    transform: translateY(60px); opacity: 0;
    transition: all 0.2s; pointer-events: none;
}
#toast.show { transform: translateY(0); opacity: 1; }
#toast.success { background: #15803d; }
#toast.error { background: #dc2626; }
```

---

## Empty States

Centered, minimal, no illustrations:
```css
.admin-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-3);
    font-size: 13px;
}
```

---

## Skeleton Loaders

For async content before data arrives:
```css
.skel {
    height: 12px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--line) 25%, #e8e8e8 50%, var(--line) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }
```

---

## Scrollbars

Style all scrollable containers consistently:
```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }
```

---

## Page Header (Admin)

Every admin page opens with:
```html
<div class="admin-page-header">
    <h1>Page Title</h1>
    <p>One-line description</p>
</div>
```
`h1`: 1.4rem, weight 600, letter-spacing -0.03em, margin-bottom 4px
`p`: 13px, `color: var(--text-3)`

---

## Toolbar (Admin)

Below the page header, before the table:
```html
<div class="admin-toolbar">
    <!-- Filter tabs on the left -->
    <div class="admin-filter-tabs">
        <button class="admin-filter-tab active">All</button>
        <button class="admin-filter-tab">Active</button>
    </div>
    <!-- Actions on the right -->
    <button class="btn-primary">+ New Item</button>
</div>
```
Filter tab active: `background: var(--active); color: var(--text); font-weight: 500; border-color: var(--line)`

---

## Auth System

The auth widget (`shared/auth.js`) auto-injects a profile button into the nav. Script loading order is required:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="shared/supabase.js"></script>
<script src="shared/auth.js"></script>
```

- **Logged out:** 28x28px circle icon button, `color: var(--text-3)`, `border: 1px solid var(--line)`
- **Logged in:** 28x28px circle with user initials, `background: var(--text)`, white text, 11px weight 600
- **Dropdown:** min-width 160px, `border-radius: 6px`, shadow-lg, opens below (or above in sidebar), fade+slide transition
- Admin pages call `requireAuth(callback)` as a guard

---

## Shell Architecture

Every page that can be embedded in the shell must:

1. **Detect when embedded** and hide its own nav:
   ```html
   <script>
   if (window.self !== window.top) {
       var _nav = document.querySelector('nav, .site-header');
       if (_nav) _nav.style.display = 'none';
   }
   </script>
   ```
   Use `.site-header` for public pages, `nav` for admin pages.

2. **Not include a back button or app-level nav** — the sidebar handles all navigation.

3. **Register as a `type: 'link'` entry** in the `TREE` in `index.html`:
   ```js
   { id: 'my-page', label: 'My Page', type: 'link', href: 'public/my-page.html' }
   ```

4. **Use hash-based routing** — the shell sets `location.hash` when navigating. Links within the shell use `type: 'page'` for in-shell panels or `type: 'link'` for iframe-loaded pages.

Pages added to the "Public Pages" branch are loaded dynamically from the `public_pages` Supabase table (`title`, `path` columns). Private Pages are only revealed to authenticated users.

---

## Metadata

All pages include:
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
```

Title format: `Page Name — haydns.ai` or `Page Name — Admin`

---

## Responsive

Sidebar collapses to 160px at `max-width: 640px`. Admin main padding reduces to `20px 16px`. The toolbar stacks vertically. No mobile-first reflow — the shell is desktop-primary.

---

## What Not To Do

- No accent colors for decoration (blue links, colored headings, etc.)
- No `alert()` — use toasts
- No top-level navigation in embedded pages
- No shadows on most surfaces — only modals, dropdowns, elevated cards
- No custom scrollbars wider than 4px
- No font weights outside 300–600 (Outfit only goes to 600)
- Don't filter archived items server-side — filter client-side (`is_archived = false`)
