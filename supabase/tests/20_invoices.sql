-- 0027 automatic invoices: generation rules, idempotence, line totals, RLS. Run by run_tests.sh after 10_rls.sql (uses its t.* helpers).
begin;
-- ---------- fixtures (as superuser) ----------
insert into auth.users (id, email, raw_user_meta_data) values
 ('70000000-0000-0000-0000-000000000001', 'inv-admin@example.test', '{"first_name":"Inv","last_name":"Admin"}'),
 ('70000000-0000-0000-0000-000000000002', 'inv-player@example.test', '{"first_name":"Inv","last_name":"Player"}'),
 ('70000000-0000-0000-0000-000000000003', 'inv-other@example.test', '{"first_name":"Other","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = '70000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name) values
 ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'Inv', 'Player'),
 ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', 'Other', 'Player');
insert into players (id, first_name, last_name)
select ('71000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'P', 'N' || n from generate_series(3, 10) n;
insert into seasons (id, name, starts_on, ends_on) values ('72000000-0000-0000-0000-000000000001', 'Invoice test season', '2026-01-01', '2026-12-31');
insert into membership_plans (id, name, amount_cents, period) values
 ('73000000-0000-0000-0000-000000000001', 'Inv monthly', 2000, 'month'),
 ('73000000-0000-0000-0000-000000000002', 'Inv yearly', 24000, 'year'),
 ('73000000-0000-0000-0000-000000000003', 'Inv quarterly odd', 6001, 'quarter'),
 ('73000000-0000-0000-0000-000000000004', 'Inv season', 5000, 'season'),
 ('73000000-0000-0000-0000-000000000005', 'Inv one-off', 3000, 'one_off');
-- a: monthly, due within lead time   b: yearly   c: quarterly with an odd amount   d: season
-- e: not renewing   f: pending membership   g: far in the future   h: already ended   i: one-off plan
insert into memberships (id, player_id, plan_id, season_id, status, auto_renew, next_due_on, ends_on) values
 ('74000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'active', true, '2026-01-15', null),
 ('74000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 'active', true, '2026-01-01', null),
 ('74000000-0000-0000-0000-00000000000c', '71000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', 'active', true, '2026-01-01', null),
 ('74000000-0000-0000-0000-00000000000d', '71000000-0000-0000-0000-000000000004', '73000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000001', 'active', true, '2026-01-01', null),
 ('74000000-0000-0000-0000-00000000000e', '71000000-0000-0000-0000-000000000005', '73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'active', false, '2026-01-01', null),
 ('74000000-0000-0000-0000-00000000000f', '71000000-0000-0000-0000-000000000006', '73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'pending', true, '2026-01-01', null),
 ('74000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000007', '73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'active', true, '2026-03-01', null),
 ('74000000-0000-0000-0000-000000000011', '71000000-0000-0000-0000-000000000008', '73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'active', true, '2026-01-01', '2025-12-31'),
 ('74000000-0000-0000-0000-000000000012', '71000000-0000-0000-0000-000000000009', '73000000-0000-0000-0000-000000000005', '72000000-0000-0000-0000-000000000001', 'active', true, '2026-01-01', null);
create temp table inv_count (n int);

-- ---------- billing details required ----------
select t.check('billing setting exists, empty IBAN, public', (select value->>'iban' = '' and is_public from site_settings where key = 'billing'));
select t.check('no IBAN: nothing issued', app.generate_due_invoices('2026-01-01') = 0);
-- (the 0036 rule "contract signed and Code of Conduct agreed first" is off here; it is tested in 96_invoice_consents.sql)
update site_settings set value = value || '{"iban":"FI00 1234 5600 0007 85","bic":"TESTFIHH","legal_name":"Test ry","payment_terms_days":14,"lead_days":14,"require_consents":false}' where key = 'billing';

-- ---------- generation ----------
insert into inv_count select app.generate_due_invoices('2026-01-01');
select t.check('4 invoices issued (monthly, yearly, quarterly, season)', (select n from inv_count) = 4);
select t.check('skipped: not renewing, pending, not yet due, ended, one-off', (select count(*) from payments where membership_id in
  ('74000000-0000-0000-0000-00000000000e','74000000-0000-0000-0000-00000000000f','74000000-0000-0000-0000-000000000010','74000000-0000-0000-0000-000000000011','74000000-0000-0000-0000-000000000012')) = 0);
select t.check('invoice: method, status, number, reference, issued', (select bool_and(method = 'invoice' and status = 'pending' and invoice_number is not null and reference ~ '^[0-9]+$' and invoice_sent_at is not null)
  from payments where membership_id::text like '74000000%'));
select t.check('monthly: 1 line, €20, due on the period start', (select count(*) = 1 and sum(l.unit_price_cents) = 2000 from payment_lines l join payments p on p.id = l.payment_id where p.membership_id = '74000000-0000-0000-0000-00000000000a')
  and (select due_on = '2026-01-15' from payments where membership_id = '74000000-0000-0000-0000-00000000000a'));
select t.check('yearly: 12 monthly lines adding up to €240, first of each month', (select count(*) = 12 and sum(l.unit_price_cents) = 24000 and min(line_date) = '2026-01-01' and max(line_date) = '2026-12-01'
  from payment_lines l join payments p on p.id = l.payment_id where p.membership_id = '74000000-0000-0000-0000-00000000000b'));
select t.check('yearly: due date = invoice date + terms when the period already started', (select due_on = '2026-01-15' from payments where membership_id = '74000000-0000-0000-0000-00000000000b'));
select t.check('quarterly €60.01: lines 20.00 + 20.00 + 20.01 add up exactly', (select array_agg(l.unit_price_cents order by l.position) = array[2000,2000,2001]
  from payment_lines l join payments p on p.id = l.payment_id where p.membership_id = '74000000-0000-0000-0000-00000000000c'));
select t.check('season: one line, no further invoices', (select count(*) from payment_lines l join payments p on p.id = l.payment_id where p.membership_id = '74000000-0000-0000-0000-00000000000d') = 1
  and (select next_due_on is null from memberships where id = '74000000-0000-0000-0000-00000000000d'));
select t.check('next invoice dates move one period on', (select next_due_on from memberships where id = '74000000-0000-0000-0000-00000000000a') = '2026-02-15'
  and (select next_due_on from memberships where id = '74000000-0000-0000-0000-00000000000b') = '2027-01-01'
  and (select next_due_on from memberships where id = '74000000-0000-0000-0000-00000000000c') = '2026-04-01');
select t.check('same day again: nothing issued twice', app.generate_due_invoices('2026-01-01') = 0);
truncate inv_count; insert into inv_count select app.generate_due_invoices('2026-02-01');  -- separate statement: the count below must see its rows
select t.check('next month: only the monthly one again', (select n from inv_count) = 1
  and (select count(*) from payments where membership_id = '74000000-0000-0000-0000-00000000000a') = 2);
select t.check('line constraints: negative price refused', t.raises($$insert into payment_lines (payment_id, description, unit_price_cents) select id, 'x', -1 from payments limit 1$$));
select t.check('line constraints: empty description refused', t.raises($$insert into payment_lines (payment_id, description, unit_price_cents) select id, '', 1 from payments limit 1$$));
select t.check('audit trail records lines', (select count(*) from audit_log where table_name = 'payment_lines') >= 17);

-- ---------- RLS ----------
select t.login('70000000-0000-0000-0000-000000000002');
select t.check('player reads the lines of own invoices only', (select count(*) from payment_lines) = 2
  and not exists (select 1 from payment_lines l join payments p on p.id = l.payment_id where p.player_id <> '71000000-0000-0000-0000-000000000001'));
select t.check('player cannot add lines', t.raises($$insert into payment_lines (payment_id, description, unit_price_cents) select id, 'free', 0 from my_payments limit 1$$));
select t.check('player cannot change a line', t.rows($$update payment_lines set unit_price_cents = 0$$) = 0);
select t.check('player cannot run invoicing', t.raises($$select public.run_invoice_generation()$$));
select t.check('player cannot call the generator directly', t.raises($$select app.generate_due_invoices('2026-03-01')$$));
select t.check('player sees invoice numbers in my_payments', (select count(*) from my_payments where invoice_number is not null) = 2);
select t.admin();
select t.anon();
select t.check('anonymous: no access to invoice lines at all', t.raises($$select count(*) from payment_lines$$));
select t.check('anonymous: can read the public billing details', (select value->>'bic' from site_settings where key = 'billing') = 'TESTFIHH');
select t.admin();
select t.login('70000000-0000-0000-0000-000000000001');
select t.check('admin reads all lines', (select count(*) from payment_lines) >= 18);
select t.check('admin can run invoicing now', not t.raises($$select public.run_invoice_generation()$$));
select t.admin();
select t.check('release 0.16.0 present', exists (select 1 from app_releases where version = '0.16.0'));
rollback;
