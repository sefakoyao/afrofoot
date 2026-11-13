# Phase 2 – real site and app

Status: database (26 migrations, 315 tests), design preview v0.15.0 and all 777 preview texts (en/fi/fr/ar, `messages/*.json` under `site.*`) are ready. Code below is not built yet.

## Blocked until the owner has done
1. GitHub: private empty repo `afrofoot`; GitHub connected to Claude (Settings → Connectors); repo name given.
2. Supabase: projects `afrofoot-staging` and `afrofoot-prod` (EU region). Passwords stay with the owner.
3. Vercel: import the GitHub repo (two projects: `web` = www.afrofoot.club, `app` = app.afrofoot.club); add environment variables.
4. Package installs allowed in the Claude session (needed to build and test Next.js), or builds run on GitHub Actions.
5. New Torneopal key (the old one was exposed).

## Build order
1. Shared UI package from the preview (Figtree, Cairo for Arabic, green/black/white, dark hero, pill buttons).
2. Public site `apps/web`: Home, News, Team, Membership, Join (tryout + enrolment forms with calendar, country list, +country-code phone), Sponsors, Contact. i18n with RTL.
3. Auth in `apps/app`: Supabase sign-in, roles, custom access token hook (fee block), middleware.
4. Player: profile, payments status. Coach/admin: lineup builder, match day, schedule, fees policy.
5. Admin CMS: pages with revision history, news, releases.
6. Payments: Paytrail and MobilePay (needs merchant accounts), invoice requests.
7. Federation sync (Torneopal) after `pnpm fed:probe` fixtures.

## Environment variables (names only; values go into Vercel/Supabase, never into chat or the repo)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `TORNEOPAL_API_KEY` (server only), `PAYTRAIL_MERCHANT_ID`, `PAYTRAIL_SECRET`, `MOBILEPAY_*` (later).
