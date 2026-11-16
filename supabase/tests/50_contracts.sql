-- 0030 Player contracts: who can read, draft, send, sign, countersign; the text is locked once sent. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a1000000-0000-0000-0000-000000000001', 'ct-admin@example.test', '{"first_name":"Cat","last_name":"Admin"}'),
 ('a1000000-0000-0000-0000-000000000002', 'ct-coach@example.test', '{"first_name":"Cat","last_name":"Coach"}'),
 ('a1000000-0000-0000-0000-000000000003', 'ct-player@example.test', '{"first_name":"Amadou","last_name":"Diallo"}'),
 ('a1000000-0000-0000-0000-000000000004', 'ct-other@example.test', '{"first_name":"Other","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'a1000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'a1000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004');
insert into seasons (id, name, starts_on, ends_on) values ('a2000000-0000-0000-0000-000000000001', 'Ct season', '2027-01-01', '2027-12-31');
insert into teams (id, name, slug) values ('a3000000-0000-0000-0000-000000000001', 'Ct A', 'ct-a');
insert into team_seasons (id, team_id, season_id) values ('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001');
insert into players (id, profile_id, first_name, last_name) values
 ('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'Amadou', 'Diallo'),
 ('a5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000004', 'Other', 'Player');
insert into team_players (team_season_id, player_id) values ('a4000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000003');
insert into staff_members (id, profile_id, first_name, last_name, type) values ('a6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'Cat', 'Coach', 'head_coach');
insert into team_staff (team_season_id, staff_id) values ('a4000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002');

select t.check('default template present with its fields (0037: season and fees are fields, no blanks left)', (select count(*) from contract_templates where is_default and body like '%{{player}}%' and body like '%{{season_objectives}}%') = 1);

-- ---------- admin drafts ----------
select t.login('a1000000-0000-0000-0000-000000000001');
select t.check('admin creates a 2-year draft', not t.raises($$insert into player_contracts (id, player_id, team_season_id, title, years, starts_on, ends_on, body)
  values ('a7000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000001', 'Player contract 2027–2028', 2, '2027-03-01', '2028-10-31',
  'Contract text for Amadou Diallo. Fees: [[amount]]. This agreement is signed electronically.')$$));
select t.check('term longer than the chosen years refused', t.raises($$insert into player_contracts (player_id, title, years, starts_on, ends_on, body) values ('a5000000-0000-0000-0000-000000000003', 'Too long', 1, '2027-03-01', '2028-10-31', repeat('x', 60))$$));
select t.check('4 years refused', t.raises($$insert into player_contracts (player_id, title, years, starts_on, ends_on, body) values ('a5000000-0000-0000-0000-000000000003', 'Four', 4, '2027-03-01', '2030-10-31', repeat('x', 60))$$));
select t.check('end before start refused', t.raises($$insert into player_contracts (player_id, title, years, starts_on, ends_on, body) values ('a5000000-0000-0000-0000-000000000003', 'Backwards', 1, '2027-03-01', '2027-02-01', repeat('x', 60))$$));
select t.check('cannot insert an already signed contract', t.raises($$insert into player_contracts (player_id, title, years, starts_on, ends_on, body, status, sent_at, body_sha256, player_signed_at, player_signed_name) values ('a5000000-0000-0000-0000-000000000004', 'Forged', 1, '2027-03-01', '2027-10-31', repeat('x', 60), 'player_signed', now(), repeat('a', 64), now(), 'Other Player')$$));
select t.check('cannot send with [[blanks]] left', t.raises($$update player_contracts set status = 'sent' where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.admin();

select t.login('a1000000-0000-0000-0000-000000000003');
select t.check('player cannot see a draft', (select count(*) from player_contracts) = 0);
select t.admin();

select t.login('a1000000-0000-0000-0000-000000000001');
select t.check('admin edits the draft', t.rows($$update player_contracts set body = replace(body, '[[amount]]', 'EUR 50') where id = 'a7000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('admin sends it', t.rows($$update player_contracts set status = 'sent' where id = 'a7000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('fingerprint and send time stored', (select sent_at is not null and body_sha256 = encode(sha256(convert_to(body, 'UTF8')), 'hex') from player_contracts where id = 'a7000000-0000-0000-0000-000000000001'));
select t.check('sent text cannot be changed', t.raises($$update player_contracts set body = body || ' extra' where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.check('sent contract cannot be deleted', t.raises($$delete from player_contracts where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.check('admin cannot sign for the player', t.raises($$update player_contracts set status = 'player_signed', player_signed_name = 'Amadou Diallo' where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.check('admin cannot countersign before the player', t.raises($$update player_contracts set status = 'active' where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.check('overlapping second contract cannot be sent', not t.raises($$insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body) values ('a7000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000003', 'Overlap', 1, '2027-06-01', '2027-12-31', repeat('y', 60))$$)
  and t.raises($$update player_contracts set status = 'sent' where id = 'a7000000-0000-0000-0000-000000000002'$$));
select t.admin();

-- ---------- coach, other player, anonymous ----------
select t.login('a1000000-0000-0000-0000-000000000002');
select t.check('coach reads the sent contract of own team player, not drafts or the template (0031)', (select count(*) from player_contracts) = 1
  and (select id from player_contracts) = 'a7000000-0000-0000-0000-000000000001' and (select count(*) from contract_templates) = 0);
select t.check('coach cannot change a contract', t.rows($$update player_contracts set title = 'Coach edit'$$) = 0);
select t.admin();
select t.login('a1000000-0000-0000-0000-000000000004');
select t.check('another player sees nothing', (select count(*) from player_contracts) = 0);
select t.check('another player cannot sign it', t.raises($$select public.sign_contract('a7000000-0000-0000-0000-000000000001', 'Other Player')$$));
select t.admin();
select t.anon();
select t.check('anonymous: no access', t.raises($$select count(*) from player_contracts$$) and t.raises($$select public.sign_contract('a7000000-0000-0000-0000-000000000001', 'x')$$));
select t.admin();

-- ---------- player signs ----------
select t.login('a1000000-0000-0000-0000-000000000003');
select t.check('player reads the sent contract', (select count(*) from player_contracts) = 1);
select t.check('player cannot update the table directly', t.rows($$update player_contracts set status = 'player_signed', player_signed_name = 'Amadou Diallo'$$) = 0);
select t.check('wrong name refused', t.raises($$select public.sign_contract('a7000000-0000-0000-0000-000000000001', 'Someone Else')$$));
select t.check('player signs with their name (case and spaces ignored)', not t.raises($$select public.sign_contract('a7000000-0000-0000-0000-000000000001', '  amadou   DIALLO ')$$));
select t.check('signature stored', (select status = 'player_signed' and player_signed_at is not null and player_signed_name = 'amadou DIALLO' from player_contracts where id = 'a7000000-0000-0000-0000-000000000001'));
select t.check('cannot sign twice', t.raises($$select public.sign_contract('a7000000-0000-0000-0000-000000000001', 'Amadou Diallo')$$));
select t.check('cannot decline after signing', t.raises($$select public.decline_contract('a7000000-0000-0000-0000-000000000001', 'changed my mind')$$));
select t.admin();

-- ---------- admin countersigns ----------
select t.login('a1000000-0000-0000-0000-000000000001');
select t.check('signature cannot be edited', t.raises($$update player_contracts set player_signed_name = 'Forged' where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.check('admin countersigns', t.rows($$update player_contracts set status = 'active' where id = 'a7000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('club signature records the admin', (select status = 'active' and club_signed_by = 'a1000000-0000-0000-0000-000000000001' and club_signed_name = 'Cat Admin' from player_contracts where id = 'a7000000-0000-0000-0000-000000000001'));
select t.check('active contract cannot be cancelled, only terminated', t.raises($$update player_contracts set status = 'cancelled' where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.check('termination needs a date', t.raises($$update player_contracts set status = 'terminated' where id = 'a7000000-0000-0000-0000-000000000001'$$));
select t.check('terminate with date and reason', t.rows($$update player_contracts set status = 'terminated', terminated_on = '2027-09-30', termination_reason = 'Moved abroad' where id = 'a7000000-0000-0000-0000-000000000001'$$) = 1);
select t.check('draft can be deleted', t.rows($$delete from player_contracts where id = 'a7000000-0000-0000-0000-000000000002'$$) = 1);
-- decline flow
select t.check('new contract for the other player sent', not t.raises($$insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body) values ('a7000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000004', 'One year', 1, '2027-03-01', '2027-10-31', repeat('z', 60))$$)
  and t.rows($$update player_contracts set status = 'sent' where id = 'a7000000-0000-0000-0000-000000000003'$$) = 1);
select t.admin();
select t.login('a1000000-0000-0000-0000-000000000004');
select t.check('player declines with a reason', not t.raises($$select public.decline_contract('a7000000-0000-0000-0000-000000000003', 'Not this season')$$));
select t.admin();
select t.check('decline stored', (select status = 'declined' and declined_at is not null and decline_reason = 'Not this season' from player_contracts where id = 'a7000000-0000-0000-0000-000000000003'));
select t.check('audit trail records contracts', (select count(*) from audit_log where table_name = 'player_contracts') >= 6);
select t.check('release 0.18.0 present', exists (select 1 from app_releases where version = '0.18.0'));
rollback;
