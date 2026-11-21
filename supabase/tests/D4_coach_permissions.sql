-- 0070 Coach permissions: admins tick rights per coach; each right reaches only the coach's own teams.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fb100000-0000-0000-0000-000000000001', 'cp-admin@example.test', '{"first_name":"Cp","last_name":"Admin"}'),
 ('fb100000-0000-0000-0000-000000000002', 'cp-coach@example.test', '{"first_name":"Cp","last_name":"Coach"}'),
 ('fb100000-0000-0000-0000-000000000003', 'cp-player@example.test', '{"first_name":"Cp","last_name":"Player"}'),
 ('fb100000-0000-0000-0000-000000000004', 'cp-other@example.test', '{"first_name":"Cp","last_name":"Other"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fb100000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'fb100000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('fb100000-0000-0000-0000-000000000003', 'fb100000-0000-0000-0000-000000000004');
delete from players where profile_id in ('fb100000-0000-0000-0000-000000000003', 'fb100000-0000-0000-0000-000000000004');
insert into players (id, profile_id, first_name, last_name) values ('fb500000-0000-0000-0000-000000000003', 'fb100000-0000-0000-0000-000000000003', 'Cp', 'Player'),
 ('fb500000-0000-0000-0000-000000000004', 'fb100000-0000-0000-0000-000000000004', 'Cp', 'Other');
insert into seasons (id, name, starts_on, ends_on, is_current) values ('fb200000-0000-0000-0000-000000000001', 'Cp season', current_date - 30, current_date + 300, false);
insert into teams (id, name, slug) values ('fb300000-0000-0000-0000-000000000001', 'Cp A', 'cp-a'), ('fb300000-0000-0000-0000-000000000002', 'Cp B', 'cp-b');
insert into team_seasons (id, team_id, season_id) values ('fb400000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001', 'fb200000-0000-0000-0000-000000000001'),
 ('fb400000-0000-0000-0000-000000000002', 'fb300000-0000-0000-0000-000000000002', 'fb200000-0000-0000-0000-000000000001');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('fb600000-0000-0000-0000-000000000002', 'fb100000-0000-0000-0000-000000000002', 'Cp', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('fb400000-0000-0000-0000-000000000001', 'fb600000-0000-0000-0000-000000000002');
insert into team_players (team_season_id, player_id) values ('fb400000-0000-0000-0000-000000000001', 'fb500000-0000-0000-0000-000000000003'), ('fb400000-0000-0000-0000-000000000002', 'fb500000-0000-0000-0000-000000000004');
insert into payments (id, player_id, amount_cents) values ('fb700000-0000-0000-0000-000000000003', 'fb500000-0000-0000-0000-000000000003', 4000), ('fb700000-0000-0000-0000-000000000004', 'fb500000-0000-0000-0000-000000000004', 4000);
select t.login('fb100000-0000-0000-0000-000000000001');
insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body) values
 ('fb800000-0000-0000-0000-000000000003', 'fb500000-0000-0000-0000-000000000003', 'Cp contract', 1, current_date, current_date + 300, repeat('Contract text. ', 10)),
 ('fb800000-0000-0000-0000-000000000004', 'fb500000-0000-0000-0000-000000000004', 'Cp contract', 1, current_date, current_date + 300, repeat('Contract text. ', 10));
update player_contracts set status = 'sent' where id in ('fb800000-0000-0000-0000-000000000003', 'fb800000-0000-0000-0000-000000000004');

-- without any right
select t.login('fb100000-0000-0000-0000-000000000002');
select t.check('without the right a coach sees no contracts', (select count(*) from player_contracts where id = 'fb800000-0000-0000-0000-000000000003') = 0);
select t.check('…no invoices', (select count(*) from payments where id = 'fb700000-0000-0000-0000-000000000003') = 0);
select t.check('…cannot add an opponent', t.raises($$insert into opponents (name) values ('Cp Rivals')$$));
select t.check('a coach cannot grant themselves a right', t.raises($$insert into coach_permissions (profile_id, permission) values (auth.uid(), 'fees')$$));

-- the admin ticks the boxes
select t.login('fb100000-0000-0000-0000-000000000001');
select t.check('an admin grants rights to a coach', t.rows($$insert into coach_permissions (profile_id, permission) values ('fb100000-0000-0000-0000-000000000002', 'contracts'), ('fb100000-0000-0000-0000-000000000002', 'fees'), ('fb100000-0000-0000-0000-000000000002', 'opponents')$$) = 3);
select t.check('only coaches get rights', t.raises($$insert into coach_permissions (profile_id, permission) values ('fb100000-0000-0000-0000-000000000003', 'fees')$$));
select t.check('only the known rights', t.raises($$insert into coach_permissions (profile_id, permission) values ('fb100000-0000-0000-0000-000000000002', 'everything')$$));
select t.check('granting is audited', exists (select 1 from audit_log where table_name = 'coach_permissions' and action = 'INSERT'));

select t.login('fb100000-0000-0000-0000-000000000002');
select t.check('the coach sees their own rights', (select count(*) from coach_permissions where profile_id = auth.uid()) = 3);
select t.check('with the right: the own team''s contract', (select count(*) from player_contracts where id = 'fb800000-0000-0000-0000-000000000003') = 1);
select t.check('…never another team''s', (select count(*) from player_contracts where id = 'fb800000-0000-0000-0000-000000000004') = 0);
select t.check('…the own team''s invoices, not another team''s', (select count(*) from payments where id = 'fb700000-0000-0000-0000-000000000003') = 1 and (select count(*) from payments where id = 'fb700000-0000-0000-0000-000000000004') = 0);
select t.check('…cannot change an invoice', t.rows($$update payments set amount_cents = 1 where id = 'fb700000-0000-0000-0000-000000000003'$$) = 0);
select t.check('…adds an opponent', t.rows($$insert into opponents (name) values ('Cp Rivals')$$) = 1);

-- taken back, and a coach who stops coaching
select t.login('fb100000-0000-0000-0000-000000000001');
delete from coach_permissions where profile_id = 'fb100000-0000-0000-0000-000000000002' and permission = 'contracts';
select t.login('fb100000-0000-0000-0000-000000000002');
select t.check('the right taken back: contracts hidden again', (select count(*) from player_contracts where id = 'fb800000-0000-0000-0000-000000000003') = 0);
select t.login('fb100000-0000-0000-0000-000000000001');
update profiles set role = 'player' where id = 'fb100000-0000-0000-0000-000000000002';
select t.login('fb100000-0000-0000-0000-000000000002');
select t.check('no longer a coach: the rights no longer work', (select count(*) from payments where id = 'fb700000-0000-0000-0000-000000000003') = 0);
rollback;
