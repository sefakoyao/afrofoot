# Afro Foot 2.0 – instructions for Claude

Rebuild of Afro Foot Club: public site (www.afrofoot.club, `apps/web`) and secure app (app.afrofoot.club, `apps/app`). pnpm monorepo, Next.js 15 / React 19 / TypeScript / Tailwind 3 / next-intl / Supabase (@supabase/ssr) / Vercel.

## Read first
- `docs/03-phase2-plan.md` (build order and status), `docs/01-design-system.md`, `docs/02-database.md`, `CHANGELOG.md`.
- Design reference: the single-file preview `design-preview/apercu-afrofoot-v0.15.0.html` (open it in a browser; all pages, forms, lineup builder, admin tools). Copy its look and behaviour, not its code.

## Rules
- Languages en / fi / fr / ar. Arabic is RTL: use logical CSS properties. All text comes from `packages/i18n/src/messages/*.json` (`site.*` holds every preview text). Run `pnpm i18n:check`.
- Colours: green #3DAF2C, black, white. **No yellow.** Typeface: Figtree (Latin), Cairo (Arabic). Round, pill buttons, soft cards.
- Security: RLS default-deny, audit trail, server-side validation (zod) mirroring the DB constraints. No hard-coded data in production. Secrets only as environment variables (names in the plan), never in the repo. Torneopal key is server-side only.
- Phone numbers must include the country code (+358 …); nationality is an ISO country code; birth date fields use the calendar picker.
- Players with overdue fees cannot sign in (custom access token hook, migration 0022). Payment must stay possible from the public Membership page.
- Database: migrations in `supabase/migrations`, tests with `sh supabase/tests/run_tests.sh` (needs a local Postgres; expect no ERROR/FAIL lines). Add a test for every new policy or constraint.
- Work in branches and open pull requests; never push untested code to `main`.
