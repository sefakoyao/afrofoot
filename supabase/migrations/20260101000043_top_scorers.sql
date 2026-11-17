-- 0043 All-time top scorers on the team page. Release 0.31.0.
-- The sync now also reads the club's goals from every official group it has played on the Palloliitto results service
-- (earlier seasons and cups; never friendlies). Former players are stored off the roster with their name only.
-- The website shows the top three of the club's league and cup goals, with the same safeguards as the squad (0042):
-- a player hidden by the club or who removed themselves in the app is never listed.
-- Fix: games played come from "matches" in the service's answer ("matches_played" is empty); the next sync corrects them.

create view public_top_scorers as
with totals as (
  select fp.display_name, fp.on_roster,
         sum(fs.goals)::int as goals, sum(fs.appearances)::int as appearances,
         min(c.season) as first_season, max(c.season) as last_season
  from federation_players fp
  join federation_teams ft on ft.external_id = fp.team_external_id and ft.is_club
  left join players p on p.id = fp.player_id
  join federation_player_stats fs on fs.player_external_id = fp.external_id
  join federation_competitions c on c.external_id = fs.competition_external_id and c.kind in ('league', 'cup') and c.show_publicly
  where not fp.hidden and not coalesce(p.website_hidden, false)
  group by fp.external_id, fp.display_name, fp.on_roster
)
select (row_number() over (order by goals desc, appearances, display_name))::int as rank,
       display_name, goals, appearances, on_roster as current_player, first_season, last_season,
       (select min(c.season) from federation_competitions c
         join federation_player_stats fs on fs.competition_external_id = c.external_id
         where c.kind in ('league', 'cup') and c.show_publicly) as since_season
from totals
where goals > 0
order by rank
limit 3;
grant select on public_top_scorers to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.31.0','feature','All-time top scorers',
  'The team page shows the club''s three all-time top scorers in league and cup games, from the Palloliitto results service. Games played per player are now counted correctly.','2026-11-17')
on conflict (version) do nothing;
