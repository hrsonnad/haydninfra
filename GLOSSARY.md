# Glossary

Key terms for understanding the haydninfra codebase. Written for agents working in this repo.

---

## Shell

`index.html` at the repo root. The entire site lives here — it renders the collapsible sidebar navigation and an `<iframe>` that loads all content pages. Every page on haydns.ai is viewed through this shell.

## Admin pages

The HTML files in `admin/`. These are auth-gated CRUD interfaces for managing the knowledge base (documents, projects, notes, tags, public pages, resume, workflow docs). All admin pages call `requireAuth(callback)` from `shared/auth.js` to enforce login before rendering.

## Public pages

HTML files in `public/`. These are user-facing pages (e.g. `ufc.html`) loaded into the shell iframe. Their URLs and metadata are stored in the `public_pages` Supabase table and managed via `admin/public-pages.html`.

## `shared/`

Four shared files used across all pages:

| File | Purpose |
|------|---------|
| `shared/supabase.js` | Initializes the Supabase client; exposes `SUPABASE_URL` and `SUPABASE_ANON_KEY` as globals |
| `shared/auth.js` | Profile button, login modal, page guard (`requireAuth()`), and `window.adminSupabase` client |
| `shared/admin.css` | Admin page styles; themeable via `--aap-*` CSS variables |
| `shared/theme.js` | Dark mode detection, persistence, and `html.dark` class toggling |

Script loading order matters — always load `supabase.js` before `auth.js`.

## `--aap-*` CSS variables

CSS custom properties prefixed `--aap-` (e.g. `--aap-primary`, `--aap-bg`, `--aap-text`). The `aap` prefix is a legacy artifact from the AlpacApps template origin — the variables themselves are fully active and used by `shared/auth.js` injected markup and `shared/admin.css`. Always define `--aap-*` variables alongside any theme variables you set.

## Tree nav

The collapsible sidebar navigation tree in `index.html`. Built with plain HTML/JS — expandable sections, nested links, active state highlighting. All navigation for the site is defined here.

## Workflow Kit

The multi-agent Linear delivery system living in `playbooks/`, `templates/`, and `metrics/`. Consists of:

- `playbooks/` — step-by-step agent workflow guides (brain dump → Linear, landing page delivery, etc.)
- `templates/` — Linear epic/story templates and agent prompt packs (Orchestrator, Spec, Build, QA, Release)
- `metrics/` — pilot measurement templates

Used to run structured software delivery with multiple AI agents coordinated through Linear.

## Edge Functions

Supabase Edge Functions in `supabase/functions/`. Currently deployed:

- `github-proxy` — proxies GitHub API requests server-side (uses `GITHUB_TOKEN` secret)
- `ufc-cards` — fetches UFC event data from ESPN public API

Deploy with: `supabase functions deploy <function-name>`

## `CLAUDE.md`

The agent context file at the repo root. Contains the live tech stack, database schema, Supabase project details, storage buckets, shared file descriptions, auth system docs, and conventions. Always read this file at the start of a session. Private credentials (API keys, DB connection string) live in `CLAUDE.local.md` (not committed).
