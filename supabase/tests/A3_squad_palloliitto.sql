-- 0042 Squad from Palloliitto's public list: everyone on the club's current roster, minus opt-outs. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fc000000-0000-0000-0000-000000000001', 'pl-admin@example.test', '{"first_name":"Pl","last_name":"Admin"}'),
 ('fc000000-0000-0000-0000-000000000002', 'pl-coach@example.test', '{"first_name":"Pl","last_name":"Coach"}'),
 ('fc000000-0000-0000-0000-000000000003', 'pl-one@example.test', '{"first_name":"Pl","last_name":"One"}'),
 ('fc000000-0000-0000-0000-000000000004', 'pl-two@example.test', '{"first_name":"Pl","last_name":"Two"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fc000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'fc000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('fc000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000004');
insert into players (id, profile_id, first_name, last_name, status, position) values
 ('fc500000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000003', 'Pl', 'One', 'active', 'forward'),
 ('fc500000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000004', 'Pl', 'Two', 'active', 'defender');
-- what the sync stores: the club's team, another club's team, and players on and off the roster
insert into federation_teams (external_id, name, is_club) values ('7700001', 'Pl Club', true), ('7700002', 'Pl Rivals', false)
  on conflict (external_id) do update set is_club = excluded.is_club;
insert into federation_competitions (external_id, name, category, season, kind) values ('pl26/M4/4', 'Pl 2026', 'Miesten Nelonen', 2026, 'league');
insert into federation_players (external_id, team_external_id, display_name, shirt_number, position, on_roster, player_id) values
 ('8801', '7700001', 'Pl One', 9, 'forward', true, 'fc500000-0000-0000-0000-000000000003'),
 ('8802', '7700001', 'Pl Two', 4, 'defender', true, 'fc500000-0000-0000-0000-000000000004'),
 ('8803', '7700001', 'Pl Unlinked', 1, 'goalkeeper', true, null),
 ('8804', '7700001', 'Pl Gone', 7, null, false, null),
 ('8805', '7700002', 'Pl Rival', 10, 'midfielder', true, null);
insert into federation_player_stats (player_external_id, competition_external_id, appearances, goals) values ('8801', 'pl26/M4/4', 12, 5);

-- ---------- listed without consent ----------
select t.anon();
select t.check('everyone on the club roster is listed, linked or not', (select count(*) from public_squad where display_name in ('Pl One', 'Pl Two', 'Pl Unlinked')) = 3);
select t.check('players off the roster are not listed', not exists (select 1 from public_squad where display_name = 'Pl Gone'));
select t.check('other clubs'' players are not listed', not exists (select 1 from public_squad where display_name = 'Pl Rival'));
select t.check('league goals and games are shown', (select goals = 5 and appearances = 12 and stats_season = 2026 from public_squad where display_name = 'Pl One'));
select t.check('the squad view shows no birth, nationality or app ids', not exists (select 1 from information_schema.columns where table_name = 'public_squad'
  and column_name in ('date_of_birth', 'birthyear', 'nationality', 'player_id', 'profile_id', 'hidden', 'on_roster')));
select t.check('anon cannot read the Palloliitto list itself', t.raises($$select 1 from federation_players$$));

-- ---------- the player opts out ----------
select t.login('fc000000-0000-0000-0000-000000000003');
select t.check('a player removes themselves', t.rows($$update players set website_hidden = true where profile_id = 'fc000000-0000-0000-0000-000000000003'$$) = 1);
select t.check('a player cannot remove someone else', t.rows($$update players set website_hidden = true where profile_id = 'fc000000-0000-0000-0000-000000000004'$$) = 0);
select t.check('a player cannot hide or show Palloliitto rows', t.rows($$update federation_players set hidden = false where external_id = '8801'$$) = 0);
select t.anon();
select t.check('a player who opted out is gone', not exists (select 1 from public_squad where display_name = 'Pl One')
  and exists (select 1 from public_squad where display_name = 'Pl Two'));
select t.login('fc000000-0000-0000-0000-000000000003');
select t.check('and can come back', t.rows($$update players set website_hidden = false where profile_id = 'fc000000-0000-0000-0000-000000000003'$$) = 1);
select t.anon();
select t.check('then they are listed again', exists (select 1 from public_squad where display_name = 'Pl One'));

-- ---------- the club hides ----------
select t.login('fc000000-0000-0000-0000-000000000002');
select t.check('a coach cannot hide a player', t.rows($$update federation_players set hidden = true where external_id = '8803'$$) = 0);
select t.login('fc000000-0000-0000-0000-000000000001');
select t.check('an admin hides a player', t.rows($$update federation_players set hidden = true where external_id = '8803'$$) = 1);
select t.anon();
select t.check('a hidden player is gone', not exists (select 1 from public_squad where display_name = 'Pl Unlinked'));
select t.login('fc000000-0000-0000-0000-000000000001');
select t.check('positions are limited to the four', t.raises($$update federation_players set position = 'Hyökkääjä' where external_id = '8802'$$));
select t.admin();
select t.check('release 0.30.0 present', exists (select 1 from app_releases where version = '0.30.0'));
rollback;
