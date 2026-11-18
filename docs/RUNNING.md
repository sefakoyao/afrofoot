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

## 3j. Events, meeting times and the website calendar (migration 0034, release 0.22.0)
**Database:** paste `supabase/migrations/20260101000034_events_public_schedule.sql` into Supabase → SQL Editor and run it once. It adds meeting times and a "show on the website" switch to training, the new table `club_events` (team meetings, social events, tournaments, camps), and the view `public_schedule` the website reads.

**Who adds what:**
- **Coaches** (team page): training, games and friendlies, and other events for their teams.
- **Admins** (Admin → Events): club-wide events, events for any team, and the list of saved places.

Every form has an optional meeting time and meeting point and a place. A new place can be added right in the form; if no Google Maps link is pasted, one is made from the address.

**Website:** the new **Calendar** page (`/calendar`) and the home page refresh from the database at most once a minute, so whatever is marked "Show on the club website" appears there without a deploy. Only public teams are shown, and visitors never see meeting points, replies or player details.

## 3k. Create an account in the app, by email or phone (migration 0035, release 0.23.0)
**Database:** paste `supabase/migrations/20260101000035_phone_sign_up.sql` into Supabase → SQL Editor and run it once. Accounts made with a phone number have no email address; every profile still has an email or a phone.

**Robot check secret (required):** in Vercel → the `app` project → Settings → Environment Variables, add `SIGNUP_CHECK_SECRET` with a long random value (for example the output of `openssl rand -base64 32`), then redeploy. It signs the football robot check. Until it is set, the sign-up page says sign-up is not open yet.

**Email sign-up:** works with the email settings you already have. Recommended: Authentication → Email templates → *Confirm signup*, set the link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
so the link works on any device. (The default template only works in the browser that made the account.)

**Phone sign-up and sign-in (optional; costs money per text message):**
1. Supabase → Authentication → Sign In / Providers → **Phone**: switch it on and choose an SMS provider (Twilio, MessageBird, Vonage or Textlocal). Paste that provider's keys there; they stay in Supabase.
2. Authentication → Rate limits: keep the SMS limit low (for example 30 per hour) to cap the cost.
3. The "Phone number" tab on the sign-up page and "Sign in with a phone number" on the sign-in page appear by themselves within 5 minutes.

**Who gets in:** every new account is a pending player, as before. Approve it under Admin → Members, where phone accounts are marked "phone sign-in" and can be found by number. Members with a phone account sign in with a code by text message.

**About robots:** the football check, a hidden honeypot field and a time check protect the app's forms. Supabase's own sign-up address can still be called directly with the public key, but such accounts stay pending and can do nothing. To also protect text-message costs at that level, Supabase's built-in CAPTCHA (Cloudflare Turnstile) can be added later. Do not switch it on in Supabase before the app shows the widget, or sign-up stops working.

## 3l. Invoices after the contract and the Code of Conduct (migration 0036, release 0.24.0)
**Database:** paste `supabase/migrations/20260101000036_invoice_after_consents.sql` into Supabase → SQL Editor and run it once.

