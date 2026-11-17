-- 0040 League tables and results from Palloliitto: public views, club flag, defaults, checks, settings. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values ('fa000000-0000-0000-0000-000000000001', 'fed-player@example.test', '{"first_name":"Fed","last_name":"Player"}');
update profiles set role = 'player', status = 'active' where id = 'fa000000-0000-0000-0000-000000000001';

-- what the sync writes (service role = no RLS here)
insert into federation_competitions (external_id, name, category, season_label, season, kind, group_name) values
 ('etejp26/M4/4', 'Etelä Jalkapallo 2026', 'Miesten Nelonen', '2026', 2026, 'league', '4'),
 ('spljp26/MSC/1', 'SPL Jalkapallo 2026', 'Miesten Suomen Cup', '2026', 2026, 'cup', 'Kierros 1');
insert into federation_competitions (external_id, name, category, season, kind, show_publicly) values ('hidden26/M4/9', 'Hidden league', 'Miesten Nelonen', 2026, 'league', false);
insert into federation_teams (external_id, name, is_club) values ('35118195', 'Afro Foot Club', true), ('1001', 'KoiPS', false), ('1002', 'ToBK', false);
insert into federation_standings (competition_external_id, team_external_id, team_name, position, played, won, drawn, lost, goals_for, goals_against, points) values
 ('etejp26/M4/4', '1001', 'KoiPS', 1, 20, 15, 2, 3, 69, 30, 47),
 ('etejp26/M4/4', '35118195', 'Afro Foot Club', 10, 20, 4, 2, 14, 26, 57, 14),
 ('hidden26/M4/9', '1002', 'ToBK', 1, 1, 1, 0, 0, 1, 0, 3),
 ('spljp26/MSC/1', '1002', 'ToBK', 1, 1, 1, 0, 0, 1, 0, 3);
insert into federation_matches (external_id, competition_external_id, home_external_id, away_external_id, home_name, away_name, kickoff_at, venue, status, home_goals, away_goals, payload) values
 ('m1', 'etejp26/M4/4', '1002', '35118195', 'ToBK', 'Afro Foot Club', '2026-10-01 15:00+00', 'Pallokenttä TN', 'played', 2, 3, '{"referee_1_name":"Someone"}'),
 ('m2', 'spljp26/MSC/1', '35118195', '1001', 'Afro Foot Club', 'KoiPS', '2026-05-01 15:00+00', null, 'played', 1, 2, null),
 ('m3', 'hidden26/M4/9', '1002', '1001', 'ToBK', 'KoiPS', '2026-06-01 15:00+00', null, 'played', 1, 0, null);

select t.check('new competitions are public by default', (select show_publicly from federation_competitions where external_id = 'etejp26/M4/4'));
select t.check('competition kind must be league, cup or friendly', t.raises($$insert into federation_competitions (external_id, name, kind) values ('x', 'X', 'other')$$));
select t.check('season must be a year', t.raises($$insert into federation_competitions (external_id, name, season) values ('y', 'Y', 26)$$));
select t.check('game status must be known', t.raises($$insert into federation_matches (external_id, competition_external_id, home_name, away_name, status) values ('bad', 'etejp26/M4/4', 'A', 'B', 'weird')$$));
select t.check('settings name the club''s Palloliitto team and switch the sync on',
  (select value -> 'team_ids' @> '["35118195"]'::jsonb and (value ->> 'enabled')::boolean from site_settings where key = 'federation'));

-- ---------- visitors ----------
select t.anon();
select t.check('visitors see the public league table', (select count(*) from public_standings where competition_external_id = 'etejp26/M4/4') = 2);
select t.check('the club row is flagged', (select is_club from public_standings where team_name = 'Afro Foot Club') and not (select is_club from public_standings where team_name = 'KoiPS'));
select t.check('hidden competitions are not shown', (select count(*) from public_standings where competition_external_id = 'hidden26/M4/9') = 0
  and (select count(*) from public_league_fixtures where competition_external_id = 'hidden26/M4/9') = 0);
select t.check('cup rows are not a league table', (select count(*) from public_standings where competition_external_id like 'spljp%') = 0);
select t.check('table carries season, category and group', (select season = 2026 and category = 'Miesten Nelonen' and group_name = '4' from public_standings where team_name = 'KoiPS'));
select t.check('visitors see the club''s games, league and cup', (select count(*) from public_league_fixtures where home_is_club or away_is_club) = 2);
select t.check('game shows which side is the club', (select away_is_club and not home_is_club from public_league_fixtures where external_id = 'm1'));
select t.check('views expose no raw answers', not exists (select 1 from information_schema.columns where table_name in ('public_standings', 'public_league_fixtures') and column_name = 'payload'));
select t.check('visitors cannot read the federation tables', t.raises('select * from federation_matches') and t.raises('select * from federation_teams') and t.raises('select * from sync_runs'));

-- ---------- members ----------
select t.login('fa000000-0000-0000-0000-000000000001');
select t.check('a player cannot change league data', t.raises($$insert into federation_standings (competition_external_id, team_external_id, team_name, position) values ('etejp26/M4/4', '9', 'Fake', 1)$$)
  and t.rows($$update federation_teams set is_club = true where external_id = '1001'$$) = 0);
select t.check('a player cannot read sync runs', (select count(*) from sync_runs) = 0);

select t.admin();
select t.check('release 0.28.0 present', exists (select 1 from app_releases where version = '0.28.0'));
rollback;
