-- 0047 Game details: stored by the sync (admins), public through views only, opted-out club players without a name.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f8000000-0000-0000-0000-000000000001', 'md-admin@example.test', '{"first_name":"Md","last_name":"Admin"}'),
 ('f8000000-0000-0000-0000-000000000002', 'md-coach@example.test', '{"first_name":"Md","last_name":"Coach"}'),
 ('f8000000-0000-0000-0000-000000000003', 'md-player@example.test', '{"first_name":"Md","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f8000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'f8000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id = 'f8000000-0000-0000-0000-000000000003';
insert into players (id, profile_id, first_name, last_name, status) values ('f8500000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000003', 'Md', 'Player', 'active');
update federation_teams set is_club = false;
insert into federation_teams (external_id, name, is_club) values ('8800001', 'Md Club', true), ('8800002', 'Md Rivals', false) on conflict (external_id) do update set is_club = excluded.is_club;
insert into federation_competitions (external_id, name, season, kind) values ('md26/M4/4', 'Md league', 2026, 'league'), ('mdhid/X/1', 'Md hidden', 2026, 'league');
update federation_competitions set show_publicly = false where external_id = 'mdhid/X/1';
insert into federation_players (external_id, team_external_id, display_name, player_id) values ('88901', '8800001', 'Md Player', 'f8500000-0000-0000-0000-000000000003'), ('88902', '8800001', 'Md Hidden', null);
update federation_players set hidden = true where external_id = '88902';
insert into federation_matches (external_id, competition_external_id, home_external_id, away_external_id, home_name, away_name, status, home_goals, away_goals, kickoff_at) values
 ('88001', 'md26/M4/4', '8800001', '8800002', 'Md Club', 'Md Rivals', 'played', 3, 1, now() - interval '2 days'),
 ('88002', 'mdhid/X/1', '8800001', '8800002', 'Md Club', 'Md Rivals', 'played', 1, 0, now() - interval '9 days');

select t.admin(); -- what the sync does (service role or an admin)
update federation_matches set ht_home = 1, ht_away = 1, attendance = 45, details_synced_at = now() where external_id = '88001';
insert into federation_match_events (match_external_id, seq, kind, minute, team_external_id, player_external_id, player_name, score_home, score_away) values
 ('88001', 1, 'goal', 12, '8800002', '77001', 'Md Away Scorer', 0, 1),
 ('88001', 2, 'goal', 40, '8800001', '88901', 'Md Player', 1, 1),
 ('88001', 3, 'yellow', 55, '8800001', '88902', 'Md Hidden', null, null),
 ('88001', 4, 'goal', 77, '8800001', '88902', 'Md Hidden', 2, 1),
 ('88002', 1, 'goal', 10, '8800001', '88901', 'Md Player', 1, 0);

select t.anon();
select t.check('public: the game with half-time score, attendance and details flag', (select ht_home = 1 and ht_away = 1 and attendance = 45 and has_details from public_league_fixtures where external_id = '88001'));
select t.check('public: goals and cards in order with side and club flag', (select string_agg(seq || ':' || kind || ':' || side || ':' || is_club, ',' order by seq) from public_league_match_events where match_external_id = '88001') = '1:goal:away:false,2:goal:home:true,3:yellow:home:true,4:goal:home:true');
select t.check('public: other teams'' scorers named, club players named', (select player_name from public_league_match_events where match_external_id = '88001' and seq = 1) = 'Md Away Scorer' and (select player_name from public_league_match_events where match_external_id = '88001' and seq = 2) = 'Md Player');
select t.check('public: a club player hidden by the club has no name', (select bool_and(player_name is null) from public_league_match_events where match_external_id = '88001' and seq in (3, 4)));
select t.check('public: games of hidden competitions are not shown', not exists (select 1 from public_league_match_events where match_external_id = '88002'));
select t.check('public: no player ids in the view', not exists (select 1 from information_schema.columns where table_name = 'public_league_match_events' and column_name in ('player_external_id', 'team_external_id', 'id')));
select t.check('anon cannot read or write the table itself', t.raises($$select 1 from federation_match_events$$) and t.raises($$insert into federation_match_events (match_external_id, seq, kind, team_external_id) values ('88001', 9, 'goal', '8800001')$$));
select t.login('f8000000-0000-0000-0000-000000000003');
update players set website_hidden = true where id = 'f8500000-0000-0000-0000-000000000003';
select t.anon();
select t.check('public: a club player who removed themselves has no name', (select player_name is null from public_league_match_events where match_external_id = '88001' and seq = 2));
select t.login('f8000000-0000-0000-0000-000000000003');
select t.check('a player cannot read the table', (select count(*) from federation_match_events) = 0 and t.rows($$update federation_match_events set player_name = 'X'$$) = 0);
select t.login('f8000000-0000-0000-0000-000000000002');
select t.check('a coach reads it but cannot change it', (select count(*) from federation_match_events where match_external_id = '88001') = 4 and t.rows($$update federation_match_events set player_name = 'X'$$) = 0);
select t.login('f8000000-0000-0000-0000-000000000001');
select t.check('an admin writes it; kinds and minutes are checked', t.rows($$update federation_match_events set minute = 13 where match_external_id = '88001' and seq = 1$$) = 1
  and t.raises($$insert into federation_match_events (match_external_id, seq, kind, team_external_id) values ('88001', 9, 'penalty', '8800001')$$)
  and t.raises($$insert into federation_match_events (match_external_id, seq, kind, minute, team_external_id) values ('88001', 9, 'goal', 300, '8800001')$$));
select t.admin();
delete from federation_matches where external_id = '88001';
select t.check('deleting a game deletes its events', not exists (select 1 from federation_match_events where match_external_id = '88001'));
select t.check('release 0.35.0 present', exists (select 1 from app_releases where version = '0.35.0'));
rollback;
