-- 0067 Duplicate accounts: admins delete an account without history; the club is told when a duplicate is created.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fe000000-0000-0000-0000-000000000001', 'dp-admin@example.test', '{"first_name":"Dp","last_name":"Admin"}'),
 ('fe000000-0000-0000-0000-000000000002', 'dp-real@example.test', '{"first_name":"Ama","last_name":"Real"}'),
 ('fe000000-0000-0000-0000-000000000004', 'dp-player@example.test', '{"first_name":"Dp","last_name":"Player"}'),
 ('fe000000-0000-0000-0000-000000000005', 'dp-super@example.test', '{"first_name":"Dp","last_name":"Super"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fe000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active', phone = '+358405550001' where id = 'fe000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id = 'fe000000-0000-0000-0000-000000000004';
update profiles set role = 'super_admin', status = 'active' where id = 'fe000000-0000-0000-0000-000000000005';
insert into seasons (id, name, starts_on, ends_on) values ('fe200000-0000-0000-0000-000000000001', 'Dp season', '2032-01-01', '2032-12-31');
insert into teams (id, name, slug) values ('fe100000-0000-0000-0000-000000000001', 'Dp team', 'dp-team');
insert into team_seasons (id, team_id, season_id) values ('fe300000-0000-0000-0000-000000000001', 'fe100000-0000-0000-0000-000000000001', 'fe200000-0000-0000-0000-000000000001');
delete from players where profile_id = 'fe000000-0000-0000-0000-000000000002';
insert into players (id, profile_id, first_name, last_name) values ('fe500000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000002', 'Ama', 'Real');
insert into team_players (team_season_id, player_id, jersey_number) values ('fe300000-0000-0000-0000-000000000001', 'fe500000-0000-0000-0000-000000000002', 5);

-- the same person signs up again with their phone number (no email): the club gets an email
insert into auth.users (id, phone, raw_user_meta_data) values ('fe000000-0000-0000-0000-000000000003', '358405550001', '{"first_name":"Ama","last_name":"Again"}');
select t.check('a new account sharing a phone queues an email to the club', exists (select 1 from email_outbox where kind = 'duplicate_alert' and ref_id = 'fe000000-0000-0000-0000-000000000003'
  and subject like '%Ama Again%' and body_text like '%+358405550001%' and body_text like '%/admin/members/merge%'));
select t.check('a new account without a shared contact queues none', not exists (select 1 from email_outbox where kind = 'duplicate_alert' and ref_id = 'fe000000-0000-0000-0000-000000000004'));
-- the duplicate got an (empty) player record and a pending reply, like any new player
insert into players (id, profile_id, first_name, last_name) values ('fe500000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000003', 'Ama', 'Again') on conflict (profile_id) do nothing;

select t.login('fe000000-0000-0000-0000-000000000004');
select t.check('a player cannot delete accounts', t.raises($$select delete_account('fe000000-0000-0000-0000-000000000003')$$));
select t.check('…and sees nothing as deletable', not account_deletable('fe000000-0000-0000-0000-000000000003'));

select t.login('fe000000-0000-0000-0000-000000000001');
select t.check('an account with history cannot be deleted (merge it instead)', t.raises($$select delete_account('fe000000-0000-0000-0000-000000000002')$$) and not account_deletable('fe000000-0000-0000-0000-000000000002'));
select t.check('an admin cannot delete their own account', t.raises($$select delete_account('fe000000-0000-0000-0000-000000000001')$$));
select t.check('a club admin cannot delete an administrator', t.raises($$select delete_account('fe000000-0000-0000-0000-000000000005')$$));
select t.check('the empty duplicate is deletable', account_deletable('fe000000-0000-0000-0000-000000000003'));
select t.check('the admin deletes the empty duplicate', not t.raises($$select delete_account('fe000000-0000-0000-0000-000000000003')$$));
reset role;
select t.check('its login, profile and empty player record are gone', not exists (select 1 from auth.users where id = 'fe000000-0000-0000-0000-000000000003')
  and not exists (select 1 from profiles where id = 'fe000000-0000-0000-0000-000000000003') and not exists (select 1 from players where id = 'fe500000-0000-0000-0000-000000000003'));
select t.check('the real account is untouched', exists (select 1 from team_players where player_id = 'fe500000-0000-0000-0000-000000000002'));
select t.check('the deletion is logged with the shared phone', exists (select 1 from account_merges where action = 'delete' and removed_profile_id = 'fe000000-0000-0000-0000-000000000003'
  and shared = '+358405550001' and merged_by = 'fe000000-0000-0000-0000-000000000001' and kept_profile_id is null));
select t.check('a merge is still logged as a merge', (select column_default from information_schema.columns where table_name = 'account_merges' and column_name = 'action') like '%merge%');
select t.login('fe000000-0000-0000-0000-000000000005');
select t.check('a super admin can delete an administrator without history', not t.raises($$select delete_account('fe000000-0000-0000-0000-000000000001')$$));
rollback;
