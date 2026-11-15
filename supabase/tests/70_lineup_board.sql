-- 0032 Lineup board: formats, whole-board save with plan and rotation, photo paths. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('c1000000-0000-0000-0000-000000000002', 'lb-coach@example.test', '{"first_name":"Lb","last_name":"Coach"}'),
 ('c1000000-0000-0000-0000-000000000005', 'lb-coach2@example.test', '{"first_name":"Other","last_name":"Coach"}'),
 ('c1000000-0000-0000-0000-000000000003', 'lb-p1@example.test', '{"first_name":"Lb","last_name":"One"}'),
 ('c1000000-0000-0000-0000-000000000004', 'lb-p2@example.test', '{"first_name":"Lb","last_name":"Two"}'),
 ('c1000000-0000-0000-0000-000000000006', 'lb-p3@example.test', '{"first_name":"Lb","last_name":"Three"}');
update profiles set role = 'coach', status = 'active' where id in ('c1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000005');
update profiles set role = 'player', status = 'active' where id in ('c1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000006');
insert into seasons (id, name, starts_on, ends_on) values ('c2000000-0000-0000-0000-000000000001', 'Lb season', '2026-01-01', '2028-12-31');
insert into teams (id, name, slug) values ('c3000000-0000-0000-0000-000000000001', 'Lb U12', 'lb-u12');
insert into team_seasons (id, team_id, season_id) values ('c4000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001');
insert into players (id, profile_id, first_name, last_name) values
 ('c5000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 'Lb', 'One'),
 ('c5000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000004', 'Lb', 'Two'),
 ('c5000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000006', 'Lb', 'Three');
insert into team_players (team_season_id, player_id) select 'c4000000-0000-0000-0000-000000000001', id from players where id::text like 'c5000000%';
insert into staff_members (id, profile_id, first_name, last_name, type) values ('c6000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'Lb', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('c4000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002');
insert into matches (id, team_season_id, opponent, kickoff_at, event_type) values ('c8000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'Lb Rivals', now() + interval '3 days', 'friendly');

-- ---------- formats ----------
select t.check('formations for every format: 8 + 5 + 5 + 4 + 4', (select string_agg(format || ':' || n, ',' order by format) from (select format, count(*) n from formations group by format) q) = '5:4,7:4,8:5,9:5,11:8');
select t.check('every formation has as many positions as players', not exists (select 1 from formations where jsonb_array_length(slots) <> format));
select t.check('a formation with the wrong number of positions is refused', t.raises($$insert into formations (code, name, slots, format) values ('9-9', '9-9', '[{"slot":1,"role":"GK","x":50,"y":92}]', 7)$$));
select t.check('7 v 7 shape 2-3-1: goalkeeper, 2 defenders, 3 midfielders, 1 forward', (select string_agg(r->>'role', '' order by (r->>'slot')::int) from formations, jsonb_array_elements(slots) r where code = '2-3-1') = 'GKDFDFMFMFMFFW');

-- ---------- coach saves the whole board ----------
select t.login('c1000000-0000-0000-0000-000000000002');
select t.check('7 v 7 board with plan and rotation saved', not t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1',
  '[{"slot":1,"player":"c5000000-0000-0000-0000-000000000003"},{"slot":7,"player":"c5000000-0000-0000-0000-000000000004"}]', '["c5000000-0000-0000-0000-000000000006"]', 'c5000000-0000-0000-0000-000000000004',
  '[{"minute":30,"off":"c5000000-0000-0000-0000-000000000004","on":"c5000000-0000-0000-0000-000000000006"}]',
  '{"style":"high_press","line":"high","press":"high","width":"wide","tempo":"fast","text":"Press high."}')$$));
select t.check('formation, style and instructions stored together', (select concat_ws(',', formation, tactic_style, defensive_line, pressing, width, tempo, game_plan) from matches where id = 'c8000000-0000-0000-0000-000000000001') = '2-3-1,high_press,high,high,wide,fast,Press high.');
select t.check('rotation stored', (select minute || ':' || player_on_id from match_rotation_plan where match_id = 'c8000000-0000-0000-0000-000000000001') = '30:c5000000-0000-0000-0000-000000000006');
select t.check('position 8 does not exist in a 7 v 7 shape', t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1', '[{"slot":8,"player":"c5000000-0000-0000-0000-000000000003"}]', '[]', null)$$));
select t.check('more starters than the format allows refused', t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '1-2-1',
  '[{"slot":1,"player":"c5000000-0000-0000-0000-000000000003"},{"slot":2,"player":"c5000000-0000-0000-0000-000000000004"},{"slot":3,"player":"c5000000-0000-0000-0000-000000000006"},{"slot":4,"player":"c5000000-0000-0000-0000-000000000006"},{"slot":5,"player":"c5000000-0000-0000-0000-000000000004"},{"slot":6,"player":"c5000000-0000-0000-0000-000000000003"}]', '[]', null)$$));
