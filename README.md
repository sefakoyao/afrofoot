# Afro Foot 2.0

Public website (`apps/web`, www.afrofoot.club) + management app (`apps/app`, app.afrofoot.club) on one Supabase project.
Stack: Next.js · React · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage) · Vercel · GitHub.

```
apps/web        public site + CMS rendering         (Phase 2)
apps/app        secure management application      (Phases 3–6)
packages/ui     design tokens, Tailwind preset, shared components
packages/db     roles/permissions mirror, generated DB types
packages/i18n   English / Finnish / French messages, locale helpers
supabase/       migrations, seed (reference data), database tests
docs/           analysis, design system, database, permissions
```
Languages: English, Finnish, French (docs/04-i18n.md). Checks: `pnpm i18n:check`, `pnpm db:test`.
Status: **Phase 1 complete** (analysis, structure, design system, database + RLS, tests). See docs/PHASE-1-REPORT.md.

## Database
`sh supabase/tests/run_tests.sh` (needs PostgreSQL client + a local server; set PGHOST/PGPORT/PGUSER).
On Supabase: `supabase link --project-ref <ref> && supabase db push`, then create the first super administrator
(sign up, then in the SQL editor: `update profiles set role='super_admin', status='active' where email='…';`).

## Local development
`pnpm install && cp .env.example .env.local && pnpm dev:web` / `pnpm dev:app`


**How to run everything:** see [docs/RUNNING.md](docs/RUNNING.md).
