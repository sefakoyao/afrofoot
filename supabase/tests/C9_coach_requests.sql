-- 0066 Coaches see tryout requests and team enrolments (read only, without address, payment choice or internal note).
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f9000000-0000-0000-0000-000000000001', 'cr-coach@example.test', '{"first_name":"Cr","last_name":"Coach"}'),
 ('f9000000-0000-0000-0000-000000000002', 'cr-pc@example.test', '{"first_name":"Cr","last_name":"PlayerCoach"}'),
 ('f9000000-0000-0000-0000-000000000003', 'cr-player@example.test', '{"first_name":"Cr","last_name":"Player"}'),
 ('f9000000-0000-0000-0000-000000000004', 'cr-admin@example.test', '{"first_name":"Cr","last_name":"Admin"}');
update profiles set role = 'coach', status = 'active' where id = 'f9000000-0000-0000-0000-000000000001';
update profiles set role = 'player_coach', status = 'active' where id = 'f9000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id = 'f9000000-0000-0000-0000-000000000003';
update profiles set role = 'club_admin', status = 'active' where id = 'f9000000-0000-0000-0000-000000000004';
select t.login('f9000000-0000-0000-0000-000000000004'); -- review fields (status, note) are set by the club
insert into tryout_requests (id, first_name, last_name, date_of_birth, email, phone, position, message, internal_note, status) values
 ('f9100000-0000-0000-0000-000000000001', 'Try', 'Open', '2001-01-01', 'try-open@example.test', '+358401000001', 'forward', 'I score goals', 'secret admin note', 'new'),
 ('f9100000-0000-0000-0000-000000000002', 'Try', 'Archived', '2001-01-01', 'try-old@example.test', '+358401000002', 'defender', null, null, 'archived');
insert into player_enrolments (id, first_name, last_name, date_of_birth, email, phone, position, terms_accepted, privacy_accepted, address, city, internal_note) values
 ('f9200000-0000-0000-0000-000000000001', 'Enrol', 'New', '2002-02-02', 'enrol@example.test', '+358401000003', 'midfielder', true, true, 'Kotikatu 5', 'Helsinki', 'paid by cash');

select t.login('f9000000-0000-0000-0000-000000000001');
select t.check('a coach sees open tryout requests and enrolments', (select count(*) from coach_requests() where id in ('f9100000-0000-0000-0000-000000000001', 'f9200000-0000-0000-0000-000000000001')) = 2);
select t.check('…with the message and contact details', exists (select 1 from coach_requests() where id = 'f9100000-0000-0000-0000-000000000001' and message = 'I score goals' and phone = '+358401000001' and kind = 'tryout'));
select t.check('archived ones only when asking for all', not exists (select 1 from coach_requests() where id = 'f9100000-0000-0000-0000-000000000002') and exists (select 1 from coach_requests(true) where id = 'f9100000-0000-0000-0000-000000000002'));
select t.check('no address, payment choice or internal note in what coaches get', not exists (select 1 from pg_proc where proname = 'coach_requests' and pg_get_function_result(oid) ~ '(address|internal_note|payment_method)'));
select t.check('a coach still cannot read the tables directly', (select count(*) from tryout_requests) = 0 and (select count(*) from player_enrolments) = 0);
select t.check('…nor change a request', t.rows($$update tryout_requests set status = 'accepted' where id = 'f9100000-0000-0000-0000-000000000001'$$) = 0);
select t.login('f9000000-0000-0000-0000-000000000002');
select t.check('a player-coach sees them too', (select count(*) from coach_requests() where id = 'f9200000-0000-0000-0000-000000000001') = 1);
select t.login('f9000000-0000-0000-0000-000000000003');
select t.check('a player sees none', (select count(*) from coach_requests(true)) = 0);
select t.login('f9000000-0000-0000-0000-000000000004');
select t.check('an admin sees them (and the tables as before)', (select count(*) from coach_requests() where id = 'f9100000-0000-0000-0000-000000000001') = 1 and (select count(*) from tryout_requests where id = 'f9100000-0000-0000-0000-000000000001') = 1);
reset role;
set local role anon;
select t.check('anonymous visitors cannot call it', t.raises($$select * from coach_requests()$$));
rollback;
