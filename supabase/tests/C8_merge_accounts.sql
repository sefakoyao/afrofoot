-- 0065 Merge accounts: admins merge two accounts of one person (sharing an email or phone); everything moves to the kept one.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f8000000-0000-0000-0000-000000000001', 'mg-admin@example.test', '{"first_name":"Mg","last_name":"Admin"}'),
 ('f8000000-0000-0000-0000-000000000002', 'mg-keep@example.test', '{"first_name":"Kofi","last_name":"Keep"}'),
 ('f8000000-0000-0000-0000-000000000003', 'mg-dupe@example.test', '{"first_name":"Kofi","last_name":"Dupe"}'),
 ('f8000000-0000-0000-0000-000000000004', 'mg-other@example.test', '{"first_name":"Other","last_name":"Person"}'),
 ('f8000000-0000-0000-0000-000000000005', 'mg-super@example.test', '{"first_name":"Mg","last_name":"Super"}'),
 ('f8000000-0000-0000-0000-000000000006', 'mg-admin2@example.test', '{"first_name":"Mg","last_name":"Admin2"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f8000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'pending', phone = '+358401234567' where id = 'f8000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active', phone = '+358 40 123 4567' where id = 'f8000000-0000-0000-0000-000000000003';
update profiles set role = 'player', status = 'active' where id = 'f8000000-0000-0000-0000-000000000004';
update profiles set role = 'super_admin', status = 'active', phone = '+358409999999' where id = 'f8000000-0000-0000-0000-000000000005';
update profiles set role = 'club_admin', status = 'active', phone = '+358409999999' where id = 'f8000000-0000-0000-0000-000000000006';

insert into seasons (id, name, starts_on, ends_on) values ('f8200000-0000-0000-0000-000000000001', 'Mg season', '2031-01-01', '2031-12-31');
insert into teams (id, name, slug) values ('f8100000-0000-0000-0000-000000000001', 'Mg A', 'mg-a'), ('f8100000-0000-0000-0000-000000000002', 'Mg B', 'mg-b');
insert into team_seasons (id, team_id, season_id) values
 ('f8300000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'f8200000-0000-0000-0000-000000000001'),
 ('f8300000-0000-0000-0000-000000000002', 'f8100000-0000-0000-0000-000000000002', 'f8200000-0000-0000-0000-000000000001');
delete from players where profile_id in ('f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name, date_of_birth) values
 ('f8500000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000002', 'Kofi', 'Keep', null),
 ('f8500000-0000-0000-0000-000000000003', 'f8000000-0000-0000-0000-000000000003', 'Kofi', 'Dupe', '2000-05-05');
insert into player_private (player_id, phone) values ('f8500000-0000-0000-0000-000000000002', '+358401234567');
insert into player_private (player_id, phone, address, emergency_name) values ('f8500000-0000-0000-0000-000000000003', '+358401234567', 'Kenttätie 1', 'Ama');
insert into team_players (team_season_id, player_id, jersey_number) values
 ('f8300000-0000-0000-0000-000000000001', 'f8500000-0000-0000-0000-000000000002', 7),
 ('f8300000-0000-0000-0000-000000000001', 'f8500000-0000-0000-0000-000000000003', 17),
 ('f8300000-0000-0000-0000-000000000002', 'f8500000-0000-0000-0000-000000000003', 9);
insert into matches (id, team_season_id, opponent, kickoff_at, event_type) values
 ('f8600000-0000-0000-0000-000000000001', 'f8300000-0000-0000-0000-000000000001', 'Mg FC', '2031-03-01 18:00+02', 'friendly'),
 ('f8600000-0000-0000-0000-000000000002', 'f8300000-0000-0000-0000-000000000002', 'Mg United', '2031-03-08 18:00+02', 'friendly');
insert into match_availability (match_id, player_id, availability) values
 ('f8600000-0000-0000-0000-000000000001', 'f8500000-0000-0000-0000-000000000002', 'yes'),
 ('f8600000-0000-0000-0000-000000000001', 'f8500000-0000-0000-0000-000000000003', 'no'),
 ('f8600000-0000-0000-0000-000000000002', 'f8500000-0000-0000-0000-000000000003', 'yes')
 on conflict (match_id, player_id) do update set availability = excluded.availability;
insert into membership_plans (id, name, amount_cents) values ('f8700000-0000-0000-0000-000000000001', 'Mg plan', 10000);
insert into memberships (id, player_id, plan_id, season_id, status) values
 ('f8710000-0000-0000-0000-000000000002', 'f8500000-0000-0000-0000-000000000002', 'f8700000-0000-0000-0000-000000000001', 'f8200000-0000-0000-0000-000000000001', 'active'),
 ('f8710000-0000-0000-0000-000000000003', 'f8500000-0000-0000-0000-000000000003', 'f8700000-0000-0000-0000-000000000001', 'f8200000-0000-0000-0000-000000000001', 'active');
insert into payments (id, player_id, membership_id, amount_cents) values ('f8720000-0000-0000-0000-000000000003', 'f8500000-0000-0000-0000-000000000003', 'f8710000-0000-0000-0000-000000000003', 5000);
insert into conduct_consents (version_id, profile_id) select id, 'f8000000-0000-0000-0000-000000000003' from conduct_versions where is_current;
insert into notifications (user_id, title) values ('f8000000-0000-0000-0000-000000000003', 'Hello');

select t.login('f8000000-0000-0000-0000-000000000004');
select t.check('a player sees no duplicates', (select count(*) from duplicate_accounts()) = 0);
select t.check('a player cannot merge accounts', t.raises($$select merge_accounts('f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003')$$));

select t.login('f8000000-0000-0000-0000-000000000001');
select t.check('an admin sees the pair sharing a phone (spaces ignored)', exists (select 1 from duplicate_accounts() where a = 'f8000000-0000-0000-0000-000000000002' and b = 'f8000000-0000-0000-0000-000000000003' and shared = '+358401234567'));
select t.check('two accounts without a shared email or phone are refused', t.raises($$select merge_accounts('f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000004')$$));
select t.check('the same account twice is refused', t.raises($$select merge_accounts('f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000002')$$));
select t.check('an admin cannot merge away their own account', t.raises($$select merge_accounts('f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000001')$$));
select t.check('a club admin cannot merge administrators'' accounts', t.raises($$select merge_accounts('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000006')$$));
select t.check('the merge log cannot be written directly', t.raises($$insert into account_merges (removed_profile_id, removed_name, shared) values (gen_random_uuid(), 'x', 'x')$$));

select t.check('the admin merges the duplicate into the kept account', (merge_accounts('f8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000003') ->> 'shared') = '+358401234567');
reset role;
select t.check('the removed login and profile are gone', not exists (select 1 from auth.users where id = 'f8000000-0000-0000-0000-000000000003') and not exists (select 1 from profiles where id = 'f8000000-0000-0000-0000-000000000003'));
select t.check('the duplicate player record is gone', not exists (select 1 from players where id = 'f8500000-0000-0000-0000-000000000003'));
select t.check('teams: the kept player is in both, once each, keeping their own number', (select count(*) from team_players where player_id = 'f8500000-0000-0000-0000-000000000002') = 2
  and (select jersey_number from team_players where player_id = 'f8500000-0000-0000-0000-000000000002' and team_season_id = 'f8300000-0000-0000-0000-000000000001') = 7);
select t.check('a game both replied to keeps the kept account''s reply', (select availability::text from match_availability where match_id = 'f8600000-0000-0000-0000-000000000001' and player_id = 'f8500000-0000-0000-0000-000000000002') = 'yes'
  and (select count(*) from match_availability where match_id = 'f8600000-0000-0000-0000-000000000001') = 1);
select t.check('the other game''s reply moved', exists (select 1 from match_availability where match_id = 'f8600000-0000-0000-0000-000000000002' and player_id = 'f8500000-0000-0000-0000-000000000002'));
select t.check('invoices moved, onto the kept season membership', (select player_id = 'f8500000-0000-0000-0000-000000000002' and membership_id = 'f8710000-0000-0000-0000-000000000002' from payments where id = 'f8720000-0000-0000-0000-000000000003')
  and (select count(*) from memberships where season_id = 'f8200000-0000-0000-0000-000000000001') = 1);
select t.check('empty details filled from the duplicate (address, emergency contact, birth date)', (select address = 'Kenttätie 1' and emergency_name = 'Ama' from player_private where player_id = 'f8500000-0000-0000-0000-000000000002')
  and (select date_of_birth = '2000-05-05' from players where id = 'f8500000-0000-0000-0000-000000000002'));
select t.check('consents and notifications moved', exists (select 1 from conduct_consents where profile_id = 'f8000000-0000-0000-0000-000000000002') and exists (select 1 from notifications where user_id = 'f8000000-0000-0000-0000-000000000002' and title = 'Hello'));
select t.check('the kept account becomes active (the duplicate was)', (select status::text from profiles where id = 'f8000000-0000-0000-0000-000000000002') = 'active');
select t.check('the merge is logged, by whom and what moved', exists (select 1 from account_merges where kept_profile_id = 'f8000000-0000-0000-0000-000000000002' and removed_email = 'mg-dupe@example.test'
  and merged_by = 'f8000000-0000-0000-0000-000000000001' and (moved ->> 'team_players')::int = 1 and (moved ->> 'payments')::int = 1));
select t.check('…and in the audit trail', exists (select 1 from audit_log where table_name = 'account_merges' and action = 'INSERT'));

select t.login('f8000000-0000-0000-0000-000000000004');
select t.check('a player cannot read the merge log', (select count(*) from account_merges) = 0);
select t.login('f8000000-0000-0000-0000-000000000005');
select t.check('a super admin merges two administrator accounts', (merge_accounts('f8000000-0000-0000-0000-000000000005', 'f8000000-0000-0000-0000-000000000006') ->> 'shared') = '+358409999999');
rollback;
