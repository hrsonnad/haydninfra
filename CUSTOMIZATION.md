# Customization Guide

This document explains how to adapt the AlpacApps template for a new organization. It is written for Claude Code sessions that will be customizing this codebase.

## Overview

This repo is a **generic template**. It contains no organization-specific data, credentials, or branding. When a new organization clones it and runs `/setup-alpacapps-infra`, Claude should customize the following areas.

## What to Customize

### 1. Supabase Credentials (set during `/setup-alpacapps-infra`)

| File | What to replace |
|------|----------------|
| `src/lib/supabase.ts` | `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` |
| `shared/supabase.js` | `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` |
| `CLAUDE.md` | All `YOUR_*` placeholders |

### 2. GitHub Pages basePath

| File | What to set |
|------|------------|
| `next.config.ts` | `basePath: "/{REPO_NAME}"` |
| `src/contexts/auth-context.tsx` | Google OAuth redirect URL: `window.location.origin + "/{REPO_NAME}/en/intranet"` |

### 3. Organization Branding

| File | What to customize |
|------|------------------|
| `src/i18n/dictionaries/en.json` | `metadata.title` (org name), `metadata.description`, `home.hero.title`, `home.hero.subtitle`, `home.mission.description`, `about.history.content`, program names |
| `src/i18n/dictionaries/*.json` | Same fields in all other locale files (translate using Gemini — see `translations/GEMINI_PROMPT.md`) |
| `src/app/layout.tsx` | `metadata.title` and `metadata.description` |
| `index.html` | Title text (optional, redirect page) |

### 4. Locales / Languages

| File | What to customize |
|------|------------------|
| `src/i18n/config.ts` | `locales` array — add/remove locale codes; update `INTRANET_LOCALES`, `localeNames`, `localeFlags` |
| `src/i18n/get-dictionary.ts` | Add/remove import lines to match the locales in config |
| `src/i18n/dictionaries/` | Create/delete JSON files to match locales |
| `src/app/[lang]/layout.tsx` | Update `fontFamilyMap` if adding non-Latin scripts (and add Google Fonts to `src/app/layout.tsx`) |

### 5. CLAUDE.md

Replace all placeholders with actual values:
- `[Your Project Name]` — organization name
- `[Your project]`, `[type of system]`, `[purpose]`, `[core entities]` — project description
- `YOUR_PROJECT_REF` — Supabase project ref
- `YOUR_REF` — Supabase project ref (in psql string)
- `YOUR_PASSWORD` — database password
- `REGION` — Supabase region
- `USERNAME` — GitHub username
- `REPO` — GitHub repo name

Also add the database schema section with actual table definitions after running migrations.

### 6. Database Schema

The setup skill creates tables tailored to the org's domain. There is no hardcoded schema — Claude generates tables based on what the user describes in Step 1. The common patterns are:

- Core tables: members, contacts, events, documents, transactions, messages, settings
- Service configs: telnyx_config, square_config, signwell_config
- All tables get: RLS enabled, `updated_at` trigger, UUID primary keys
- Storage buckets: `photos` (public), `documents` (private)

### 7. Intranet Sections

The intranet tab system is driven by the `page_display_config` table in Supabase. Customize which sections and tabs are visible:

| Section | Typical tabs |
|---------|-------------|
| Admin | Users, Passwords, Settings, Releases, Templates, Brand, Accounting |
| Devices | Inventory, Assignments, Maintenance, Procurement |
| Residents/Members | Directory, Rooms/Groups, Check In/Out, Requests |
| Associates/Contacts | Directory, Organizations, Donations, Communications |
| Staff | Directory, Schedules, Roles, Attendance |

Not all sections are relevant to every org — customize via the database.

## Adding Non-Latin Language Support

If the organization needs scripts beyond Latin (e.g., Tibetan, Hindi, Chinese, Arabic):

1. Add the locale code to `src/i18n/config.ts`
2. Create the dictionary JSON file in `src/i18n/dictionaries/`
3. Add the import in `src/i18n/get-dictionary.ts`
4. Add the font family mapping in `src/app/[lang]/layout.tsx`
5. Add a Google Fonts link in `src/app/layout.tsx` `<head>`

## Adding a Static Site (e.g., Public-Facing Pages)

Some organizations need a separate static HTML site (e.g., a donation page, landing page). To add one:

1. Create a folder at the repo root (e.g., `public-site/`)
2. Add HTML/CSS/JS files
3. Update `index.html` to redirect to the appropriate page
4. The static files are served directly by GitHub Pages alongside the Next.js export

## Checklist for New Organizations

- [ ] Clone the repo and run `/setup-alpacapps-infra`
- [ ] Supabase credentials set in `src/lib/supabase.ts` and `shared/supabase.js`
- [ ] `next.config.ts` basePath matches repo name
- [ ] OAuth redirect URL updated in `src/contexts/auth-context.tsx`
- [ ] Organization name and content updated in all dictionary files
- [ ] `src/app/layout.tsx` metadata updated
- [ ] CLAUDE.md filled in with all actual values
- [ ] Database schema created and documented in CLAUDE.md
- [ ] Locales configured for the org's languages
- [ ] Site pushed and live on GitHub Pages
