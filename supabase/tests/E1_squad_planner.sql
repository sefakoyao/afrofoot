-- 0076 Squad planner: admins and the team's coaches plan; players never see it; saved in one step.
begin;
create or replace function t.service() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fea00000-0000-0000-0000-000000000001', 'sq-admin@example.test', '{"first_name":"Sq","last_name":"Admin"}'),
 ('fea00000-0000-0000-0000-000000000002', 'sq-coach@example.test', '{"first_name":"Sq","last_name":"Coach"}'),
 ('fea00000-0000-0000-0000-000000000003', 'sq-other@example.test', '{"first_name":"Sq","last_name":"Other"}'),
 ('fea00000-0000-0000-0000-000000000004', 'sq-player@example.test', '{"first_name":"Sq","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fea00000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id in ('fea00000-0000-0000-0000-000000000002', 'fea00000-0000-0000-0000-000000000003');
update profiles set role = 'player', status = 'active' where id = 'fea00000-0000-0000-0000-000000000004';
insert into seasons (id, name, starts_on, ends_on) values ('fea10000-0000-0000-0000-000000000001', 'Sq season', current_date - 30, current_date + 300);
insert into teams (id, name, slug) values ('fea20000-0000-0000-0000-000000000001', 'Sq A', 'sq-a'), ('fea20000-0000-0000-0000-000000000002', 'Sq B', 'sq-b');
insert into team_seasons (id, team_id, season_id) values ('fea30000-0000-0000-0000-000000000001', 'fea20000-0000-0000-0000-000000000001', 'fea10000-0000-0000-0000-000000000001'),
 ('fea30000-0000-0000-0000-000000000002', 'fea20000-0000-0000-0000-000000000002', 'fea10000-0000-0000-0000-000000000001');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('fea40000-0000-0000-0000-000000000002', 'fea00000-0000-0000-0000-000000000002', 'Sq', 'Coach', 'head_coach'),
 ('fea40000-0000-0000-0000-000000000003', 'fea00000-0000-0000-0000-000000000003', 'Sq', 'Other', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('fea30000-0000-0000-0000-000000000001', 'fea40000-0000-0000-0000-000000000002'), ('fea30000-0000-0000-0000-000000000002', 'fea40000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name, position) values
 ('fea50000-0000-0000-0000-000000000001', 'fea00000-0000-0000-0000-000000000004', 'Sq', 'Keeper', 'goalkeeper'),
 ('fea50000-0000-0000-0000-000000000002', null, 'Sq', 'Back', 'defender');
insert into tryout_requests (id, phone, position, first_name, last_name, date_of_birth, email) values ('fea60000-0000-0000-0000-000000000001', '+358401110000', 'forward', 'Sq', 'Striker', '2000-01-01', 'sq-striker@example.test');

create temp table sq_ids (id uuid); grant all on sq_ids to authenticated;
select t.login('fea00000-0000-0000-0000-000000000002');
insert into sq_ids select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '4-3-3',
  '[{"slot":1,"depth":1,"player_id":"fea50000-0000-0000-0000-000000000001"},{"slot":2,"depth":1,"player_id":"fea50000-0000-0000-0000-000000000002"},{"slot":10,"depth":2,"applicant_kind":"tryout","applicant_id":"fea60000-0000-0000-0000-000000000001"}]',
  '[{"player_id":"fea50000-0000-0000-0000-000000000001","status":"confirmed"},{"player_id":"fea50000-0000-0000-0000-000000000002","status":"leaving","note":"Moving abroad"}]', 'Need a striker');
select t.check('the team''s coach saves a plan', (select count(*) from squad_plan_slots where plan_id = (select id from sq_ids)) = 3);
select t.check('…with the players'' outlook', (select string_agg(status, ',' order by status) from squad_plan_players where plan_id = (select id from sq_ids)) = 'confirmed,leaving');
select t.check('…and reads it back', (select notes from squad_plans where id = (select id from sq_ids)) = 'Need a striker');
create temp table sq_again (id uuid); grant all on sq_again to authenticated;
insert into sq_again select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '4-4-2', '[]', '[]', null);
select t.check('saving again replaces the plan (one per team and season)', (select id from sq_again) = (select id from sq_ids)
  and (select count(*) from squad_plan_slots where plan_id = (select id from sq_ids)) = 0 and (select formation from squad_plans where id = (select id from sq_ids)) = '4-4-2');
select t.check('a slot outside the formation is refused', t.raises($$select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '4-3-3', '[{"slot":12,"depth":1,"player_id":"fea50000-0000-0000-0000-000000000001"}]', '[]')$$));
select t.check('a fourth player on one position is refused', t.raises($$select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '4-3-3', '[{"slot":1,"depth":4,"player_id":"fea50000-0000-0000-0000-000000000001"}]', '[]')$$));
select t.check('an unknown applicant is refused', t.raises($$select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '4-3-3', '[{"slot":9,"depth":1,"applicant_kind":"tryout","applicant_id":"fea60000-0000-0000-0000-000000000009"}]', '[]')$$));
select t.check('an unknown outlook is refused', t.raises($$select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '4-3-3', '[]', '[{"player_id":"fea50000-0000-0000-0000-000000000001","status":"maybe"}]')$$));
select t.check('an unknown formation is refused', t.raises($$select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '9-9-9', '[]', '[]')$$));
select t.check('a coach cannot plan another team', t.raises($$select save_squad_plan('fea20000-0000-0000-0000-000000000002', 2027, '4-3-3', '[]', '[]')$$));
select t.check('no direct writes, only through saving', t.raises($$insert into squad_plan_players (plan_id, player_id, status) values ((select id from sq_ids), 'fea50000-0000-0000-0000-000000000002', 'likely')$$));

select t.login('fea00000-0000-0000-0000-000000000003');
select t.check('can_plan_team: no for another team''s coach', not can_plan_team('fea20000-0000-0000-0000-000000000001'));
select t.check('another team''s coach does not see the plan', (select count(*) from squad_plans where team_id = 'fea20000-0000-0000-0000-000000000001') = 0);
select t.login('fea00000-0000-0000-0000-000000000004');
select t.check('a player does not see any plan', (select count(*) from squad_plans) = 0 and (select count(*) from squad_plan_players) = 0);
select t.check('a player cannot save a plan', t.raises($$select save_squad_plan('fea20000-0000-0000-0000-000000000001', 2027, '4-3-3', '[]', '[]')$$));
select t.anon();
select t.check('visitors see nothing', t.raises($$select count(*) from squad_plans$$));

select t.login('fea00000-0000-0000-0000-000000000001');
select t.check('an admin plans any team', t.rows($$select save_squad_plan('fea20000-0000-0000-0000-000000000002', 2027, '4-3-3', '[]', '[]')$$) = 1);
select t.check('…sees every plan', (select count(*) from squad_plans where team_id in ('fea20000-0000-0000-0000-000000000001', 'fea20000-0000-0000-0000-000000000002')) = 2);
select t.check('…and removes one', t.rows($$delete from squad_plans where team_id = 'fea20000-0000-0000-0000-000000000002'$$) = 1);
select t.check('changes are audited', exists (select 1 from audit_log where table_name = 'squad_plans'));
rollback;
