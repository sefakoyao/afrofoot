# Afro Foot 2.0 — Analysis (Phase 1)

## 1. Existing identity (read from www.afrofoot.club on 13 Nov 2026)
| Item | Finding |
|---|---|
| Name | Afro Foot Club (legal: Afro Foot Club ry), founded 2020, Finland, FIFA ID 149PZFE |
| Tagline | "Where the world plays as one." — "a no-nation, no-color team" |
| Values | Unity, inclusion, diversity — 40+ players from 20+ countries |
| Navigation | Home · News · The Club (Overview, The Staff, Player List, Sponsors) · Contact |
| Home sections | Welcome, main-sponsor announcement (Montel Intergalactic, 2026 kits), calls to action (join as player / follow / partner), Afro News, standings (M4), next game, partner logos |
| Partners | Montel Intergalactic (main), Palloliitto (Finnish FA), Musine, Dosmar (PCE) |
| Contact | info@afrofoot.club · +358 50 477 3030 · Sefako Yao, GM |
| Social | facebook.com/afrofootclub · twitter.com/AfroFootClub · instagram.com/afrofootclub |
| Logo | Supplied by the club (AFC-LOGO-2025.png): black shield, green AFRO FOOT, green-to-yellow top band with 4 stars, ivory lion, "2020". Colours sampled: green #3DAF2C, ivory #F8F4EC, black. Stored in packages/ui/assets |
| Language | English today. **Decision (13 Nov): the new site and app are trilingual: English, Finnish, French.** |

**Not obtainable from this environment** (network allowlist; the homepage HTML exposes no colour or font values): the logo file itself, exact brand hex codes, fonts, and the sub-pages
(The Club, Staff, Players, News archive). Colour decision: colours come from the official logo: green, black and white, no yellow (see design system).
These values were seeded into `site_settings` so the new site starts with correct club facts.

## 2. Product scope
Two apps, one Supabase project (shared Auth, Postgres, Storage):
- **www.afrofoot.club** (`apps/web`): public site + content shown from CMS tables; join / contact / partnership forms.
- **app.afrofoot.club** (`apps/app`): secure management app with four role experiences.

## 3. Roles
| Role | Purpose | Experience |
|---|---|---|
| super_admin | Owns the platform; only role that can create/remove administrators | desktop, sidebar |
| club_admin | Runs the club: people, teams, money, content | desktop, sidebar |
| coach | Runs own team(s): training, attendance, matches, squads, evaluations | mobile-first, bottom tabs |
| player | Own schedule, availability, stats, membership, private profile | mobile-first, bottom tabs |

Sign-up always creates a **pending player**. Elevation and activation are administrator actions (enforced by a database trigger, not the UI).

## 4. Modules → data model
| # | Module | Tables |
|---|---|---|
| 1 | Public website + CMS | pages, news_posts, sponsors, site_settings, contact_messages, join_requests, public_* views |
| 2 | Registration & auth | auth.users → profiles (trigger), account_status |
| 3 | Players | players, player_private, player_medical |
| 4 | Coaches & staff | staff_members, team_staff |
| 5 | Teams & seasons | seasons, teams, team_seasons, team_players (history preserved: restrict deletes) |
| 6 | Training programs | training_programs, training_sessions, locations |
| 7 | Schedules / calendars | training_sessions, matches (calendar = union, built in Phase 5) |
| 8 | Attendance & availability | session_attendance, match_availability (rows generated from roster by triggers) |
| 9 | Matches & competitions | competitions, matches |
| 10 | Squads & lineups | match_squad (starter/substitute, shirt numbers unique per match, publish flag) |
| 11 | Results & stats | matches.goals_*, match_player_stats |
| 12 | Development | evaluation_criteria, evaluations, evaluation_scores, development_goals |
| 13 | Membership | membership_plans, memberships |
| 14 | Payments & finance | payments, expenses, `finance_summary()` |
| 15 | Announcements & notifications | announcements, notifications, `publish_announcement()` |
| 16 | Reports & analytics | views/functions added Phase 6 on the tables above; audit_log for admin oversight |

## 5. Privacy decisions (GDPR-oriented, EU hosting)
- Public player list is **opt-in** (`players.show_publicly`) and exposed only through a column-limited view.
- Contact/emergency data and medical notes are separate tables; medical notes are visible to the player and administrators only.
- Audit log of private tables stores **column names only**, never values.
- Recommended Supabase region: EU (Frankfurt). Minors: date of birth is optional; guardian handling is an open question below.

## 6. Open questions (need the club's answer)
1. Fonts (the logo lettering is a rounded sporty face; Barlow Condensed is used meanwhile).
2. Do you have players under 18 (guardian consent, separate fees)?
3. ~~Languages~~ — decided: English, Finnish, French. Who translates the existing news/page content into Finnish and French (the club, or draft translations reviewed by the club)?
4. Payment collection: manual recording (bank transfer/MobilePay/cash) first, or an online provider (Stripe, Paytrail, MobilePay Vipps) in Phase 6?
5. Existing data to migrate (players, news, results): in what format (WordPress export, spreadsheet)?
6. Standings: keep entering league results manually, or link to the Palloliitto / M4 source?
7. Supabase, Vercel and GitHub accounts: who owns them, and who is the first super administrator?
