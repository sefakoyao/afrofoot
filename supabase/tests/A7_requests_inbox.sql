-- 0046 Requests inbox: admins read and handle website requests; coaches and players cannot; message changes are audited.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f9000000-0000-0000-0000-000000000001', 'rq-admin@example.test', '{"first_name":"Rq","last_name":"Admin"}'),
 ('f9000000-0000-0000-0000-000000000002', 'rq-coach@example.test', '{"first_name":"Rq","last_name":"Coach"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f9000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'f9000000-0000-0000-0000-000000000002';
select t.anon();
insert into contact_messages (id, name, email, topic, message) values ('f9100000-0000-0000-0000-000000000001', 'Rq Visitor', 'rq-visitor@example.test', 'general', 'Hello, can I join?');
insert into tryout_requests (id, first_name, last_name, date_of_birth, email, phone, position) values ('f9200000-0000-0000-0000-000000000001', 'Rq', 'Tryout', '2000-05-05', 'rq-tryout@example.test', '+358401234567', 'forward');
select t.check('visitors cannot read what they sent', t.raises($$select 1 from contact_messages$$) and t.raises($$select 1 from tryout_requests$$));
select t.login('f9000000-0000-0000-0000-000000000002');
select t.check('a coach cannot read or handle requests', (select count(*) from contact_messages where id = 'f9100000-0000-0000-0000-000000000001') = 0
  and t.rows($$update tryout_requests set status = 'accepted' where id = 'f9200000-0000-0000-0000-000000000001'$$) = 0);
select t.login('f9000000-0000-0000-0000-000000000001');
select t.check('an admin reads both', (select count(*) from contact_messages where id = 'f9100000-0000-0000-0000-000000000001') = 1 and (select count(*) from tryout_requests where id = 'f9200000-0000-0000-0000-000000000001') = 1);
select t.check('an admin handles a message', t.rows($$update contact_messages set status = 'archived', handled_by = 'f9000000-0000-0000-0000-000000000001' where id = 'f9100000-0000-0000-0000-000000000001'$$) = 1);
select t.check('an admin sets a tryout date and note', t.rows($$update tryout_requests set status = 'in_review', tryout_on = current_date + 7, internal_note = 'Invite to Tuesday' where id = 'f9200000-0000-0000-0000-000000000001'$$) = 1);
select t.check('statuses are limited', t.raises($$update contact_messages set status = 'paid' where id = 'f9100000-0000-0000-0000-000000000001'$$));
select t.admin();
select t.check('message changes are audited, without the message text', exists (select 1 from audit_log where table_name = 'contact_messages' and record_id = 'f9100000-0000-0000-0000-000000000001' and action = 'UPDATE')
  and not exists (select 1 from audit_log where table_name = 'contact_messages' and record_id = 'f9100000-0000-0000-0000-000000000001' and (coalesce(old_data::text, '') || coalesce(new_data::text, '')) like '%can I join%'));
select t.check('release 0.34.0 present', exists (select 1 from app_releases where version = '0.34.0'));
rollback;
