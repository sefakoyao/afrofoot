-- 0031 Match day: protocol times, game plan, coaches' access to contracts. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('b1000000-0000-0000-0000-000000000002', 'md-coach@example.test', '{"first_name":"Md","last_name":"Coach"}'),
 ('b1000000-0000-0000-0000-000000000005', 'md-coach2@example.test', '{"first_name":"Other","last_name":"Coach"}'),
 ('b1000000-0000-0000-0000-000000000003', 'md-player@example.test', '{"first_name":"Md","last_name":"Player"}'),
 ('b1000000-0000-0000-0000-000000000004', 'md-other@example.test', '{"first_name":"Md","last_name":"Other"}');
update profiles set role = 'coach', status = 'active' where id in ('b1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000005');
update profiles set role = 'player', status = 'active' where id in ('b1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000004');
insert into seasons (id, name, starts_on, ends_on) values ('b2000000-0000-0000-0000-000000000001', 'Md season', '2026-01-01', '2028-12-31');
insert into teams (id, name, slug) values ('b3000000-0000-0000-0000-000000000001', 'Md A', 'md-a'), ('b3000000-0000-0000-0000-000000000002', 'Md B', 'md-b');
insert into team_seasons (id, team_id, season_id) values ('b4000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001'),
 ('b4000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001');
insert into players (id, profile_id, first_name, last_name) values
 ('b5000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'Md', 'Player'),
 ('b5000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000004', 'Md', 'Other');
insert into team_players (team_season_id, player_id) values ('b4000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000003'),
 ('b4000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000004');
insert into staff_members (id, profile_id, first_name, last_name, type) values
 ('b6000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'Md', 'Coach', 'head_coach'),
 ('b6000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000005', 'Other', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('b4000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000002'),
 ('b4000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-000000000005');
insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body) values
 ('b7000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000003', 'Sent one', 1, '2027-03-01', '2027-10-31', repeat('s', 60)),
 ('b7000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000003', 'Draft one', 1, '2028-03-01', '2028-10-31', repeat('d', 60));
update player_contracts set status = 'sent' where id = 'b7000000-0000-0000-0000-000000000001';

-- ---------- coach: matches, protocol, game plan ----------
select t.login('b1000000-0000-0000-0000-000000000002');
select t.check('coach adds a friendly to own team', not t.raises($$insert into matches (id, team_season_id, opponent, kickoff_at, event_type) values ('b8000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'Md Rivals', now() + interval '3 days', 'friendly')$$));
select t.check('coach cannot add a match to another team', t.raises($$insert into matches (team_season_id, opponent, kickoff_at, event_type) values ('b4000000-0000-0000-0000-000000000002', 'X', now() + interval '3 days', 'friendly')$$));
select t.check('protocol times before kick-off accepted', t.rows($$update matches set meet_at = kickoff_at - interval '90 minutes', warmup_at = kickoff_at - interval '60 minutes', briefing_at = kickoff_at - interval '20 minutes', meeting_point = 'Main gate' where id = 'b8000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('protocol time after kick-off refused', t.raises($$update matches set warmup_at = kickoff_at + interval '5 minutes' where id = 'b8000000-0000-0000-0000-000000000001'$$));
select t.check('protocol time more than 6 hours before refused', t.raises($$update matches set meet_at = kickoff_at - interval '7 hours' where id = 'b8000000-0000-0000-0000-000000000001'$$));
select t.check('game plan with a known style accepted', t.rows($$update matches set tactic_style = 'high_press', defensive_line = 'high', pressing = 'high', width = 'wide', tempo = 'fast', formation = '4-3-3', game_plan = 'Win the ball high.' where id = 'b8000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('unknown style refused', t.raises($$update matches set tactic_style = 'park_the_bus' where id = 'b8000000-0000-0000-0000-000000000001'$$));
select t.check('unknown instruction refused', t.raises($$update matches set pressing = 'extreme' where id = 'b8000000-0000-0000-0000-000000000001'$$));
select t.check('game plan longer than 2000 characters refused', t.raises($$update matches set game_plan = repeat('x', 2001) where id = 'b8000000-0000-0000-0000-000000000001'$$));
-- lineup in one step
select t.admin();
insert into team_players (team_season_id, player_id) values ('b4000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000004');
select t.login('b1000000-0000-0000-0000-000000000002');
select t.check('coach saves a lineup (starter in slot 1 as captain, one substitute)', not t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '4-4-2',
  '[{"slot":1,"player":"b5000000-0000-0000-0000-000000000003"}]', '["b5000000-0000-0000-0000-000000000004"]', 'b5000000-0000-0000-0000-000000000003')$$));
select t.check('lineup stored: goalkeeper slot, captain, bench', (select string_agg(status || ':' || coalesce(slot::text, '-') || ':' || coalesce(position::text, '-') || ':' || captain, ',' order by status) from match_squad where match_id = 'b8000000-0000-0000-0000-000000000001')
  = 'starter:1:goalkeeper:true,substitute:-:-:false');
select t.check('formation saved with the lineup', (select formation from matches where id = 'b8000000-0000-0000-0000-000000000001') = '4-4-2');
select t.check('saving again replaces the lineup', not t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '4-3-3', '[{"slot":2,"player":"b5000000-0000-0000-0000-000000000004"}]', '[]', null)$$));
select t.check('replaced: old starter not selected', (select status from match_squad where match_id = 'b8000000-0000-0000-0000-000000000001' and player_id = 'b5000000-0000-0000-0000-000000000003') = 'not_selected'
  and (select status || ':' || slot from match_squad where match_id = 'b8000000-0000-0000-0000-000000000001' and player_id = 'b5000000-0000-0000-0000-000000000004') = 'starter:2');
select t.check('same player twice refused', t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '4-4-2', '[{"slot":1,"player":"b5000000-0000-0000-0000-000000000003"}]', '["b5000000-0000-0000-0000-000000000003"]', null)$$));
select t.check('two players in one position refused', t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '4-4-2', '[{"slot":1,"player":"b5000000-0000-0000-0000-000000000003"},{"slot":1,"player":"b5000000-0000-0000-0000-000000000004"}]', '[]', null)$$));
select t.check('unknown formation refused', t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '9-9-9', '[]', '[]', null)$$));
select t.check('captain outside the squad refused', t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '4-4-2', '[{"slot":1,"player":"b5000000-0000-0000-0000-000000000003"}]', '[]', 'b5000000-0000-0000-0000-000000000004')$$));
-- contracts
select t.check('coach reads own player''s sent contract only (no draft)', (select count(*) from player_contracts) = 1 and (select title from player_contracts) = 'Sent one');
select t.check('coach cannot sign for the club', t.rows($$update player_contracts set status = 'active'$$) = 0);
select t.check('coach reads the Code of Conduct', (select count(*) from conduct_versions where is_current) = 1);
select t.admin();

