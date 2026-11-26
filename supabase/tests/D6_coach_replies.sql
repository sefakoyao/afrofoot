-- 0072 Coaches sign in and out of their teams' events (coach_replies).
begin;
create or replace function t.service() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fd100000-0000-0000-0000-000000000001', 'cr-admin@example.test', '{"first_name":"Cr","last_name":"Admin"}'),
 ('fd100000-0000-0000-0000-000000000002', 'cr-coach@example.test', '{"first_name":"Lamie","last_name":"Kabba"}'),
 ('fd100000-0000-0000-0000-000000000003', 'cr-other@example.test', '{"first_name":"Cr","last_name":"Other"}'),
 ('fd100000-0000-0000-0000-000000000004', 'cr-player@example.test', '{"first_name":"Cr","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fd100000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id in ('fd100000-0000-0000-0000-000000000002', 'fd100000-0000-0000-0000-000000000003');
update profiles set role = 'player', status = 'active' where id = 'fd100000-0000-0000-0000-000000000004';
insert into seasons (id, name, starts_on, ends_on) values ('fd200000-0000-0000-0000-000000000001', 'Cr season', current_date - 30, current_date + 300);
insert into teams (id, name, slug) values ('fd300000-0000-0000-0000-000000000001', 'Cr A', 'cr-a'), ('fd300000-0000-0000-0000-000000000002', 'Cr B', 'cr-b');
insert into team_seasons (id, team_id, season_id) values ('fd400000-0000-0000-0000-000000000001', 'fd300000-0000-0000-0000-000000000001', 'fd200000-0000-0000-0000-000000000001'),
 ('fd400000-0000-0000-0000-000000000002', 'fd300000-0000-0000-0000-000000000002', 'fd200000-0000-0000-0000-000000000001');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('fd600000-0000-0000-0000-000000000002', 'fd100000-0000-0000-0000-000000000002', 'Lamie', 'Kabba', 'head_coach'),
 ('fd600000-0000-0000-0000-000000000003', 'fd100000-0000-0000-0000-000000000003', 'Cr', 'Other', 'assistant_coach');
insert into team_staff (team_season_id, staff_id) values ('fd400000-0000-0000-0000-000000000001', 'fd600000-0000-0000-0000-000000000002'), ('fd400000-0000-0000-0000-000000000002', 'fd600000-0000-0000-0000-000000000003');
insert into training_sessions (id, team_season_id, title, starts_at, ends_at) values
 ('fd700000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001', 'Cr training', now() + interval '2 days', now() + interval '2 days 90 minutes'),
 ('fd700000-0000-0000-0000-000000000002', 'fd400000-0000-0000-0000-000000000001', 'Cr past', now() - interval '2 days', now() - interval '2 days' + interval '90 minutes'),
 ('fd700000-0000-0000-0000-000000000003', 'fd400000-0000-0000-0000-000000000002', 'Cr B training', now() + interval '2 days', now() + interval '2 days 90 minutes');
insert into matches (id, team_season_id, opponent, kickoff_at, event_type) values ('fd800000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001', 'Cr Rovers', now() + interval '5 days', 'friendly');
insert into club_events (id, team_season_id, kind, title, starts_at, ends_at) values ('fd900000-0000-0000-0000-000000000001', 'fd400000-0000-0000-0000-000000000001', 'meeting', 'Cr meeting', now() + interval '3 days', now() + interval '3 days 1 hour');

-- the coach answers for their own team
select t.login('fd100000-0000-0000-0000-000000000002');
select t.check('a coach signs in for their team''s training', t.rows($$insert into coach_replies (event_kind, event_id, availability) values ('practice', 'fd700000-0000-0000-0000-000000000001', 'yes')$$) = 1);
select t.check('…the answer is theirs, with the database time', (select profile_id = auth.uid() and responded_at is not null from coach_replies where event_id = 'fd700000-0000-0000-0000-000000000001'));
select t.check('…and for a game', t.rows($$insert into coach_replies (event_kind, event_id, availability, note) values ('match', 'fd800000-0000-0000-0000-000000000001', 'maybe', 'Maybe late')$$) = 1);
select t.check('…and for a team event', t.rows($$insert into coach_replies (event_kind, event_id, availability) values ('event', 'fd900000-0000-0000-0000-000000000001', 'no')$$) = 1);
select t.check('changing the answer (sign out)', t.rows($$update coach_replies set availability = 'no' where event_id = 'fd700000-0000-0000-0000-000000000001'$$) = 1);
select t.check('only one answer per event and coach', t.raises($$insert into coach_replies (event_kind, event_id, availability) values ('practice', 'fd700000-0000-0000-0000-000000000001', 'yes')$$));
select t.check('not for another team''s training', t.raises($$insert into coach_replies (event_kind, event_id, availability) values ('practice', 'fd700000-0000-0000-0000-000000000003', 'yes')$$));
select t.check('not for an event that has started', t.raises($$insert into coach_replies (event_kind, event_id, availability) values ('practice', 'fd700000-0000-0000-0000-000000000002', 'yes')$$));
select t.check('not in someone else''s name', t.raises($$insert into coach_replies (event_kind, event_id, profile_id, availability) values ('match', 'fd800000-0000-0000-0000-000000000001', 'fd100000-0000-0000-0000-000000000003', 'yes')$$));
select t.check('only known answers', t.raises($$update coach_replies set availability = 'perhaps' where event_id = 'fd800000-0000-0000-0000-000000000001'$$));
select t.check('a note of at most 300 characters', t.raises($$update coach_replies set note = repeat('a', 301) where event_id = 'fd800000-0000-0000-0000-000000000001'$$));

-- cancelled: closed
select t.service();
update training_sessions set status = 'cancelled' where id = 'fd700000-0000-0000-0000-000000000001';
select t.login('fd100000-0000-0000-0000-000000000002');
select t.check('a cancelled training is closed', t.raises($$update coach_replies set availability = 'yes' where event_id = 'fd700000-0000-0000-0000-000000000001'$$));

-- who reads them
select t.login('fd100000-0000-0000-0000-000000000003');
select t.check('a coach of another team does not see them', (select count(*) from coach_replies where event_id in ('fd800000-0000-0000-0000-000000000001', 'fd900000-0000-0000-0000-000000000001')) = 0);
select t.check('…nor change them', t.rows($$update coach_replies set availability = 'yes' where event_id = 'fd800000-0000-0000-0000-000000000001'$$) = 0);
select t.login('fd100000-0000-0000-0000-000000000004');
select t.check('a player cannot answer as a coach', t.raises($$insert into coach_replies (event_kind, event_id, availability) values ('practice', 'fd700000-0000-0000-0000-000000000001', 'yes')$$));
select t.check('…nor read the coaches'' answers', (select count(*) from coach_replies) = 0);
select t.login('fd100000-0000-0000-0000-000000000001');
select t.check('admins read all answers', (select count(*) from coach_replies where profile_id = 'fd100000-0000-0000-0000-000000000002') = 3);
select t.check('admins may correct an answer after the start', t.rows($$update coach_replies set availability = 'yes' where event_id = 'fd700000-0000-0000-0000-000000000001'$$) = 1);
select t.check('changes are audited', exists (select 1 from audit_log where table_name = 'coach_replies'));
select t.anon();
select t.check('visitors see nothing', t.raises($$select count(*) from coach_replies$$));
rollback;
