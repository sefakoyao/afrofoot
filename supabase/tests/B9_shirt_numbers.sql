-- 0057 Shirt number requests: players ask for free numbers in their team; coach or admin decides; never their own.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fe000000-0000-0000-0000-000000000001', 'sn-admin@example.test', '{"first_name":"Sn","last_name":"Admin"}'),
 ('fe000000-0000-0000-0000-000000000002', 'sn-coach@example.test', '{"first_name":"Sn","last_name":"Coach"}'),
 ('fe000000-0000-0000-0000-000000000003', 'sn-p1@example.test', '{"first_name":"Kwesi","last_name":"One"}'),
 ('fe000000-0000-0000-0000-000000000004', 'sn-p2@example.test', '{"first_name":"Efua","last_name":"Two"}'),
 ('fe000000-0000-0000-0000-000000000005', 'sn-out@example.test', '{"first_name":"Other","last_name":"Team"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fe000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'fe000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('fe000000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000005');
insert into seasons (id, name, starts_on, ends_on) values ('fe200000-0000-0000-0000-000000000001', 'Sn season', '2031-03-01', '2031-10-31');
insert into teams (id, name, slug) values ('fe300000-0000-0000-0000-000000000001', 'Sn A', 'sn-a'), ('fe300000-0000-0000-0000-000000000002', 'Sn B', 'sn-b');
insert into team_seasons (id, team_id, season_id) values ('fe400000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000001', 'fe200000-0000-0000-0000-000000000001'),
 ('fe400000-0000-0000-0000-000000000002', 'fe300000-0000-0000-0000-000000000002', 'fe200000-0000-0000-0000-000000000001');
insert into players (id, profile_id, first_name, last_name) values
 ('fe500000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000003', 'Kwesi', 'One'),
 ('fe500000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000004', 'Efua', 'Two'),
 ('fe500000-0000-0000-0000-000000000005', 'fe000000-0000-0000-0000-000000000005', 'Other', 'Team');
insert into team_players (team_season_id, player_id, jersey_number) values
 ('fe400000-0000-0000-0000-000000000001', 'fe500000-0000-0000-0000-000000000003', null), ('fe400000-0000-0000-0000-000000000001', 'fe500000-0000-0000-0000-000000000004', 7),
 ('fe400000-0000-0000-0000-000000000002', 'fe500000-0000-0000-0000-000000000005', null);
insert into staff_members (id, profile_id, first_name, last_name, type) values ('fe600000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000002', 'Sn', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('fe400000-0000-0000-0000-000000000001', 'fe600000-0000-0000-0000-000000000002');

select t.login('fe000000-0000-0000-0000-000000000003');
select t.check('a player sees 99 numbers of their team, 98 free, 7 worn by Efua', (select count(*) || '/' || count(*) filter (where free) || '/' || max(player_name) filter (where number = 7) from shirt_numbers('fe400000-0000-0000-0000-000000000001')) = '99/98/Efua Two');
select t.check('…but not of another team', t.raises($$select * from shirt_numbers('fe400000-0000-0000-0000-000000000002')$$));
select t.check('cannot ask for a taken number', t.raises($$select request_shirt_number('fe400000-0000-0000-0000-000000000001', 7)$$));
select t.check('cannot ask in a team they are not in', t.raises($$select request_shirt_number('fe400000-0000-0000-0000-000000000002', 10)$$));
select t.check('number 100 refused', t.raises($$select request_shirt_number('fe400000-0000-0000-0000-000000000001', 100)$$));
select t.check('asks for 10', not t.raises($$select request_shirt_number('fe400000-0000-0000-0000-000000000001', 10, 'Like at my last club')$$));
select t.check('a second request replaces the first (one open)', not t.raises($$select request_shirt_number('fe400000-0000-0000-0000-000000000001', 9)$$)
  );
select t.check('…10 withdrawn, 9 open', (select string_agg(number || ':' || status, ',' order by number) from jersey_requests) = '9:pending,10:withdrawn');
select t.check('a player cannot decide', t.raises(format($$select decide_shirt_request(%L, true)$$, (select id from jersey_requests where number = 9))));
select t.check('a player cannot write requests directly', t.raises($$insert into jersey_requests (team_season_id, player_id, number) values ('fe400000-0000-0000-0000-000000000001', 'fe500000-0000-0000-0000-000000000003', 11)$$));
select t.login('fe000000-0000-0000-0000-000000000004');
select t.check('Efua (wears 7) also asks for 9', not t.raises($$select request_shirt_number('fe400000-0000-0000-0000-000000000001', 9)$$));
select t.check('…she sees her own request only', (select count(*) from jersey_requests) = 1);
select t.check('…the grid shows 2 requests on 9 and hers', (select requests || '/' || mine_requested from shirt_numbers('fe400000-0000-0000-0000-000000000001') where number = 9) = '2/true');

select t.login('fe000000-0000-0000-0000-000000000002');
select t.check('the coach sees both open requests', (select count(*) from jersey_requests where status = 'pending') = 2);
select t.check('the coach approves Kwesi for 9', not t.raises(format($$select decide_shirt_request(%L, true)$$, (select id from jersey_requests where number = 9 and player_id = 'fe500000-0000-0000-0000-000000000003'))));
select t.check('…Kwesi now wears 9', (select jersey_number from team_players where player_id = 'fe500000-0000-0000-0000-000000000003') = 9);
select t.check('…Efua''s request for 9 was declined automatically, without a note', (select status || ':' || coalesce(decision_note, '-') from jersey_requests where player_id = 'fe500000-0000-0000-0000-000000000004') = 'declined:-');
select t.check('…9 is no longer free', (select free from shirt_numbers('fe400000-0000-0000-0000-000000000001') where number = 9) = false);
select t.login('fe000000-0000-0000-0000-000000000004');
select t.check('Efua asks for 12 instead (her 7 stays until approved)', not t.raises($$select request_shirt_number('fe400000-0000-0000-0000-000000000001', 12)$$)
  and (select jersey_number from team_players where player_id = 'fe500000-0000-0000-0000-000000000004') = 7);
select t.login('fe000000-0000-0000-0000-000000000001');
select t.check('the admin declines with a reason', not t.raises(format($$select decide_shirt_request(%L, false, 'Reserved for the goalkeeper')$$, (select id from jersey_requests where number = 12))));
select t.check('…declined with the note, 7 kept', (select status || ':' || decision_note from jersey_requests where number = 12) = 'declined:Reserved for the goalkeeper'
  and (select jersey_number from team_players where player_id = 'fe500000-0000-0000-0000-000000000004') = 7);
select t.check('decisions are audited', exists (select 1 from audit_log where table_name = 'jersey_requests' and new_data ->> 'status' = 'approved'));
select t.check('a decided request cannot be decided again', t.raises(format($$select decide_shirt_request(%L, true)$$, (select id from jersey_requests where number = 12))));
-- a player-coach cannot approve their own request
update profiles set role = 'coach' where id = 'fe000000-0000-0000-0000-000000000004';
insert into staff_members (id, profile_id, first_name, last_name, type) values ('fe600000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000004', 'Efua', 'Two', 'assistant_coach');
insert into team_staff (team_season_id, staff_id) values ('fe400000-0000-0000-0000-000000000001', 'fe600000-0000-0000-0000-000000000004');
select t.login('fe000000-0000-0000-0000-000000000004');
select request_shirt_number('fe400000-0000-0000-0000-000000000001', 14);
select t.check('a player-coach cannot approve their own request', t.raises(format($$select decide_shirt_request(%L, true)$$, (select id from jersey_requests where number = 14))));
select t.check('…but can withdraw it', not t.raises(format($$select withdraw_shirt_request(%L)$$, (select id from jersey_requests where number = 14))));
select t.login('fe000000-0000-0000-0000-000000000005');
select t.check('another team''s player cannot see these requests', (select count(*) from jersey_requests) = 0);
select t.anon();
select t.check('anon: nothing', t.raises($$select 1 from jersey_requests$$));
rollback;
