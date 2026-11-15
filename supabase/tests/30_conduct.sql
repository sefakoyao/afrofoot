-- 0028 Code of Conduct: consent rules and RLS. Run by run_tests.sh after 10_rls.sql (uses its t.* helpers).
begin;
-- ---------- fixtures ----------
insert into auth.users (id, email, raw_user_meta_data) values
 ('80000000-0000-0000-0000-000000000001', 'coc-admin@example.test', '{"first_name":"Coc","last_name":"Admin"}'),
 ('80000000-0000-0000-0000-000000000002', 'coc-coach@example.test', '{"first_name":"Coc","last_name":"Coach"}'),
 ('80000000-0000-0000-0000-000000000003', 'coc-player@example.test', '{"first_name":"Coc","last_name":"Player"}'),
 ('80000000-0000-0000-0000-000000000004', 'coc-other@example.test', '{"first_name":"Other","last_name":"Team"}'),
 ('80000000-0000-0000-0000-000000000005', 'coc-pending@example.test', '{"first_name":"Pen","last_name":"Ding"}');
update profiles set role = 'club_admin', status = 'active' where id = '80000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = '80000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('80000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000004');
update profiles set role = 'player', status = 'pending' where id = '80000000-0000-0000-0000-000000000005';
insert into seasons (id, name, starts_on, ends_on) values ('81000000-0000-0000-0000-000000000001', 'CoC season', '2026-01-01', '2026-12-31');
insert into teams (id, name, slug) values ('82000000-0000-0000-0000-000000000001', 'CoC A', 'coc-a'), ('82000000-0000-0000-0000-000000000002', 'CoC B', 'coc-b');
insert into team_seasons (id, team_id, season_id) values ('83000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001'),
 ('83000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001');
insert into players (id, profile_id, first_name, last_name) values
 ('84000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000003', 'Coc', 'Player'),
 ('84000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000004', 'Other', 'Team');
insert into team_players (team_season_id, player_id) values ('83000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000003'),
 ('83000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000004');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('85000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'Coc', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('83000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000002');
create temp table coc (k text primary key, v uuid);
insert into coc select 'current', id from conduct_versions where is_current;
grant select on coc to authenticated, anon;

-- ---------- the published version ----------
select t.check('current version 2027 published with the playbook and the agreement line', (select version = '2027' and body like '%members'' playbook%' and body like '%I hereby agree to these terms.' and pdf_path like '/documents/%.pdf' from conduct_versions where is_current));
select t.check('only one current version', t.raises($$insert into conduct_versions (version, title, body, is_current) values ('x', 'Second', 'long enough body', true)$$));
select t.check('pdf path must be a local document', t.raises($$insert into conduct_versions (version, title, body, pdf_path) values ('y', 'Bad path', 'long enough body', 'https://evil.example/x.pdf')$$));

-- ---------- player ----------
select t.login('80000000-0000-0000-0000-000000000003');
select t.check('player reads the current version', (select count(*) from conduct_versions where is_current) = 1);
select t.check('player agrees to the current version', not t.raises($$insert into conduct_consents (version_id, profile_id) select v, auth.uid() from coc where k = 'current'$$));
select t.check('agreeing twice is refused (unique)', t.raises($$insert into conduct_consents (version_id, profile_id) select v, auth.uid() from coc where k = 'current'$$));
select t.check('player cannot agree for someone else', t.raises($$insert into conduct_consents (version_id, profile_id) select v, '80000000-0000-0000-0000-000000000004' from coc where k = 'current'$$));
select t.check('player cannot change or withdraw a consent', t.raises($$update conduct_consents set consented_at = now() - interval '1 year'$$) and t.raises($$delete from conduct_consents$$));
select t.check('player cannot publish a version', t.raises($$insert into conduct_versions (version, title, body) values ('z', 'Mine', 'long enough body')$$));
select t.admin();
select t.login('80000000-0000-0000-0000-000000000004');
select t.check('another player sees only their own consents (none)', (select count(*) from conduct_consents) = 0);
select t.admin();
select t.login('80000000-0000-0000-0000-000000000005');
select t.check('pending account cannot agree', t.raises($$insert into conduct_consents (version_id, profile_id) select v, auth.uid() from coc where k = 'current'$$));
select t.admin();
select t.anon();
select t.check('anonymous: no access to versions or consents', t.raises($$select count(*) from conduct_consents$$) and t.raises($$select count(*) from conduct_versions$$));
select t.admin();

-- ---------- coach and admin ----------
select t.login('80000000-0000-0000-0000-000000000002');
select t.check('coach sees consents of own team players only', (select count(*) from conduct_consents) = 1
  and (select profile_id from conduct_consents) = '80000000-0000-0000-0000-000000000003');
select t.admin();
select t.login('80000000-0000-0000-0000-000000000001');
select t.check('admin reads all consents', (select count(*) from conduct_consents where profile_id::text like '80000000%') = 1);
select t.check('admin cannot agree on behalf of a player', t.raises($$insert into conduct_consents (version_id, profile_id) select v, '80000000-0000-0000-0000-000000000004' from coc where k = 'current'$$));
-- a new version: everyone has to agree again
update conduct_versions set is_current = false where is_current;
insert into conduct_versions (version, title, body, is_current) values ('2028', 'Code of Ethics', 'New rules for 2028, long enough.', true);
select t.check('admin publishes a new current version', (select version from conduct_versions where is_current) = '2028');
select t.admin();
select t.login('80000000-0000-0000-0000-000000000003');
select t.check('consent to the old version cannot be added any more', t.raises($$insert into conduct_consents (version_id, profile_id) select v, auth.uid() from coc where k = 'current'$$));
select t.check('player agrees to the new version', not t.raises($$insert into conduct_consents (version_id, profile_id) select id, auth.uid() from conduct_versions where is_current$$));
select t.admin();
select t.check('audit trail records consents and versions', (select count(*) from audit_log where table_name = 'conduct_consents') >= 2 and (select count(*) from audit_log where table_name = 'conduct_versions') >= 2);
select t.check('release 0.17.0 present', exists (select 1 from app_releases where version = '0.17.0'));
rollback;
