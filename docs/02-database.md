# Database

PostgreSQL 15 (Supabase). UUID primary keys everywhere. 25 migrations in `supabase/migrations`, applied in order.
| File | Content |
|---|---|
| 0001 | enums, `app` schema, updated_at helper |
| 0002 | profiles, seasons, teams, team_seasons, locations, players (+private, medical), staff, rosters |
| 0003 | training programs, sessions, attendance |
| 0004 | competitions, matches, availability, squads, player stats |
| 0005 | evaluations, goals, membership plans, memberships, payments, expenses |
| 0006 | CMS, requests, announcements, notifications, audit_log |
| 0007 | role helpers, column guards, profile guard, signup trigger, roster automation, publish_announcement, audit triggers |
| 0008 | RLS (enabled on every public table; default deny) + grants |
| 0009 | public/roster views, finance_summary, storage buckets + policies |
| 0011 | federation mirror: competitions, teams, matches, standings, players, player stats, sync_runs, public standings/fixtures views |
| 0010 | translations (fi/fr) on CMS, staff, announcements, plans, criteria; locale on request forms; `app.localized()` |

## Design rules
- **History:** a team in a season is `team_seasons`; rosters, sessions, matches hang off it with `ON DELETE RESTRICT`, so past seasons cannot be wiped.
- **Integrity:** CHECKs for dates, scores, amounts, ratings; unique jersey per roster and per match squad; one membership per player per season; one current season.
- **Automation:** attendance/availability rows are generated from the roster by triggers (players only ever UPDATE their own response).
- **Audit:** `audit_log` is append-only (no grants to API roles); 24 tables audited; private tables log column names only.
- **Privileges:** `anon` has no table access except SELECT on published CMS tables and INSERT on the two request forms; everything else goes through RLS.

## Testing
`sh supabase/tests/run_tests.sh` builds a scratch database (with a minimal Supabase stub), applies all migrations and runs 100+ assertions:
role isolation, team isolation, column-level guards, privilege-escalation attempts, public exposure, audit privacy, integrity constraints.
Phase 1 result: **124 / 124 passing** on PostgreSQL 16.

## Known limits / follow-ups
- Coaches are trusted for their own teams' rows (every change audited); finer column limits can be added if needed.
- Rate limiting of public forms is not a database concern: add Vercel/Cloudflare rate limit + CAPTCHA (Phase 7).
- `supabase gen types` output is added once the Supabase project exists.

## Migration 0012 — lineups, live events, Arabic
- `formations` (8 reference formations, 11 pitch slots each), `matches.formation / live_state / live_started_at`, `match_squad.slot / captain`.
- `app.check_squad`: roster players only, max 11 starters and 12 substitutes, one captain, one player per slot, locked for coaches after kickoff (admins can still correct).
- `match_events` (goal, assist, penalty, own goal, cards, substitution, injury, note, kickoff/half-time/full-time). Coaches of the team insert and **void** events (never delete); admins can correct finished matches. Triggers recompute the score, live state, match status and per-player statistics (`match_player_stats`) after every change.
- Public views `public_match_events` and `public_lineups`: players who did not consent appear as "Player #shirt"; injuries, notes and voided events never appear.
- Arabic (`ar`) allowed in translations and in locale columns. 169 automated checks pass.

## Migration 0013 — tryouts and billing
- `tryout_requests`: public insert only (anon), admin read/manage, coaches excluded. Under-18 requires guardian name and phone; link restricted to `https://tulospalvelu.palloliitto.fi/…`; one open request per email + birth date; applicants cannot set review fields; audit redacted to column names. View `tryout_requests_admin` adds age.
- Billing: plan periods month / quarter / season / year / one_off; payment methods cash, bank_transfer, mobilepay, card, invoice, other. Wire transfers and invoices get a Finnish reference number automatically; invoices also get a number. MobilePay payments carry `provider_ref` (unique) and `checkout_url`; `payment_events` stores webhooks idempotently and is unreadable to every client role.

## Migration 0014 — schedule, ratings, MVP, profile
- `training_schedules` (weekly template) + `generate_training_sessions(schedule, until)`: idempotent, Europe/Helsinki times, max 120 days ahead; allowed for admins, the team's coaches and the server job. Attendance lists are seeded by the existing trigger.
- `player_ratings` (1–10, category, note): administrators only; coaches and players cannot read them.
- MVP: `matches.completed_at` is stamped when a match becomes played. `mvp_votes`: only squad players, one vote each, not for themselves, changeable until 24 h after the match. Counts are invisible until then (`mvp_result()` for the team and staff, `public_mvp` for the website). `send_mvp_reminders()` (scheduled job) notifies squad players who have not voted: right after the match and 12 h later.
- Player profile: `players.profile_completed_at` can be set only with a photo, date of birth, position and phone. Photo path must be an image inside the owner's folder; the bucket accepts JPEG/PNG/WebP up to 5 MB.
- Tryouts: date of birth, position, phone, e-mail and names are mandatory; age is always computed from the date of birth.

