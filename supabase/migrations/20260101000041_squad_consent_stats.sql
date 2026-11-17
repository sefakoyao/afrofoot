-- 0041 Squad on the website: the player's own consent, with goals and games from Palloliitto. Release 0.29.0.
--  * Players switch "Show me on the club website" on or off in the member app (players.show_publicly, which the
--    restrict_columns trigger of 0007 already lets them change). Only they appear in public_players.
--  * The Palloliitto sync stores the club's registered players (id, name, shirt number, position: no birth year,
--    nationality or licence) and their league statistics, admin- and coach-readable only (0011 policies).
--  * An admin links each Palloliitto player to the app player (federation_players.player_id); never automatic.
--    One Palloliitto player per app player.
--  * public_players gains goals and games of the latest public league season, for linked players only.
alter table federation_players add column position text check (char_length(position) <= 40);
create unique index federation_players_one_link on federation_players (player_id) where player_id is not null;
create index on federation_player_stats (player_external_id);

-- Same columns as before (0009), then the statistics: only players who chose to be shown, as before.
create or replace view public_players as
select p.id, (p.first_name || ' ' || p.last_name) as display_name, p.position, p.nationality, p.photo_path, tp.jersey_number, t.name as team_name,
       st.goals, st.appearances, st.season as stats_season
from players p
join team_players tp on tp.player_id = p.id and tp.left_on is null
join team_seasons ts on ts.id = tp.team_season_id and ts.is_public
join seasons s on s.id = ts.season_id and s.is_current
join teams t on t.id = ts.team_id
left join lateral (
  select fs.goals, fs.appearances, c.season
  from federation_players fp
  join federation_player_stats fs on fs.player_external_id = fp.external_id
  join federation_competitions c on c.external_id = fs.competition_external_id and c.kind = 'league' and c.show_publicly
  where fp.player_id = p.id
  order by c.season desc nulls last, fs.appearances desc
  limit 1
) st on true
where p.show_publicly and p.status = 'active';
grant select on public_players to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.29.0','feature','Squad on the website',
  'Players choose in My profile whether they appear on the club website. Those who do are listed with their shirt number, position and, once an admin links them to Palloliitto, their league goals and games.','2026-11-17')
on conflict (version) do nothing;
