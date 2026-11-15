# Changelog

Format: [Semantic Versioning](https://semver.org). The same history lives in the database table `app_releases`
(shown to admins in the app) and every edit of a website page or news post is kept in `content_revisions`.

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
