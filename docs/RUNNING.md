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

## 3b. Member app sign-in (apps/app)
- **Hook**: Supabase dashboard → Authentication → Hooks → *Customize Access Token* → Postgres function `public.custom_access_token_hook` (migration 0022). Locally it is enabled by `supabase/config.toml`. Without it, players with overdue fees can still sign in.
- **Redirect URLs**: Authentication → URL configuration must allow `https://app.afrofoot.club/auth/confirm` (and `http://localhost:3001/auth/confirm` for local work).
- **Reset email (recommended)**: Authentication → Email templates → *Reset password*: set the link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`.
  The default template also works, but only in the browser that asked for the link (PKCE); the template above works on any device.
- **Variables** for the Vercel `app` project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; optional `APP_URL` and `NEXT_PUBLIC_WEB_URL`. The member app does not use the service-role key.
- Roles: new accounts are pending players. A super administrator activates them and sets the role (`profiles.role`, `profiles.status`); role changes take effect on the next page load.

## 3c. Automatic membership invoices (migration 0027, release 0.16.0)
1. **Database:** paste `supabase/migrations/20260101000027_automatic_invoices.sql` into Supabase → SQL Editor and run it once (fresh installs get it with `supabase/paste/part3.sql`).
   - It schedules a nightly job with `pg_cron`. If the run shows the notice *Could not schedule the invoice job*, enable **pg_cron** under Database → Extensions and run the `select cron.schedule(...)` line from the notice. Check: `select jobname, schedule from cron.job;` lists `afrofoot-invoices`.
2. **Admin → Invoices → Club billing details:** legal name, address, business ID, **IBAN** (validated) and BIC, contact details, payment terms, how many days before a period the invoice goes out, late interest. No invoice is created while the IBAN is missing. These details are public (printed on invoices).
3. **Plans:** add the membership plans (price and period: month, quarter, year, season; one-off plans are never invoiced automatically).
4. **Memberships:** put each player on a plan with the date their first period starts, "Invoice automatically" ticked. The nightly job (04:15 UTC) issues each invoice `lead_days` before its period starts; "Create due invoices now" does the same on demand. An invoice covers one plan period: one line per month, one line for a season.
5. **Payments:** when the money arrives, click **Mark paid**. Unpaid invoices past their due date count as overdue and, after the grace period, block the player's sign-in (migration 0022) — the public Membership page stays open for paying.
6. **Players** open their invoices from the **Membership** tab of their page ("Invoice (PDF)"). The PDF's QR code and link point to `APP_URL` (or the app's address) + `/me/membership`; set `APP_URL` on Vercel to the final domain.
7. Not yet: sending invoices by email (needs an email provider / custom SMTP).

## 3d. Player tabs and Code of Conduct (migration 0028, release 0.17.0)
1. **Database:** paste `supabase/migrations/20260101000028_code_of_conduct.sql` into Supabase → SQL Editor and run it once (fresh installs get it with `supabase/paste/part3.sql`). It adds `conduct_versions` and `conduct_consents` and publishes the club's Code of Ethics (version 2027) as the current version.
2. The PDF is served by the app from `apps/app/public/documents/afro-foot-club-code-of-ethics-2027.pdf`.
3. **Players** see three tabs: **Calendar** (all trainings, matches and friendlies of their teams, month by month), **Membership** (Code of Conduct, payments, invoices) and **My season** (stats, attendance, player profile). Until they agree to the current version, a red banner on every tab links to the text and the "I agree" form.
4. **Admins** see the number of players without consent on the overview, a "Code of Conduct: not agreed" filter and a flag in Members, and a flag in team rosters. Coaches see the flag in their team rosters.
5. **New version later:** an admin inserts a new row in `conduct_versions` and sets it as the only `is_current` one; every player must then agree again.

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
