# haydninfra

Haydn Sonnad's personal knowledge base and site — [haydns.ai](https://haydns.ai). Stores documents, notes, projects, and tags backed by Supabase. The whole thing is static HTML served from GitHub Pages.

**Live URLs:**
- Public site: https://hrsonnad.github.io/haydninfra/
- Admin: https://hrsonnad.github.io/haydninfra/admin/

---

## Tech Stack

| Layer | What |
|-------|------|
| Frontend | Vanilla HTML/JS (static) |
| Backend | Supabase (PostgreSQL + Storage + Auth) |
| Hosting | GitHub Pages |
| Styling | Tailwind CSS v4 (`styles/tailwind.out.css`, committed) |

## Repo Structure

```
haydninfra/
├── index.html              # Shell — sidebar + iframe host for the whole site
├── admin/                  # Auth-gated admin CRUD pages
│   ├── index.html          # Knowledge base dashboard
│   ├── documents.html      # Documents
│   ├── projects.html       # Projects
│   ├── notes.html          # Notes
│   ├── tags.html           # Tags
│   ├── public-pages.html   # Public page manager
│   ├── resume.html         # Resume hub
│   ├── workflow-readme.html # Workflow Kit docs
│   └── workflow-agents.html # Agent Playbook
├── public/                 # Public-facing pages (ufc.html, etc.)
├── shared/                 # Shared JS/CSS used across all pages
│   ├── supabase.js         # Supabase client init
│   ├── auth.js             # Auth module (profile button, login modal, page guard)
│   ├── admin.css           # Admin page styles
│   └── theme.js            # Dark mode toggle
├── styles/                 # Tailwind source + built output
├── playbooks/              # Multi-agent workflow guides
├── templates/              # Linear templates + agent prompt packs
├── metrics/                # Pilot measurement templates
├── supabase/               # Edge functions + DB migrations
└── CLAUDE.md               # Agent context (schema, stack, conventions)
```

## Database Schema

All tables have RLS enabled — users can only access their own rows.

| Table | Description |
|-------|-------------|
| `projects` | Active projects (name, description, status, color) |
| `documents` | Files, notes, links, references (title, content, type, project_id) |
| `document_tags` | Junction: documents ↔ tags |
| `notes` | Quick capture notes (content, project_id) |
| `note_tags` | Junction: notes ↔ tags |
| `tags` | User-defined tags (name, color) |
| `profile_context` | About-me data (full_name, bio, metadata JSONB) |
| `public_pages` | Metadata for public-facing pages |

## Local Development

No build step. Edit HTML/JS files directly and open in a browser. For CSS:

```bash
npm run css:watch   # rebuild tailwind.out.css on save
```

## Deployment

Push to `main` — GitHub Pages serves it live immediately.

```bash
git add . && git commit -m "your message" && git push
```

## Shared Assets

All pages load three scripts in order:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="shared/supabase.js"></script>
<script src="shared/auth.js"></script>
```

`auth.js` auto-inserts a profile button into the nav. Admin pages call `requireAuth(callback)` to gate access. The Supabase client is exposed as `window.adminSupabase`.

## References

- [CLAUDE.md](CLAUDE.md) — full agent context (schema, credentials pointer, conventions)
- [GLOSSARY.md](GLOSSARY.md) — key terms (Shell, Admin pages, Tree nav, Workflow Kit, etc.)
- [style-guide.md](style-guide.md) — design tokens, layout patterns, component conventions
