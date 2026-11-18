-- 0054 Finance: balances, income projection, budget and expenses; admins only.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fb000000-0000-0000-0000-000000000001', 'fn-admin@example.test', '{"first_name":"Fn","last_name":"Admin"}'),
 ('fb000000-0000-0000-0000-000000000002', 'fn-p1@example.test', '{"first_name":"Abena","last_name":"One"}'),
 ('fb000000-0000-0000-0000-000000000003', 'fn-p2@example.test', '{"first_name":"Kofi","last_name":"Two"}'),
 ('fb000000-0000-0000-0000-000000000004', 'fn-p3@example.test', '{"first_name":"Yaa","last_name":"Three"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fb000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('fb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000004');
insert into players (id, profile_id, first_name, last_name) values
 ('fb500000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000002', 'Abena', 'One'),
 ('fb500000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000003', 'Kofi', 'Two'),
 ('fb500000-0000-0000-0000-000000000004', 'fb000000-0000-0000-0000-000000000004', 'Yaa', 'Three');
insert into seasons (id, name, starts_on, ends_on) values ('fb200000-0000-0000-0000-000000000001', 'Fn 2031', '2031-03-01', '2031-10-31');
insert into membership_plans (id, name, amount_cents, period) values
 ('fb300000-0000-0000-0000-000000000001', 'Fn monthly', 2000, 'month'), ('fb300000-0000-0000-0000-000000000002', 'Fn quarterly', 9000, 'quarter'),
 ('fb300000-0000-0000-0000-000000000003', 'Fn season', 15000, 'season');
-- monthly from March (8 to come), quarterly from April (Apr, Jul, Oct), season plan in May; a fourth membership is not renewed
insert into memberships (id, player_id, plan_id, season_id, status, auto_renew, next_due_on) values
 ('fb400000-0000-0000-0000-000000000001', 'fb500000-0000-0000-0000-000000000002', 'fb300000-0000-0000-0000-000000000001', 'fb200000-0000-0000-0000-000000000001', 'active', true, '2031-03-01'),
 ('fb400000-0000-0000-0000-000000000002', 'fb500000-0000-0000-0000-000000000003', 'fb300000-0000-0000-0000-000000000002', 'fb200000-0000-0000-0000-000000000001', 'active', true, '2031-04-01'),
 ('fb400000-0000-0000-0000-000000000003', 'fb500000-0000-0000-0000-000000000004', 'fb300000-0000-0000-0000-000000000003', 'fb200000-0000-0000-0000-000000000001', 'active', true, '2031-05-01');
-- invoices: Abena paid 20 in the season; Kofi owes 90, overdue; Yaa owes 40 from an earlier season (no membership)
insert into payments (player_id, membership_id, amount_cents, method, status, due_on, invoice_sent_at, paid_at) values
 ('fb500000-0000-0000-0000-000000000002', 'fb400000-0000-0000-0000-000000000001', 2000, 'invoice', 'paid', '2031-02-15', now(), now());
insert into payments (player_id, membership_id, amount_cents, method, status, due_on, invoice_sent_at) values
 ('fb500000-0000-0000-0000-000000000003', 'fb400000-0000-0000-0000-000000000002', 9000, 'invoice', 'pending', '2026-01-01', now()),
 ('fb500000-0000-0000-0000-000000000004', null, 4000, 'invoice', 'pending', '2025-05-01', now());

select t.login('fb000000-0000-0000-0000-000000000002');
select t.check('a player cannot see balances', t.raises($$select * from finance_balances('fb200000-0000-0000-0000-000000000001')$$));
select t.check('a player cannot see the projection', t.raises($$select finance_projection('fb200000-0000-0000-0000-000000000001')$$));
select t.check('a player cannot read budgets', (select count(*) from season_budgets) = 0 and t.raises($$insert into season_budgets (season_id, category, amount_cents) values ('fb200000-0000-0000-0000-000000000001', 'kits', 100)$$));
select t.anon();
select t.check('anon cannot read budgets', t.raises($$select 1 from season_budgets$$));

select t.login('fb000000-0000-0000-0000-000000000001');
select t.check('balances: Abena invoiced 20, paid 20, owes nothing', (select invoiced_cents || '/' || paid_cents || '/' || balance_cents from finance_balances('fb200000-0000-0000-0000-000000000001') where last_name = 'One') = '2000/2000/0');
select t.check('balances: Kofi 90 overdue, balance 90', (select overdue_cents || '/' || open_cents || '/' || balance_cents || '/' || oldest_due from finance_balances('fb200000-0000-0000-0000-000000000001') where last_name = 'Two') = '9000/0/9000/2026-01-01');
select t.check('balances: Yaa owes 40 from an earlier season, nothing in this one', (select invoiced_cents || '/' || balance_cents from finance_balances('fb200000-0000-0000-0000-000000000001') where last_name = 'Three') = '0/4000');
select t.check('projection: collected 20, outstanding 90 (all overdue)', (select (j ->> 'collected') || '/' || (j ->> 'outstanding') || '/' || (j ->> 'overdue') from finance_projection('fb200000-0000-0000-0000-000000000001') j) = '2000/9000/9000');
select t.check('projection: still to invoice 8×20 + 3×90 + 150 = 580 in 12 invoices', (select (j ->> 'scheduled') || '/' || (j ->> 'scheduled_count') from finance_projection('fb200000-0000-0000-0000-000000000001') j) = '58000/12');
select t.check('projection: by month, July = 20 + 90', (select (m ->> 'scheduled') from finance_projection('fb200000-0000-0000-0000-000000000001') j, jsonb_array_elements(j -> 'by_month') m where m ->> 'month' = '2031-07') = '11000');
select t.check('projection: nothing after the season ends', not exists (select 1 from finance_projection('fb200000-0000-0000-0000-000000000001') j, jsonb_array_elements(j -> 'by_month') m where m ->> 'month' > '2031-10' and (m ->> 'scheduled')::int > 0));
update memberships set auto_renew = false where id = 'fb400000-0000-0000-0000-000000000003';
select t.check('projection: a membership not renewed automatically is not projected', (select (j ->> 'scheduled') from finance_projection('fb200000-0000-0000-0000-000000000001') j) = '43000');
select t.check('unknown season refused', t.raises($$select finance_projection(gen_random_uuid())$$));
-- budget and expenses
select t.check('admin sets a budget', t.rows($$insert into season_budgets (season_id, category, amount_cents) values ('fb200000-0000-0000-0000-000000000001', 'field_booking', 120000), ('fb200000-0000-0000-0000-000000000001', 'licences', 30000)$$) = 2);
select t.check('one budget per category and season', t.raises($$insert into season_budgets (season_id, category, amount_cents) values ('fb200000-0000-0000-0000-000000000001', 'licences', 1)$$));
select t.check('unknown category refused', t.raises($$insert into season_budgets (season_id, category, amount_cents) values ('fb200000-0000-0000-0000-000000000001', 'beer', 1)$$));
select t.check('negative budget refused', t.raises($$insert into season_budgets (season_id, category, amount_cents) values ('fb200000-0000-0000-0000-000000000001', 'kits', -1)$$));
select t.check('admin records an expense', t.rows($$insert into expenses (season_id, category, amount_cents, description) values ('fb200000-0000-0000-0000-000000000001', 'kits', 45000, 'Shirts')$$) = 1);
select t.check('expense categories are the new ones', t.raises($$insert into expenses (season_id, category, amount_cents) values ('fb200000-0000-0000-0000-000000000001', 'pitch', 100)$$));
select t.check('expense over EUR 100 000 refused', t.raises($$insert into expenses (season_id, category, amount_cents) values ('fb200000-0000-0000-0000-000000000001', 'other', 10000001)$$));
select t.check('budget changes are audited', exists (select 1 from audit_log where table_name = 'season_budgets'));
select t.login('fb000000-0000-0000-0000-000000000002');
select t.check('a player cannot read expenses', (select count(*) from expenses) = 0);
rollback;
