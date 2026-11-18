-- 0045 Player-coach: coach rights and player rights in one account, never coach of themselves. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fa000000-0000-0000-0000-000000000001', 'pc-admin@example.test', '{"first_name":"Pc","last_name":"Admin"}'),
 ('fa000000-0000-0000-0000-000000000002', 'pc-both@example.test', '{"first_name":"Pc","last_name":"Both"}'),
 ('fa000000-0000-0000-0000-000000000003', 'pc-mate@example.test', '{"first_name":"Pc","last_name":"Mate"}'),
 ('fa000000-0000-0000-0000-000000000004', 'pc-other@example.test', '{"first_name":"Pc","last_name":"Other"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fa000000-0000-0000-0000-000000000001';
update profiles set role = 'player_coach', status = 'active' where id = 'fa000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('fa000000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000004');
insert into seasons (id, name, starts_on, ends_on, is_current) values ('fa200000-0000-0000-0000-000000000001', 'Pc season', current_date - 30, current_date + 300, false);
insert into teams (id, name, slug) values ('fa300000-0000-0000-0000-000000000001', 'Pc Team', 'pc-team'), ('fa300000-0000-0000-0000-000000000002', 'Pc Other Team', 'pc-other-team');
insert into team_seasons (id, team_id, season_id) values ('fa400000-0000-0000-0000-000000000001', 'fa300000-0000-0000-0000-000000000001', 'fa200000-0000-0000-0000-000000000001'),
 ('fa400000-0000-0000-0000-000000000002', 'fa300000-0000-0000-0000-000000000002', 'fa200000-0000-0000-0000-000000000001');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('fa600000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000002', 'Pc', 'Both', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('fa400000-0000-0000-0000-000000000001', 'fa600000-0000-0000-0000-000000000002');
insert into players (id, profile_id, first_name, last_name, status) values
 ('fa500000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000002', 'Pc', 'Both', 'active'),
 ('fa500000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000003', 'Pc', 'Mate', 'active'),
 ('fa500000-0000-0000-0000-000000000004', 'fa000000-0000-0000-0000-000000000004', 'Pc', 'Other', 'active');
insert into team_players (team_season_id, player_id) values ('fa400000-0000-0000-0000-000000000001', 'fa500000-0000-0000-0000-000000000002'),
 ('fa400000-0000-0000-0000-000000000001', 'fa500000-0000-0000-0000-000000000003'), ('fa400000-0000-0000-0000-000000000002', 'fa500000-0000-0000-0000-000000000004');
insert into training_sessions (id, team_season_id, title, starts_at, ends_at) values
 ('fa700000-0000-0000-0000-000000000001', 'fa400000-0000-0000-0000-000000000001', 'Pc future training', now() + interval '2 days', now() + interval '2 days 90 minutes'),
 ('fa700000-0000-0000-0000-000000000002', 'fa400000-0000-0000-0000-000000000001', 'Pc started training', now() - interval '30 minutes', now() + interval '60 minutes');

-- ---------- coach rights ----------
select t.login('fa000000-0000-0000-0000-000000000002');
select t.check('player-coach: coaches their team and plays in it', app.coaches_ts('fa400000-0000-0000-0000-000000000001') and app.in_team_ts('fa400000-0000-0000-0000-000000000001'));
select t.check('player-coach: not the coach of another team', not app.coaches_ts('fa400000-0000-0000-0000-000000000002'));
select t.check('player-coach: reads a teammate as their coach, and their own record', (select count(*) from players where id in ('fa500000-0000-0000-0000-000000000002', 'fa500000-0000-0000-0000-000000000003')) = 2
  and (select count(*) from players where id = 'fa500000-0000-0000-0000-000000000004') = 0);
select t.check('player-coach: evaluates a teammate', t.rows($$insert into evaluations (player_id, evaluator_id, summary) values ('fa500000-0000-0000-0000-000000000003', 'fa000000-0000-0000-0000-000000000002', 'Strong week')$$) = 1);
select t.check('player-coach: cannot evaluate themselves', t.raises($$insert into evaluations (player_id, evaluator_id, summary) values ('fa500000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000002', 'I am great')$$));
select t.check('player-coach: sets a teammate''s goal, not their own', t.rows($$insert into development_goals (player_id, title, created_by) values ('fa500000-0000-0000-0000-000000000003', 'Weak foot', 'fa000000-0000-0000-0000-000000000002')$$) = 1
  and t.raises($$insert into development_goals (player_id, title, created_by) values ('fa500000-0000-0000-0000-000000000002', 'Captain', 'fa000000-0000-0000-0000-000000000002')$$));
select t.check('player-coach: drafts a team announcement', t.rows($$insert into announcements (title, body, audience, team_season_id, created_by) values ('Pc kit', 'Bring boots', 'team', 'fa400000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002')$$) = 1);
select t.check('player-coach: reads the Palloliitto list like a coach', not t.raises($$select count(*) from federation_players$$));
select t.check('player-coach: saves a new place like a coach', t.rows($$insert into locations (name, created_by) values ('Pc pitch', 'fa000000-0000-0000-0000-000000000002')$$) = 1);
select t.check('player-coach: corrects a teammate''s reply after the start', t.rows($$update session_attendance set availability = 'no' where session_id = 'fa700000-0000-0000-0000-000000000002' and player_id = 'fa500000-0000-0000-0000-000000000003'$$) = 1);

-- ---------- player rules on their own record ----------
select t.check('own record: player columns can change', t.rows($$update players set bio = 'Left back and coach' where id = 'fa500000-0000-0000-0000-000000000002'$$) = 1);
select t.check('own record: no fee exemption for themselves', t.raises($$update players set fee_exempt_until = current_date + 30 where id = 'fa500000-0000-0000-0000-000000000002'$$));
select t.check('own reply: open before the event', t.rows($$update session_attendance set availability = 'yes' where session_id = 'fa700000-0000-0000-0000-000000000001' and player_id = 'fa500000-0000-0000-0000-000000000002'$$) = 1);
select t.check('own reply: closed once the event started, even for a coach', t.raises($$update session_attendance set availability = 'no' where session_id = 'fa700000-0000-0000-0000-000000000002' and player_id = 'fa500000-0000-0000-0000-000000000002'$$));

-- ---------- a plain player stays a player ----------
select t.login('fa000000-0000-0000-0000-000000000003');
select t.check('a teammate (player) has no coach rights', not app.coaches_ts('fa400000-0000-0000-0000-000000000001') and not app.is_coach()
  and t.raises($$insert into evaluations (player_id, evaluator_id) values ('fa500000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000003')$$));

-- ---------- announcements and fees ----------
select t.admin();
insert into announcements (id, title, body, audience, created_by) values
 ('fa800000-0000-0000-0000-000000000001', 'To players', 'x', 'players', 'fa000000-0000-0000-0000-000000000001'),
 ('fa800000-0000-0000-0000-000000000002', 'To coaches', 'x', 'coaches', 'fa000000-0000-0000-0000-000000000001');
select t.login('fa000000-0000-0000-0000-000000000001');
select publish_announcement('fa800000-0000-0000-0000-000000000001'); select publish_announcement('fa800000-0000-0000-0000-000000000002');
select t.admin();
select t.check('player-coach: notified as a player and as a coach', (select count(*) from notifications where user_id = 'fa000000-0000-0000-0000-000000000002' and title in ('To players', 'To coaches')) = 2);
select t.login('fa000000-0000-0000-0000-000000000002');
select t.check('player-coach: reads both announcements', (select count(*) from announcements where id in ('fa800000-0000-0000-0000-000000000001', 'fa800000-0000-0000-0000-000000000002')) = 2);
select t.admin();
update fee_policy set enabled = true, grace_days = 14;
insert into payments (player_id, amount_cents, status, due_on) values ('fa500000-0000-0000-0000-000000000002', 24000, 'pending', current_date - 30);
select t.check('player-coach: overdue fees block sign-in like for players', app.player_blocked('fa000000-0000-0000-0000-000000000002'));

-- ---------- nothing left that names the old roles ----------
select t.check('no policy still names the coach or player role directly', not exists (select 1 from pg_policies
  where coalesce(qual, '') ~ '''(coach|player)''::user_role' or coalesce(with_check, '') ~ '''(coach|player)''::user_role'));
select t.check('release 0.33.0 present', exists (select 1 from app_releases where version = '0.33.0'));
rollback;
