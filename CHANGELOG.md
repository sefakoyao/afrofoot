# Changelog

Format: [Semantic Versioning](https://semver.org). The same history lives in the database table `app_releases`
(shown to admins in the app) and every edit of a website page or news post is kept in `content_revisions`.

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
