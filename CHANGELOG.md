# Changelog

Format: [Semantic Versioning](https://semver.org). The same history lives in the database table `app_releases`
(shown to admins in the app) and every edit of a website page or news post is kept in `content_revisions`.

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
