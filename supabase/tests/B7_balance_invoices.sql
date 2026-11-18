-- 0055 Balance invoices: one invoice per item, with its season; admins only; players see their own with title and season.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fc000000-0000-0000-0000-000000000001', 'bi-admin@example.test', '{"first_name":"Bi","last_name":"Admin"}'),
 ('fc000000-0000-0000-0000-000000000002', 'bi-p1@example.test', '{"first_name":"Ekow","last_name":"Mensah"}'),
 ('fc000000-0000-0000-0000-000000000003', 'bi-p2@example.test', '{"first_name":"Adjoa","last_name":"Owusu"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fc000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('fc000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name) values
 ('fc500000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000002', 'Ekow', 'Mensah'),
 ('fc500000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000003', 'Adjoa', 'Owusu');
insert into seasons (id, name, starts_on, ends_on) values
 ('fc200000-0000-0000-0000-000000000024', 'Bi 2024', '2024-03-01', '2024-10-31'), ('fc200000-0000-0000-0000-000000000026', 'Bi 2026', '2026-03-01', '2026-10-31');

select t.login('fc000000-0000-0000-0000-000000000002');
select t.check('a player cannot create balance invoices', t.raises($$select create_balance_invoices('fc500000-0000-0000-0000-000000000002', current_date, '[{"description":"Balance 2024","amount_cents":5000}]')$$));

select t.login('fc000000-0000-0000-0000-000000000001');
select t.check('admin creates two balance invoices in one go', (select cardinality(create_balance_invoices('fc500000-0000-0000-0000-000000000002', current_date + 14,
  jsonb_build_array(jsonb_build_object('season_id', 'fc200000-0000-0000-0000-000000000024', 'description', ' Balance 2024 ', 'amount_cents', 6000),
                    jsonb_build_object('season_id', 'fc200000-0000-0000-0000-000000000026', 'description', 'Player licence 2026', 'amount_cents', 4500))))) = 2);
select t.check('…two separate invoices with their own numbers and references', (select count(distinct invoice_number) || '/' || count(distinct reference) from payments where player_id = 'fc500000-0000-0000-0000-000000000002' and notes = 'balance invoice') = '2/2');
select t.check('…pending, due in 14 days, with their season', (select string_agg(amount_cents || ':' || status || ':' || (due_on = current_date + 14) || ':' || s.name, ',' order by amount_cents) from payments p join seasons s on s.id = p.season_id where p.player_id = 'fc500000-0000-0000-0000-000000000002') = '4500:pending:true:Bi 2026,6000:pending:true:Bi 2024');
select t.check('…one balance line each, trimmed text', (select string_agg(l.description || ':' || l.kind || ':' || l.unit_price_cents, ',' order by l.unit_price_cents) from payment_lines l join payments p on p.id = l.payment_id where p.player_id = 'fc500000-0000-0000-0000-000000000002') = 'Player licence 2026:balance:4500,Balance 2024:balance:6000');
select t.check('no season is allowed', cardinality(create_balance_invoices('fc500000-0000-0000-0000-000000000003', current_date, '[{"description":"Kit deposit","amount_cents":2000}]')) = 1);
select t.check('an empty list is refused', t.raises($$select create_balance_invoices('fc500000-0000-0000-0000-000000000003', current_date, '[]')$$));
select t.check('more than 10 items refused', t.raises(format($$select create_balance_invoices('fc500000-0000-0000-0000-000000000003', current_date, %L)$$, (select jsonb_agg(jsonb_build_object('description', 'Item ' || g, 'amount_cents', 100)) from generate_series(1, 11) g))));
select t.check('a bad item refuses the whole call (nothing created)', t.raises($$select create_balance_invoices('fc500000-0000-0000-0000-000000000003', current_date, '[{"description":"Fine","amount_cents":100},{"description":"x","amount_cents":100}]')$$));
select t.check('…still only the kit deposit for her', (select count(*) from payments where player_id = 'fc500000-0000-0000-0000-000000000003') = 1);
select t.check('amount over EUR 5000 refused', t.raises($$select create_balance_invoices('fc500000-0000-0000-0000-000000000003', current_date, '[{"description":"Too much","amount_cents":500001}]')$$));
select t.check('unknown season refused', t.raises(format($$select create_balance_invoices('fc500000-0000-0000-0000-000000000003', current_date, %L)$$, jsonb_build_array(jsonb_build_object('season_id', gen_random_uuid(), 'description', 'Balance', 'amount_cents', 100)))));
select t.check('a due date over a year away refused', t.raises($$select create_balance_invoices('fc500000-0000-0000-0000-000000000003', current_date + 400, '[{"description":"Later","amount_cents":100}]')$$));
select t.check('unknown player refused', t.raises($$select create_balance_invoices(gen_random_uuid(), current_date, '[{"description":"Nobody","amount_cents":100}]')$$));
-- finance follows the invoice's own season
select t.check('finance: the 2024 balance counts in 2024, not 2026', (select invoiced_cents from finance_balances('fc200000-0000-0000-0000-000000000024') where player_id = 'fc500000-0000-0000-0000-000000000002') = 6000
  and (select invoiced_cents from finance_balances('fc200000-0000-0000-0000-000000000026') where player_id = 'fc500000-0000-0000-0000-000000000002') = 4500);
select t.check('finance: the balance across seasons is 105', (select balance_cents from finance_balances('fc200000-0000-0000-0000-000000000026') where player_id = 'fc500000-0000-0000-0000-000000000002') = 10500);
select t.check('created invoices are audited', (select count(*) from audit_log where table_name = 'payments' and new_data ->> 'notes' = 'balance invoice') >= 3);

select t.login('fc000000-0000-0000-0000-000000000002');
select t.check('the player sees both invoices with title and season', (select string_agg(title || ' / ' || season_name, ',' order by amount_cents) from my_payments) = 'Player licence 2026 / Bi 2026,Balance 2024 / Bi 2024');
select t.check('…and not the other player''s', (select count(*) from my_payments) = 2);
select t.check('…the summary owes 105', (select owed_cents from my_payment_summary()) = 10500);
rollback;
