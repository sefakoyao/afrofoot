-- 0039 Saved places: coaches edit every place, only admins hide/show, places in use cannot be deleted. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f1000000-0000-0000-0000-000000000001', 'pl-admin@example.test', '{"first_name":"Pl","last_name":"Admin"}'),
 ('f1000000-0000-0000-0000-000000000002', 'pl-coach@example.test', '{"first_name":"Pl","last_name":"Coach"}'),
 ('f1000000-0000-0000-0000-000000000003', 'pl-coach2@example.test', '{"first_name":"Pl","last_name":"Coach2"}'),
 ('f1000000-0000-0000-0000-000000000004', 'pl-player@example.test', '{"first_name":"Pl","last_name":"Player"}'),
 ('f1000000-0000-0000-0000-000000000005', 'pl-gone@example.test', '{"first_name":"Pl","last_name":"Gone"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f1000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id in ('f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000005');
update profiles set role = 'coach', status = 'suspended' where id = 'f1000000-0000-0000-0000-000000000003';
update profiles set role = 'player', status = 'active' where id = 'f1000000-0000-0000-0000-000000000004';
insert into seasons (id, name, starts_on, ends_on) values ('f2000000-0000-0000-0000-000000000001', 'Pl season', '2026-01-01', '2028-12-31');
insert into teams (id, name, slug) values ('f3000000-0000-0000-0000-000000000001', 'Pl Team', 'pl-team');
insert into team_seasons (id, team_id, season_id) values ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001');
insert into locations (id, name, city, created_by) values
 ('f7000000-0000-0000-0000-000000000001', 'Pl Admin Pitch', 'Helsinki', 'f1000000-0000-0000-0000-000000000001'),
 ('f7000000-0000-0000-0000-000000000002', 'Pl Used Hall', 'Espoo', 'f1000000-0000-0000-0000-000000000001'),
 ('f7000000-0000-0000-0000-000000000003', 'Pl Spare Field', 'Vantaa', 'f1000000-0000-0000-0000-000000000001'),
 ('f7000000-0000-0000-0000-000000000004', 'Pl Gone Coach Gym', 'Helsinki', 'f1000000-0000-0000-0000-000000000005');
insert into training_sessions (team_season_id, title, starts_at, ends_at, location_id)
  values ('f4000000-0000-0000-0000-000000000001', 'Pl training', now() + interval '2 days', now() + interval '2 days 1 hour', 'f7000000-0000-0000-0000-000000000002');

-- ---------- coach ----------
select t.login('f1000000-0000-0000-0000-000000000002');
select t.check('coach adds a place', not t.raises($$insert into locations (id, name, kind, address, city, created_by)
  values ('f7000000-0000-0000-0000-000000000010', 'Pl Coach Hall', 'hall', 'Hallitie 2', 'Helsinki', 'f1000000-0000-0000-0000-000000000002')$$));
select t.check('coach edits a place an admin added', t.rows($$update locations set address = 'Kenttätie 9', directions = 'Gate B, then left', transit = 'Bus 55', parking = 'Free', postal_code = '00100', kind = 'pitch'
  where id = 'f7000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('the change is saved', (select address from locations where id = 'f7000000-0000-0000-0000-000000000001') = 'Kenttätie 9');
select t.check('coach cannot hide a place', t.raises($$update locations set active = false where id = 'f7000000-0000-0000-0000-000000000001'$$));
select t.check('coach cannot change who added a place', t.raises($$update locations set created_by = 'f1000000-0000-0000-0000-000000000002' where id = 'f7000000-0000-0000-0000-000000000001'$$));
select t.check('coach cannot delete a place', t.rows($$delete from locations where id = 'f7000000-0000-0000-0000-000000000003'$$) = 0
  and exists (select 1 from locations where id = 'f7000000-0000-0000-0000-000000000003'));
select t.check('name of 1 character refused', t.raises($$update locations set name = 'X' where id = 'f7000000-0000-0000-0000-000000000010'$$));
select t.check('name over 120 characters refused', t.raises($$update locations set name = repeat('x', 121) where id = 'f7000000-0000-0000-0000-000000000010'$$));
select t.check('address over 200 characters refused', t.raises($$update locations set address = repeat('x', 201) where id = 'f7000000-0000-0000-0000-000000000010'$$));
select t.check('city over 80 characters refused', t.raises($$update locations set city = repeat('x', 81) where id = 'f7000000-0000-0000-0000-000000000010'$$));
select t.check('notes over 500 characters refused', t.raises($$update locations set notes = repeat('x', 501) where id = 'f7000000-0000-0000-0000-000000000010'$$));
select t.check('map link must start with https://', t.raises($$update locations set maps_url = 'http://maps.example' where id = 'f7000000-0000-0000-0000-000000000010'$$));
select t.check('same name and city twice refused', t.raises($$insert into locations (name, city, created_by) values ('pl coach hall', 'HELSINKI', 'f1000000-0000-0000-0000-000000000002')$$));

-- ---------- suspended coach, player ----------
select t.login('f1000000-0000-0000-0000-000000000003');
select t.check('suspended coach cannot edit places', t.rows($$update locations set notes = 'x' where id = 'f7000000-0000-0000-0000-000000000001'$$) = 0);
select t.login('f1000000-0000-0000-0000-000000000004');
select t.check('player cannot add a place', t.raises($$insert into locations (name, city, created_by) values ('Pl Player Place', 'Helsinki', 'f1000000-0000-0000-0000-000000000004')$$));
select t.check('player cannot edit a place', t.rows($$update locations set notes = 'x' where id = 'f7000000-0000-0000-0000-000000000001'$$) = 0);
select t.check('player still sees the places', (select count(*) from locations where id::text like 'f7000000%') = 5);

-- ---------- admin ----------
select t.login('f1000000-0000-0000-0000-000000000001');
select t.check('admin hides a place', t.rows($$update locations set active = false where id = 'f7000000-0000-0000-0000-000000000003'$$) = 1);
select t.check('admin shows it again', t.rows($$update locations set active = true where id = 'f7000000-0000-0000-0000-000000000003'$$) = 1);
select t.check('admin edits a coach''s place', t.rows($$update locations set notes = 'Key from the caretaker' where id = 'f7000000-0000-0000-0000-000000000010'$$) = 1);
select t.check('admin cannot delete a place a training uses', t.raises($$delete from locations where id = 'f7000000-0000-0000-0000-000000000002'$$)
  and exists (select 1 from locations where id = 'f7000000-0000-0000-0000-000000000002'));
select t.check('the training keeps its place', (select location_id from training_sessions where title = 'Pl training') = 'f7000000-0000-0000-0000-000000000002');
select t.check('admin deletes an unused place', t.rows($$delete from locations where id = 'f7000000-0000-0000-0000-000000000003'$$) = 1);

-- ---------- database itself ----------
select t.admin();
select t.check('the account that added a place can be deleted', not t.raises($$delete from auth.users where id = 'f1000000-0000-0000-0000-000000000005'$$));
select t.check('its place stays, with nobody as the one who added it', (select created_by from locations where id = 'f7000000-0000-0000-0000-000000000004') is null);
select t.check('changes are in the audit trail', exists (select 1 from audit_log where table_name = 'locations' and record_id = 'f7000000-0000-0000-0000-000000000001'));
select t.check('release 0.27.0 present', exists (select 1 from app_releases where version = '0.27.0'));
rollback;
