-- 0035 Phone sign-up: accounts without an email address. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, phone, raw_user_meta_data) values
 ('f1000000-0000-0000-0000-000000000001', null, '358401234567', '{"first_name":"Phone","last_name":"Player"}'),
 ('f1000000-0000-0000-0000-000000000002', 'mail-user@example.test', null, '{"first_name":"Mail","last_name":"User"}'),
 ('f1000000-0000-0000-0000-000000000003', '', '33612345678', '{}');
select t.check('phone account: profile without email, phone with country code', (select coalesce(email::text, '-') || '|' || phone || '|' || first_name from profiles where id = 'f1000000-0000-0000-0000-000000000001') = '-|+358401234567|Phone');
select t.check('phone account: pending player', (select role || ':' || status from profiles where id = 'f1000000-0000-0000-0000-000000000001') = 'player:pending');
select t.check('email account unchanged (no phone)', (select email || '|' || coalesce(phone, '-') from profiles where id = 'f1000000-0000-0000-0000-000000000002') = 'mail-user@example.test|-');
select t.check('empty email from Auth stored as no email', (select email is null and phone = '+33612345678' from profiles where id = 'f1000000-0000-0000-0000-000000000003'));
select t.check('two phone accounts can both have no email', (select count(*) from profiles where id::text like 'f1000000%' and email is null) = 2);
select t.check('a profile needs an email or a phone', t.raises($$update profiles set phone = null where id = 'f1000000-0000-0000-0000-000000000001'$$));
select t.check('account without email or phone refused', t.raises($$insert into auth.users (id, email, phone) values ('f1000000-0000-0000-0000-000000000004', null, null)$$));
-- the phone owner can read their own profile and cannot change it to remove the phone
update profiles set status = 'active' where id = 'f1000000-0000-0000-0000-000000000001';
select t.login('f1000000-0000-0000-0000-000000000001');
select t.check('phone member reads own profile', (select count(*) from profiles where id = 'f1000000-0000-0000-0000-000000000001') = 1);
select t.check('phone member cannot add an email to the profile (managed by Auth)', t.raises($$update profiles set email = 'x@example.test' where id = 'f1000000-0000-0000-0000-000000000001'$$));
select t.admin();
select t.check('release 0.23.0 present', exists (select 1 from app_releases where version = '0.23.0'));
rollback;
