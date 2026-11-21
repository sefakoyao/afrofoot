-- 0068 Contracts of players under 18: a parent or guardian signs too; the club countersigns only after them.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fd100000-0000-0000-0000-000000000001', 'mc-admin@example.test', '{"first_name":"Mc","last_name":"Admin"}'),
 ('fd100000-0000-0000-0000-000000000002', 'mc-young@example.test', '{"first_name":"Yaw","last_name":"Young"}'),
 ('fd100000-0000-0000-0000-000000000003', 'mc-adult@example.test', '{"first_name":"Ama","last_name":"Adult"}'),
 ('fd100000-0000-0000-0000-000000000004', 'mc-nodob@example.test', '{"first_name":"Kojo","last_name":"Nodob"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fd100000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('fd100000-0000-0000-0000-000000000002', 'fd100000-0000-0000-0000-000000000003', 'fd100000-0000-0000-0000-000000000004');
delete from players where profile_id in ('fd100000-0000-0000-0000-000000000002', 'fd100000-0000-0000-0000-000000000003', 'fd100000-0000-0000-0000-000000000004');
insert into players (id, profile_id, first_name, last_name, date_of_birth) values
 ('fd500000-0000-0000-0000-000000000002', 'fd100000-0000-0000-0000-000000000002', 'Yaw', 'Young', current_date - interval '16 years'),
 ('fd500000-0000-0000-0000-000000000003', 'fd100000-0000-0000-0000-000000000003', 'Ama', 'Adult', '1995-05-05'),
 ('fd500000-0000-0000-0000-000000000004', 'fd100000-0000-0000-0000-000000000004', 'Kojo', 'Nodob', null);
select t.login('fd100000-0000-0000-0000-000000000001');
insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body)
  select ('fd600000-0000-0000-0000-00000000000' || n)::uuid, ('fd500000-0000-0000-0000-00000000000' || n)::uuid, 'Mc contract', 1, current_date, current_date + 300, repeat('Contract text. ', 10)
  from generate_series(2, 4) n;
update player_contracts set status = 'sent' where id in ('fd600000-0000-0000-0000-000000000002', 'fd600000-0000-0000-0000-000000000003', 'fd600000-0000-0000-0000-000000000004');
select t.check('admins see which players are under 18', exists (select 1 from minor_players() m where m = 'fd500000-0000-0000-0000-000000000002')
  and not exists (select 1 from minor_players() m where m in ('fd500000-0000-0000-0000-000000000003', 'fd500000-0000-0000-0000-000000000004')));

-- the young player
select t.login('fd100000-0000-0000-0000-000000000002');
select t.check('the player is told they are under 18', my_minor_status());
select t.check('a minor cannot sign alone', t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000002', 'Yaw Young')$$));
select t.check('…nor without the parent''s phone', t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000002', 'Yaw Young', null, 'Efua Young', 'mother', null, null, 'Efua Young')$$));
select t.check('…nor with a phone without country code', t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000002', 'Yaw Young', null, 'Efua Young', 'mother', '040 123 4567', null, 'Efua Young')$$));
select t.check('…nor when the parent did not type their own name', t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000002', 'Yaw Young', null, 'Efua Young', 'mother', '+358 40 123 4567', 'efua@example.test', 'Yaw Young')$$));
select t.check('…nor with the player as their own guardian', t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000002', 'Yaw Young', null, 'Yaw Young', 'parent', '+358 40 123 4567', null, 'Yaw Young')$$));
select t.check('…nor by claiming to be an adult (the birth date decides)', t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000002', 'Yaw Young', false, null, null, null, null, null)$$));
select t.check('the minor signs together with the mother', not t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000002', 'Yaw Young', null, 'Efua Young', 'mother', '+358 40 123 4567', 'efua@example.test', 'efua  young')$$));
reset role;
select t.check('…stored: under 18, the mother''s details and signature', (select is_minor and guardian_name = 'Efua Young' and guardian_relation = 'mother' and guardian_phone = '+358 40 123 4567'
  and guardian_email = 'efua@example.test' and guardian_signed_name = 'Efua Young' and guardian_signed_at is not null and status = 'player_signed' from player_contracts where id = 'fd600000-0000-0000-0000-000000000002'));

-- the adult and the player without a birth date
select t.login('fd100000-0000-0000-0000-000000000003');
select t.check('an adult is not under 18', my_minor_status() = false);
select t.check('an adult signs alone, as before', not t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000003', 'Ama Adult')$$));
select t.login('fd100000-0000-0000-0000-000000000004');
select t.check('without a birth date the status is unknown', my_minor_status() is null);
select t.check('saying "under 18" without a birth date needs the guardian', t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000004', 'Kojo Nodob', true, null, null, null, null, null)$$));
select t.check('…and works with them', not t.raises($$select sign_contract('fd600000-0000-0000-0000-000000000004', 'Kojo Nodob', true, 'Kwesi Nodob', 'father', '+358401112222', null, 'Kwesi Nodob')$$));
reset role;
select t.check('…stored as a minor''s contract', (select is_minor and guardian_relation = 'father' from player_contracts where id = 'fd600000-0000-0000-0000-000000000004'));
select t.check('the adult''s contract has no guardian', (select not is_minor and guardian_name is null from player_contracts where id = 'fd600000-0000-0000-0000-000000000003'));

-- the club
select t.login('fd100000-0000-0000-0000-000000000001');
select t.check('an admin cannot change the guardian''s signature', t.raises($$update player_contracts set guardian_signed_name = 'Someone Else' where id = 'fd600000-0000-0000-0000-000000000002'$$));
select t.check('…nor drop the under-18 flag', t.raises($$update player_contracts set is_minor = false where id = 'fd600000-0000-0000-0000-000000000002'$$));
select t.check('the club countersigns the minor''s contract signed by the parent', not t.raises($$update player_contracts set status = 'active' where id = 'fd600000-0000-0000-0000-000000000002'$$));
reset role;
select t.check('a minor''s signed contract without a guardian signature is impossible', t.raises($$update player_contracts set is_minor = true where id = 'fd600000-0000-0000-0000-000000000003'$$));
rollback;