**From then on:**
- A player's membership is invoiced (nightly job, or "Create due invoices now") only once the player has:
  1. signed a contract that covers the invoice date (the club's countersignature is not needed), and
  2. agreed to the current Code of Conduct in the app.
- Until then the membership waits with its invoice date unchanged, so the first run afterwards invoices that period.
- Admin → Invoices shows "Waiting before invoicing" with what each player still has to do.
- Players without an app account cannot agree to the Code of Conduct, so they wait too. Invite them, or switch the rule off.

**Switch:** Admin → Invoices → Billing details → "Invoice a player only after the contract is signed and the Code of Conduct agreed" (on by default).

## 3m. Automatic player contracts (migration 0037, release 0.25.0)
1. Paste `supabase/migrations/20260101000037_automatic_contracts.sql` into Supabase → SQL Editor and run it once.
2. **Admin → Contracts → Automatic contracts:** fill in the three fee lines (fees the club pays, maximum yearly fees, volunteer-event alternative), choose the contract length and what happens ("Create and send" is the default), then save.
3. **Admin → Teams → each team:** write its **Season and objectives** in English (printed in that team's contracts).
4. Existing drafts: open each one and click **Fill in again from the template**, then **Send**.

From then on, approving a player into a group, or adding players to a team, creates their contract and sends it for signature. If something is missing, it stays a draft and the admin sees a note with a link to the drafts.

## 3n. Amateur player agreement (migration 0038, release 0.26.0)
1. Paste `supabase/migrations/20260101000038_amateur_contract.sql` into Supabase → SQL Editor and run it once. It makes "Player agreement (amateur)" the default template; the earlier one stays for reference.
2. **Admin → Contracts → Automatic contracts:** write the **membership fee for the season** (for example "EUR 300 per season, invoiced through the app in instalments") and check the two lists (includes / does not include). Save.
3. Drafts made earlier: open each, click **Fill in again from the template**, then **Send**.

The fee exemption is a clause in the agreement. The board's decisions themselves are recorded outside the app for now.

## 3o. News from the old website (content, no migration)
Paste `supabase/content/news_import_old_site.sql` into Supabase → SQL Editor and run it once. It adds the 37 articles from the old WordPress site with their original dates. Their pictures ship with the website. Running it again is safe: articles that already exist (same address) are not touched. Old article addresses (`/YYYY/MM/DD/<article>/`) redirect to `/news/<article>`.

## 3p. Search engines and visitor statistics (website, no migration)
- **Built in:** every page has its own title and description in its language, a canonical link and links to its other language versions (hreflang), a link preview (picture `apps/web/public/og-image.jpg`), structured data (the club; each news article), `/sitemap.xml` (pages and articles in all languages, refreshed hourly) and `/robots.txt`. Preview deployments are not indexed.
- **Variables** (Vercel `web` project, all optional): `NEXT_PUBLIC_SITE_URL` (defaults to `https://www.afrofoot.club`; used for canonical links and the sitemap), `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (only if Search Console is verified with the "HTML tag" method; the DNS method needs nothing here).
- **Visitor statistics:** Vercel → the `web` project → **Analytics** → *Enable*, then redeploy. Cookie-free (no consent banner needed; stated in the privacy policy). Shows visitors, top pages, referrers, countries, devices.
- **Google Search Console** (search terms, position on Google, indexing problems): <https://search.google.com/search-console> → *Add property* → **Domain** `afrofoot.club` → copy the `google-site-verification=…` TXT value → GoDaddy → DNS → add a **TXT** record, name `@`, that value → back in Search Console, *Verify* (can take up to an hour). Then *Sitemaps* → submit `https://www.afrofoot.club/sitemap.xml`. Do this after the DNS switch to Vercel.

## 3r. League table and results from Palloliitto (migration 0040, release 0.28.0)
The website's **Standings** section, the latest results and, when no game is entered in the app, the next match come from the Palloliitto results service (Torneopal). A sync job fetches them once a day.

1. **Database:** paste `supabase/migrations/20260101000040_federation_sync.sql` into Supabase → SQL Editor and run it once. It sets the club's Palloliitto team (35118195) and switches the sync on.
2. **Vercel → the `web` project → Settings → Environment Variables** (Production, all three **server-only**, never with a `NEXT_PUBLIC_` prefix):
   - `TORNEOPAL_API_KEY`: the key from Palloliitto (Torneopal).
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project Settings → API → *service_role* secret. Only the sync route uses it.
   - `CRON_SECRET`: a long random value, e.g. the output of `openssl rand -base64 32`. Vercel sends it to the sync route; nothing else can start it.
   Then redeploy.
3. **Schedule:** `apps/web/vercel.json` runs `/api/federation-sync` every day at 05:23 UTC (Vercel → web project → *Cron Jobs* shows it). On a paid Vercel plan it can run more often (change `schedule`, e.g. `"23 * * * *"` for hourly).
4. **Update now from the member app (easiest):** add `TORNEOPAL_API_KEY` to the Vercel **app** project too (Secret, Production) and redeploy it. Then **Admin → home → League table (Palloliitto) → "Update the league table now"**. It runs with your admin rights: no service key or cron secret needed. The card shows the club's position and the last update (or why it failed).
5. **Or start a run from your computer** (the website route, same result):
   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://www.afrofoot.club/api/federation-sync
   ```
   It answers `{"ok":true,"teams":1,"competitions":…,"standings":12,"matches":…}`. The home page shows the table within a minute.
6. **Check runs:** Supabase → Table Editor → `sync_runs` (status, rows, error). Errors never contain the key.

**How it chooses what to show:** the newest season whose league table has games played; last season's final table stays until the new season's first games are played. A competition can be hidden: set `show_publicly = false` on its row in `federation_competitions` (the sync keeps that choice). Raw answers are not stored (they name referees and players).

## 3s. Squad on the website (migration 0041, release 0.29.0)
1. **Database:** paste `supabase/migrations/20260101000041_squad_consent_stats.sql` into Supabase → SQL Editor (project of the website) and run it once.
2. **Players** decide in the member app: **My profile → On the club website → Show me on the club website** (and can remove themselves at any time). Only they appear on www.afrofoot.club/team#squad.
3. **Admin → League table → Update the league table now** also fetches the club's registered players and their league goals and games from Palloliitto (stored for admins and coaches only).
4. **Admin → Palloliitto players:** link each Palloliitto player to the player in the app (a same-name player is suggested; nothing is linked until you click Save). Linked players who chose to appear show "7 goals · 18 games · 2026" on their card.
The team page refreshes every minute.

## 3t. Squad from Palloliitto without consent (migration 0042, release 0.30.0)
1. **Database:** paste `supabase/migrations/20260101000042_squad_from_palloliitto.sql` into Supabase → SQL Editor (project of the website) and run it once (after 0041).
2. **Admin → League table → Update the league table now:** fetches the roster again, so removed or inactive players are marked and positions are stored in the club's four words.
3. www.afrofoot.club/team#squad then lists every player on the current roster (refreshes every minute).
4. A player who prefers not to be listed: **My profile → Remove me from the club website** (needs their account linked under Admin → Palloliitto players), or an admin clicks **Hide** on that page.

## 3u. All-time top scorers (migration 0043, release 0.31.0)
1. **Database:** paste `supabase/migrations/20260101000043_top_scorers.sql` into Supabase → SQL Editor (project of the website) and run it once (after 0042).
2. **Admin → League table → Update the league table now:** reads every season and cup the club has played on Palloliitto (takes a few seconds longer), and corrects the games counts.
3. www.afrofoot.club/team#squad shows the corner within a minute. To leave someone out: Admin → Palloliitto players → Hide (former players are listed there too, greyed out).

## 3v. When a merge does not reach production
Every merge into `main` should build both Vercel projects (`afrofoot` for the website, `afrofoot-app` for the app) as **Production**.
1. Check **Settings → Git → Production Branch** = `main` in both projects.
2. Vercel → project → **Deployments**: the newest "Merge pull request #…" should be marked Production. If it is a Preview, use **⋯ → Promote to Production**; if it failed, read its build log.
3. Never **Redeploy** an older deployment to "refresh" the site: it puts that older code back live.
4. Quick check after a release: www.afrofoot.club/team#squad shows "All-time top scorers" (release 0.31.0 and later).

## 3w. Sign-in help (migration 0044, release 0.32.0)
1. **Database:** paste `supabase/migrations/20260101000044_signin_help.sql` into Supabase → SQL Editor (project of the website and app) and run it once.
2. **Supabase → Authentication → URL Configuration → Redirect URLs** must allow `https://app.afrofoot.club/auth/confirm` (already needed, §3b). Nothing else to set: reset and confirmation links now work with the default email templates on any device.
3. Use it: Admin → **Sign-in help**, search the member, follow "What stops them, and what to do".

## 3x. Player-coach role (migration 0045, release 0.33.0)
1. **Database:** paste `supabase/migrations/20260101000045_player_coach.sql` into Supabase → SQL Editor and run it once (after 0044). If Saved places (0039) is not installed yet, run 0039 first when you install it later, then run 0045 again (it is safe to run twice).
2. **Make someone a player-coach:** Admin → Members → their row → role **Player-coach** → Save. Then Admin → Teams → the team → add them under Players (they stay the team's coach).
3. They sign in to the coach area and switch with **My player page** / **Coaching** in the header.

## 3y. Requests inbox (migration 0046, release 0.34.0)
1. **Database:** paste `supabase/migrations/20260101000046_requests_inbox.sql` into Supabase → SQL Editor and run it once.
2. Admin → **Requests**: website tryout requests, team enrolments, invoice requests and messages, with a count of new ones in the menu.

## 3z. Game details (migration 0047, release 0.35.0)
1. **Database:** paste `supabase/migrations/20260101000047_match_details.sql` into Supabase → SQL Editor and run it once.
2. Admin → **Update the league table now**: reads up to 40 played games in detail per run (run it two or three times the first time, or let the nightly update fill the rest).
3. On www.afrofoot.club, each result under "Latest results" opens its game page.

## 3aa. Club emails: Resend, reply deadlines and reminders (migration 0048, release 0.36.0)
Emails (reminders, approval, request alerts) are sent by the database through Resend. The key is stored only in Supabase Vault.
1. **Database:** Supabase → SQL Editor: run `supabase/migrations/20260101000048_email_notifications.sql` once. It enables `pg_net` and `pg_cron` and schedules the two jobs.
   Check: `select jobname, schedule from cron.job where jobname like 'afrofoot-email%';` lists two jobs. If not, enable both under Database → Extensions, then run only the last `do $$ … cron.schedule …` block of the file again.
2. **Resend account:** sign up at resend.com (free: 3,000 emails a month).
3. **Domain:** Resend → Domains → Add domain → `afrofoot.club`, region **Ireland (eu-west-1)**. Resend shows 3–4 DNS records (an MX and a TXT on `send`, a TXT on `resend._domainkey`, optionally `_dmarc`).
4. **GoDaddy:** My Products → afrofoot.club → DNS → Add for each record, copying Type, Name and Value exactly (MX priority 10). The existing records (website, app, email) stay as they are. Then Resend → Verify; it takes minutes to a few hours.
5. **API key:** Resend → API Keys → Create: name "Supabase", permission **Sending access**, domain `afrofoot.club`. Copy it (it is shown once).
6. **Supabase Vault:** Supabase → the project → **Integrations → Vault** (or Database → Vault) → *Add new secret*: name `resend_api_key`, value: the key. Never put it in the repo, in Vercel or in chat.
7. **Check:** Admin → Overview → **Club emails** says "Sending works". Approving a test account, or sending the website contact form, delivers an email within 2 minutes.
Settings (sender `noreply@afrofoot.club`, reply-to and alerts `info@afrofoot.club`, app link): `site_settings` key `email`.

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
