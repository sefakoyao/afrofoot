-- 0073 Players set their own birth date once; admins correct it; the contract needs it.
begin;
create or replace function t.service() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fe100000-0000-0000-0000-000000000001', 'bd-admin@example.test', '{"first_name":"Bd","last_name":"Admin"}'),
 ('fe100000-0000-0000-0000-000000000002', 'bd-player@example.test', '{"first_name":"Bd","last_name":"Player"}'),
 ('fe100000-0000-0000-0000-000000000003', 'bd-other@example.test', '{"first_name":"Bd","last_name":"Other"}'),
 ('fe100000-0000-0000-0000-000000000004', 'bd-coach@example.test', '{"first_name":"Bd","last_name":"Coach"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fe100000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('fe100000-0000-0000-0000-000000000002', 'fe100000-0000-0000-0000-000000000003');
update profiles set role = 'coach', status = 'active' where id = 'fe100000-0000-0000-0000-000000000004';
insert into players (id, profile_id, first_name, last_name) values
 ('fe200000-0000-0000-0000-000000000002', 'fe100000-0000-0000-0000-000000000002', 'Bd', 'Player'),
 ('fe200000-0000-0000-0000-000000000003', 'fe100000-0000-0000-0000-000000000003', 'Bd', 'Other');

-- the player enters it once
select t.login('fe100000-0000-0000-0000-000000000002');
select t.check('a birth date in the future is refused', t.raises($$update players set date_of_birth = current_date + 10 where id = 'fe200000-0000-0000-0000-000000000002'$$));
select t.check('less than 5 years ago is refused', t.raises($$update players set date_of_birth = current_date - 365 where id = 'fe200000-0000-0000-0000-000000000002'$$));
select t.check('before 1940 is refused', t.raises($$update players set date_of_birth = date '1939-12-31' where id = 'fe200000-0000-0000-0000-000000000002'$$));
select t.check('the player saves their own birth date', t.rows($$update players set date_of_birth = date '1996-05-20' where id = 'fe200000-0000-0000-0000-000000000002'$$) = 1);
select t.check('…but cannot change it afterwards', t.raises($$update players set date_of_birth = date '1990-01-01' where id = 'fe200000-0000-0000-0000-000000000002'$$));
select t.check('…nor clear it', t.raises($$update players set date_of_birth = null where id = 'fe200000-0000-0000-0000-000000000002'$$));
select t.check('another player''s birth date is out of reach', t.rows($$update players set date_of_birth = date '1990-01-01' where id = 'fe200000-0000-0000-0000-000000000003'$$) = 0);
select t.check('other player fields stay locked', t.raises($$update players set position = 'forward' where id = 'fe200000-0000-0000-0000-000000000002'$$));
select t.check('the player can still change their own allowed fields', t.rows($$update players set height_cm = 180 where id = 'fe200000-0000-0000-0000-000000000002'$$) = 1);
select t.service();
select t.check('saved', (select date_of_birth from players where id = 'fe200000-0000-0000-0000-000000000002') = date '1996-05-20');

-- a coach cannot overwrite a saved one either
select t.login('fe100000-0000-0000-0000-000000000004');
select t.check('a coach cannot change a saved birth date', (select count(*) from players where id = 'fe200000-0000-0000-0000-000000000002') = 0
  or t.raises($$update players set date_of_birth = date '1990-01-01' where id = 'fe200000-0000-0000-0000-000000000002'$$));

-- the admin corrects it
select t.login('fe100000-0000-0000-0000-000000000001');
select t.check('an admin corrects a saved birth date', t.rows($$update players set date_of_birth = date '1995-05-20' where id = 'fe200000-0000-0000-0000-000000000002'$$) = 1);
select t.check('…and the change is in the audit trail', exists (select 1 from audit_log where table_name = 'players' and old_data->>'date_of_birth' = '1996-05-20' and new_data->>'date_of_birth' = '1995-05-20'));
select t.check('the database still refuses a future date, even from an admin', t.raises($$update players set date_of_birth = current_date + 1 where id = 'fe200000-0000-0000-0000-000000000002'$$));

-- the contract needs a saved birth date (where contracts are installed)
select t.service();
insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body, status, sent_at) values
 ('fe300000-0000-0000-0000-000000000003', 'fe200000-0000-0000-0000-000000000003', 'Bd contract', 1, date '2026-12-01', date '2027-11-30', repeat('x', 60), 'draft', null);
update player_contracts set status = 'sent' where id = 'fe300000-0000-0000-0000-000000000003';
select t.login('fe100000-0000-0000-0000-000000000003');
select t.check('no birth date: the player cannot sign', t.raises($$select public.sign_contract('fe300000-0000-0000-0000-000000000003', 'Bd Other')$$));
select t.check('the player saves their birth date', t.rows($$update players set date_of_birth = date '1998-02-02' where id = 'fe200000-0000-0000-0000-000000000003'$$) = 1);
select t.check('…then signs', not t.raises($$select public.sign_contract('fe300000-0000-0000-0000-000000000003', 'Bd Other')$$));
select t.service();
select t.check('…signed', (select status::text from player_contracts where id = 'fe300000-0000-0000-0000-000000000003') = 'player_signed');
rollback;
