-- 0034 Events, training meeting times, members' calendar and the website's public schedule. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('e1000000-0000-0000-0000-000000000001', 'ev-admin@example.test', '{"first_name":"Ev","last_name":"Admin"}'),
 ('e1000000-0000-0000-0000-000000000002', 'ev-coach@example.test', '{"first_name":"Ev","last_name":"Coach"}'),
 ('e1000000-0000-0000-0000-000000000003', 'ev-player@example.test', '{"first_name":"Ev","last_name":"Player"}'),
 ('e1000000-0000-0000-0000-000000000004', 'ev-other@example.test', '{"first_name":"Ev","last_name":"Other"}'),
 ('e1000000-0000-0000-0000-000000000005', 'ev-pending@example.test', '{"first_name":"Ev","last_name":"Pending"}');
update profiles set role = 'club_admin', status = 'active' where id = 'e1000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'e1000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('e1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000004');
update profiles set role = 'player', status = 'pending' where id = 'e1000000-0000-0000-0000-000000000005';
insert into seasons (id, name, starts_on, ends_on) values ('e2000000-0000-0000-0000-000000000001', 'Ev season', '2026-01-01', '2028-12-31');
insert into teams (id, name, slug) values ('e3000000-0000-0000-0000-000000000001', 'Ev Public', 'ev-public'), ('e3000000-0000-0000-0000-000000000002', 'Ev Private', 'ev-private');
insert into team_seasons (id, team_id, season_id, is_public) values
 ('e4000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', true),
 ('e4000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', false);
insert into players (id, profile_id, first_name, last_name) values
 ('e5000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000003', 'Ev', 'Player'),
 ('e5000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000004', 'Ev', 'Other');
