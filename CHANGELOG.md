# Changelog

Format: [Semantic Versioning](https://semver.org). The same history lives in the database table `app_releases`
(shown to admins in the app) and every edit of a website page or news post is kept in `content_revisions`.

## Unreleased – sign-in log (branch `phase2/signin-log`, migration 0051, release 0.39.0)
- **Admin → Sign-in help → Sign-in log**, for today, 7, 30 or 90 days:
  - tiles for successful sign-ins (and how many members), failed sign-ins, reset emails sent, and reset emails **not** sent
  - **why sign-ins failed:** wrong email or password, email not confirmed, waiting for approval, suspended, overdue fees, too many attempts, technical error
  - **having trouble:** members with 2+ failures, or a reset email that could not be sent, and no successful sign-in since, each with a **Help →** link
  - **latest attempts**, filtered by all, failed, successful or password resets; a mistyped address shows as "No account with this email"
  - a red warning with the fix when Supabase could not send password-reset emails (custom SMTP missing)
- **Per member** in Sign-in help: their recent attempts and, where Supabase keeps it, the Supabase Auth log (sign-ins, reset emails requested, password changes).
- Logged from the password sign-in, Google/Facebook, email links, the Forgot password page and the admin's "Send password link". Passwords are never logged. Only admins read the log; it is kept 90 days (nightly clean-up).
- **Fix:** the Forgot password page no longer hides an error from Supabase when the email can't be sent; the error is logged and shown to admins. Members still see the same neutral answer.
- Docs: Supabase Auth needs custom SMTP (Resend) for members to receive reset and confirmation emails.
- 20 database checks, 24 browser checks.

## Unreleased – more quiz questions, quiz editor (branch `phase2/quiz-more`, migration 0050, release 0.38.0)
- **Admin → Quiz** (new menu item): every quiz question, filtered by topic and shown/switched off.
  - **New question** and an editor per question: the question, 2–6 answers and the explanation in English, Finnish, French and Arabic (English required, players see English when a language is missing), the right answer, the source, and **Shown to players**.
  - A yellow badge shows which languages are still missing. **Delete** removes a question (kept in the audit log).
  - Checked on the server and in the database: lengths (question 300, answer 150, explanation 600 characters), only the four languages, English on every answer, the right answer among the filled ones.
- **21 more Laws of the Game questions** (33 in all): throw-ins and goal kicks into a goal, penalty mark, goal size, ball size, free-kick distance, indirect free kicks, advantage, handball denying a goal, penalty taker touching twice, back-pass, offside (level, own half), corners, dropped ball, spitting, added time, shirt celebrations, leaving the field, match length.
- **4 more club questions from live data:** biggest win of the last two seasons (opponent), current league position, first season in the Palloliitto results, number of Finnish Cup seasons. Each round still takes 2 club questions at random from those the data allows.
- 12 database checks.

## Unreleased – football quiz for players (branch `phase2/quiz`, migration 0049, release 0.37.0)
- **Player area:** a **Football quiz** card right after signing in (highlighted in green when nothing is on that day) and a new **Quiz** tab.
- **Each round, 5 questions,** one at a time. The right answer is shown with a short explanation and the Law it comes from, then the score ("Well played!") and **Play again** (a new random round).
  - **3 Laws of the Game questions**, picked from 12: goal over the line, offside from throw-ins, goalkeeper 8-second rule (2025/26), minimum players, second yellow, penalty goalkeeper position, throw-in feet, goal kick, 1-metre wall distance, ball hitting the referee, accidental handball before a goal, scoring from kick-off.
  - **2 club questions from live data:**
    - **top scorer of the last two seasons** (league and cup, from Palloliitto)
    - **highest league played** (worked out from the Palloliitto competitions: currently Nelonen)
    - **founding year** (club setting: 2020)
    - A question is left out when the data can't make it fair, e.g. a tie for top scorer.
- **Questions are data** (`quiz_questions`, en/fi/fr/ar), editable by admins, so no question is hard-coded. Players hidden by the club or who opted out of the website never appear. Scores are not stored.
- Texts in four languages, right-to-left in Arabic. 16 database checks, 21 browser checks.

## Unreleased – news in pages of 9 (branch `phase2/news-pages`)
- **News page:** 9 articles per page instead of the whole archive at once.
  - Under the list: **‹ Previous · 1 2 3 … 5 · Next ›**, with the current page highlighted and "…" when there are many pages.
  - Page 1 stays `/news`; later pages are `/news/page/2`, `/news/page/3` … Each page has its own title ("News – Page 2"), canonical link, "Page 2 of 5" under the heading, and the same one-minute refresh.
  - A page past the end, or one that isn't a number, gives "not found"; `/news/page/1` goes to `/news`.
  - Articles keep their addresses (`/news/<article>`).
- Arabic: the arrows and order follow right-to-left. No database changes.

## Unreleased – reply deadlines, reminders and club emails (branch `phase2/email-reminders`, migration 0048, release 0.36.0)
- **Reply deadline** on every training and game, set automatically: trainings the **day before at 20:00**, games **two days before at 20:00** (Helsinki time). Coaches change it on the training or game page ("Players reply by …"). Players see "Reply by Tue 25.11. 20:00"; after the deadline their replies close, while coaches can still record them.
- **Email reminders** to players who **have not replied**: **3 days before the deadline** and **on the last day** (morning), each sent once.
  - The email names the training or game, the deadline and links straight to it in the app.
  - Players can switch them off in My profile.
  - No reminders to players without an email address or who are blocked by overdue fees.
- **Approval email:** when an admin approves an account, the member gets "Welcome to Afro Foot Club: your account is approved" with the sign-in link, in their language (en/fi/fr/ar).
- **Request alerts:** each new tryout request, team enrolment, invoice request or message from the website sends an email to **info@afrofoot.club** with the name and a link to Admin → Requests (no contact details in the email).
- **How it's sent:**
  - Everything goes from the database: a queue (`email_outbox`), a job every 2 minutes that sends through **Resend**, and a daily job at 08:05 / 09:05 Helsinki time that queues reminders.
  - The Resend key lives only in **Supabase Vault**, not in the website or app.
  - Without the key emails wait (up to 2 days) instead of failing.
  - **Admin overview → "Club emails"** shows whether sending works, how many were delivered, and the last failure.
- 33 database checks, 20 browser checks. Set-up: `docs/RUNNING.md` §3aa.

## Unreleased – game details from Palloliitto (branch `phase2/match-details`, migration 0047, release 0.35.0)
- **Every result opens its game:** on the home page each line under "Latest results" is a link, and the hero's latest result has a **Game details** button. The new page `/results/<game>` shows:
  - the score with both crests and the **half-time score**
  - **Goals and cards**, in time order with the minute and player. Each goal shows the running score, e.g. "28' ⚽ Name 2–1". The club's lines are highlighted.
  - date and kick-off, venue with a map link, **attendance**, competition
- **Sync:** each update also reads played club games in detail (`getMatch`). Missing ones come first, and games from the last 7 days are read again for late corrections. At most 40 games per run; a game the service can't answer is skipped.
- **Kept:** goals, cards, half-time score and attendance. **Not kept:** referees and officials, line-ups, birth years, the raw answer.
- **Privacy:** a club player who removed themselves from the website or was hidden by an admin appears as "Afro Foot Club player". Other teams' scorers are shown as Palloliitto publishes them.
- **Database 0047:** `federation_match_events` (admins write, coaches read, no public access), new columns on `federation_matches`, public views `public_league_fixtures` (extended) and `public_league_match_events`.
- **Fix:** the half-time score reads home–away in Arabic too.
- 13 database checks, 2 new sync tests, 13 browser checks.

## Unreleased – who signed in, with names (branch `phase2/attendance-names`)
- **Trainings and games, for coaches and admins:** every reply summary reads "1 in · 1 out · 12 no reply · of 14 invited". **Show names** opens three groups: *Signed in*, *Signed out* (with the player's note, e.g. "Work shift") and *No reply yet*.
- **Where:**
  - coach → team page (schedule and games)
  - coach → training page (open straight away)
  - **Admin → Events** (trainings and games, which had no replies before)
- One shared component (`components/events/Replies.tsx`). Texts in four languages. No database changes.

## Unreleased – cancelled events hidden from players (branch `phase2/hide-cancelled`)
- **Website → Calendar** and the **player's list in the member app** no longer show cancelled trainings, games, friendlies or club events. Until now they were shown crossed out.
- **Postponed** games and events still show, marked "Postponed", until they get a new date.
- Coaches and admins still see cancelled events in their own lists, with "Restore". No database changes.

## Unreleased – requests inbox (branch `phase2/requests-inbox`, migration 0046, release 0.34.0)
- **Admin → Requests**, a new menu item with the number of new requests:
  - It lists everything sent from the website forms: tryout requests, team enrolments, membership invoice requests and messages (sponsor enquiries are messages marked "Sponsorship").
  - Until now these were only in the database (Supabase Table Editor) and nobody saw them in the app.
- **List:** newest first, open ones by default ("Show handled ones too" for the rest), filters per kind. Each line gives the essentials, e.g. "Forward · 25 years · FC Example".
- **Opening a request:** all its details, email and phone as tap links, the message, and:
  - a **status** (tryouts and enrolments: new → in review → accepted / declined / archived; invoices: new → invoiced → paid / cancelled; messages: new → in review → archived)
  - an internal note
  - a **tryout date** (tryouts) or an **invoice number** (invoices)
  - who handled it is recorded
- Admins only; coaches and players can't see it.
- **Database 0046:** changes to messages are now audited like the other requests, without copying the message text.
- 8 database checks, 16 browser checks. Next step: an email alert for new requests.

## Unreleased – FIFA ID badge (branch `phase2/fifa-badge`)
- The club's **FIFA ID 149PZFE** as an outline badge (design option A) under the logo in the website footer, and on the member app's sign-in page just before "Privacy policy".
- One shared component (`packages/ui` `FifaBadge`, the ID set in one place). Label in four languages (fr "ID FIFA", ar "معرّف FIFA"); the ID always reads left to right.

## Unreleased – player-coach role (branch `phase2/player-coach`, migration 0045, release 0.33.0)
- **New role "Player-coach"** (fi Pelaajavalmentaja, fr Joueur-entraîneur, ar لاعب ومدرب) for a coach who also plays. One account, two areas:
  - It lands on the coach area, with a **"My player page"** button in the header and **"Coaching"** to go back.
  - In the coach area: team rosters, attendance, match day and lineups, evaluations, places, the Palloliitto list.
  - In the player area: calendar replies, fees, contract, profile, the website squad.
- **Making someone a player-coach:** Admin → Members → set the role to **Player-coach**, then add them to the team as a player on the team page (they stay its coach).
- **Safeguards:**
  - A player-coach is never their own coach: they cannot evaluate themselves, set their own goals or read their own private data as coach.
  - On their own player record they can only change what any player can (so no fee exemption for themselves).
  - Their own calendar replies close when the event starts, like for any player. They can still correct their players' replies.
  - They pay fees like a player: the overdue-fee sign-in block applies.
  - Announcements to "players" and to "coaches" both reach them.
- **Database (0045):**
  - helpers `app.is_coach()` / `app.is_playing()`
  - every policy and function that named the coach or player role now uses them; any other policy naming the role (e.g. the places policies, whichever version is installed) is rewritten in place
  - the file runs in one transaction (Supabase SQL Editor)
- 27 database checks (no policy left naming the role directly), 13 browser checks; all existing coach and player tests unchanged.

## Unreleased – email address hidden from spam bots (branch `phase2/email-protect`)
- **info@afrofoot.club** on the website (footer, contact page, women's and juniors' pages, privacy policy) and the club email on the member app's payment page are now **clickable mailto: links that spam bots can't read**. The page carries only an encoded form of the address (reversed, base64), and the browser builds the real link after loading (`packages/ui` `ProtectedEmail`). Harvesters that read the HTML without running scripts find no address. Without JavaScript, a short note is shown instead.
- The address is no longer in the search engines' structured data (a common harvesting source); the phone number stays, and is now a tap-to-call link.
- `packages/ui` declares React as a peer dependency. Texts in four languages.

## Unreleased – version and copyright in the footers (branch `phase2/footer-version`)
- **Website footer:** "© 2026 Afro Foot Club ry · Crafted by Fazao Oy", then the privacy link and "Version v0.32.0 · d2f1d45" (release and deployed commit).
- **Member app:** a new slim footer on every page with the same line.
- The year follows the calendar (Helsinki time). The release comes from each app's `package.json` (now 0.32.0, kept equal to the latest release); the commit comes from Vercel (`VERCEL_GIT_COMMIT_SHA`), so the footer shows which code is live. The company name is set in one place (`packages/ui/src/release.ts`). Texts in four languages.

## Unreleased – sign-in help for admins (branch `phase2/signin-help`, migration 0044, release 0.32.0)
- **Admin → Sign-in help** (also a link on every row in Members): find a member and see why they cannot sign in.
  - **Facts shown:** account status, email confirmed, last sign-in, sign-in method (email and password, Google, Facebook, phone) and unpaid fees.
  - **Problems named, each with its fix:** email not confirmed, waiting for approval, suspended, blocked by overdue fees, signed up with Google or Facebook, phone-only account, never signed in.
- **Actions:**
  - **Send a password reset link.**
  - **Send the confirmation email again.**
  - **Allow sign-in until a date** despite overdue fees, with a reason (up to 90 days). The public payment page link is shown too.
  - Admins never see or set a password and cannot sign in as the member. Every email sent is written to the audit log.
- **Fix: reset and confirmation links now open on any device.** Until now a "Forgot password" link only worked in the browser that asked for it (Supabase's default email template uses PKCE), so opening the email on a phone said "link invalid". These emails are now sent without PKCE, and the new `/auth/hash` page takes over the session the link brings. The recommended `token_hash` template (§3b) still works as before.
- Database: `signin_status()` and `log_signin_help()`, admins only. 11 database checks, 21 browser checks (including resetting a password on a second device).
## Unreleased – contract blanks: fee from the membership plans, clear list of what is missing (branch `phase2/contract-blanks`)
- **Membership fee line in contracts:** when Admin → Contracts → "Membership fee for the season" is left empty, contracts now use the club's active membership plans, e.g. "EUR 240 per year (or EUR 60 per quarter, or EUR 20 per month), invoiced through the Afro Foot Club app". The settings box shows that line and links to Invoices → Membership plans to change the amounts. A text written there still takes precedence.
- **"Some [[…]] blanks are not filled in yet":** a draft contract now lists each missing blank, what it is (the team's season objectives, a fee line, or a blank typed into the text) and a link to where it is filled in, then says to click "Fill in again from the template".
- The "incomplete" warning only shows when there is neither a fee line nor an active plan. No database changes.

## Unreleased – all-time top scorers (branch `phase2/top-scorers`, migration 0043, release 0.31.0)
- **Team page, squad:** a corner card **"All-time top scorers"** beside the squad (above it on phones). It lists the club's top three in league and cup goals from the Palloliitto results service, with games, seasons ("2024–2026") and "former player" where it applies. Friendlies don't count. Black card with the logo band; medals in yellow, white and green.
- **Sync:** also reads the club's goals from every earlier season and cup group (statistics only, no tables or games). Former players are stored off the roster with their name only. A group the service can't answer is skipped.
- **Same safeguards as the squad:** a player who removed themselves in the app, or whom an admin hid, is not listed. Admin → Palloliitto players now offers Hide for former players too.
- **Fix:** every player showed "0 games": Palloliitto puts games in `matches`, not `matches_played`. Corrected at the next update.
- **Fix:** "1 goals" → "1 goal" (plural forms in four languages, Arabic included). The translation check now reads plural messages properly.
- 11 new database checks, 3 new sync tests, 18 browser checks. Set-up: `docs/RUNNING.md` §3u.

## Unreleased – modern standings on the home page (branch `phase2/standings-banner`)
- **Home → Standings:** "Latest results" and the league table (e.g. "Miesten Nelonen · Group 4") get black header banners with the green-to-yellow band from the top of the logo.
- **Results:** a round W / D / L badge per game from the club's side (green win, yellow draw, black loss; read out in full by screen readers), the club's name in bold and the score in a black pill.
- **Table:** a yellow strip "Afro Foot Club: 10. of 12 · 14 points", position badges (leader in green), and the club's row highlighted in yellow.
- **Design system:** the logo's yellow (#EDF70F, token `gold`) is now allowed as a secondary accent, only as a fill with black text (CLAUDE.md, `docs/01-design-system.md`). New texts in four languages; no database changes.

## Unreleased – squad from Palloliitto, no consent needed (branch `phase2/squad-palloliitto`, migration 0042, release 0.30.0)
- **Website, team page:** the squad now lists **every player on the club's current Palloliitto roster** (Palloliitto's public player register), without asking each player first. Only name, shirt number, position, and league goals and games; never birth year or nationality. A note says where the list comes from and how to be removed.
- **Only the current roster:** players removed or marked inactive at Palloliitto are kept for the admin but not shown, and drop off at the next sync. Positions are stored as goalkeeper / defender / midfielder / forward (the service writes English or Finnish).
- **Opt-out instead of opt-in:** My profile → "On the club website" now says the player is shown and offers **"Remove me from the club website"** (and "Show me again"). It applies once the admin has linked the account to the Palloliitto player.
- **Admin → Palloliitto players:** each row says whether the player is on the website, removed themselves, is hidden by the club or is off the roster, with **Hide / Show** (for example when someone asks by email). The sync never overwrites a hide, a self-removal or a link.
- **Privacy policy** (four languages): the public squad is based on the club's legitimate interest and Palloliitto's public register, with the right to object in the app or by email.
- 17 new database checks, updated sync tests, 19 browser checks. Set-up: `docs/RUNNING.md` §3t.

## Unreleased – squad on the website (branch `phase2/squad-consent`, migration 0041, release 0.29.0)
- **Players decide:** a new **"On the club website"** section in My profile, with **"Show me on the club website"** and "Remove me". The database always had this consent, but nobody could set it, so the squad was empty. It says what is shown: name, shirt number, position, nationality, photo, league goals and games.
- **Palloliitto players:** the sync (button and nightly) also stores the club's registered players and their league statistics. It keeps only the id, name, shirt number, position and statistics, never birth year, nationality or licence, and never other teams' players. Admins and coaches can read them.
- **Admin → Palloliitto players:** link each one to the app player. A same-name player is suggested, nothing is linked until you save, and each app player can be linked once. It shows how many are linked and shown, each player's goals and games, and who is on the website.
- **Website, team page:** consenting players with "7 goals · 18 games · 2026" from the latest public league season, or a note that players appear once they choose to.
- **Fix:** the team page was built once and never refreshed, so a player's choice or new statistics needed a redeploy. It now refreshes every minute.
- **Fix:** the league card said "the reason is shown above"; it now says "below".
- Privacy policy: the public squad and the Palloliitto player list are described exactly, in four languages.
- 17 database checks, 3 new sync tests, 20 browser checks. Set-up: `docs/RUNNING.md` §3s.

## Unreleased – "Update the league table now" in the admin (branch `phase2/admin-sync-button`)
- **Admin home → League table (Palloliitto):** shows the club's position, for example "Afro Foot Club: 10. of 12 · 14 points (Miesten Nelonen, 2026)", and the last update or why it failed. **"Update the league table now"** runs the Palloliitto sync right away, as the signed-in admin.
  - It needs only `TORNEOPAL_API_KEY` in the app's Vercel project: no service key and no cron secret. Admins' own rights already allow writing league data.
  - Clear messages for a missing or refused key and for missing settings. A failed update keeps the previous table.
- The sync's database code is shared (`packages/federation/src/supabase.ts`) by this button and the website's nightly route. No database changes.

## Unreleased – sync key details (branch `phase2/fed-key-details`)
- When Supabase refuses `SUPABASE_SERVICE_ROLE_KEY`, the sync's answer adds safe facts about the value, never the key itself: its length, stray spaces or quotes, its role, and whether its project matches `NEXT_PUBLIC_SUPABASE_URL`. A value that isn't an API key (the JWT Secret) is named as such.
- A key pasted with a space or line break around it now works.

## Unreleased – clearer sync messages (branch `phase2/fed-sync-diagnostics`)
- `/api/federation-sync` now says what is wrong instead of answering "disabled" whenever it can't read its settings:
  - the public (anon or publishable) key put in `SUPABASE_SERVICE_ROLE_KEY`
  - the settings couldn't be read (wrong key or project)
  - no settings row (migration 0040 not run in this project)
  - no team configured
  - "disabled" now only means the setting is switched off, with a pointer to `docs/RUNNING.md` §3r
- No database changes.

## Unreleased – league table and results from Palloliitto (branch `phase2/federation-sync`, migration 0040, release 0.28.0)
- **Home page, Standings:** the real league table from the Palloliitto results service: Miesten Nelonen, group 4, 2026, Afro Foot Club highlighted. It's marked "final table" once the club has no games left in it. Next to it are the club's latest five results (league, cup and friendlies). The source line now shows the real update date instead of the fixed "updated 12 min ago".
- **Hero:** "Latest result" shows the newest official result. "Next match" uses the next Palloliitto fixture when none is entered in the app.
- **Off-season:** last season's final table stays until the new season's first games are played. The 2027 season (Miesten Vitonen, group 2) takes over by itself.
- **Fix:** an away game's score was shown in the wrong order next to the team names. Now it's always home team first, with the score in the same order.
- **Sync job:** `/api/federation-sync` runs daily via Vercel Cron and only with `CRON_SECRET`. It needs `TORNEOPAL_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (all server-only). Every run is in `sync_runs`, errors never contain the key, and a failed run keeps the existing data.
- **Database (0040):**
  - Competitions have a season, a kind (league, cup or friendly) and a group name, and are public by default; an admin can still hide one.
  - Teams have an `is_club` flag.
  - The public views carry these fields.
  - The club's team (35118195) is set in the settings.
- **Tests:** 16 tests of the mappers and the sync, against trimmed real answers with no player, referee or official data; 17 database checks; 16 browser checks. Set-up: `docs/RUNNING.md` §3r.

## Unreleased – trainings and games from Admin → Events (branch `phase2/admin-sport-events`)
- **Admin → Events:** the event type list now starts with **Training**, **Game (league)** and **Friendly game** (grouped as "Trainings and games"), then the other events.
  - They are saved exactly like the coaches' own trainings and games, so they appear in the team's calendar, on the coach's pages and, for public teams, on the website.
  - A training or game needs a team, and starts and ends on the same day.
  - **Training:** title, start and end, meeting time and point, place, and a focus (the description, up to 200 characters).
  - **Game:** opponent, home or away, division (required for a league game), kick-off, place. It gets the standard pre-game protocol: meeting 90 minutes before unless a meeting time is given, then warm-up and briefing.
  - Fields that don't apply hide themselves; for a game, that's the end time, end date, description and "on the website".
- New **"Trainings and games"** list on the same page: the next trainings and games of all teams. Attendance and line-ups stay on the coaches' team pages.
- Coaches' own event form is unchanged; they keep their training and game forms on the team page. No database changes.

## Unreleased – home page: fixtures placeholder, 100+ players (branch `phase2/home-placeholders`)
- **Next match placeholder:** when no game is scheduled (off-season, or fixtures not published yet), the hero slide and the "Next match" section say *Fixtures coming soon: league games and pre-season friendlies will appear here as soon as they are confirmed*, with **View calendar** and **Apply for a tryout**. As soon as a game is scheduled in the member app, it replaces the placeholder (within a minute).
- **Hero:** "100+ players" instead of "102+", in the number and in the intro text, in all four languages.
- No database changes.

## Unreleased – player guide on the admin and coach pages (branch `phase2/player-guide`)
- **Player guide card** on the admin and coach home pages: a one-page PDF for players (create an account, sign in, agree to the Code of Conduct, sign the contract, pay the fee) in English, Finnish, French and Arabic.
  - One download button per language (the viewer's own language is highlighted) and **Copy link** to paste the guide's address into WhatsApp or an email.
  - The PDFs (`apps/app/public/guides/player-guide-<lang>.pdf`) hold no personal data and open without signing in, so players can read them before they have an account.
- `scripts/player-guide/`: the guide's text and the steps to rebuild the PDFs after a change (fonts Figtree and Cairo, as on the website). A rebuild fails if a language no longer fits on one page.
- No database changes.

## Unreleased – green Sign in button (branch `phase2/menu-signin`)
- The green **Join the club** button is removed from the header and the phone menu; **Sign in** (to the member app) is now the green button. Join the club stays in the *Join us* menu and on the home page.
- Phones: the header shows the logo, the green Sign in button and a ☰ menu button (the word "Menu" appears from 640 px). Below 360 px the logo is shown without the club name, so the header fits small phones in all four languages.
- No database changes.

## Unreleased – search engines and visitor statistics (branch `phase2/seo`)
- **Every page has its own title and description** in en / fi / fr / ar (for example "Rejoindre le club · Afro Foot Club"); the home page is "Afro Foot Club – football club in Helsinki".
- **News articles** use their headline, summary and cover picture in Google results and in link previews, with article data for Google.
- **Link previews** on Facebook, WhatsApp, LinkedIn and X: a club picture (`og-image.jpg`, 1200×630) for every page.
- **Languages for Google:** each page lists its four language versions (hreflang) and its own canonical address, so the versions are not treated as duplicates and searchers get their language.
- **`/sitemap.xml`** (11 pages and every article, in 4 languages, refreshed hourly) and **`/robots.txt`**; preview deployments are not indexed.
- **Structured data** about the club (sports organisation, logo, contact, Helsinki).
- **Visitor statistics:** Vercel Web Analytics (cookie-free; enable it in the Vercel dashboard). The privacy policy explains it and now also lists Twilio (sign-in codes by text message).
- **Fix:** the News page heading read "أفرو" in Arabic and "News" in French; it now uses the menu word.
- Set-up steps, including Google Search Console: `docs/RUNNING.md` §3p. No database changes.

## Unreleased – website menu with sub-menus (branch `phase2/web-menus`)
- **Four menus instead of twelve links:** Teams ▾ · Matches ▾ · Club ▾ · Join us ▾, then the language, Sign in and a green **Join the club** button. The black top bar is gone; the logo leads home.
  - Teams: Men, Women, Juniors. Matches: Calendar, Results & standings. Club: News, Sponsors & partners, Contact. Join us: Join the club, Book a try-out, Membership & fees, Pay my fee.
  - Each entry has a one-line description, so visitors know what they will find. The menu holding the current page is highlighted.
  - Click or Enter opens a menu; arrow keys move through it; Esc or a click outside closes it.
- **Phones:** Join and ☰ Menu in the header; the menu opens full screen with fold-out groups, Join the club, Sign in and the four languages.
- **Footer** lists every page (now also Women and Juniors).
- Text in en / fi / fr / ar (Arabic opens the menus from the right). No database changes.

## Unreleased – news from the old website (branch `phase2/news-import`)
- **All 37 articles from the old WordPress site** (2021 – March 2026), with their original dates, text, emoji, links, headings, quotes and pictures.
  - `supabase/content/news_import_old_site.sql`: run once in the SQL Editor. Safe to run again: existing articles are left as they are.
  - Pictures (49, resized for the web, 7.5 MB) are part of the website (`apps/web/public/news/<article>/`), so they keep working after the old hosting is cancelled.
  - Videos become "Watch the video" links; Facebook tracking codes are removed from links; Facebook emoji pictures become real emoji.
  - `scripts/import-old-news.py` documents and repeats the conversion.
- **Article page** shows paragraphs, line breaks, "## " headings, "> " quotes, **bold**, links (external ones open in a new tab) and pictures.
  - Built from React elements only: HTML in an article is shown as text, and only https and site links or pictures are accepted.
  - Titles and paragraphs follow their own text direction, so English articles read correctly on the Arabic site.
- **News pages refresh every minute** (new or edited articles show without a deploy); the list shows up to 100 articles.
- **Old addresses keep working:** `/2026/03/15/<article>/` → `/news/<article>`; `/category/…` and `/tag/…` → `/news`.
- No migration. 8 new database checks run the import file twice.

## Unreleased – "My profile" tab (branch `phase2/profile-tab`)
- **Player tabs:** Calendar · Membership · My season · **My profile**. The four tabs fit a phone screen; the selected tab is kept in view.
- **My profile:**
  - **Sport details:** team and division, position, second position, shirt number (set by the coach, read-only), preferred foot, height and weight, phone, and the emergency contact with its relation. A missing phone or emergency contact is flagged.
  - Below it: the photo, and the form to edit sport details, phone and the **emergency contact** (relation drop-down).
- **My season:** keeps the match statistics and training attendance; the profile card moved to My profile (with a link).
- No database changes.

## Unreleased – Membership tab order: payments, team's goals, signed documents (branch `phase2/membership-order`)
- **Player → Membership tab, new order:**
  1. **Payments:** summary, how to pay, invoices, payment history.
  2. **Team's goals:** new. The season goals the club wrote for the player's current team(s) (team page "Season and objectives"), or a note while not written yet.
  3. **Signed documents:** the player contract, then the Code of Conduct, under one heading.
- The "please sign / please agree" banners at the top of the player tabs stay, so moving the documents down hides nothing that needs action.
- Links like `/me/membership#conduct` still work. No database changes.

## Unreleased – emergency contact relation list (branch `phase2/emergency-relation`)
- **Player profile → Emergency contact → Relation is a drop-down:** mother, father, guardian, spouse, partner, sister, brother, daughter, son, grandmother, grandfather, aunt, uncle, cousin, other relative, friend, and **Other…** with a text box.
  - A code is stored (`mother`), shown in each reader's language: "(Mother)" for an English coach, "(Äiti)" in Finnish.
  - Relations typed before the list existed still show as written, under "Other".
  - Shown on the player's season page and the coach's team page.
- **Fix:** the help text above the contract template editor (`contract.templateLead`) showed the raw key in every language, because its `{{…}}` field names were not escaped for the message format. It now lists all fields, including the 0037/0038 ones.
- `pnpm i18n:check` now also fails when a message is not valid ICU, so this cannot happen again. New dev dependency `@formatjs/icu-messageformat-parser` in `packages/i18n` (already used by next-intl).
- No database changes.

## Unreleased – rename teams, coach menu "My teams" (branch `phase2/team-rename-coach-menu`)
- **Admin → Teams → a team → "Rename or edit the team":** change the name, group (Men / Women / Junior / …) and this season's division.
  - The new name shows everywhere at once (coach menus, calendars, website, new contracts). Contracts already sent keep the name they were signed with.
  - A name another team has is refused. The team's internal slug follows the name.
- **Coach menu:** Overview, then **My teams** with the coach's teams under it (Afro Foot Club and any others), then Code of Conduct. On computers the teams are a labelled section of the sidebar; on phones a labelled group in the scrolling row. The group is announced to screen readers.
- Menus can now group entries (`NavItem.group`). No database changes.

## Unreleased – amateur player agreement, release 0.26.0 (branch `phase2/amateur-contract`)
- **New default contract template "Player agreement (amateur)":**
  - Players are not paid; they contribute to the team's costs with the membership fee.
  - What the fee includes (league fee per player, training and games, training ground booking, the app, personal development plan) and what it doesn't (player insurance, player licence).
  - The player buys their own licence, with a link to the licence and insurance prices on the website.
  - A **Fee exemption** section: in rare cases the board may reduce or waive a player's fee for financial reasons, on a proposal from the coach or team manager, kept confidential.
  - The club's and player's obligations are adapted to match.
- **Admin → Contracts → Automatic contracts:** "Membership fee for the season" and the two lists **includes / does not include** (one item per line, prefilled) replace the old fee fields.
- The earlier template is kept (not default). Drafts made before can be updated with "Fill in again from the template".
- **Migration 0038 (run once in the SQL Editor):** new default template, settings lists; 11 new database tests.

## Unreleased – team page without migration 0037 (branch `phase2/teams-page-fallback`)
- The admin team page showed "404 – This page could not be found" when migration 0037 had not been run yet: it asked for the new objectives column. It now opens without the "Season and objectives" box until the migration is in. Automatic contracts likewise leave that line as a blank. No database changes.

## Unreleased – automatic player contracts, release 0.25.0 (branch `phase2/auto-contracts`)
- **Contracts are created when a player joins a team:** approve with a group, bulk "add to a team", or the team page picker. Each player without a contract for the period gets one from the template. The team, season, the team's **Season and objectives** and the club's **fee lines** are filled in.
- **Default "Create and send":** the player gets the "Read and sign" banner straight away. A contract stays a **draft** instead when something is missing (the team's objectives, a fee line, or the player has no app account to sign with). The admin is told how many were sent and how many wait, with a link to the drafts.
- **Admin → Contracts → Automatic contracts:**
  - choose create and send / create as draft / do nothing
  - choose the contract length
  - write once: the fees the club pays, the maximum yearly fees, and the volunteer-event alternative
- **Team page → Season and objectives:** printed in that team's contracts; warns while it is empty.
- **Drafts:** a "Fill in again from the template" button picks up objectives and fees written after the draft was made. The manual "New contract" form fills the same fields.
- **Migration 0037 (run once in the SQL Editor):**
  - `team_seasons.objectives`
  - the private setting `contracts`
  - the template's four `[[…]]` blanks become `{{season_objectives}}`, `{{club_fees}}`, `{{max_fee_per_year}}`, `{{volunteer_amount}}` (only the exact original blank texts are replaced)
  - 10 new database tests
- `supabase/remove_demo_users.sql` also deletes the demo players' contracts.

## Unreleased – sign-up errors in the server log (branch `phase2/signup-logging`)
- When Supabase refuses a sign-up or a text-message code (for example an SMS provider set up wrongly), the app writes Supabase's own error code and message to the server log (Vercel → Logs → `[signup]`). Phone numbers in provider messages are replaced by "[number]". What members see is unchanged.

## Unreleased – approve into a group, bulk actions, player picker (branch `phase2/bulk-roster`)
- **Admin → Members:**
  - **Waiting for approval** panel at the top. Each new account has a **Group** choice: the current season's teams, grouped Men / Women / Junior (Other for the rest). Approving puts the player straight into that team, creating the player record from the account name.
  - **Bulk actions:** tick members in the list (or "Select all on this page") and choose "Approve and add to a team", "Add to a team" or "Approve". The bar shows how many are ticked. The result says how many were approved, added, already in the team, or skipped (not a player, no name, or not yours to manage).
  - Cleaner rows: ticked rows are highlighted, and badges stay on one line.
- **Team page:** the single "Add a player" drop-down is replaced by a **player picker**. Search by name, tick several (also across searches), "Select all shown", and "Add N selected". Players without an app account are marked. Shirt numbers and captain are set in the roster afterwards.
- No database changes: admins already manage players and rosters (RLS admin_all).

## Unreleased – Code of Conduct jump links, invoices after contract and consent, release 0.24.0 (branch `phase2/invoice-consents`)
- **Jump links in the Code of Conduct:**
  - The "Please read and agree" reminder now opens the Code of Conduct at the **players' section** (`#players`); coaches land on the coaches' section (`#coaches`).
  - A contents box at the top offers "Go to the players' section", "Go to “I agree”" and a list of every section.
- **Invoices only after the contract and the Code of Conduct:**
  - A player's membership invoice is issued only once the player has signed a contract that covers the invoice date and agreed to the current Code of Conduct. The player's signature is enough; the club's countersignature is not needed.
  - The membership keeps its invoice date, so the first run after the player has done both invoices that period. Nothing is skipped.
  - Admin → Invoices lists who is waiting and what is missing, with a link to the player's contracts.
  - The rule can be switched off in Billing details (on by default).
- Admin → Contracts accepts `?player=` to show one player's contracts, with that player chosen for a new contract.
- **Migration 0036 (run once in the SQL Editor):** `app.invoice_hold`, a new `app.generate_due_invoices` with the rule, `public.invoice_holds()` for admins, and the billing setting `require_consents`. 22 new database tests.

## Unreleased – lineup style first on phones (branch `phase2/board-mobile-order`)
- Coach match page, lineup board: on phones and tablets the lineup style panel (style, formation, description) now comes before the starting XI pitch, then the players. Wide screens keep the pitch on the left with the style panel and players on the right. The order is the same for keyboard and screen-reader users. No database changes.

## Unreleased – create an account, by email or phone, with a football robot check, release 0.23.0 (branch `phase2/signup`)
- **Create account** on the sign-in page, which opens the new `/signup` page: first and last name, email and password (confirmation link by email), or a **phone number** with a 6-digit code by text message. Google and Facebook remain below. New accounts wait for the club's approval, as before.
- **Sign in with a phone number** (`/login/phone`) for members whose account uses a phone number. Answers never reveal whether a number or email already has an account.
- **Football robot check** on both sign-up forms: "Tap the whistle" among six football pictures (ball, boot, whistle, goal, cone, shirt, trophy, corner flag, goalkeeper glove) in a random order.
  - The challenge is signed with `SIGNUP_CHECK_SECRET` and checked on the server, with a time window.
  - A hidden honeypot field catches form-filling robots.
  - Keyboard and screen-reader friendly (radio buttons), translated.
- "I have read the privacy policy" is required to create an account.
- Phone and email tabs appear only when Phone is switched on in Supabase.
- Admin → Members finds phone accounts by number and marks them. My account shows the sign-in phone when there is no email.
- **Migration 0035 (run once in the SQL Editor):** `profiles.email` is optional, but every profile needs an email or a phone. New accounts take their phone (with country code) from Supabase Auth. 10 new database tests.
- Setup: RUNNING §3k (`SIGNUP_CHECK_SECRET` on Vercel; optional SMS provider in Supabase).

## Unreleased – events, meeting times, website calendar, release 0.22.0 (branch `phase2/events`)
- **Meeting time and place everywhere:** training, games/friendlies and the new events take an optional meeting time (same day, at most 6 hours before) and meeting point.
- **Places:** choose a saved place or add a new one in the form (name, address, city, Google Maps link). "Find it on Google Maps" searches for what was typed; without a pasted link, a Google Maps link is made from the address. Players get the link in their calendar.
- **Other events:** team meetings, social events, tournaments and camps (up to 14 days). Coaches add them for their teams on the team page; admins add club-wide or team events under **Admin → Events**, which also lists the saved places. Cancel and restore.
- **One calendar, two places:** every training, game and event marked "Show on the club website" (on by default) appears on the new website **Calendar** page within a minute, with All / Games / Training / Events filters and "Open in Google Maps". No need to enter anything twice. The home page's next match and results also refresh every minute now, instead of only at deploy.
- Players see events (with type, meeting and details) and training meeting times in their Calendar tab.
- **Migration 0034 (run once in the SQL Editor):** training meeting time, point and website switch; table `club_events` with RLS (admins all; coaches only their teams; members read their own team's and club-wide events); `team_schedule` includes events; view `public_schedule` for the website (public teams only, no meeting points). 35 new database tests.

## Unreleased – lineup before protocol, faster-feeling tabs (branch `phase2/match-order-nav`)
- **Match day order:** on the coach's match page the lineup board now comes first and the pre-game protocol after it (section links too). In the player's calendar the lineup comes before the protocol times.
- **Lineup for players:** once the coach publishes, players see the lineup on a pitch (shirt numbers and surnames, captain, their own marker as "You") and the bench. It is open in the "Next up" card and folded in the month list. Until then, upcoming matches show a placeholder: "Lineup coming soon". Names come from the existing team roster view; teammates' photos stay private. No database changes.
- **Tabs answer at once:** the tapped tab (player tabs, coach and admin menus) is highlighted straight away with a small spinner, a thin green bar runs at the top of the screen, and the page being left dims until the new one arrives. Press effect on tabs.
- **Faster calendar:** the player's Calendar tab now reads its data in two parallel rounds instead of five one after another.
- `supabase/remove_demo_users.sql` also removes demo players from match lineups (it failed when a demo player was in a lineup).

## Unreleased – language drop-down and home link (branch `phase2/lang-home`)
- **Language:** the website and the member app now share one language drop-down (globe, the language's own name: English, Suomi, Français, العربية) instead of four small pills that did not line up. Choosing a language switches at once; on the website you stay on the same page. Without JavaScript a "Change" button (app) or the old links (website) still work.
- **Back home:** on player, coach and admin pages the club logo and area name (My Afro Foot / Coaching / Admin) link back to that area's main page from anywhere, including My account. The member's name still opens My account.
- No database changes.

## Unreleased – pitch lines watermark (branch `phase2/pitch-watermark`)
- Faint pitch markings (design canvas "Page watermarks", option A) behind every signed-in page: player, coach and admin. A sideways pitch on wide screens, an upright one on phones.
- Decorative only: fixed behind the content, never catches clicks or focus, hidden from screen readers, left out in high-contrast mode and when printing. The sign-in screens keep the ball arcs.
- No database changes.

## Unreleased – privacy policy (branch `phase2/privacy`)
- New page **/privacy** on the website in en/fi/fr/ar: who is responsible, what the website and member app collect, purposes and legal bases (GDPR), what is public, who can see what, service providers and transfers, retention periods, rights, **how to delete your data** (`#delete`, the address Facebook Login asks for), children, cookies (only necessary ones; no analytics), security, changes.
- The club's business ID, address and contact email come from the billing settings (Admin → Invoices), so nothing is typed twice.
- Links from the website footer, the membership and tryout forms (next to the consent boxes) and the member app's sign-in page.
- Draft for the club board to approve. No database changes.

## Unreleased – sign in with Google or Facebook, release 0.21.0 (branch `phase2/social-login`)
- **Continue with Google / Continue with Facebook** on the sign-in page, under the email form. A button only shows once that provider is switched on in Supabase; setup steps in docs/RUNNING.md §3h (the keys stay in Supabase, nothing in the code or on Vercel).
- New route `/auth/callback` finishes the sign-in (PKCE) with the same rules as the password sign-in: new accounts wait for approval as pending players, suspended accounts are refused, players with overdue fees get the payment notice, and the member returns to the page they wanted. An existing account with the same email is the same member.
- **Migration 0033 (run it once in the SQL Editor):** new accounts take their first and last name from the Google or Facebook account (full_name / given_name / family_name). 7 new database tests.
- Messages for a cancelled sign-in, a provider without an email address, and other failures, in all four languages.

## Unreleased – "ball arcs" background (branch `phase2/ball-arcs`)
- New shared background `@afrofoot/ui/ball-arcs` (design canvas option C): passing lines draw themselves between players, a ball travels along each pass and the players pulse. One self-contained SVG (CSS and SVG animation, no JavaScript), decorative (`aria-hidden`), scales to any screen. With "reduce motion" on, the lines stay still and the balls and pulses are hidden.
- **Website:** the home page hero uses it instead of the background video (`/hero.mp4` is still in `public/`, so it can come back).
- **Member app:** sign-in, forgot password, reset password and the public payment page show it behind the card (a tall version on phones, a wide one on larger screens).
- No database changes.

## Unreleased – lineup board, release 0.20.0 (branch `phase2/lineup-board`)
- **Fix:** the chosen lineup style did not reach the lineup formation (the style was saved separately and the board then saved its old formation over it). Style, formation, instructions, plan, lineup, bench, captain and rotation plan are now one board saved in one step.
- **Lineup style drop-down** with the description, shape, line counts and a mini pitch beside the pitch; **format and formation** drop-down grouped 11, 9, 8, 7 and 5 v 5; quick format buttons. Changing style or format keeps the players and re-places them by position. **Migration 0032 (run it once in the SQL Editor):** formations get a size; 18 new shapes for 9, 8, 7 and 5 v 5.
- **Drag and drop** (mouse, pen and touch) from the list or bench onto the pitch, marker onto marker to swap, onto the bench, back to the list; tap-to-place still works.
- **Player cards:** photo, shirt, preferred positions, reply and note, training attendance, season minutes, Call and WhatsApp. **Player photos:** players upload their own photo (shrunk to 512 px in the browser); coaches of their teams can view it (storage policy in 0032).
- **Rotation plan** (coaches only, table `match_rotation_plan`): planned substitutions with planned minutes per player beside their season minutes, for fair playing time; Auto-fill prefers players with fewer minutes; planned changes are offered in the live console.
- **Availability** summary with filters and a reminder message for players without a reply.
- **Export and sharing:** PNG, JPG, Share image (WhatsApp, Spond, … on phones), a 5-second animated video clip (MP4/WebM), copy as text.
- 24 new database tests.

## Unreleased – match day for coaches, release 0.19.0 (branch `phase2/match-day`)
- **Migration 0031 (run it once in the SQL Editor):** pre-game protocol and game plan on matches (times checked to be before kick-off, at most 6 hours before), `save_lineup` to save a whole lineup in one step under the coach's own access rights, and coaches' read access to their players' contracts (never drafts). 29 new database tests.
- **Add matches and friendlies** from the coach's team page, with the standard protocol (meeting 90, warm-up 60, briefing 20 minutes before kick-off). Team page lists matches with live and published badges and recent results; coach home shows the next matches.
- **Match day page:** pre-game protocol (meeting time and place, warm-up, strategy briefing, kick-off; the next step is highlighted); **game plan** with six lineup styles — Balanced 4-4-2, Defensive 5-3-2, Midfield domination 4-1-4-1, High press 4-3-3, Counter-attack 4-5-1, Wing play 3-4-3 — that set the formation and instructions (defensive line, pressing, width, tempo), plus a plan for the players; **lineup builder** on a pitch with auto-fill from positions and replies, swap, bench (up to 12), captain, lineup checks (goalkeeper, players who said no, out of position), copy as text and publish; **live scoreboard** with clock, kick-off / half time / second half / full time, quick buttons, substitutions limited to players on the pitch and unused substitutes, undo, timeline and automatic player statistics at full time.
- **Players** see on each match in their Calendar the protocol times and meeting point, the live or final score, and once the lineup is published whether they start (and captain), are on the bench or not selected, with the style and plan.
- **Coaches** can read their players' contracts (status in the roster, read-only page and PDF) and the Code of Conduct, and agree to it themselves; a reminder shows until they do.

## Unreleased – player contracts, event sign-in/out, how to pay, release 0.18.0 (branch `phase2/contracts`)
- **Digital player contracts (migration 0030, run it once in the SQL Editor):** Admin → Contracts drafts a 1-, 2- or 3-year contract for a player from an editable English template (player, team, dates filled in; `[[…]]` blanks must be completed before sending). Sending locks the text and stores its SHA-256 fingerprint. The player reads it on the Membership tab and signs by typing their full name (checked against their account) and ticking the box, or declines with a reason; an admin countersigns to make it active, and can cancel before that or terminate later. PDF with both electronic signatures for the player and admins. Confidential: coaches and other players cannot read contracts. Only one live contract per player for the same dates. Reminders: a banner for the player, a count on the admin overview and in the menu. 39 new database tests.
- **Sign in / out of events (migration 0029):** "I'm in" / "I'm out" with an optional note on every training, match and friendly in the player's Calendar, saved in place without leaving the page (also works without JavaScript). Answers close when the event starts or if it is cancelled; the answer time is set by the database. Coaches see in / out / no reply on each training, and a new **Upcoming matches** list on their team page with who is in or out and why. 17 new database tests.
- **How to pay (fix for the broken payment link):** "See payment options" now opens a **How to pay** section on the Membership tab with the club's IBAN and BIC and, for each open payment, the reference number, amount, due date and the Finnish virtual bank barcode, each with a Copy button. Blocked players get a public **/pay** page in the app instead of a link to the public website.
- The invoice QR code opens the Membership tab.

## Unreleased – player tabs and Code of Conduct, release 0.17.0 (branch `phase2/player-tabs`)
- **Player page tabs:** **Calendar** (every training, match and friendly of the player's teams, one month at a time with previous / next, grouped by day in Helsinki time, a "Next up" card, cancelled events struck through, place with map link), **Membership** (Code of Conduct, payments, invoices, payment history) and **My season** (season stats, training attendance, player profile). Team, position and shirt stay in the header above the tabs.
- **Code of Conduct (migration 0028, run it once in the SQL Editor):** `conduct_versions` (the club's Code of Ethics, version 2027, full text plus PDF) and `conduct_consents` (one per player and version). Players read the text and tick "I have read … and agree" — only for the current version and only for themselves; consent cannot be changed or deleted afterwards. 20 new database tests.
- **Flags:** players who have not agreed see a banner on every tab. Admins see the count on the overview with a "See who" link, a "not agreed" filter and a badge in Members, and a badge in team rosters; coaches see the badge in their rosters.
- The invoice PDF's QR code now opens the Membership tab.

## Unreleased – invoices for players and admins (branch `phase2/invoice-views`)
- **Player page:** a **My invoices** section right under the payment summary: one card per invoice with number, the months it covers, amount, due date or paid date, status (open, overdue, paid) and a large **Open invoice (PDF)** button.
- **Admin → Invoices:** search by player name or invoice number, filter by status (open, overdue, paid) and month issued, 25 per page with paging, totals (count and euros) for open, overdue and paid that follow the filters; click a player to see only their invoices. Mark paid keeps the filters.
- **Admin → Members:** an **Invoices** link under each member who has a player record, opening their invoices.
- No database changes.

## 0.16.0 automatic membership invoices (merged in #21)
- **Database (migration 0027, run it once in the SQL Editor):** `payment_lines` (invoice rows; players read their own, admins all), a public `billing` setting for the club's invoice details, `app.generate_due_invoices()` and a nightly `pg_cron` job (04:15 UTC). An invoice covers one plan period — one line per month (12 for a yearly plan, like the club's current invoices), one line for a season — and the membership's next invoice date moves on, so a period is never invoiced twice. Nothing is issued while the IBAN is missing. 27 new database tests.
- **Invoice PDF** (`/invoices/<id>`), one A4 page in the layout of the club's existing invoices: logo and payer, invoice details, lines and totals, company band and Finnish bank transfer slip with **valid reference number** and **bank barcode** (version 4, Code 128 C, checked by decoding), plus a QR code and link to the player's page. Opens only for the player it belongs to and for admins.
- **Admin → Invoices:** readiness and "Create due invoices now", latest invoices (PDF, Mark paid), memberships of the current season (add, stop / resume automatic invoices), plans (add, activate / deactivate), club billing details (IBAN and business ID validated).
- **Player page:** "Invoice (PDF)" next to each invoice in the payment history.

## Unreleased – coach area: teams, training schedule, attendance (branch `phase2/coach`)
- Coach home: my teams this season (also in the navigation), a to-do list of past sessions still waiting for attendance, and the next sessions. A coach without a team sees how to get assigned.
- Team page: training schedule (planned, done, cancelled) and **Add training** (date, start and end in Helsinki time, place, focus, optionally weekly for up to 20 weeks); roster sorted by shirt with position, each player's attendance % this season (excused not counted), emergency contact, and **Call** / **WhatsApp** buttons.
- Session page: mark attendance with large buttons (present, late, absent, excused, not marked), **All present** in one tap, works without JavaScript; players who joined after the session was planned are included; marking opens on the session's day; a marked session counts as done; cancel a session.
- Everything is limited to the coach's own teams by the database (app.coaches_ts); forged team, session, player or value is refused. Players see the result in their Training this season figures.
- Accessibility: sticky action bars no longer hide focused or scrolled-to fields (scroll-padding).
- No database changes.

## Admin teams and roster (merged in #18)
- Admin **Teams**: seasons (add, make current — one at a time), teams per season (name, category, division; an existing team with the same name is reused), player and coach counts.
- Team page: roster with shirt number (1–99, unique among active players), position and captain (one per team); remove keeps history (leave date) and re-adding reopens the row; former players listed. Coaches and staff: assign members with the coach role (role and optional title), remove.
- Members approved as players get a player record automatically when first added to a team; coaches get a staff record when first assigned. A member without a name is refused with a clear message.
- Demo script assigns the demo coach to the sample team.
- No database changes (admin_all policies and the audit trigger cover these tables).

## Player portal: sport profile, season stats, training (merged in #17)
- Player home: position and shirt number; **This season** (games played, goals, assists, minutes, cards, clean sheets for goalkeepers, last 5 matches with score) from `match_player_stats`; **Training this season** (attended, missed, excused, attendance %, late arrivals) from `session_attendance`; **My player profile** card with missing details flagged.
- `/me/profile`: preferred foot, height, weight, phone (WhatsApp, with country code), emergency contact (name, relation, phone). Position is shown but stays with the coach (database: `app.restrict_columns`). Players' phone now lives here (`player_private`, visible to their coaches), so the Account page hides its phone field for players.
- Forms keep what was typed after a validation error (player profile and account).
- Demo script adds sport data on the sample season: positions, a phone and emergency contact, match stats and 8 training sessions with attendance.
- No database changes.

## Member app, part 3: player page and account (merged in #16)
- Player home (`/me`): team, paid / still owed / overdue totals, a clear status message (all paid, amount and next due date, or overdue with the date sign-in will be blocked), the club's exemption if any, a "See payment options" button to the public Membership page, and the payment history. Data comes from `my_payment_summary()` and `my_payments` (migration 0022), which only return the signed-in player's own payments.
- Account page (`/account`, all roles; open it by clicking your name in the black bar): edit first and last name, phone (with country code, stored as +358…) and language; change password. Role, status and email cannot be changed here (database trigger).
- Phone layout: wide tables scroll inside their card instead of widening the page (also on the admin Members and Audit log pages).
- `supabase/demo_users.sql` now adds sample payments (one up to date, one overdue inside the grace period, one fully paid); the removal script deletes them too.
- No database changes.

## Member app, part 2a: admin user management (merged in #14)
- Admin area gets a sidebar: Overview (active, pending and suspended counts, members per role, pending approvals), Members and Audit log.
- Members: search by name or email, filter by role and status, approve pending accounts, suspend and reactivate, change roles. Club administrators manage coaches and players; only a super administrator manages administrator accounts; nobody changes their own account here. The database trigger `guard_profiles` and RLS enforce the same rules.
- Audit log: every change, newest first, with who, what and old → new values (redacted fields shown as private). Read-only.
- No database changes.

## Member app, part 1 (merged in #13)
- Member app (`apps/app`): sign in with email and password, sign out, password reset by email, and role-based routing: super and club administrators → `/admin`, coaches → `/coach`, players → `/me`. Other areas send a member back to their own.
- Pending and suspended accounts are refused with a message. Players blocked for overdue fees (hook from migration 0022) see "Sign-in blocked" with a link to the public Membership page, also when an open session's token refresh is refused.
- Language follows the profile (saved when the member switches), or the browser language when signed out. English, Finnish, French and Arabic (right to left).
- Validation with zod on the server (password 10–72 characters, as Supabase Auth). The reset form never reveals whether an account exists, and `?next=` only accepts paths on this site.

## 0.16.0 – 2026-11-15
- Fix: loading a saved or preset lineup no longer overrides the chosen lineup style, and the style description always matches the pitch.
- Lineup style is a drop-down (grouped 11 v 11, 9 v 9, 7 v 7, 5 v 5) with its description, shape and line counts shown beside the pitch. Changing style keeps the players and re-places them by position.
- Drag and drop: from the player list or bench onto the pitch, marker onto marker to swap, onto the bench to remove.
- Rotation plan with planned minutes per player, availability (RSVP) summary and filter, live match clock, JPG download and share (WhatsApp etc.). Video clips are not included.
- Warning colours no longer use yellow.

## 0.15.0 – 2026-11-13
- Typeface changed from Nunito to **Figtree** (round, modern, easy to read) for all Latin text and headings, the lineup page and the exported lineup image. Arabic stays Cairo.

## 0.14.3 – 2026-11-13
- Fix: the "Player enrolment" title uses the same green as the other section titles.

## 0.14.2 – 2026-11-13
- Join page: "Apply for a tryout" and "Player enrolment" are collapsible cards (closed by default, opened by links such as "Enrol" or "Apply for a tryout"); the enrolment description now sits under its title.
- Enrolment nationality is a country list (common countries first, then all countries in the visitor's language) stored as an ISO code; shown in the summary step (migration 0025).
- Birth-date calendar restyled: dark panel with clearly visible month, year and arrow controls.
- FAQ "How much is membership?" now reads: 20 € a month; choose monthly, quarterly or yearly; pay by MobilePay, wire transfer or invoice.

## 0.14.1 – 2026-11-13
- Lineup: realistic grass pitch; each player is a shirt in the team colour (goalkeeper in a contrasting colour) with the player's photo above the number. Photos also appear in the player pool and in the exported image. Without an uploaded photo a placeholder portrait is shown.
- Birth-date fields: selectable calendar with month and year pickers (language-aware, keyboard accessible, no future dates).
- Phone fields: country code required (e.g. +358 40 123 4567) with live formatting and validation; the database enforces it for new and changed numbers (migration 0024, constraints `*_e164`, NOT VALID so old rows are untouched until cleaned and validated).

## 0.14.0 – 2026-11-13
- Lineup builder: auto-fill XI (position and availability aware), player availability (available/late/injured/away), search and position filters, substitutes strip, live lineup check (goalkeeper, shape, out-of-position, unavailable players, captain, bench), tactic arrows, undo/redo, kit colour and pitch style, names toggle.
- Saved lineups with private coach notes (`lineup_templates`, coaches of the team and admins only), image download and copy-as-text for sharing.
- Fix: player markers on the pitch were squashed by a hero-slider style.

## 0.13.0 – 2026-11-13
- Players see their payment status (paid / still owed / overdue, history) on their own page (`my_payments`, `my_payment_summary()`).
- Sign-in is refused for players whose fees are overdue beyond a grace period (default 14 days), via the Supabase `custom_access_token_hook`; admins can toggle the policy, set the grace period and exempt players (`fee_policy`, `set_fee_exemption`, `fee_overview`).
- Preview: player payments card, blocked sign-in message, admin fee policy card.

## 0.12.2 – 2026-11-13
- Membership: insurance prices per year by age/status (born 2020+: 10 EUR, born 2015: 70 EUR, born 2009–2011: 230 EUR, adult amateur 395/150 EUR, contracted amateur 695/325 EUR). Rows are flagged "To verify" until checked against the federation table (`federation_fees.verified`).
- Removed the claim that under-12s are covered for free.

## 0.12.1 – 2026-11-13
- Fixed: insurance options for ages 20–69 were not listed (only a reference to 12–19). Broad, narrow and optional leisure cover are now shown for 12–19 and 20–69, with the adult-league note for 20–69.

## 0.12.0 – 2026-11-13
- Membership page: included = league fee per player, training and games, training ground booking, the app, personal development plan; not included = player insurance, player license.
- Federation fees by age (player license 2026: 27 / 43 / 53 EUR, insurance options per age) with an age selector; stored in `federation_fees` (admin-editable, `verified` flag). Prices are indicative until an admin verifies them on palloliitto.fi.
- How to pay: MobilePay, bank payment via Paytrail (provider added), invoice request form with membership options (`invoice_requests`).
- New Sponsors page: current sponsors with descriptions, sponsor packages (`sponsor_packages`), how-to steps and an enquiry form; menu and footer link to it.

## 0.11.0 – 2026-11-13
- New public Team page listing the men's, women's and junior teams (men's squad cards live here).
- Join the club page now contains the tryout form and the player enrolment wizard (before the questions); the separate Enrol page and the front-page tryout form are removed.
- Membership: included = team training, jersey and training bibs without personal name, the app; not included = player license, training ball, other training kits, shoes, socks, warm-up suits, drinking bottle.
- Fixed: "Back to top" label had been overwritten by "Upcoming." in 0.9.1–0.10.0.

## 0.10.0 – 2026-11-13
- Separate public pages: Enrolment (own page with header and footer), Membership, Join the club, Contact; main menu and footer link to them (Home, News, Team, Membership, Join, Sponsors, Contact).
- Membership fees set to 20 EUR / month, 60 EUR / quarter, 240 EUR / year (migration 0017).
- Fixed: the enrolment page rendered underneath the front page in the preview.

## 0.9.1 – 2026-11-13
- Player enrolment removed from the front page (the "Want to play?" block); it is reached from the new "Join" menu item and from the team pages.
- New Women and Juniors pages marked "Upcoming." with sample details (age group, training, venue, coach, season start) to be filled in later.
- "Play with us!" band moved down 24 px.

## 0.9.0 – 2026-11-13
- Hero: dark video slider with four slides using current club data (club intro, next match + countdown, latest result, open training / tryout); pause, arrows, dots, swipe, keyboard, reduced-motion aware.
- Version history: release log (`app_releases`, super admin writes, admins read) and revision history with restore for pages and news (`content_revisions`, `restore_revision()`).
- Public footer shows the current version (`public_app_version`).

## 0.8.0 – 2026-11-13
- Rounded typeface (Nunito), pill buttons, soft cards.

## 0.7.0 – 2026-11-12
- Big-club editorial design (two-tier menu, results/standings modules, tiles, values footer).

## 0.6.0 – 2026-11-10
- Saved locations, event types (practice/game/friendly + division), route guide, enrolment page.

## 0.5.0 – 2026-11-06
- Training schedule, admin ratings, MVP voting (published after 24 h), profile with required photo.

## 0.4.0 – 2026-11-02
- Tryout form, membership plans (monthly/quarterly/yearly), MobilePay / wire / invoice.

## 0.3.0 – 2026-10-28
- Arabic (RTL), lineups, live match events.

## 0.2.0 – 2026-10-24
- English/Finnish/French, design system.

## 0.1.0 – 2026-10-20
- Database, roles, row-level security, audit log.
