-- 0061 Opponents: coaches and admins read the list; only admins change it; a game's opponent is remembered.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f2000000-0000-0000-0000-000000000001', 'op-admin@example.test', '{"first_name":"Op","last_name":"Admin"}'),
 ('f2000000-0000-0000-0000-000000000002', 'op-coach@example.test', '{"first_name":"Op","last_name":"Coach"}'),
 ('f2000000-0000-0000-0000-000000000003', 'op-player@example.test', '{"first_name":"Op","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f2000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'f2000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id = 'f2000000-0000-0000-0000-000000000003';
insert into teams (id, name, slug) values ('f2100000-0000-0000-0000-000000000001', 'Op team', 'op-team');
insert into seasons (id, name, starts_on, ends_on) values ('f2200000-0000-0000-0000-000000000001', 'Op season', '2027-01-01', '2027-12-31');
insert into team_seasons (id, team_id, season_id) values ('f2300000-0000-0000-0000-000000000001', 'f2100000-0000-0000-0000-000000000001', 'f2200000-0000-0000-0000-000000000001');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('f2400000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 'Op', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('f2300000-0000-0000-0000-000000000001', 'f2400000-0000-0000-0000-000000000002');

select t.check('the club''s list is loaded (84 names)', (select count(*) from opponents where name in ('5/1', 'Wartti/Wild Boars', 'Club Latino Español "CLE"', 'Gambia 🇬🇲', 'FC Pehmeet ja Märät')) = 5
  and (select count(*) from opponents) >= 84);
select t.check('names are unique whatever the case', t.raises($$insert into opponents (name) values ('fc eagles')$$));
select t.check('no spaces around a name', t.raises($$insert into opponents (name) values (' FC New ')$$));

select t.login('f2000000-0000-0000-0000-000000000003');
select t.check('a player does not see the list', (select count(*) from opponents) = 0);
select t.login('f2000000-0000-0000-0000-000000000002');
select t.check('a coach sees the list', (select count(*) from opponents) >= 84);
select t.check('a coach cannot add a name directly', t.raises($$insert into opponents (name) values ('Coach FC')$$));
select t.check('…nor rename or hide one', t.rows($$update opponents set active = false where name = 'FC Eagles'$$) = 0);
-- booking a game with a new opponent remembers it
insert into matches (team_season_id, opponent, kickoff_at, event_type) values ('f2300000-0000-0000-0000-000000000001', 'Brand New FC', '2027-03-01 18:00+02', 'friendly');
select t.check('a coach''s game with a new opponent adds it to the list', exists (select 1 from opponents where name = 'Brand New FC' and created_by = 'f2000000-0000-0000-0000-000000000002'));
insert into matches (team_season_id, opponent, kickoff_at, event_type) values ('f2300000-0000-0000-0000-000000000001', 'brand new fc', '2027-03-08 18:00+02', 'friendly');
select t.check('…typed again in other letters: still one name', (select count(*) from opponents where lower(name) = 'brand new fc') = 1);

select t.login('f2000000-0000-0000-0000-000000000001');
select t.check('an admin adds a name', t.rows($$insert into opponents (name) values ('Admin FC')$$) = 1);
select t.check('an admin renames a name', t.rows($$update opponents set name = 'MPS/Atletico Akatemia 2' where name = 'MPS/AtleticoAkatemia'$$) = 1);
select t.check('an admin hides a name', t.rows($$update opponents set active = false where name = 'TBD'$$) = 1);
select t.check('renaming does not change booked games', (select count(*) from matches where opponent = 'Brand New FC') = 1);
-- a hidden name used again for a game comes back
insert into matches (team_season_id, opponent, kickoff_at, event_type) values ('f2300000-0000-0000-0000-000000000001', 'TBD', '2027-03-15 18:00+02', 'friendly');
select t.check('a hidden opponent booked again is shown again', (select active from opponents where name = 'TBD'));
select t.check('changes are audited', exists (select 1 from audit_log where table_name = 'opponents' and action = 'UPDATE'));
rollback;