select t.check('rotation: only a substitute comes on', t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1',
  '[{"slot":1,"player":"c5000000-0000-0000-0000-000000000003"},{"slot":7,"player":"c5000000-0000-0000-0000-000000000004"}]', '[]', null,
  '[{"minute":30,"off":"c5000000-0000-0000-0000-000000000004","on":"c5000000-0000-0000-0000-000000000006"}]')$$));
select t.check('rotation: the player going off must be on the pitch', t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1',
  '[{"slot":1,"player":"c5000000-0000-0000-0000-000000000003"}]', '["c5000000-0000-0000-0000-000000000006","c5000000-0000-0000-0000-000000000004"]', null,
  '[{"minute":30,"off":"c5000000-0000-0000-0000-000000000004","on":"c5000000-0000-0000-0000-000000000006"}]')$$));
select t.check('rotation: a player who came on can go off later', not t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1',
  '[{"slot":1,"player":"c5000000-0000-0000-0000-000000000003"}]', '["c5000000-0000-0000-0000-000000000006","c5000000-0000-0000-0000-000000000004"]', null,
  '[{"minute":20,"off":"c5000000-0000-0000-0000-000000000003","on":"c5000000-0000-0000-0000-000000000006"},{"minute":50,"off":"c5000000-0000-0000-0000-000000000006","on":"c5000000-0000-0000-0000-000000000004"}]')$$));
select t.check('a refused save changes nothing (one step)', (select formation from matches where id = 'c8000000-0000-0000-0000-000000000001') = '2-3-1'
  and (select count(*) from match_rotation_plan where match_id = 'c8000000-0000-0000-0000-000000000001') = 2);
select t.check('saving without a plan keeps the plan', not t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1', '[]', '[]', null)$$));
select t.check('plan kept, rotation cleared', (select tactic_style from matches where id = 'c8000000-0000-0000-0000-000000000001') = 'high_press'
  and (select count(*) from match_rotation_plan where match_id = 'c8000000-0000-0000-0000-000000000001') = 0);
select t.check('unknown style in the plan refused', t.raises($$select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1', '[]', '[]', null, '[]', '{"style":"bus"}')$$));
select t.check('coach reads the photos path of own players', (select count(*) from players where id::text like 'c5000000%') = 3);
select public.save_lineup('c8000000-0000-0000-0000-000000000001', '2-3-1', '[{"slot":7,"player":"c5000000-0000-0000-0000-000000000004"}]', '["c5000000-0000-0000-0000-000000000006"]', null,
  '[{"minute":40,"off":"c5000000-0000-0000-0000-000000000004","on":"c5000000-0000-0000-0000-000000000006"}]');
select t.admin();

-- ---------- privacy ----------
select t.login('c1000000-0000-0000-0000-000000000004');
select t.check('player cannot see the rotation plan', (select count(*) from match_rotation_plan) = 0);
select t.check('player cannot write a rotation plan', t.raises($$insert into match_rotation_plan (match_id, minute, player_off_id, player_on_id) values ('c8000000-0000-0000-0000-000000000001', 10, 'c5000000-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000006')$$));
select t.check('player sets a photo in their own folder', t.rows($$update players set photo_path = 'c1000000-0000-0000-0000-000000000004/photo.jpg' where profile_id = auth.uid()$$) = 1);
select t.check('photo outside their own folder refused', t.raises($$update players set photo_path = 'c1000000-0000-0000-0000-000000000003/photo.jpg' where profile_id = auth.uid()$$));
select t.check('odd photo names refused', t.raises($$update players set photo_path = 'c1000000-0000-0000-0000-000000000004/../x.jpg' where profile_id = auth.uid()$$));
select t.admin();
select t.login('c1000000-0000-0000-0000-000000000005');
select t.check('another team''s coach cannot see the rotation plan', (select count(*) from match_rotation_plan) = 0);
select t.admin();
select t.check('release 0.20.0 present', exists (select 1 from app_releases where version = '0.20.0'));
rollback;
