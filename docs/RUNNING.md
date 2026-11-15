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

## 3e. Player contracts, event sign-in/out, how to pay (migrations 0029–0030, release 0.18.0)
1. **Database:** paste `supabase/migrations/20260101000029_event_replies.sql`, then `supabase/migrations/20260101000030_player_contracts.sql` into Supabase → SQL Editor and run each once (fresh installs get them with `supabase/paste/part3.sql`).
2. **How to pay:** the Membership tab now shows the club's bank details and, for each open payment, the reference number, amount, due date and the Finnish virtual bank barcode, each with a Copy button. It uses the billing details from Admin → Invoices (section 3c, step 2); until the IBAN is filled in, players see "Payment details are not available yet". Players whose sign-in is blocked for overdue fees get a button to the public page `https://app.afrofoot.club/pay` (no sign-in, club account only). The app no longer links to the public website's Membership page for payment.
3. **Sign in / out:** players answer "I'm in" / "I'm out" (with an optional note) on each training, match and friendly in their Calendar until it starts; afterwards only coaches and admins can change an answer. Coaches see the counts and names on the session page and under **Upcoming matches** on their team page.
4. **Contracts:** Admin → Contracts → New contract (player, team, 1, 2 or 3 years, start date; the end date defaults to 31 October of the last season). The draft is made from the **contract template** (English; edit it on the same page): `{{player}}`, `{{team}}`, `{{starts}}`, `{{ends}}`, `{{years_text}}` and `{{club}}` are filled in, and every `[[…]]` blank (season objectives, fees) must be completed before **Send to player**. Sending locks the text and stores its SHA-256 fingerprint. The player reads it on the Membership tab, types their full name and ticks the box to sign (or declines with a reason); an admin then **countersigns** and the contract is active. Both can download the PDF (`/contracts/<id>`). Since migration 0031 the team's coaches can read them too (never drafts). Active contracts can be terminated (last day and reason); the overview and the Contracts menu show how many wait for the club's signature.

## 3f. Match day for coaches (migration 0031, release 0.19.0)
1. **Database:** paste `supabase/migrations/20260101000031_match_day.sql` into Supabase → SQL Editor and run it once (fresh installs get it with `supabase/paste/part3.sql`).
2. **Add matches:** coach → team page → **Add a match or friendly** (league matches need a division). The standard pre-game protocol is added: meeting 90, warm-up 60 and strategy briefing 20 minutes before kick-off.
3. **Match day page** (`/coach/matches/<id>`, linked from the coach home and the team page):
   - **Pre-game protocol:** meeting time and place, warm-up, strategy briefing, kick-off. Times must be before kick-off and at most 6 hours before it. Players see them on the match in their Calendar.
   - **Game plan:** six lineup styles (Balanced, Defensive, Midfield domination, High press, Counter-attack, Wing play). **Apply style** sets the formation and the instructions (defensive line, pressing, width, tempo); the coach can adjust them and write a plan for the players.
   - **Lineup:** pitch with the formation; tap a position, then Start a player. **Auto-fill** uses positions and the players' In/Out replies. Bench of up to 12 and a captain. Checks warn about a missing goalkeeper, players who said they cannot come and players out of position. **Copy as text** gives a list for WhatsApp. Saved in one step (`save_lineup`). **Publish to the squad** shows each player whether they start, are on the bench or not selected, plus the style and plan.
   - **Live scoreboard:** Kick off / Half time / Second half / Full time with a running clock, quick buttons for goals, cards, substitutions and notes, and a timeline with **Undo**. The database keeps the score; the lineup locks at kick-off; at full time it calculates minutes, goals, assists and cards for each player. After full time only an admin can correct events.
4. **Contracts and Code of Conduct for coaches:** coaches read the contracts of the players in their own teams (sent, signed or ended; never drafts) and see each player's contract status in the roster. Coaches read the Code of Conduct and agree to it themselves (menu **Code of Conduct**; a reminder shows on the coach home until they agree).

