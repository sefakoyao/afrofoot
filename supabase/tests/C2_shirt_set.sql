-- 0059 The club's shirt numbers (site_settings 'shirts') and releasing a number.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('ff000000-0000-0000-0000-000000000001', 'ss-admin@example.test', '{"first_name":"Ss","last_name":"Admin"}'),
 ('ff000000-0000-0000-0000-000000000002', 'ss-coach@example.test', '{"first_name":"Ss","last_name":"Coach"}'),
 ('ff000000-0000-0000-0000-000000000003', 'ss-p1@example.test', '{"first_name":"Yaw","last_name":"One"}'),
 ('ff000000-0000-0000-0000-000000000004', 'ss-p2@example.test', '{"first_name":"Akua","last_name":"Two"}');
update profiles set role = 'club_admin', status = 'active' where id = 'ff000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'ff000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('ff000000-0000-0000-0000-000000000003', 'ff000000-0000-0000-0000-000000000004');
insert into seasons (id, name, starts_on, ends_on) values ('ff200000-0000-0000-0000-000000000001', 'Ss season', '2032-03-01', '2032-10-31');
insert into teams (id, name, slug) values ('ff300000-0000-0000-0000-000000000001', 'Ss A', 'ss-a');
insert into team_seasons (id, team_id, season_id) values ('ff400000-0000-0000-0000-000000000001', 'ff300000-0000-0000-0000-000000000001', 'ff200000-0000-0000-0000-000000000001');
insert into players (id, profile_id, first_name, last_name) values
 ('ff500000-0000-0000-0000-000000000003', 'ff000000-0000-0000-0000-000000000003', 'Yaw', 'One'),
 ('ff500000-0000-0000-0000-000000000004', 'ff000000-0000-0000-0000-000000000004', 'Akua', 'Two');
delete from site_settings where key = 'shirts';
-- before a list is set, every number counts: Akua already wears 77
insert into team_players (team_season_id, player_id, jersey_number) values
 ('ff400000-0000-0000-0000-000000000001', 'ff500000-0000-0000-0000-000000000003', null), ('ff400000-0000-0000-0000-000000000001', 'ff500000-0000-0000-0000-000000000004', 77);
insert into staff_members (id, profile_id, first_name, last_name, type) values ('ff600000-0000-0000-0000-000000000002', 'ff000000-0000-0000-0000-000000000002', 'Ss', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('ff400000-0000-0000-0000-000000000001', 'ff600000-0000-0000-0000-000000000002');

select t.login('ff000000-0000-0000-0000-000000000003');
select t.check('no list: 1–99 count', (select count(*) from shirt_numbers('ff400000-0000-0000-0000-000000000001')) = 99);
select t.check('a player cannot set the club''s numbers', t.raises($$insert into site_settings (key, value, is_public) values ('shirts', '{"numbers":[1,2]}', false)$$));

select t.login('ff000000-0000-0000-0000-000000000001');
select t.check('admin sets the club''s numbers to 1–39', t.rows($$insert into site_settings (key, value, is_public) values ('shirts', jsonb_build_object('numbers', (select jsonb_agg(g) from generate_series(1, 39) g)), false)$$) = 1);
select t.check('…the grid has 1–39 plus the worn 77, outside the list', (select count(*) || '/' || count(*) filter (where not in_set) || '/' || max(number) filter (where not in_set) from shirt_numbers('ff400000-0000-0000-0000-000000000001')) = '40/1/77');
select t.check('…77 is not free (worn) and not in the list', (select free::text || '/' || in_set::text || '/' || player_name from shirt_numbers('ff400000-0000-0000-0000-000000000001') where number = 77) = 'false/false/Akua Two');

select t.login('ff000000-0000-0000-0000-000000000003');
select t.check('a player cannot ask for 40 (not one of the club''s numbers)', t.raises($$select request_shirt_number('ff400000-0000-0000-0000-000000000001', 40)$$));
select t.check('…but can ask for 39', not t.raises($$select request_shirt_number('ff400000-0000-0000-0000-000000000001', 39)$$));
select t.check('a player cannot release a number', t.raises($$select release_shirt_number('ff400000-0000-0000-0000-000000000001', 'ff500000-0000-0000-0000-000000000004')$$));

select t.login('ff000000-0000-0000-0000-000000000001');
select t.check('giving 50 on the team page is refused (trigger)', t.raises($$update team_players set jersey_number = 50 where player_id = 'ff500000-0000-0000-0000-000000000003'$$));
select t.check('giving 12 is fine', t.rows($$update team_players set jersey_number = 12 where player_id = 'ff500000-0000-0000-0000-000000000003'$$) = 1);
select t.check('Akua keeps 77 while other columns change (captain)', t.rows($$update team_players set captain = true where player_id = 'ff500000-0000-0000-0000-000000000004'$$) = 1);
select t.check('the admin releases 77 from Akua', not t.raises($$select release_shirt_number('ff400000-0000-0000-0000-000000000001', 'ff500000-0000-0000-0000-000000000004')$$));
select t.check('…she has no number; 77 is gone from the grid', (select jersey_number from team_players where player_id = 'ff500000-0000-0000-0000-000000000004') is null
  and not exists (select 1 from shirt_numbers('ff400000-0000-0000-0000-000000000001') where number = 77));
select t.check('releasing again: nothing to release', t.raises($$select release_shirt_number('ff400000-0000-0000-0000-000000000001', 'ff500000-0000-0000-0000-000000000004')$$));
select t.check('the release is audited', exists (select 1 from audit_log where table_name = 'team_players' and old_data ->> 'jersey_number' = '77' and new_data ->> 'jersey_number' is null));

select t.login('ff000000-0000-0000-0000-000000000002');
select t.check('the team''s coach releases 12 from Yaw; it is free again', not t.raises($$select release_shirt_number('ff400000-0000-0000-0000-000000000001', 'ff500000-0000-0000-0000-000000000003')$$)
  );
select t.check('…12 free', (select free from shirt_numbers('ff400000-0000-0000-0000-000000000001') where number = 12));
rollback;
