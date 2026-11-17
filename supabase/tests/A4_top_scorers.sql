-- 0043 All-time top scorers (view public_top_scorers). Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fd000000-0000-0000-0000-000000000001', 'ts-admin@example.test', '{"first_name":"Ts","last_name":"Admin"}'),
 ('fd000000-0000-0000-0000-000000000003', 'ts-one@example.test', '{"first_name":"Ts","last_name":"One"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fd000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'fd000000-0000-0000-0000-000000000003';
insert into players (id, profile_id, first_name, last_name, status) values ('fd500000-0000-0000-0000-000000000003', 'fd000000-0000-0000-0000-000000000003', 'Ts', 'One', 'active');
-- other test files may leave club teams behind: this file's numbers are only about its own players
update federation_teams set is_club = false;
insert into federation_teams (external_id, name, is_club) values ('7800001', 'Ts Club', true), ('7800002', 'Ts Rivals', false)
  on conflict (external_id) do update set is_club = excluded.is_club;
insert into federation_competitions (external_id, name, category, season, kind) values
 ('ts22/M6/6', 'Ts 2022', 'Miesten Kutonen', 2022, 'league'), ('ts25/M5/6', 'Ts 2025', 'Miesten Vitonen', 2025, 'league'),
 ('tscup25/MSC/1', 'Ts Cup 2025', 'Suomen Cup', 2025, 'cup'), ('tsfr25/H/1', 'Ts Friendlies', 'Harjoitus', 2025, 'friendly');
insert into federation_players (external_id, team_external_id, display_name, on_roster, player_id) values
 ('7701', '7800001', 'Ts Current Striker', true, 'fd500000-0000-0000-0000-000000000003'),
 ('7702', '7800001', 'Ts Former Legend', false, null),
 ('7703', '7800001', 'Ts Midfielder', true, null),
 ('7704', '7800001', 'Ts Fourth', true, null),
 ('7705', '7800001', 'Ts Friendly Hero', true, null),
 ('7799', '7800002', 'Ts Rival', true, null);
insert into federation_player_stats (player_external_id, competition_external_id, appearances, goals) values
 ('7701', 'ts25/M5/6', 18, 9), ('7701', 'tscup25/MSC/1', 2, 3),          -- 12 in league and cup
 ('7702', 'ts22/M6/6', 20, 15),                                          -- 15, a former player
 ('7703', 'ts25/M5/6', 20, 6),                                           -- 6
 ('7704', 'ts25/M5/6', 10, 4),                                           -- 4: fourth, not shown
 ('7705', 'tsfr25/H/1', 5, 40), ('7705', 'ts25/M5/6', 3, 1),             -- friendlies do not count: 1
 ('7799', 'ts25/M5/6', 20, 30);                                          -- another club's player

select t.anon();
select t.check('top three by league and cup goals, former players included', (select string_agg(display_name || ':' || goals, ',' order by rank) from public_top_scorers) = 'Ts Former Legend:15,Ts Current Striker:12,Ts Midfielder:6');
select t.check('games, seasons and former player flag', (select appearances = 20 and not current_player and first_season = 2022 and last_season = 2022 from public_top_scorers where rank = 1)
  and (select appearances = 20 and current_player and first_season = 2025 from public_top_scorers where rank = 2));
select t.check('since: the first season with statistics', (select min(since_season) = 2022 from public_top_scorers));
select t.check('the view shows no ids, birth or nationality', not exists (select 1 from information_schema.columns where table_name = 'public_top_scorers'
  and column_name in ('external_id', 'player_external_id', 'player_id', 'id', 'date_of_birth', 'birthyear', 'nationality')));
select t.login('fd000000-0000-0000-0000-000000000003');
select t.check('a player removes themselves from the website', t.rows($$update players set website_hidden = true where profile_id = 'fd000000-0000-0000-0000-000000000003'$$) = 1);
select t.anon();
select t.check('then they are not listed among the scorers either', (select string_agg(display_name, ',' order by rank) from public_top_scorers) = 'Ts Former Legend,Ts Midfielder,Ts Fourth');
select t.login('fd000000-0000-0000-0000-000000000001');
select t.check('an admin hides a former player', t.rows($$update federation_players set hidden = true where external_id = '7702'$$) = 1);
select t.anon();
select t.check('a hidden player is not listed', not exists (select 1 from public_top_scorers where display_name = 'Ts Former Legend'));
select t.admin();
update federation_competitions set show_publicly = false where external_id = 'ts25/M5/6';
select t.anon();
select t.check('a competition hidden by the club does not count', not exists (select 1 from public_top_scorers where display_name in ('Ts Midfielder', 'Ts Fourth')));
select t.check('anon cannot read the statistics table itself', t.raises($$select 1 from federation_player_stats$$));
select t.admin();
select t.check('release 0.31.0 present', exists (select 1 from app_releases where version = '0.31.0'));
rollback;