## 3g. Lineup board (migration 0032, release 0.20.0)
1. **Database:** paste `supabase/migrations/20260101000032_lineup_board.sql` into Supabase → SQL Editor and run it once (fresh installs get it with `supabase/paste/part3.sql`). Check: `select format, count(*) from formations group by format;` shows 11 → 8, 9 → 5, 8 → 5, 7 → 4, 5 → 4.
2. **Photos** use the private storage bucket `player-photos` (created by migration 0009). Check that it exists: `select id, public from storage.buckets where id = 'player-photos';` → one row, `public` false. Players add or change their photo under **My season → Edit profile** (the browser shrinks it to a 512 px JPEG). Players, their coaches and admins can see it.
3. **Match day → Lineup board** (coaches):
   - **Lineup style** drop-down (Balanced, Defensive, Midfield domination, High press, Counter-attack, Wing play) and **Format and formation** drop-down (11, 9, 8, 7 and 5 v 5). Changing either re-places the players by position; the description, shape and line counts are shown beside the pitch. Team instructions and the plan for the players are below the board.
   - **Drag and drop:** from the player list or the bench onto the pitch, a marker onto another to swap, onto the bench, or back to the list to remove. Tapping a position and then **Start** works too (phones, keyboards).
   - **Player cards:** photo, shirt, positions, reply and note, training attendance, minutes this season, Call and WhatsApp.
   - **Availability:** counts and filters (In, Maybe, Out, No reply) and **Copy reminder** with a ready message for the players who have not replied.
   - **Rotation plan:** planned substitutions with the planned minutes per player next to their season minutes (coaches only). During the match the planned changes are offered in the live console; one tap fills in the substitution.
   - **Share:** image (PNG or JPG), **Share image** (phone share sheet: WhatsApp, Spond, …), a 5-second **video clip** (MP4 or WebM, depending on the browser), or copy as text.
   - **Save lineup and plan** stores everything in one step, so the style, the formation and the lineup always match.

## 3h. Sign in with Google or Facebook (migration 0033, release 0.21.0)
The buttons appear on the sign-in page by themselves once a provider is switched on in Supabase (the app reads Supabase's public settings every 5 minutes). Nothing goes into the code or into Vercel: the keys are kept by Supabase.

**Database:** paste `supabase/migrations/20260101000033_social_sign_in.sql` into Supabase → SQL Editor and run it once (it takes the member's name from their Google or Facebook account).

**Return address (once):** Supabase → Authentication → URL Configuration → Redirect URLs: add `https://app.afrofoot.club/auth/callback` (and the preview address if you test there, e.g. `https://afrofoot-app-*.vercel.app/auth/callback`). Then open Supabase → Authentication → Sign In / Providers → Google: the page shows the **Callback URL** of your project (`https://<project>.supabase.co/auth/v1/callback`). Copy it; both providers need it.

**Google (about 15 minutes, free):**
1. https://console.cloud.google.com → create a project "Afro Foot Club".
2. APIs & Services → OAuth consent screen (Google Auth Platform → Branding): user type **External**; app name "Afro Foot Club"; support email; app domain `https://www.afrofoot.club`; authorised domains `afrofoot.club` and `supabase.co`. Audience → **Publish app** (otherwise only test users can sign in). The basic scopes (email, profile, openid) need no review.
3. Clients (Credentials) → Create client → **Web application**. Authorised JavaScript origins: `https://app.afrofoot.club`. Authorised redirect URIs: the Supabase **Callback URL** from above. Create, then copy the Client ID and Client secret.
4. Supabase → Authentication → Sign In / Providers → **Google** → enable, paste Client ID and Client secret, Save.

**Facebook (about 20 minutes):**
1. https://developers.facebook.com → My Apps → Create app → use case **Authenticate and request data from users with Facebook Login**; app name "Afro Foot Club".
2. Use cases → Facebook Login → Customise: make sure **email** (and public_profile) are added. Settings → **Valid OAuth Redirect URIs**: the Supabase **Callback URL**.
3. App settings → Basic: **Privacy policy URL** `https://www.afrofoot.club/privacy`, **User data deletion** → Data deletion instructions URL `https://www.afrofoot.club/privacy#delete`. App domain `afrofoot.club`, category, icon.
4. Switch the app from **Development** to **Live** (top of the dashboard). In Development mode only people listed as app testers can sign in.
5. Copy App ID and App secret (App settings → Basic) to Supabase → Authentication → Sign In / Providers → **Facebook** → enable, Save.

**How it behaves:**
- New accounts are pending players, as with email sign-up: an admin approves them and sets the role (Admin → Members). The name comes from the Google or Facebook account; the phone number (with country code) is still added in the profile.
- Someone who already has an account with the same (verified) email is the same member: Supabase links the identities, so they can use either way to sign in.
- The fee block (migration 0022) applies to every sign-in: players with overdue fees see the payment notice and the /pay page.
- A Facebook account without an email address cannot be used (the club needs the email); the member sees a message and can use Google or email and password.
- Instagram is not offered: it has no sign-in for personal accounts.

## 3i. Privacy policy (website)
- `https://www.afrofoot.club/privacy` (all four languages), linked from the website footer, the membership and tryout forms and the member app's sign-in page. `#delete` holds the data deletion instructions.
- The club's business ID, address and contact email are taken from Admin → Invoices → Club billing details; until an email is entered there, `info@afrofoot.club` is shown.
- The text is a draft written from what the apps collect: the club board should read and approve it (and adjust retention periods if needed) before Facebook sign-in goes live. If the club's practice changes (new data, new service provider, payments by MobilePay), update the text in `packages/i18n/src/messages/*.json` → `privacyPolicy` and the date.
- Retention periods are a commitment: deleting old data is not automatic yet; until it is, an admin removes or anonymises it by hand (for example once a year).

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
