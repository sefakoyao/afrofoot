# How to run Afro Foot 2.0

## Where the project stands (be aware)
Phase 1 is finished: database (15 migrations, 170+ automated checks), permissions, i18n (EN/FI/FR/AR), design system, federation client and the HTML preview.
**The Next.js pages of the public site and of the management app are not built yet** (Phase 2 onward). Until then `pnpm dev:web` / `pnpm dev:app` start empty apps. What you can run today is listed in section 1; section 2 is the full procedure that will apply as soon as the pages exist.

## 1. What you can run today
| What | How |
|---|---|
| Visual preview (all screens, 4 languages, demo sign-in) | open `apercu-afrofoot.html` in a browser |
| Database + security tests | PostgreSQL 16 locally, then `PGHOST=… PGUSER=… sh supabase/tests/run_tests.sh` (or `pnpm db:test`) |
| Translation check | `node packages/i18n/scripts/check-messages.mjs` (or `pnpm i18n:check`) |
| Federation probe (Finnish FA API) | `TORNEOPAL_API_KEY=… pnpm fed:probe` — saves real responses to fixtures |

## 2. Full local stack (site + app + database)
Prerequisites: Node 20+, pnpm 9+, Docker, Supabase CLI.

1. `pnpm install`
2. `cp .env.example apps/web/.env.local && cp .env.example apps/app/.env.local`
3. `supabase start` — prints the local URL, anon key and service-role key; put them in both `.env.local` files.
4. `supabase db reset` — applies every migration in `supabase/migrations` and `supabase/seed.sql`.
5. Create the first super administrator: sign up in the app (or Supabase Studio → Auth), then in Studio's SQL editor  
   `update profiles set role='super_admin', status='active' where email='you@example.com';`
6. `pnpm dev:web` → http://localhost:3000 (public site) and `pnpm dev:app` → http://localhost:3001 (management app).
7. Before every commit: `pnpm typecheck && pnpm lint && pnpm i18n:check && pnpm db:test`.

## 3. Production
1. **Supabase**: create one project; `supabase link --project-ref …` then `supabase db push`. Auth → URL configuration: site `https://app.afrofoot.club`, redirect URLs for both domains. Enable email confirmation.
2. **GitHub**: push the monorepo.
3. **Vercel**: two projects from the same repo — root directory `apps/web` (domain `www.afrofoot.club`) and `apps/app` (domain `app.afrofoot.club`). Set the environment variables from `.env.example` in both (service-role key and `TORNEOPAL_API_KEY` as server-only secrets).
4. **Scheduled jobs** (Vercel Cron): federation sync (every 15–60 min), overdue-payment reminders, membership renewals.
5. Run section 2 step 5 against the production database.

## 4. Payments setup
- **Wire transfer / invoice**: set the club IBAN and recipient in `site_settings`; the database generates Finnish reference numbers (viitenumero, check digit 7-3-1) and invoice numbers.
- **MobilePay**: needs a merchant agreement and API credentials from Vipps MobilePay. The server creates a checkout (`payments.provider='mobilepay'`, `provider_ref`, `checkout_url`) and a webhook route records events in `payment_events` (idempotent by event id) and marks the payment paid. Credentials stay in server environment variables only. Until credentials exist, MobilePay is hidden in the member screen.
- Plans (monthly / quarterly / yearly) and prices are created by an administrator; none are hard-coded.

## 5. Tryouts
Applicants submit the public form (name, date of birth, previous team, optional `https://tulospalvelu.palloliitto.fi/…` link). Under-18s must give a guardian. Administrators review them in the app; coaches cannot see them. The link is checked for format only; the server cannot confirm the profile exists without the Palloliitto API.

## 6. Scheduled jobs to create (Vercel Cron → server routes using the service role)
- `generate_training_sessions` for every active schedule, nightly.
- `send_mvp_reminders()` every 30 minutes.
- Federation sync (see section 3).
