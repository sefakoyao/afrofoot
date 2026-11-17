-- 0040 League standings and results from the Palloliitto results service (Torneopal). Release 0.28.0.
-- The sync job (apps/web /api/federation-sync, run by Vercel Cron with the service role) fills the federation_* tables of
-- migration 0011; the website reads the two public views. The mappers are tested against real answers
-- (packages/federation/src/map.test.ts). Raw answers are not stored (payload stays empty): they name referees and players.
--  * competitions: one row per group (e.g. etejp26/M4/4), with its season, its kind (league, cup, friendly) and group name.
--    New competitions are public by default; an admin can still hide one (show_publicly = false), and the sync never
--    changes that choice afterwards.
--  * teams: is_club marks Afro Foot Club's own teams (from the settings), so the website can highlight them.
--  * views: the website's standings and results, with season, kind and the club flag; still column-limited.
--  * settings: the club's Palloliitto team (35118195, tulospalvelu.palloliitto.fi/team/35118195) and the sync switched on.

alter table federation_competitions
  add column season int check (season between 2000 and 2100),
  add column kind text not null default 'league' check (kind in ('league', 'cup', 'friendly')),
  add column group_name text check (char_length(group_name) <= 80),
  alter column show_publicly set default true;
alter table federation_teams add column is_club boolean not null default false;
alter table federation_matches
  add constraint federation_matches_status check (status is null or status in ('played', 'fixture', 'cancelled', 'forfeited')) not valid;
create index on federation_matches (home_external_id, kickoff_at);
create index on federation_matches (away_external_id, kickoff_at);

drop view public_standings;
drop view public_league_fixtures;

-- League tables of public competitions. is_club: this row is one of Afro Foot Club's teams.
create view public_standings as
select s.competition_external_id, c.name as competition, c.category, c.group_name, c.season, s.position, s.team_name,
       coalesce(ft.is_club, false) as is_club, s.played, s.won, s.drawn, s.lost, s.goals_for, s.goals_against, s.points, s.synced_at
from federation_standings s
join federation_competitions c on c.external_id = s.competition_external_id and c.show_publicly and c.kind = 'league'
left join federation_teams ft on ft.external_id = s.team_external_id;

-- Games of public competitions (league, cup, friendlies), with which side is the club.
create view public_league_fixtures as
select m.external_id, m.competition_external_id, c.name as competition, c.category, c.kind, c.season, m.kickoff_at,
       m.home_name, m.away_name, m.home_goals, m.away_goals, m.venue, m.status,
       coalesce(h.is_club, false) as home_is_club, coalesce(a.is_club, false) as away_is_club, m.synced_at
from federation_matches m
join federation_competitions c on c.external_id = m.competition_external_id and c.show_publicly
left join federation_teams h on h.external_id = m.home_external_id
left join federation_teams a on a.external_id = m.away_external_id;

grant select on public_standings, public_league_fixtures to anon, authenticated;

-- The club's team on the results service; kept if an admin already configured teams.
update site_settings set value = value || jsonb_build_object('enabled', true, 'team_ids', jsonb_build_array('35118195'))
where key = 'federation' and coalesce(jsonb_array_length(value -> 'team_ids'), 0) = 0;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.28.0','feature','League table and results from Palloliitto',
  'The website shows the league table and the club''s results straight from the Palloliitto results service, updated automatically; last season''s final table stays until the new season starts.','2026-11-17')
on conflict (version) do nothing;
