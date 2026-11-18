-- 0047 Game details from the Palloliitto results service (release 0.35.0).
-- The sync now also reads each played club game in detail (getMatch): half-time score, attendance, and the goals and
-- cards with minute, team and player. The website opens a page per game from the home page's results.
-- Kept: only those facts. Not kept: referees and officials, line-ups, birth years, the raw answer.
-- A club player who removed themselves from the website or was hidden by an admin (migration 0042) appears without a
-- name on the public page; other teams' scorers are shown as the results service publishes them.

alter table federation_matches
  add column ht_home int check (ht_home between 0 and 99),
  add column ht_away int check (ht_away between 0 and 99),
  add column attendance int check (attendance between 0 and 200000),
  add column details_synced_at timestamptz;

create table federation_match_events (
  id uuid primary key default gen_random_uuid(),
  match_external_id text not null references federation_matches(external_id) on delete cascade,
  seq int not null check (seq between 1 and 500),
  kind text not null check (kind in ('goal', 'yellow', 'red')),
  minute int check (minute between 0 and 200),
  team_external_id text not null check (char_length(team_external_id) <= 20),
  player_external_id text check (char_length(player_external_id) <= 20),
  player_name text check (char_length(player_name) <= 120),
  score_home int check (score_home between 0 and 99),
  score_away int check (score_away between 0 and 99),
  synced_at timestamptz not null default now(),
  unique (match_external_id, seq)
);
alter table federation_match_events enable row level security;
create policy admin_all on federation_match_events for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy coach_read on federation_match_events for select to authenticated using (app.is_coach());
revoke all on federation_match_events from anon;

-- The website's games: the 0040 view plus half-time score, attendance, crests and whether details exist.
create or replace view public_league_fixtures as
select m.external_id, m.competition_external_id, c.name as competition, c.category, c.kind, c.season, m.kickoff_at,
       m.home_name, m.away_name, m.home_goals, m.away_goals, m.venue, m.status,
       coalesce(h.is_club, false) as home_is_club, coalesce(a.is_club, false) as away_is_club, m.synced_at,
       m.ht_home, m.ht_away, m.attendance, h.logo_url as home_logo, a.logo_url as away_logo, m.details_synced_at is not null as has_details
from federation_matches m
join federation_competitions c on c.external_id = m.competition_external_id and c.show_publicly
left join federation_teams h on h.external_id = m.home_external_id
left join federation_teams a on a.external_id = m.away_external_id;
grant select on public_league_fixtures to anon, authenticated;

-- Goals and cards of public games. side: home or away; a club player who opted out or was hidden has no name.
create view public_league_match_events as
select e.match_external_id, e.seq, e.kind, e.minute,
       case when e.team_external_id = m.home_external_id then 'home' else 'away' end as side,
       coalesce(t.is_club, false) as is_club,
       case when t.is_club and (coalesce(fp.hidden, false) or coalesce(p.website_hidden, false)) then null else e.player_name end as player_name,
       e.score_home, e.score_away
from federation_match_events e
join federation_matches m on m.external_id = e.match_external_id
join federation_competitions c on c.external_id = m.competition_external_id and c.show_publicly
left join federation_teams t on t.external_id = e.team_external_id
left join federation_players fp on fp.external_id = e.player_external_id
left join players p on p.id = fp.player_id;
grant select on public_league_match_events to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.35.0','feature','Game details',
  'Each result on the website opens a page with the half-time score, the goals and cards with minutes and players, the venue and attendance, from the Palloliitto results service.','2026-11-18')
on conflict (version) do nothing;
