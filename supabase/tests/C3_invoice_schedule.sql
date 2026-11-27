-- 0060 Monthly invoice schedule: dated the invoice day (1st), due the due day (10th); late invoices due 7 days on;
-- admins set from which month memberships are invoiced; the contract rule (0036) still holds.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f1000000-0000-0000-0000-000000000001', 'is-admin@example.test', '{"first_name":"Is","last_name":"Admin"}'),
 ('f1000000-0000-0000-0000-000000000002', 'is-p1@example.test', '{"first_name":"Kobby","last_name":"One"}'),
 ('f1000000-0000-0000-0000-000000000003', 'is-p2@example.test', '{"first_name":"Abena","last_name":"Two"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f1000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name) values
 ('f1500000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'Kobby', 'One'),
 ('f1500000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000003', 'Abena', 'Two');
update players set date_of_birth = date '1990-01-01' where date_of_birth is null;   -- 0073: signing needs a saved birth date
update seasons set is_current = false;
insert into seasons (id, name, starts_on, ends_on, is_current) values ('f1200000-0000-0000-0000-000000000001', 'Is season', '2026-11-01', '2027-10-31', true);
insert into membership_plans (id, name, amount_cents, period) values ('f1300000-0000-0000-0000-000000000001', 'Is monthly', 2000, 'month');
insert into memberships (id, player_id, plan_id, season_id, status, auto_renew, next_due_on) values
 ('f1400000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000002', 'f1300000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'active', true, '2026-12-01'),
 ('f1400000-0000-0000-0000-000000000002', 'f1500000-0000-0000-0000-000000000003', 'f1300000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'active', true, '2026-12-01');
update site_settings set value = ((value || '{"iban":"FI00 1234 5600 0007 85","legal_name":"Test ry","require_consents":true}'::jsonb) - 'invoice_day') - 'due_day' where key = 'billing';
-- both players agreed to the Code of Conduct (if one is current); Kobby signed a contract from January 2027, Abena not yet
insert into conduct_consents (profile_id, version_id) select pr, v.id from conduct_versions v, unnest(array['f1000000-0000-0000-0000-000000000002'::uuid, 'f1000000-0000-0000-0000-000000000003'::uuid]) pr where v.is_current;
select t.login('f1000000-0000-0000-0000-000000000001');
insert into player_contracts (id, player_id, title, years, starts_on, ends_on, body) values
 ('f1600000-0000-0000-0000-000000000001', 'f1500000-0000-0000-0000-000000000002', 'Is contract', 1, '2027-01-01', '2027-10-31', repeat('x', 60)),
 ('f1600000-0000-0000-0000-000000000002', 'f1500000-0000-0000-0000-000000000003', 'Is contract 2', 1, '2027-01-01', '2027-10-31', repeat('y', 60));
update player_contracts set status = 'sent' where id::text like 'f1600000%';
select t.login('f1000000-0000-0000-0000-000000000002');
select public.sign_contract('f1600000-0000-0000-0000-000000000001', 'Kobby One');
select t.anon(); select set_config('request.jwt.claims', '', true); reset role;

select t.check('defaults: dated the 1st, due the 10th', (select issue_on || '/' || due_on from app.invoice_dates('2027-01-01')) = '2027-01-01/2027-01-10');

select t.login('f1000000-0000-0000-0000-000000000002');
select t.check('a player cannot set the invoice start', t.raises($$select set_invoice_start('2027-01-01')$$));
select t.check('a player cannot start invoices from contracts', t.raises($$select set_invoice_start_from_contracts()$$));
select t.login('f1000000-0000-0000-0000-000000000001');
select t.check('admin: from each player''s contract month (both contracts start in January 2027)', set_invoice_start_from_contracts() = 2);
select t.check('…both start on 1 January 2027 (not December)', (select bool_and(next_due_on = '2027-01-01') from memberships where id::text like 'f1400000%'));
select t.check('…running it again changes nothing', set_invoice_start_from_contracts() = 0);
select t.check('admin: start invoices from a month for everyone without invoices (2 memberships)', set_invoice_start('2027-01-15') = 2);
select t.check('…both start on 1 January 2027', (select bool_and(next_due_on = '2027-01-01') from memberships where id::text like 'f1400000%'));
select t.check('a month too far away is refused', t.raises($$select set_invoice_start('2030-01-01')$$));
select t.anon(); select set_config('request.jwt.claims', '', true); reset role;

-- December: nothing (January not reached yet)
select t.check('31 December: no invoice yet', app.generate_due_invoices('2026-12-31') = 0);
-- 1 January: Kobby (signed) is invoiced, dated the 1st, due the 10th; Abena (no contract) waits
create temp table c3_n (n int);
insert into c3_n select app.generate_due_invoices('2027-01-01');
select t.check('1 January: one invoice (Kobby); Abena waits for her contract', (select n from c3_n) = 1
  and not exists (select 1 from payments where player_id = 'f1500000-0000-0000-0000-000000000003'));
select t.check('…dated 1 January, due 10 January, covering January', (select (invoice_sent_at at time zone 'Europe/Helsinki')::date || '/' || due_on from payments where player_id = 'f1500000-0000-0000-0000-000000000002') = '2027-01-01/2027-01-10'
  and (select min(l.line_date) from payment_lines l join payments p on p.id = l.payment_id where p.player_id = 'f1500000-0000-0000-0000-000000000002') = '2027-01-01');
select t.check('…next one from February', (select next_due_on from memberships where id = 'f1400000-0000-0000-0000-000000000001') = '2027-02-01');
-- Abena signs on 15 January: her January invoice comes late, due 7 days later (not the past 10th)
select t.login('f1000000-0000-0000-0000-000000000003');
select public.sign_contract('f1600000-0000-0000-0000-000000000002', 'Abena Two');
select t.anon(); select set_config('request.jwt.claims', '', true); reset role;
truncate c3_n; insert into c3_n select app.generate_due_invoices('2027-01-15');
select t.check('15 January (signed late): Abena''s January invoice, due 22 January', (select n from c3_n) = 1
  and (select due_on from payments where player_id = 'f1500000-0000-0000-0000-000000000003') = '2027-01-22');
-- 1 February: both
truncate c3_n; insert into c3_n select app.generate_due_invoices('2027-02-01');
select t.check('1 February: both invoiced, due 10 February', (select n from c3_n) = 2
  and (select count(*) from payments where due_on = '2027-02-10' and player_id::text like 'f1500000%') = 2);
-- the club's own days
update site_settings set value = value || '{"invoice_day":5,"due_day":20}' where key = 'billing';
select t.check('club days 5 / 20', (select issue_on || '/' || due_on from app.invoice_dates('2027-03-01')) = '2027-03-05/2027-03-20');
select t.check('2 March: not yet (invoice day is the 5th)', app.generate_due_invoices('2027-03-02') = 0);
update site_settings set value = value || '{"invoice_day":25,"due_day":5}' where key = 'billing';
select t.check('due day before the invoice day: due next month', (select issue_on || '/' || due_on from app.invoice_dates('2027-03-01')) = '2027-03-25/2027-04-05');
-- one membership at a time; memberships with invoices are left alone by the "everyone" setting
select t.login('f1000000-0000-0000-0000-000000000001');
select t.check('"everyone" skips memberships that already have invoices', set_invoice_start('2027-06-01') = 0);
select t.check('one membership: move Kobby to June', set_invoice_start('2027-06-01', 'f1400000-0000-0000-0000-000000000001') = 1);
select t.check('…his next invoice is for June', (select next_due_on from memberships where id = 'f1400000-0000-0000-0000-000000000001') = '2027-06-01');
select t.check('an unknown membership is refused', t.raises($$select set_invoice_start('2027-06-01', gen_random_uuid())$$));
rollback;
