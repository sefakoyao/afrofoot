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

## Progress
- 2026-11-14, branch `phase2/foundation` (UNTESTED: written without package installs, only syntax-checked): language routing (next-intl, English without prefix, /fi /fr /ar), layout with Figtree and Cairo, header with utility bar and language switcher, footer, home hero. Links to /news, /team, /membership, /join, /sponsors, /contact, /women, /juniors lead to pages that do not exist yet.
- Next: run `pnpm install && pnpm typecheck && pnpm build`, fix errors, then add the remaining public pages from `design-preview/`.
- 2026-11-14, same branch (UNTESTED, still no package installs in the session that wrote it; only a syntax-level `tsc` pass and `pnpm i18n:check` were run): added the public pages News, Team, Women, Juniors, Membership, Join (tryout and enrolment forms, calendar picker, country list, +country-code phone fields), Sponsors and Contact, with server actions that validate with zod and insert through the anonymous Supabase client (RLS allows insert only). Known gaps: sample sponsors and fee tables are hard-coded and flagged (`lib/fees.ts`, sponsors page), the squad and news read from the database and stay empty until it has data, no news detail page, no rate limiting or captcha beyond a honeypot field, no automated tests for the actions, Header/Footer links to privacy policy and social links not built. First thing to do with network access: `pnpm install && pnpm typecheck && pnpm build`, then try each form against a local Supabase.
- 2026-11-14, branch `phase2/auth` (TESTED against a local Supabase stack: Postgres with all 26 migrations, GoTrue with the fee-block hook, PostgREST; 56 browser checks with Playwright): build step 3, part 1. Member app sign-in, sign-out, password reset and role-based routing (`/admin` for super and club admins, `/coach`, `/me`). Middleware refreshes the Supabase session and sends signed-out visitors to `/login`; each area layout reads the role from `profiles` (RLS) and redirects other roles to their own home. Area pages are placeholders. Before production: Supabase Auth → URL configuration must list `https://app.afrofoot.club/auth/confirm`, the custom access token hook must be enabled (Auth → Hooks), and the Vercel `app` project needs the Supabase variables (see `docs/RUNNING.md`). Next: part 2 (player profile and payment status, admin user management).
- 2026-11-15, PR #13 merged: member app part 1 is live on Vercel (`afrofoot-app`, Root Directory `apps/app`, Supabase variables on Production; branch previews need them on Preview too).
- 2026-11-15, branch `phase2/admin-users` (TESTED locally: 32 new browser checks for part 2a, including forged requests, plus the 56 part-1 checks): admin user management without new settings. Members list (search, role and status filters, approve, suspend, reactivate, change role), audit log, admin overview. No migration: `admin_all` on profiles, `guard_profiles` and the audit trigger already cover it. Next (part 2b): invite by email, which needs `SUPABASE_SERVICE_ROLE_KEY` (server only) on the `afrofoot-app` project.
- 2026-11-15, PRs #14 (admin user management) and #15 (demo accounts script) merged.
- 2026-11-15, branch `phase2/player-page` (TESTED locally: 27 new browser checks, plus 35 admin and 56 part-1 checks): player home with payment status and history, account page for every role, phone-layout fix for wide tables. No migration. Next: admin teams and roster, then coach schedule and attendance.
- 2026-11-15, PR #16 merged. Branch `phase2/player-sport` (TESTED locally: 30 new checks, all 120 earlier checks pass): player portal with sport profile, season stats, training attendance, emergency contact and WhatsApp phone. No migration (players may only change foot/height/weight/bio/photo/public listing: app.restrict_columns; player_private is theirs). Stats appear once coaches record matches (match day or stats entry) and attendance; until then the sections show empty states. Next: admin teams and roster, coach schedule and attendance, then match recording.
- 2026-11-15, PR #17 merged. Branch `phase2/teams` (TESTED locally: 41 new checks, all 150 earlier checks pass): admin seasons, teams and rosters, coach assignments. Next: coach area (my teams, training schedule, attendance marking), then match recording.