## Migration 0015 — locations, event types, enrolment
- `locations` gain kind, address, coordinates, map link (https only), directions, parking, public-transport notes. Unique name per city. Admins manage all; coaches can save new locations and edit their own; every member can read them (route guide for players). The app builds Google/Apple Maps links from the coordinates.
- `matches.event_type` (game / friendly) and `division`: a game requires a division, a friendly does not. Practices stay in `training_sessions`. View `team_schedule` merges practices, games and friendlies for coaches, admins and players (team-scoped by RLS).
- `public_fixtures` now exposes event type, division, venue address and route link.
- `player_enrolments`: public insert, admin-only read; terms and privacy acceptance mandatory; guardian required under 18; one open enrolment per e-mail + birth date; preferred plan and payment method (MobilePay / wire / invoice). `public_membership_plans` lists active plans for the form. `approve_enrolment()` (admins only, once) creates the prospect player and its private contact record; the server then e-mails the invitation to create the account and profile (photo required).

## 0016 Versions and revisions
- `app_releases`: release log (semver unique). Admins read, only super admin writes, audited. View `public_app_version` exposes only the latest version number for the footer.
- `content_revisions`: automatic snapshot of every real change to `pages` and `news_posts` (no-op saves ignored), with changed fields, optional note (`set_config('app.change_note', ...)`), author, time. Admin read only; no client writes.
- `public.restore_revision(id, note)`: admin only; writes the old content back as a NEW revision and sets it to draft. History is never rewritten.
- Release process: bump `VERSION`, add a `CHANGELOG.md` entry and an `app_releases` row (super admin) for each deployment.

## 0017 Membership fees
Plans `Monthly` 20 EUR, `Quarterly` 60 EUR, `Yearly` 240 EUR (upserted by name; edit in the admin app, not in code). Shown publicly through `public_membership_plans`.

## 0018 Release 0.11.0
Release-log entry only (no schema change).

## 0019 Fees, invoices, sponsor packages
- `federation_fees`: Palloliitto license/insurance info per season and age band; public read, admin write, `verified` flag (seed values for 2026 are indicative, unverified).
- `invoice_requests`: public insert only (one open request per email + plan), admin read/update, audited with redaction.
- `payments.provider` / `payment_events.provider` now allow `paytrail` (credentials only in server env, webhook handling same idempotent pattern as MobilePay).
- `sponsor_packages`: public read, admin write. `contact_messages.company` for sponsor enquiries (topic `partnership`).


## 0020–0022 notes
- 0020/0021: release rows and insurance price rows (all `verified=false` until checked against Palloliitto).
- 0022 – fee status and sign-in block: `fee_policy` (singleton: enabled, grace_days), `players.fee_exempt_until/reason`, `app.player_blocked()`, `app.is_active()` now false for blocked players, views/functions `my_payments`, `my_payment_summary()`, `fee_overview()`, `set_fee_exemption()`.
- **Enable the sign-in block:** in Supabase Dashboard → Authentication → Hooks, enable "Custom Access Token" and point it to `public.custom_access_token_hook` (local: already in `supabase/config.toml`). A blocked player receives error `membership_fees_overdue` (403). Because blocked players cannot sign in, payment must stay possible from the public Membership page (MobilePay/Paytrail/invoice form).

- 0023 – `lineup_templates`: saved formations with positions, bench, captain, arrows and private `coach_notes`; RLS: admins and the team's coaches only (players and anon have no access); audited. Player availability (late/injured/away) in the preview is sample data; in production it comes from `match_availability` and injury records.
- 0024 – phone numbers must be international (`+` and 7–15 digits after removing spaces, dashes and brackets) on profiles, player_private, join_requests, tryout_requests, player_enrolments and invoice_requests. Constraints are `NOT VALID`: they apply to new and edited rows. After cleaning existing data run `alter table … validate constraint …_e164`.
- 0025 – `player_enrolments.nationality` must be a two-letter ISO country code (`NOT VALID`: applies to new and edited rows).
