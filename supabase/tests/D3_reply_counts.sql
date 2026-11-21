-- 0069 Reply counts for the player's home screen: counts only, own team only.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fc100000-0000-0000-0000-000000000001', 'rc-p1@example.test', '{"first_name":"Rc","last_name":"One"}'),
 ('fc100000-0000-0000-0000-000000000002', 'rc-p2@example.test', '{"first_name":"Rc","last_name":"Two"}'),
 ('fc100000-0000-0000-0000-000000000003', 'rc-other@example.test', '{"first_name":"Rc","last_name":"Other"}');
update profiles set role = 'player', status = 'active' where id in ('fc100000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000002', 'fc100000-0000-0000-0000-000000000003');
delete from players where profile_id in ('fc100000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000002', 'fc100000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name) values
 ('fc500000-0000-0000-0000-000000000001', 'fc100000-0000-0000-0000-000000000001', 'Rc', 'One'),
 ('fc500000-0000-0000-0000-000000000002', 'fc100000-0000-0000-0000-000000000002', 'Rc', 'Two'),
 ('fc500000-0000-0000-0000-000000000003', 'fc100000-0000-0000-0000-000000000003', 'Rc', 'Other');
insert into seasons (id, name, starts_on, ends_on) values ('fc200000-0000-0000-0000-000000000001', 'Rc season', current_date - 10, current_date + 300);
insert into teams (id, name, slug) values ('fc300000-0000-0000-0000-000000000001', 'Rc A', 'rc-a'), ('fc300000-0000-0000-0000-000000000002', 'Rc B', 'rc-b');
insert into team_seasons (id, team_id, season_id) values ('fc400000-0000-0000-0000-000000000001', 'fc300000-0000-0000-0000-000000000001', 'fc200000-0000-0000-0000-000000000001'),
 ('fc400000-0000-0000-0000-000000000002', 'fc300000-0000-0000-0000-000000000002', 'fc200000-0000-0000-0000-000000000001');
insert into team_players (team_season_id, player_id) values ('fc400000-0000-0000-0000-000000000001', 'fc500000-0000-0000-0000-000000000001'),
 ('fc400000-0000-0000-0000-000000000001', 'fc500000-0000-0000-0000-000000000002'), ('fc400000-0000-0000-0000-000000000002', 'fc500000-0000-0000-0000-000000000003');
insert into training_sessions (id, team_season_id, title, starts_at, ends_at) values ('fc600000-0000-0000-0000-000000000001', 'fc400000-0000-0000-0000-000000000001', 'Rc training', now() + interval '2 days', now() + interval '2 days 90 minutes');
insert into session_attendance (session_id, player_id) values ('fc600000-0000-0000-0000-000000000001', 'fc500000-0000-0000-0000-000000000001'), ('fc600000-0000-0000-0000-000000000001', 'fc500000-0000-0000-0000-000000000002') on conflict do nothing;
update session_attendance set availability = 'yes' where session_id = 'fc600000-0000-0000-0000-000000000001' and player_id = 'fc500000-0000-0000-0000-000000000001';
select t.login('fc100000-0000-0000-0000-000000000002');
select t.check('a teammate sees the counts: 1 in, 1 waiting', (select yes = 1 and pending = 1 and no = 0 and maybe = 0 from event_reply_counts(array['fc600000-0000-0000-0000-000000000001'::uuid])));
select t.check('a player can say Maybe', t.rows($$update session_attendance set availability = 'maybe' where session_id = 'fc600000-0000-0000-0000-000000000001' and player_id = 'fc500000-0000-0000-0000-000000000002'$$) = 1);
update session_attendance set availability = 'maybe' where session_id = 'fc600000-0000-0000-0000-000000000001' and player_id = 'fc500000-0000-0000-0000-000000000002';
select t.check('…and the counts show it', (select maybe = 1 and pending = 0 from event_reply_counts(array['fc600000-0000-0000-0000-000000000001'::uuid])));
select t.login('fc100000-0000-0000-0000-000000000003');
select t.check('a player of another team gets nothing', not exists (select 1 from event_reply_counts(array['fc600000-0000-0000-0000-000000000001'::uuid])));
reset role; set local role anon;
select t.check('anonymous visitors cannot call it', t.raises($$select * from event_reply_counts(array[gen_random_uuid()])$$));
rollback;
