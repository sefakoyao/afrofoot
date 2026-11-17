-- 0041 Squad on the website: the player's own consent, Palloliitto links (admins only) and league statistics. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fb000000-0000-0000-0000-000000000001', 'sq-admin@example.test', '{"first_name":"Sq","last_name":"Admin"}'),
 ('fb000000-0000-0000-0000-000000000002', 'sq-coach@example.test', '{"first_name":"Sq","last_name":"Coach"}'),
 ('fb000000-0000-0000-0000-000000000003', 'sq-one@example.test', '{"first_name":"Sq","last_name":"One"}'),
 ('fb000000-0000-0000-0000-000000000004', 'sq-two@example.test', '{"first_name":"Sq","last_name":"Two"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fb000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'fb000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('fb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000004');
insert into seasons (id, name, starts_on, ends_on, is_current) values ('fb200000-0000-0000-0000-000000000001', 'Sq season', current_date - 30, current_date + 300, false);
update seasons set is_current = false where is_current;
update seasons set is_current = true where id = 'fb200000-0000-0000-0000-000000000001';
insert into teams (id, name, slug) values ('fb300000-0000-0000-0000-000000000001', 'Sq Team', 'sq-team');
insert into team_seasons (id, team_id, season_id, is_public) values ('fb400000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001', 'fb200000-0000-0000-0000-000000000001', true);
insert into players (id, profile_id, first_name, last_name, status, position) values
 ('fb500000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000003', 'Sq', 'One', 'active', 'forward'),
 ('fb500000-0000-0000-0000-000000000004', 'fb000000-0000-0000-0000-000000000004', 'Sq', 'Two', 'active', 'defender');
insert into team_players (team_season_id, player_id, jersey_number) values ('fb400000-0000-0000-0000-000000000001', 'fb500000-0000-0000-0000-000000000003', 9), ('fb400000-0000-0000-0000-000000000001', 'fb500000-0000-0000-0000-000000000004', 4);
-- what the sync stores
insert into federation_competitions (external_id, name, category, season, kind) values ('sq26/M4/4', 'Sq 2026', 'Miesten Nelonen', 2026, 'league'), ('sq25/M5/6', 'Sq 2025', 'Miesten Vitonen', 2025, 'league'), ('sqcup/MSC/1', 'Sq Cup', 'Cup', 2026, 'cup');
insert into federation_players (external_id, team_external_id, display_name, shirt_number, position) values ('9001', '35118195', 'Sq One', 9, 'forward'), ('9002', '35118195', 'Sq Two', 4, 'defender');
insert into federation_player_stats (player_external_id, competition_external_id, appearances, goals) values ('9001', 'sq26/M4/4', 18, 7), ('9001', 'sq25/M5/6', 15, 11), ('9001', 'sqcup/MSC/1', 1, 3);

-- ---------- the player decides ----------
select t.anon();
select t.check('nobody is listed without consent', (select count(*) from public_players where display_name like 'Sq %') = 0);
select t.login('fb000000-0000-0000-0000-000000000003');
select t.check('a player switches on their own listing', t.rows($$update players set show_publicly = true where profile_id = 'fb000000-0000-0000-0000-000000000003'$$) = 1);
select t.check('a player cannot switch on someone else', t.rows($$update players set show_publicly = true where profile_id = 'fb000000-0000-0000-0000-000000000004'$$) = 0);
select t.check('a player cannot read the Palloliitto list', (select count(*) from federation_players) = 0 and (select count(*) from federation_player_stats) = 0);
select t.check('a player cannot link themselves', t.rows($$update federation_players set player_id = 'fb500000-0000-0000-0000-000000000003' where external_id = '9001'$$) = 0);
select t.anon();
select t.check('the consenting player is listed', (select count(*) from public_players where display_name = 'Sq One') = 1 and (select count(*) from public_players where display_name = 'Sq Two') = 0);
select t.check('not linked yet: no statistics', (select goals is null and appearances is null from public_players where display_name = 'Sq One'));

-- ---------- the admin links ----------
select t.login('fb000000-0000-0000-0000-000000000002');
select t.check('a coach reads the Palloliitto list but cannot link', (select count(*) from federation_players where external_id like '900%') = 2
  and t.rows($$update federation_players set player_id = 'fb500000-0000-0000-0000-000000000003' where external_id = '9001'$$) = 0);
select t.login('fb000000-0000-0000-0000-000000000001');
select t.check('an admin links a Palloliitto player', t.rows($$update federation_players set player_id = 'fb500000-0000-0000-0000-000000000003' where external_id = '9001'$$) = 1);
select t.check('one Palloliitto player per app player', t.raises($$update federation_players set player_id = 'fb500000-0000-0000-0000-000000000003' where external_id = '9002'$$));
select t.check('position is limited to 40 characters', t.raises($$update federation_players set position = repeat('x', 41) where external_id = '9002'$$));
select t.anon();
select t.check('the listed player shows the latest league season''s goals and games', (select goals = 7 and appearances = 18 and stats_season = 2026 from public_players where display_name = 'Sq One'));
select t.admin();
update federation_competitions set show_publicly = false where external_id = 'sq26/M4/4';
select t.anon();
select t.check('a hidden competition is not used: the previous season shows', (select goals = 11 and stats_season = 2025 from public_players where display_name = 'Sq One'));
select t.login('fb000000-0000-0000-0000-000000000003');
select t.check('a player switches their listing off again', t.rows($$update players set show_publicly = false where profile_id = 'fb000000-0000-0000-0000-000000000003'$$) = 1);
select t.anon();
select t.check('then they disappear from the website', (select count(*) from public_players where display_name = 'Sq One') = 0);
select t.check('the website view shows no birth data or Palloliitto ids', not exists (select 1 from information_schema.columns where table_name = 'public_players' and column_name in ('date_of_birth', 'birthyear', 'external_id', 'player_external_id')));
select t.admin();
select t.check('release 0.29.0 present', exists (select 1 from app_releases where version = '0.29.0'));
rollback;
