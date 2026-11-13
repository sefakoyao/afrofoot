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

## Current status (honest)
- **Done and tested:** database tables + RLS + public views (10 new tests), key-safe HTTP client (7 tests against a mock server: retries, timeout, 403, bad JSON, no key leakage, path-injection guard).
- **Not done:** mappers and the sync route. The official help page could not be read (blocked for automated readers) and this build
  environment cannot reach the API, so exact command names/response fields are unverified. Writing mappers now would be guesswork.

## Next steps
1. Run the probe on a normal machine: `TORNEOPAL_API_KEY=… pnpm fed:probe "Afro Foot"` → creates `packages/federation/fixtures/*.json` (key redacted).
2. Send those files (or the saved help page). Then: mappers + tests against the real responses, the sync route, and the admin linking screen.
3. Put the team and competition IDs into `site_settings.federation` and set `enabled: true`.
