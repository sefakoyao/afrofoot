-- 0037 Automatic contracts: team objectives, contract settings, template fields. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a7000000-0000-0000-0000-000000000001', 'ac-admin@example.test', '{"first_name":"Ac","last_name":"Admin"}'),
 ('a7000000-0000-0000-0000-000000000002', 'ac-coach@example.test', '{"first_name":"Ac","last_name":"Coach"}'),
 ('a7000000-0000-0000-0000-000000000003', 'ac-player@example.test', '{"first_name":"Ac","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'a7000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'a7000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id = 'a7000000-0000-0000-0000-000000000003';
insert into seasons (id, name, starts_on, ends_on) values ('a7100000-0000-0000-0000-000000000001', 'Ac season', '2027-01-01', '2027-12-31');
insert into teams (id, name, slug) values ('a7200000-0000-0000-0000-000000000001', 'Ac Team', 'ac-team');
insert into team_seasons (id, team_id, season_id) values ('a7300000-0000-0000-0000-000000000001', 'a7200000-0000-0000-0000-000000000001', 'a7100000-0000-0000-0000-000000000001');

select t.check('contract settings exist, private, default "send", 1 year', (select value->>'auto' = 'send' and (value->>'years')::int = 1 and not is_public from site_settings where key = 'contracts'));
select t.check('template: season, fees and amounts are fields now', (select body like '%{{season_objectives}}%' and body like '%{{club_fees}}%' and body like '%{{max_fee_per_year}}%'
  and body like '%{{volunteer_amount}}%' and body not like '%[[%' from contract_templates where is_default));
select t.check('release 0.25.0 present', exists (select 1 from app_releases where version = '0.25.0'));

select t.login('a7000000-0000-0000-0000-000000000001');
select t.check('admin writes the team''s season objectives', t.rows($$update team_seasons set objectives = 'Kolmonen, aim: top three.' where id = 'a7300000-0000-0000-0000-000000000001'$$) = 1);
select t.check('objectives longer than 2000 characters refused', t.raises($$update team_seasons set objectives = repeat('x', 2001) where id = 'a7300000-0000-0000-0000-000000000001'$$));
select t.check('admin reads and changes the contract settings', t.rows($$update site_settings set value = value || '{"club_fees":"Playing licence, EUR 60"}' where key = 'contracts'$$) = 1);

select t.login('a7000000-0000-0000-0000-000000000002');
select t.check('coaches cannot read the contract settings', (select count(*) from site_settings where key = 'contracts') = 0);
select t.check('coaches cannot change a team''s objectives', t.rows($$update team_seasons set objectives = 'x' where id = 'a7300000-0000-0000-0000-000000000001'$$) = 0);
select t.login('a7000000-0000-0000-0000-000000000003');
select t.check('players cannot read the contract settings', (select count(*) from site_settings where key = 'contracts') = 0);
select t.anon();
select t.check('visitors cannot read the contract settings', (select count(*) from site_settings where key = 'contracts') = 0);
rollback;
