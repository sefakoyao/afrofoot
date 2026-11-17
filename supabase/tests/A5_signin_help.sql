-- 0044 Sign-in help: admins read why a member cannot sign in; nobody else can. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, last_sign_in_at) values
 ('fe000000-0000-0000-0000-000000000001', 'sh-admin@example.test', '{"first_name":"Sh","last_name":"Admin"}', now(), now()),
 ('fe000000-0000-0000-0000-000000000002', 'sh-coach@example.test', '{"first_name":"Sh","last_name":"Coach"}', now(), now()),
 ('fe000000-0000-0000-0000-000000000003', 'sh-new@example.test', '{"first_name":"Sh","last_name":"New"}', null, null),
 ('fe000000-0000-0000-0000-000000000004', 'sh-owes@example.test', '{"first_name":"Sh","last_name":"Owes"}', now(), now() - interval '40 days'),
 ('fe000000-0000-0000-0000-000000000005', 'sh-google@example.test', '{"first_name":"Sh","last_name":"Google"}', now(), now());
update profiles set role = 'club_admin', status = 'active' where id = 'fe000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'fe000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'pending' where id = 'fe000000-0000-0000-0000-000000000003';
update profiles set role = 'player', status = 'active' where id in ('fe000000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000005');
insert into auth.identities (user_id, provider) values ('fe000000-0000-0000-0000-000000000004', 'email'), ('fe000000-0000-0000-0000-000000000005', 'google');
insert into players (id, profile_id, first_name, last_name, status) values ('fe500000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000004', 'Sh', 'Owes', 'active');
update fee_policy set enabled = true, grace_days = 14;
insert into payments (player_id, amount_cents, currency, status, due_on, notes) values ('fe500000-0000-0000-0000-000000000004', 24000, 'EUR', 'pending', current_date - 30, 'Sh membership');

select t.login('fe000000-0000-0000-0000-000000000001');
select t.check('admin: a new member who never confirmed their email', (select not email_confirmed and last_sign_in_at is null and status = 'pending' and has_account from signin_status('fe000000-0000-0000-0000-000000000003')));
select t.check('admin: a player blocked by overdue fees, with the amount and date', (select fee_blocked and owed_cents = 24000 and oldest_due = current_date - 30 and providers = '{email}' from signin_status('fe000000-0000-0000-0000-000000000004')));
select t.check('admin: a member who signs in with Google only', (select providers = '{google}' and not fee_blocked from signin_status('fe000000-0000-0000-0000-000000000005')));
select log_signin_help('fe000000-0000-0000-0000-000000000003', 'password_link');
select t.check('admin: the sending of a link is written to the audit log', exists (select 1 from audit_log where action = 'SIGNIN_HELP' and record_id = 'fe000000-0000-0000-0000-000000000003' and actor_id = 'fe000000-0000-0000-0000-000000000001' and new_data ->> 'action' = 'password_link'));
select t.check('admin: unknown actions are refused', t.raises($$select log_signin_help('fe000000-0000-0000-0000-000000000003', 'set_password')$$));
select set_fee_exemption('fe500000-0000-0000-0000-000000000004', current_date + 14, 'Sign-in help');
select t.check('admin: a fee exemption lifts the block', (select not fee_blocked and exempt_until = current_date + 14 from signin_status('fe000000-0000-0000-0000-000000000004')));
select t.login('fe000000-0000-0000-0000-000000000002');
select t.check('a coach cannot read sign-in facts', t.raises($$select * from signin_status('fe000000-0000-0000-0000-000000000003')$$));
select t.check('a coach cannot write sign-in help to the audit log', t.raises($$select log_signin_help('fe000000-0000-0000-0000-000000000003', 'password_link')$$));
select t.login('fe000000-0000-0000-0000-000000000004');
select t.check('a player cannot read their own or others'' sign-in facts', t.raises($$select * from signin_status('fe000000-0000-0000-0000-000000000004')$$));
select t.anon();
select t.check('anon cannot call either function', t.raises($$select * from signin_status('fe000000-0000-0000-0000-000000000003')$$) and t.raises($$select log_signin_help('fe000000-0000-0000-0000-000000000003', 'password_link')$$));
select t.admin();
select t.check('release 0.32.0 present', exists (select 1 from app_releases where version = '0.32.0'));
rollback;
