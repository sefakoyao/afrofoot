-- 0029 Event replies: players sign in / out for their own events, only before the start. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('90000000-0000-0000-0000-000000000002', 'ev-coach@example.test', '{"first_name":"Ev","last_name":"Coach"}'),
 ('90000000-0000-0000-0000-000000000003', 'ev-player@example.test', '{"first_name":"Ev","last_name":"Player"}'),
 ('90000000-0000-0000-0000-000000000004', 'ev-other@example.test', '{"first_name":"Ev","last_name":"Other"}');
update profiles set role = 'coach', status = 'active' where id = '90000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('90000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000004');
insert into seasons (id, name, starts_on, ends_on) values ('91000000-0000-0000-0000-000000000001', 'Ev season', '2026-01-01', '2027-12-31');
insert into teams (id, name, slug) values ('92000000-0000-0000-0000-000000000001', 'Ev A', 'ev-a');
insert into team_seasons (id, team_id, season_id) values ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001');
insert into players (id, profile_id, first_name, last_name) values
 ('94000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'Ev', 'Player'),
 ('94000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', 'Ev', 'Other');
insert into team_players (team_season_id, player_id) values ('93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000003'),
 ('93000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000004');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('95000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Ev', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('93000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000002');
-- future training, past training, cancelled training, future match
insert into training_sessions (id, team_season_id, title, starts_at, ends_at) values
 ('96000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'Future', now() + interval '2 days', now() + interval '2 days 90 minutes'),
 ('96000000-0000-0000-0000-000000000002', '93000000-0000-0000-0000-000000000001', 'Past', now() - interval '2 days', now() - interval '2 days' + interval '90 minutes'),
 ('96000000-0000-0000-0000-000000000003', '93000000-0000-0000-0000-000000000001', 'Off', now() + interval '3 days', now() + interval '3 days 90 minutes');
update training_sessions set status = 'cancelled' where id = '96000000-0000-0000-0000-000000000003';
insert into matches (id, team_season_id, opponent, kickoff_at, division) values ('97000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'Rivals', now() + interval '5 days', 'M4');

select t.check('rows seeded for both players', (select count(*) from session_attendance where session_id = '96000000-0000-0000-0000-000000000001') = 2
  and (select count(*) from match_availability where match_id = '97000000-0000-0000-0000-000000000001') = 2);

select t.login('90000000-0000-0000-0000-000000000003');
select t.check('player signs in for a future training (update runs)', t.rows($$update session_attendance set availability = 'yes' where session_id = '96000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('answer time set by the database', (select responded_at is not null and responded_at > now() - interval '1 minute' from session_attendance where session_id = '96000000-0000-0000-0000-000000000001'));
select t.check('player signs out of a future match with a note', t.rows($$update match_availability set availability = 'no', note = 'Work trip' where match_id = '97000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('player cannot answer after the start', t.raises($$update session_attendance set availability = 'no' where session_id = '96000000-0000-0000-0000-000000000002'$$));
select t.check('player cannot answer for a cancelled event', t.raises($$update session_attendance set availability = 'yes' where session_id = '96000000-0000-0000-0000-000000000003'$$));
select t.check('player cannot fake the answer time', t.rows($$update session_attendance set responded_at = now() - interval '9 days', availability = 'no' where session_id = '96000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('player signs in for a future training', (select responded_at > now() - interval '1 minute' from session_attendance where session_id = '96000000-0000-0000-0000-000000000001'));
select t.check('answer time cannot be changed on its own (update runs)', t.rows($$update session_attendance set responded_at = now() - interval '9 days' where session_id = '96000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('answer time cannot be changed on its own', (select responded_at > now() - interval '1 minute' from session_attendance where session_id = '96000000-0000-0000-0000-000000000001'));
select t.check('player cannot mark their own attendance', t.raises($$update session_attendance set attendance = 'present' where session_id = '96000000-0000-0000-0000-000000000001'$$));
select t.check('player cannot answer for a teammate (no rows) (update runs)', t.rows($$update session_attendance set availability = 'yes' where player_id = '94000000-0000-0000-0000-000000000004'$$) = 0);
select t.admin();
select t.check('teammate unchanged', (select availability from session_attendance where player_id = '94000000-0000-0000-0000-000000000004' and session_id = '96000000-0000-0000-0000-000000000001') = 'pending');

select t.login('90000000-0000-0000-0000-000000000002');
select t.check('coach sees the replies of the team', (select count(*) from session_attendance where session_id = '96000000-0000-0000-0000-000000000001' and availability <> 'pending') = 1
  and (select note from match_availability where player_id = '94000000-0000-0000-0000-000000000003') = 'Work trip');
select t.check('coach may correct an answer after the start', t.rows($$update session_attendance set availability = 'yes' where session_id = '96000000-0000-0000-0000-000000000002' and player_id = '94000000-0000-0000-0000-000000000004'$$) = 1);
select t.admin();
select t.check('back to "no reply" clears the answer time', t.rows($$update match_availability set availability = 'pending' where match_id = '97000000-0000-0000-0000-000000000001' and player_id = '94000000-0000-0000-0000-000000000003'$$) = 1);
select t.check('player cannot answer for a teammate (no rows)', (select responded_at is null from match_availability where match_id = '97000000-0000-0000-0000-000000000001' and player_id = '94000000-0000-0000-0000-000000000003'));
rollback;