select t.login('b1000000-0000-0000-0000-000000000005');
select t.check('other team''s coach cannot save a lineup', t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '4-4-2', '[]', '[]', null)$$));
select t.check('other team''s coach sees no contract and cannot change the match', (select count(*) from player_contracts) = 0
  and t.rows($$update matches set game_plan = 'hijack' where id = 'b8000000-0000-0000-0000-000000000001'$$) = 0);
select t.admin();

-- ---------- players ----------
select t.login('b1000000-0000-0000-0000-000000000003');
select t.check('player reads the protocol and plan of own match', (select meeting_point = 'Main gate' and tactic_style = 'high_press' and briefing_at is not null from matches where id = 'b8000000-0000-0000-0000-000000000001'));
select t.check('player cannot save a lineup', t.raises($$select public.save_lineup('b8000000-0000-0000-0000-000000000001', '4-4-2', '[]', '[]', null)$$));
select t.check('player cannot change the protocol', t.rows($$update matches set meeting_point = 'Beach' where id = 'b8000000-0000-0000-0000-000000000001'$$) = 0);
select t.admin();
delete from team_players where team_season_id = 'b4000000-0000-0000-0000-000000000001' and player_id = 'b5000000-0000-0000-0000-000000000004';
select t.login('b1000000-0000-0000-0000-000000000004');
select t.check('player of another team cannot see the match', (select count(*) from matches where id = 'b8000000-0000-0000-0000-000000000001') = 0);
select t.admin();
select t.check('release 0.19.0 present', exists (select 1 from app_releases where version = '0.19.0'));
rollback;
