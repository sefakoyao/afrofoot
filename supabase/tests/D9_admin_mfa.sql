-- 0075 Admin rights count only on a session confirmed with the second step (token aal = aal2).
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fe900000-0000-0000-0000-000000000001', 'mfa-admin@example.test', '{"first_name":"Mfa","last_name":"Admin"}'),
 ('fe900000-0000-0000-0000-000000000002', 'mfa-super@example.test', '{"first_name":"Mfa","last_name":"Super"}'),
 ('fe900000-0000-0000-0000-000000000003', 'mfa-player@example.test', '{"first_name":"Mfa","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fe900000-0000-0000-0000-000000000001';
update profiles set role = 'super_admin', status = 'active' where id = 'fe900000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id = 'fe900000-0000-0000-0000-000000000003';
create or replace function t.session(u uuid, aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated', 'aal', aal)::text, true);
  execute 'set local role authenticated';
end $$;

-- an admin signed in with the password only
select t.session('fe900000-0000-0000-0000-000000000001', 'aal1');
select t.check('password only: not an admin', not app.is_admin());
select t.check('…sees only their own profile', (select count(*) from profiles) = 1);
select t.check('…cannot change another member', t.rows($$update profiles set first_name = 'X' where id = 'fe900000-0000-0000-0000-000000000003'$$) = 0);
select t.check('…can still read their own profile (to finish the second step)', (select role::text from profiles where id = auth.uid()) = 'club_admin');

-- the same admin after the code
select t.session('fe900000-0000-0000-0000-000000000001', 'aal2');
select t.check('with the code: an admin', app.is_admin());
select t.check('…sees every member', (select count(*) from profiles) >= 3);
select t.check('…can change another member', t.rows($$update profiles set first_name = 'Mfa' where id = 'fe900000-0000-0000-0000-000000000003'$$) = 1);

-- super admins too
select t.session('fe900000-0000-0000-0000-000000000002', 'aal1');
select t.check('super admin, password only: no super admin rights', not app.is_super() and not app.is_admin());
select t.session('fe900000-0000-0000-0000-000000000002', 'aal2');
select t.check('super admin with the code: super admin', app.is_super() and app.is_admin());

-- a player is not affected either way
select t.session('fe900000-0000-0000-0000-000000000003', 'aal1');
select t.check('a player with the password only reads their own profile', (select count(*) from profiles where id = auth.uid()) = 1 and not app.is_admin());

-- no token claims (the service role, migrations, tests): unchanged
reset role;
select set_config('request.jwt.claims', '', true);
select t.login('fe900000-0000-0000-0000-000000000001');
select t.check('without token claims (tests, service): unchanged', app.is_admin());
rollback;
