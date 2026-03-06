# CLAUDE.md - Personal Knowledge Base + Context MCP

This file provides context for Claude (AI assistant) when working on this codebase.

> **IMPORTANT: You have direct database access!**
> Always run SQL migrations directly using `psql` - never ask the user to run SQL manually.
> Connection string is in `CLAUDE.local.md`.

> **IMPORTANT: Push changes immediately!**
> This is a GitHub Pages site - changes only go live after pushing.
> Always `git push` as soon as changes are ready.

## Project Overview

A personal knowledge base and Google Drive replacement for storing information about the owner and their active projects. Supports documents, notes, projects, and tags — with MCP context access.

**Tech Stack:**
- Frontend: GitHub Pages (vanilla HTML/JS) + Next.js 16 (React 19, TypeScript, Tailwind CSS)
- Backend: Supabase (PostgreSQL + Storage + Auth)
- Hosting: GitHub Pages (static export)
- Styling: Tailwind CSS v4 (CSS-first, `styles/tailwind.css` → `styles/tailwind.out.css`)

**Live URLs:**
- Public site: https://hrsonnad.github.io/haydninfra/
- Admin: https://hrsonnad.github.io/haydninfra/admin/

## Deployment

Push to main and it's live. No build step, no PR process.
**For Claude:** Always push changes immediately after making them.

## Database Schema

All tables have RLS enabled. Users can only access their own rows (`auth.uid() = user_id`).

| Table | Description |
|-------|-------------|
| `projects` | Active projects (name, description, status, color) |
| `documents` | Files, notes, links, references (title, content, type, project_id, source_url, file_path) |
| `document_tags` | Junction table linking documents to tags |
| `notes` | Quick capture notes (content, project_id) |
| `note_tags` | Junction table linking notes to tags |
| `tags` | User-defined tags (name, color) |
| `profile_context` | About-me data (full_name, bio, metadata JSONB) |

**Document types:** `note`, `document`, `link`, `file`, `reference`
**Project statuses:** `active`, `paused`, `completed`, `archived`

## Storage Buckets

| Bucket | Access | Purpose |
|--------|--------|---------|
| `documents` | Private (authenticated) | File uploads attached to documents |
| `avatars` | Public | Profile avatar images |

## Shared Files

- `shared/supabase.js` — Supabase client init (URL + anon key as globals)
- `shared/auth.js` — Auth module: profile button, login modal, page guard
- `shared/admin.css` — Admin styles (themeable via `--aap-*` CSS vars)
- `styles/tailwind.css` — Tailwind v4 source (CSS-first config)
- `styles/tailwind.out.css` — Built Tailwind output (committed, served directly)

### Auth System (`shared/auth.js`)

- **Profile button**: Auto-inserts into nav. Person icon when logged out, initials avatar when logged in.
- **Login modal**: Email/password via `supabase.auth.signInWithPassword()`.
- **Dropdown menu**: "Admin" link + "Sign Out" when logged in.
- **Page guard**: Admin pages call `requireAuth(callback)`.
- **Supabase client**: Exposed as `window.adminSupabase`.

**Script loading order:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="shared/supabase.js"></script>
<script src="shared/auth.js"></script>
```

## Supabase Details

- Project ID: `ixxnhvqyxkuwyshzdnlc`
- URL: `https://ixxnhvqyxkuwyshzdnlc.supabase.co`
- Region: West US (Oregon) — pooler: `aws-0-us-west-2`

### Supabase CLI Access

```bash
export SUPABASE_ACCESS_TOKEN=<token from CLAUDE.local.md>
supabase functions deploy <function-name>
supabase functions logs <function-name>
supabase secrets set KEY=value
```

## External Services

### Email (Resend)
- API key stored as Supabase secret: `RESEND_API_KEY`
- From address: configure in Resend dashboard

## Tailwind CSS v4

- Source: `styles/tailwind.css` (CSS-first, no `tailwind.config.js`)
- Output: `styles/tailwind.out.css` (committed to repo)
- Build: `npm run css:build`
- Watch: `npm run css:watch`
- Include `<link rel="stylesheet" href="styles/tailwind.out.css">` on HTML pages
- Always rebuild and commit `tailwind.out.css` after changing `tailwind.css`

## Conventions

1. Use toast notifications, not `alert()`
2. Filter archived items client-side (`is_archived = false`)
3. All data is private — no public views (RLS enforced)
4. Client-side image compression for files > 500KB
5. Always push immediately after changes (GitHub Pages)