insert into team_players (team_season_id, player_id) values ('e4000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000003'),
 ('e4000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000004');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('e6000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'Ev', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('e4000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000002');
insert into locations (id, name, address, city, maps_url) values ('e7000000-0000-0000-0000-000000000001', 'Ev Pitch', 'Kenttätie 1', 'Helsinki', 'https://www.google.com/maps/search/?api=1&query=Ev+Pitch');

-- ---------- coach ----------
select t.login('e1000000-0000-0000-0000-000000000002');
select t.check('coach adds training with meeting time and point', not t.raises($$insert into training_sessions (id, team_season_id, title, starts_at, ends_at, meet_at, meeting_point, location_id)
  values ('e8000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'Ev training', now() + interval '2 days', now() + interval '2 days 90 minutes', now() + interval '2 days' - interval '20 minutes', 'Gate B', 'e7000000-0000-0000-0000-000000000001')$$));
select t.check('training meeting time after the start refused', t.raises($$update training_sessions set meet_at = starts_at + interval '1 minute' where id = 'e8000000-0000-0000-0000-000000000001'$$));
select t.check('training meeting time more than 6 hours before refused', t.raises($$update training_sessions set meet_at = starts_at - interval '7 hours' where id = 'e8000000-0000-0000-0000-000000000001'$$));
select t.check('training meeting point over 120 characters refused', t.raises($$update training_sessions set meeting_point = repeat('x', 121) where id = 'e8000000-0000-0000-0000-000000000001'$$));
select t.check('hidden training (not on the website)', not t.raises($$insert into training_sessions (id, team_season_id, title, starts_at, ends_at, public)
  values ('e8000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-000000000001', 'Ev closed session', now() + interval '3 days', now() + interval '3 days 1 hour', false)$$));
select t.check('coach adds an event for own team', not t.raises($$insert into club_events (id, team_season_id, kind, title, starts_at, ends_at, meet_at, location_id, description)
  values ('e9000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'meeting', 'Ev team meeting', now() + interval '4 days', now() + interval '4 days 1 hour', now() + interval '4 days' - interval '10 minutes', 'e7000000-0000-0000-0000-000000000001', 'Season plan')$$));
select t.check('coach cannot add an event for another team', t.raises($$insert into club_events (team_season_id, title, starts_at, ends_at) values ('e4000000-0000-0000-0000-000000000002', 'Not mine', now() + interval '4 days', now() + interval '4 days 1 hour')$$));
select t.check('coach cannot add a club-wide event', t.raises($$insert into club_events (title, starts_at, ends_at) values ('Club party', now() + interval '4 days', now() + interval '4 days 1 hour')$$));
select t.check('event ending before it starts refused', t.raises($$insert into club_events (team_season_id, title, starts_at, ends_at) values ('e4000000-0000-0000-0000-000000000001', 'Backwards', now() + interval '4 days', now() + interval '3 days')$$));
select t.check('event longer than 14 days refused', t.raises($$insert into club_events (team_season_id, title, starts_at, ends_at) values ('e4000000-0000-0000-0000-000000000001', 'Too long', now() + interval '4 days', now() + interval '20 days')$$));
select t.check('unknown event kind refused', t.raises($$insert into club_events (team_season_id, kind, title, starts_at, ends_at) values ('e4000000-0000-0000-0000-000000000001', 'rave', 'Odd', now() + interval '4 days', now() + interval '4 days 1 hour')$$));
select t.check('one-letter title refused', t.raises($$insert into club_events (team_season_id, title, starts_at, ends_at) values ('e4000000-0000-0000-0000-000000000001', ' x ', now() + interval '4 days', now() + interval '4 days 1 hour')$$));
select t.check('event meeting time after the start refused', t.raises($$update club_events set meet_at = starts_at + interval '5 minutes' where id = 'e9000000-0000-0000-0000-000000000001'$$));
select t.check('unknown event status refused', t.raises($$update club_events set status = 'maybe' where id = 'e9000000-0000-0000-0000-000000000001'$$));
select t.check('coach cancels own event', t.rows($$update club_events set status = 'cancelled' where id = 'e9000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('coach can save a new location', not t.raises($$insert into locations (id, name, city, maps_url, created_by) values ('e7000000-0000-0000-0000-000000000002', 'Ev Hall', 'Espoo', 'https://maps.app.goo.gl/abc', 'e1000000-0000-0000-0000-000000000002')$$));
select t.check('map link must be https', t.raises($$insert into locations (name, city, maps_url, created_by) values ('Ev Bad', 'Espoo', 'http://maps.example', 'e1000000-0000-0000-0000-000000000002')$$));
select t.check('coach calendar lists the team event', (select count(*) from team_schedule where id = 'e9000000-0000-0000-0000-000000000001' and event_type = 'event' and kind = 'meeting') = 1);

-- ---------- admin ----------
select t.login('e1000000-0000-0000-0000-000000000001');
select t.check('admin adds a club-wide event', not t.raises($$insert into club_events (id, kind, title, starts_at, ends_at, location_id) values ('e9000000-0000-0000-0000-000000000002', 'social', 'Ev club party', now() + interval '5 days', now() + interval '5 days 3 hours', 'e7000000-0000-0000-0000-000000000001')$$));
select t.check('admin adds a private event for the private team', not t.raises($$insert into club_events (id, team_season_id, title, starts_at, ends_at) values ('e9000000-0000-0000-0000-000000000003', 'e4000000-0000-0000-0000-000000000002', 'Ev private team dinner', now() + interval '6 days', now() + interval '6 days 2 hours')$$));
select t.check('admin adds a members-only club event', not t.raises($$insert into club_events (id, title, starts_at, ends_at, public) values ('e9000000-0000-0000-0000-000000000004', 'Ev annual meeting', now() + interval '7 days', now() + interval '7 days 2 hours', false)$$));
select t.check('club event changes are audited', (select count(*) from audit_log where table_name = 'club_events') >= 4);

-- ---------- players ----------
select t.login('e1000000-0000-0000-0000-000000000003');
select t.check('player sees own team event and club-wide events, not other teams''', (select count(*) from team_schedule where event_type = 'event' and title like 'Ev %') = 3
  and not exists (select 1 from team_schedule where title = 'Ev private team dinner'));
select t.check('player sees training meeting time and point', (select meeting_point from team_schedule where id = 'e8000000-0000-0000-0000-000000000001') = 'Gate B');
select t.check('player cannot add events', t.raises($$insert into club_events (team_season_id, title, starts_at, ends_at) values ('e4000000-0000-0000-0000-000000000001', 'Player party', now() + interval '4 days', now() + interval '4 days 1 hour')$$));
select t.check('player cannot change events', t.rows($$update club_events set title = 'Changed' where id = 'e9000000-0000-0000-0000-000000000002'$$) = 0);
select t.check('player cannot add locations', t.raises($$insert into locations (name, city) values ('Player spot', 'Vantaa')$$));
select t.login('e1000000-0000-0000-0000-000000000005');
select t.check('pending account sees no club events', (select count(*) from club_events) = 0);

-- ---------- website (anonymous visitor) ----------
select t.anon();
select t.check('visitor cannot read club_events directly', t.raises($$select 1 from club_events$$));
select t.check('website lists public training of a public team with its pitch and map link', (select venue || '|' || maps_url from public_schedule where id = 'e8000000-0000-0000-0000-000000000001') = 'Ev Pitch|https://www.google.com/maps/search/?api=1&query=Ev+Pitch');
select t.check('website hides training marked not public', not exists (select 1 from public_schedule where id = 'e8000000-0000-0000-0000-000000000002'));
select t.check('website lists the club-wide party and the cancelled team meeting (marked cancelled)', (select count(*) from public_schedule where id in ('e9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-000000000002')) = 2
  and (select status from public_schedule where id = 'e9000000-0000-0000-0000-000000000001') = 'cancelled');
select t.check('website hides private teams'' events and members-only events', not exists (select 1 from public_schedule where id in ('e9000000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-000000000004')));
select t.check('website shows no meeting points', not exists (select 1 from information_schema.columns where table_name = 'public_schedule' and column_name in ('meet_at', 'meeting_point', 'created_by')));
select t.admin();
select t.check('release 0.22.0 present', exists (select 1 from app_releases where version = '0.22.0'));
rollback;
