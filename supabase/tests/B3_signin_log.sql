-- 0051 Sign-in log: who may write what, the cap per email, and admins-only reading. t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f8000000-0000-0000-0000-000000000001', 'sl-admin@example.test', '{"first_name":"Sl","last_name":"Admin"}'),
 ('f8000000-0000-0000-0000-000000000002', 'sl-player@example.test', '{"first_name":"Sl","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f8000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'f8000000-0000-0000-0000-000000000002';

select t.anon();
select t.check('the sign-in page logs a failure without a session', t.rows($$select log_signin('  SL-Player@Example.test ', 'password', 'wrong_password')$$) = 1);
select t.check('a reset request for an unknown address is logged too', t.rows($$select log_signin('sl-typo@example.test', 'reset', 'reset_sent')$$) = 1);
select t.check('a success cannot be logged without signing in', t.raises($$select log_signin('sl-player@example.test', 'password', 'ok')$$));
select t.check('unknown outcome refused', t.raises($$select log_signin('sl-player@example.test', 'password', 'hacked')$$));
select t.check('unknown method refused', t.raises($$select log_signin('sl-player@example.test', 'sms', 'wrong_password')$$));
select t.check('an email is needed for a failure', t.raises($$select log_signin('not-an-email', 'password', 'wrong_password')$$));
select t.check('anon cannot read the log', t.raises($$select 1 from signin_events$$));
select t.check('anon cannot write the table directly', t.raises($$insert into signin_events (email, method, outcome) values ('x@example.test', 'password', 'ok')$$));
select t.check('one address is capped at 20 entries per 10 minutes', t.rows($$select log_signin('sl-flood@example.test', 'password', 'wrong_password') from generate_series(1, 25)$$) = 25);

select t.login('f8000000-0000-0000-0000-000000000002');
select t.check('a member logs their own success', t.rows($$select log_signin('sl-admin@example.test', 'password', 'ok')$$) = 1);
select t.check('a member cannot read the log', (select count(*) from signin_events) = 0);
select t.check('a member cannot write the table directly', t.raises($$insert into signin_events (profile_id, method, outcome) values ('f8000000-0000-0000-0000-000000000001', 'password', 'ok')$$));
select t.check('a member cannot read the Supabase Auth log', t.raises($$select * from signin_auth_log('f8000000-0000-0000-0000-000000000002')$$));

select t.login('f8000000-0000-0000-0000-000000000001');
select t.check('the failure is matched to the member, email lower-cased', exists (select 1 from signin_events where outcome = 'wrong_password' and email = 'sl-player@example.test' and profile_id = 'f8000000-0000-0000-0000-000000000002'));
select t.check('the unknown address has no member', exists (select 1 from signin_events where email = 'sl-typo@example.test' and profile_id is null and outcome = 'reset_sent'));
select t.check('the success is logged for the signed-in member, not the email passed', exists (select 1 from signin_events where outcome = 'ok' and profile_id = 'f8000000-0000-0000-0000-000000000002' and email = 'sl-player@example.test'));
select t.check('…and the flood stopped at 20', (select count(*) from signin_events where email = 'sl-flood@example.test') = 20);
select t.check('an admin reads the Supabase Auth log (empty when not available)', not t.raises($$select * from signin_auth_log('f8000000-0000-0000-0000-000000000002')$$));
select t.check('a long detail is accepted', t.rows(format($$select log_signin('sl-player@example.test', 'reset', 'reset_failed', %L)$$, repeat('x', 300))) = 1);
select t.check('…cut to 120 characters', (select max(char_length(detail)) from signin_events) = 120);
rollback;
