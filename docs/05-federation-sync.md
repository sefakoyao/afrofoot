# Federation sync — Palloliitto results service (Torneopal)

**Goal:** league standings, fixtures/results and player stats for Afro Foot appear automatically on www.afrofoot.club and in the app,
without anyone retyping them.

## Security of the API key
- The key is a **server-side secret** (`TORNEOPAL_API_KEY`, set in Vercel/hosting environment). It is not in the repository, not in
  any `NEXT_PUBLIC_` variable, never sent to the browser, never logged; client errors never contain it.
- The key was shared in a chat: treat it as exposed once and ask Torneopal/Palloliitto to **rotate it before launch**.
- Confirm the key's permitted use (read-only, rate limits, display/attribution rules) with Palloliitto.

## Architecture
```
Vercel Cron (every 15–60 min) → server route → TorneopalClient → upsert into federation_* tables → site/app read the DB
```
- The public site never calls the federation API live (fast, resilient, no key exposure).
- `payload jsonb` stores each raw API object, so a mapping fix is a re-map, not a re-fetch.
- Every run is recorded in `sync_runs` (status, rows, error); the admin Security/Federation page shows the last run.
- Linking is **manual and explicit**: an administrator links `federation_teams` → our teams and `federation_players` → our players
  (no automatic name matching; wrong links would put the wrong person's stats on a profile).
- Publishing is opt-in per competition (`federation_competitions.show_publicly`); the public views expose standings and fixtures only.

## Features this enables
| Feature | Source | Where |
|---|---|---|
| League table (e.g. M4) | standings | home page, club page, app dashboard |
| Fixtures and results | matches | "next match" card, calendar (prefills our `matches`) |
| Player goals, cards, appearances | player stats (if available) | player profile, team stats, admin analytics |
| Opponent info and venues | matches/venues | match page |

## Current status
- **Done and tested (release 0.28.0, migration 0040):** mappers (`packages/federation/src/map.ts`) and the sync run (`sync.ts`), tested against trimmed real answers for Afro Foot Club (`fixtures/`, no player, referee or official data): `pnpm --filter @afrofoot/federation test`.
  The sync route `apps/web/src/app/api/federation-sync` (Vercel Cron, `CRON_SECRET`), the public views and the home page's Standings section. Set-up: `docs/RUNNING.md` §3r.
- Verified commands: `getTeam` (team_id → groups per season), `getGroup` (competition_id, category_id, group_id → table), `getMatches` (team_id → all games). Errors come back as HTTP 200 with `call.status = "error"`.
- **Not done yet:** player statistics (`federation_players`, `federation_player_stats`: the answers name players, so linking stays manual and needs an admin screen) and an admin "sync now" button.
