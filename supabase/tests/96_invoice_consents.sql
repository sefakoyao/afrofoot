-- 0036 Invoices only after the contract is signed and the Code of Conduct agreed. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('a6000000-0000-0000-0000-000000000001', 'ic-admin@example.test', '{"first_name":"Ic","last_name":"Admin"}'),
 ('a6000000-0000-0000-0000-000000000002', 'ic-player@example.test', '{"first_name":"Ic","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'a6000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'a6000000-0000-0000-0000-000000000002';
insert into players (id, profile_id, first_name, last_name) values ('a6100000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'Ic', 'Player');
insert into players (id, first_name, last_name) values ('a6100000-0000-0000-0000-000000000002', 'No', 'Account');
update players set date_of_birth = date '1990-01-01' where date_of_birth is null;   -- 0073: signing needs a saved birth date
insert into seasons (id, name, starts_on, ends_on) values ('a6200000-0000-0000-0000-000000000001', 'Ic season', current_date - 30, current_date + 400);
insert into membership_plans (id, name, amount_cents, period) values ('a6300000-0000-0000-0000-000000000001', 'Ic monthly', 2500, 'month');
insert into memberships (id, player_id, plan_id, season_id, status, auto_renew, next_due_on) values
 ('a6400000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'a6300000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001', 'active', true, current_date + 5),
 ('a6400000-0000-0000-0000-000000000002', 'a6100000-0000-0000-0000-000000000002', 'a6300000-0000-0000-0000-000000000001', 'a6200000-0000-0000-0000-000000000001', 'active', true, current_date + 5);
update memberships set auto_renew = false where id::text not like 'a64%';   -- only this file's memberships are due
update site_settings set value = value || '{"iban":"FI21 1234 5600 0007 85","bic":"TESTFIHH","legal_name":"Test ry","lead_days":14,"require_consents":true}' where key = 'billing';
create temp table ic_n (n int);
create function pg_temp.invoices(p uuid) returns int language sql as $$ select count(*)::int from payments where player_id = p and method = 'invoice' $$;

-- ---------- nothing done yet ----------
select t.check('a Code of Conduct version is published (rule needs consent)', exists (select 1 from conduct_versions where is_current));
select t.check('hold: Code of Conduct and contract missing', app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date + 5) = array['conduct', 'contract']);
insert into ic_n select app.generate_due_invoices();
select t.check('no invoice while both are missing', (select n from ic_n) = 0 and pg_temp.invoices('a6100000-0000-0000-0000-000000000001') = 0);
select t.check('held membership keeps its invoice date', (select next_due_on from memberships where id = 'a6400000-0000-0000-0000-000000000001') = current_date + 5);

-- admin list of who is waiting
select t.login('a6000000-0000-0000-0000-000000000001');
select t.check('admin sees both players waiting, with what is missing', (select count(*) from public.invoice_holds() where player_id in ('a6100000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000002')) = 2
  and (select missing from public.invoice_holds() where player_id = 'a6100000-0000-0000-0000-000000000001') = array['conduct', 'contract']);
select t.login('a6000000-0000-0000-0000-000000000002');
select t.check('players cannot list the holds', t.raises($$select * from public.invoice_holds()$$));
select t.check('players cannot call the hold check', t.raises($$select app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date)$$));

-- ---------- Code of Conduct agreed, contract not yet ----------
insert into conduct_consents (version_id, profile_id) select id, 'a6000000-0000-0000-0000-000000000002' from conduct_versions where is_current;
select t.admin();
select t.check('hold after consent: contract only', app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date + 5) = array['contract']);
truncate ic_n; insert into ic_n select app.generate_due_invoices();
select t.check('still no invoice without a signed contract', pg_temp.invoices('a6100000-0000-0000-0000-000000000001') = 0);

-- contract sent but not signed
insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body) values
 ('a6500000-0000-0000-0000-000000000001', 'a6100000-0000-0000-0000-000000000001', 'Ic contract', 1, current_date, current_date + 365, repeat('Contract text. ', 10));
update player_contracts set status = 'sent' where id = 'a6500000-0000-0000-0000-000000000001';
truncate ic_n; insert into ic_n select app.generate_due_invoices();
select t.check('contract sent but not signed: no invoice', pg_temp.invoices('a6100000-0000-0000-0000-000000000001') = 0);

-- ---------- the player signs ----------
select t.login('a6000000-0000-0000-0000-000000000002');
select public.sign_contract('a6500000-0000-0000-0000-000000000001', 'Ic Player');
select t.admin();
select t.check('nothing missing once signed and agreed', app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date + 5) = '{}');
truncate ic_n; insert into ic_n select app.generate_due_invoices();
select t.check('invoice issued at the next run (signed by the player, before the club countersigns)', (select n from ic_n) = 1 and pg_temp.invoices('a6100000-0000-0000-0000-000000000001') = 1);
select t.check('the held period is the one invoiced (nothing skipped)', (select pl.line_date from payment_lines pl join payments p on p.id = pl.payment_id where p.player_id = 'a6100000-0000-0000-0000-000000000001') = current_date + 5
  and (select next_due_on from memberships where id = 'a6400000-0000-0000-0000-000000000001') = (current_date + 5 + interval '1 month')::date);
select t.check('player without an app account stays on hold (cannot agree to the Code of Conduct)', pg_temp.invoices('a6100000-0000-0000-0000-000000000002') = 0
  and app.invoice_hold('a6100000-0000-0000-0000-000000000002', current_date + 5) = array['conduct', 'contract']);

-- ---------- contract dates ----------
select t.check('a contract that has ended by the invoice date does not count', app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date + 400) = array['contract']);
select t.login('a6000000-0000-0000-0000-000000000001');
update player_contracts set status = 'active', club_signed_name = 'Ic Admin' where id = 'a6500000-0000-0000-0000-000000000001';
update player_contracts set status = 'terminated', terminated_on = current_date + 20 where id = 'a6500000-0000-0000-0000-000000000001';
select t.admin();
select t.check('a countersigned contract counts', (select status from player_contracts where id = 'a6500000-0000-0000-0000-000000000001') = 'terminated'
  and app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date + 10) = '{}');
select t.check('a terminated contract no longer counts after it ends', app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date + 30) = array['contract']);

-- ---------- new Code of Conduct version asks again ----------
update conduct_versions set is_current = false where is_current;
select t.check('no published Code of Conduct: only the contract is needed', app.invoice_hold('a6100000-0000-0000-0000-000000000002', current_date + 5) = array['contract']);
insert into conduct_versions (version, title, body, is_current) values ('ic-2', 'Ic code', 'Be fair and kind to everyone.', true);
select t.check('a new version needs a new consent', 'conduct' = any(app.invoice_hold('a6100000-0000-0000-0000-000000000001', current_date + 5)));

-- ---------- switched off ----------
update site_settings set value = value || '{"require_consents":false}' where key = 'billing';
truncate ic_n; insert into ic_n select app.generate_due_invoices();
select t.check('rule switched off: the waiting player is invoiced', pg_temp.invoices('a6100000-0000-0000-0000-000000000002') = 1);
select t.login('a6000000-0000-0000-0000-000000000001');
select t.check('rule switched off: nobody listed as waiting', (select count(*) from public.invoice_holds()) = 0);
select t.admin();
select t.check('release 0.24.0 present', exists (select 1 from app_releases where version = '0.24.0'));
rollback;
