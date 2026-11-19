-- 0062 Game-day and training tasks: who sees and changes them; players take open tasks and give back their own.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f3000000-0000-0000-0000-000000000001', 'tk-admin@example.test', '{"first_name":"Tk","last_name":"Admin"}'),
 ('f3000000-0000-0000-0000-000000000002', 'tk-coach@example.test', '{"first_name":"Tk","last_name":"Coach"}'),
 ('f3000000-0000-0000-0000-000000000003', 'tk-p1@example.test', '{"first_name":"Kofi","last_name":"One"}'),
 ('f3000000-0000-0000-0000-000000000004', 'tk-p2@example.test', '{"first_name":"Ama","last_name":"Two"}'),
 ('f3000000-0000-0000-0000-000000000005', 'tk-out@example.test', '{"first_name":"Yaw","last_name":"Other"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f3000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'f3000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('f3000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000005');
insert into players (id, profile_id, first_name, last_name) values
 ('f3500000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000003', 'Kofi', 'One'),
 ('f3500000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000004', 'Ama', 'Two'),
 ('f3500000-0000-0000-0000-000000000005', 'f3000000-0000-0000-0000-000000000005', 'Yaw', 'Other');
insert into teams (id, name, slug) values ('f3100000-0000-0000-0000-000000000001', 'Tk team', 'tk-team'), ('f3100000-0000-0000-0000-000000000002', 'Tk other', 'tk-other');
insert into seasons (id, name, starts_on, ends_on) values ('f3200000-0000-0000-0000-000000000001', 'Tk season', '2026-01-01', '2027-12-31');
insert into team_seasons (id, team_id, season_id) values ('f3300000-0000-0000-0000-000000000001', 'f3100000-0000-0000-0000-000000000001', 'f3200000-0000-0000-0000-000000000001'),
 ('f3300000-0000-0000-0000-000000000002', 'f3100000-0000-0000-0000-000000000002', 'f3200000-0000-0000-0000-000000000001');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('f3400000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000002', 'Tk', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('f3300000-0000-0000-0000-000000000001', 'f3400000-0000-0000-0000-000000000002');
insert into team_players (team_season_id, player_id) values ('f3300000-0000-0000-0000-000000000001', 'f3500000-0000-0000-0000-000000000003'),
 ('f3300000-0000-0000-0000-000000000001', 'f3500000-0000-0000-0000-000000000004'), ('f3300000-0000-0000-0000-000000000002', 'f3500000-0000-0000-0000-000000000005');
insert into matches (id, team_season_id, opponent, kickoff_at, event_type) values
 ('f3600000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000001', 'Tk Opp', now() + interval '3 days', 'friendly'),
 ('f3600000-0000-0000-0000-000000000002', 'f3300000-0000-0000-0000-000000000001', 'Tk Past', now() - interval '3 days', 'friendly');
insert into training_sessions (id, team_season_id, title, starts_at, ends_at) values
 ('f3700000-0000-0000-0000-000000000001', 'f3300000-0000-0000-0000-000000000001', 'Tk training', now() + interval '2 days', now() + interval '2 days 90 minutes');

select t.check('ten built-in task types with icons', (select count(*) from task_types where builtin is not null) = 10
  and exists (select 1 from task_types where builtin = 'first_aid' and icon = 'first_aid'));
select t.check('an unknown icon is refused', t.raises($$insert into task_types (name, icon) values ('Odd job', 'rocket')$$));
select t.check('a task is for a game or a training, not both', t.raises($$insert into event_tasks (match_id, session_id, task_type_id) values ('f3600000-0000-0000-0000-000000000001', 'f3700000-0000-0000-0000-000000000001', (select id from task_types where builtin = 'balls'))$$));

-- coach
select t.login('f3000000-0000-0000-0000-000000000002');
select t.check('coach adds a task type', t.rows($$insert into task_types (name, icon) values ('Open the clubhouse', 'key')$$) = 1);
select t.check('…but cannot make a built-in one', t.raises($$insert into task_types (builtin, name, icon) values ('fake', 'Fake', 'star')$$));
select t.check('…nor change a type', t.rows($$update task_types set active = false where builtin = 'water'$$) = 0);
select t.check('coach adds tasks to the game: balls to Kofi, water open', t.rows($$insert into event_tasks (id, match_id, task_type_id, player_id) values
  ('f3800000-0000-0000-0000-000000000001', 'f3600000-0000-0000-0000-000000000001', (select id from task_types where builtin = 'balls'), 'f3500000-0000-0000-0000-000000000003'),
  ('f3800000-0000-0000-0000-000000000002', 'f3600000-0000-0000-0000-000000000001', (select id from task_types where builtin = 'water'), null)$$) = 2);
select t.check('…and to the training', t.rows($$insert into event_tasks (id, session_id, task_type_id) values ('f3800000-0000-0000-0000-000000000003', 'f3700000-0000-0000-0000-000000000001', (select id from task_types where name = 'Open the clubhouse'))$$) = 1);
select t.check('a player of another team cannot be given a task', t.raises($$update event_tasks set player_id = 'f3500000-0000-0000-0000-000000000005' where id = 'f3800000-0000-0000-0000-000000000002'$$));
-- a task on the past game, for the "started" checks
insert into event_tasks (id, match_id, task_type_id) values ('f3800000-0000-0000-0000-000000000004', 'f3600000-0000-0000-0000-000000000002', (select id from task_types where builtin = 'bibs'));

-- players
select t.login('f3000000-0000-0000-0000-000000000004');
select t.check('a player sees the team''s tasks', (select count(*) from event_tasks where id::text like 'f38%') = 4);
select t.check('a player cannot add a task', t.raises($$insert into event_tasks (match_id, task_type_id) values ('f3600000-0000-0000-0000-000000000001', (select id from task_types where builtin = 'cones'))$$));
select t.check('…nor give a task to themselves directly', t.rows($$update event_tasks set player_id = 'f3500000-0000-0000-0000-000000000004' where id = 'f3800000-0000-0000-0000-000000000002'$$) = 0);
select t.check('…nor add a task type', t.raises($$insert into task_types (name, icon) values ('Player job', 'star')$$));
select public.claim_event_task('f3800000-0000-0000-0000-000000000002');
select t.check('Ama takes the open water task', (select player_id from event_tasks where id = 'f3800000-0000-0000-0000-000000000002') = 'f3500000-0000-0000-0000-000000000004');
select t.check('a taken task cannot be taken again', t.raises($$select public.claim_event_task('f3800000-0000-0000-0000-000000000001')$$));
select t.check('Ama cannot give back Kofi''s task', t.raises($$select public.release_event_task('f3800000-0000-0000-0000-000000000001')$$));
select t.check('a task of a game that has started cannot be taken', t.raises($$select public.claim_event_task('f3800000-0000-0000-0000-000000000004')$$));
select public.release_event_task('f3800000-0000-0000-0000-000000000002');
select t.check('Ama gives the water back: open again', (select player_id from event_tasks where id = 'f3800000-0000-0000-0000-000000000002') is null);
select t.login('f3000000-0000-0000-0000-000000000005');
select t.check('a player of another team sees none of them', (select count(*) from event_tasks where id::text like 'f38%') = 0);
select t.check('…and cannot take one', t.raises($$select public.claim_event_task('f3800000-0000-0000-0000-000000000002')$$));
select t.anon();
select t.check('visitors cannot read tasks', t.raises($$select count(*) from event_tasks$$));
select set_config('request.jwt.claims', '', true); reset role;

-- admin
select t.login('f3000000-0000-0000-0000-000000000001');
select t.check('admin hides a task type', t.rows($$update task_types set active = false where name = 'Open the clubhouse'$$) = 1);
select t.check('admin removes a task', t.rows($$delete from event_tasks where id = 'f3800000-0000-0000-0000-000000000003'$$) = 1);
select t.check('changes are audited', exists (select 1 from audit_log where table_name = 'event_tasks' and action = 'DELETE'));
select t.anon(); select set_config('request.jwt.claims', '', true); reset role;
delete from matches where id = 'f3600000-0000-0000-0000-000000000002';
select t.check('a deleted game takes its tasks with it', not exists (select 1 from event_tasks where id = 'f3800000-0000-0000-0000-000000000004'));
rollback;
