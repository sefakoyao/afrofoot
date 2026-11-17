-- 0042 Squad on the website from Palloliitto's public player list. Release 0.30.0.
-- The club decided to show its players as registered with Palloliitto (public there), without asking each player first.
-- Legal basis: the club's legitimate interest in presenting its team (stated in the privacy policy). Safeguards:
--  * Only name, shirt number, position, and league goals and games: never birth year, nationality or licence.
--  * Only the current roster (players removed or inactive at Palloliitto drop off at the next sync).
--  * Opt-out: a player removes themselves in the member app (players.website_hidden, linked players), and an admin can
--    hide anyone (federation_players.hidden), e.g. on request by email. The sync never overwrites either choice.
alter table federation_players
  add column on_roster boolean not null default true,
  add column hidden boolean not null default false;
-- positions as the website filters them (the first sync of 0041 stored the service's own words)
update federation_players set position = case
  when lower(position) ~ 'goal|maalivahti|^mv$' then 'goalkeeper' when lower(position) ~ 'defen|puolustaja' then 'defender'
  when lower(position) ~ 'midfield|keskikent' then 'midfielder' when lower(position) ~ 'forward|hy.kk' then 'forward' else null end
where position is not null;
alter table federation_players add constraint federation_players_position check (position is null or position in ('goalkeeper', 'defender', 'midfielder', 'forward'));

alter table players add column website_hidden boolean not null default false;
comment on column players.website_hidden is 'The player removed themselves from the squad on the club website (opt-out, migration 0042).';
-- players may change this themselves (same list as 0007, plus website_hidden)
drop trigger restrict_cols on players;
create trigger restrict_cols before update on players for each row
  execute function app.restrict_columns('preferred_foot','height_cm','weight_kg','bio','photo_path','show_publicly','website_hidden','updated_at');

-- The website's squad: the club's current Palloliitto roster, minus anyone hidden; latest public league season's statistics.
create view public_squad as
select fp.external_id as id, fp.display_name, fp.shirt_number, fp.position, st.goals, st.appearances, st.season as stats_season
from federation_players fp
join federation_teams ft on ft.external_id = fp.team_external_id and ft.is_club
left join players p on p.id = fp.player_id
left join lateral (
  select fs.goals, fs.appearances, c.season
  from federation_player_stats fs
  join federation_competitions c on c.external_id = fs.competition_external_id and c.kind = 'league' and c.show_publicly
  where fs.player_external_id = fp.external_id
  order by c.season desc nulls last, fs.appearances desc
  limit 1
) st on true
where fp.on_roster and not fp.hidden and not coalesce(p.website_hidden, false);
grant select on public_squad to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.30.0','feature','Squad from Palloliitto',
  'The website''s squad shows the club''s players as registered with Palloliitto: name, shirt number, position, league goals and games. Players can remove themselves in My profile; admins can hide a player.','2026-11-17')
on conflict (version) do nothing;
