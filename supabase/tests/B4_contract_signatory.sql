-- 0052 Club signatory: the contract settings' name and title become the club's signature at countersigning; frozen afterwards.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f9000000-0000-0000-0000-000000000001', 'cs-admin@example.test', '{"first_name":"Cs","last_name":"Admin"}'),
 ('f9000000-0000-0000-0000-000000000002', 'cs-player@example.test', '{"first_name":"Kwame","last_name":"Owusu"}'),
 ('f9000000-0000-0000-0000-000000000003', 'cs-player2@example.test', '{"first_name":"Esi","last_name":"Boateng"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f9000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('f9000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name) values
 ('f9500000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-000000000002', 'Kwame', 'Owusu'),
 ('f9500000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-000000000003', 'Esi', 'Boateng');
update site_settings set value = value - 'signatory_name' - 'signatory_title' where key = 'contracts';

select t.login('f9000000-0000-0000-0000-000000000001');
select t.check('a title cannot be written on a new contract', t.rows($$insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body, club_signed_title)
  values ('f9700000-0000-0000-0000-000000000001', 'f9500000-0000-0000-0000-000000000002', 'Cs 1', 1, '2027-03-01', '2027-10-31', repeat('x', 60), 'Forged')$$) = 1);
select t.check('…it is cleared', (select club_signed_title from player_contracts where id = 'f9700000-0000-0000-0000-000000000001') is null);
insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body) values
 ('f9700000-0000-0000-0000-000000000002', 'f9500000-0000-0000-0000-000000000003', 'Cs 2', 1, '2027-03-01', '2027-10-31', repeat('y', 60));
update player_contracts set status = 'sent' where id in ('f9700000-0000-0000-0000-000000000001', 'f9700000-0000-0000-0000-000000000002');
select t.login('f9000000-0000-0000-0000-000000000002');
select public.sign_contract('f9700000-0000-0000-0000-000000000001', 'Kwame Owusu');
select t.login('f9000000-0000-0000-0000-000000000003');
select public.sign_contract('f9700000-0000-0000-0000-000000000002', 'Esi Boateng');

-- without a signatory: the admin's own name, no title
select t.login('f9000000-0000-0000-0000-000000000001');
select t.check('countersigned without a signatory', t.rows($$update player_contracts set status = 'active' where id = 'f9700000-0000-0000-0000-000000000001'$$) = 1);
select t.check('…the admin''s own name, no title', (select club_signed_name || '|' || coalesce(club_signed_title, '-') from player_contracts where id = 'f9700000-0000-0000-0000-000000000001') = 'Cs Admin|-');

-- with a signatory: that name and title, the admin still recorded
update site_settings set value = value || '{"signatory_name": " Ama Mensah ", "signatory_title": "General Manager"}' where key = 'contracts';
select t.check('countersigned with a signatory', t.rows($$update player_contracts set status = 'active' where id = 'f9700000-0000-0000-0000-000000000002'$$) = 1);
select t.check('…the signatory''s name and title', (select club_signed_name || '|' || club_signed_title from player_contracts where id = 'f9700000-0000-0000-0000-000000000002') = 'Ama Mensah|General Manager');
select t.check('…the admin who clicked is kept', (select club_signed_by from player_contracts where id = 'f9700000-0000-0000-0000-000000000002') = 'f9000000-0000-0000-0000-000000000001');
select t.check('the title cannot be changed afterwards', t.raises($$update player_contracts set club_signed_title = 'Chair' where id = 'f9700000-0000-0000-0000-000000000002'$$));
select t.check('…nor added to a contract signed without one', t.raises($$update player_contracts set club_signed_title = 'Chair' where id = 'f9700000-0000-0000-0000-000000000001'$$));
select t.check('a later settings change does not touch signed contracts', t.rows($$update site_settings set value = value || '{"signatory_name": "Someone Else"}' where key = 'contracts'$$) = 1
  and (select club_signed_name from player_contracts where id = 'f9700000-0000-0000-0000-000000000002') = 'Ama Mensah');
rollback;
