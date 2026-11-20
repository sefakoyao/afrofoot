-- 0063 Past-season invoices: one invoice per player with a line per month; nobody billed twice; bulk "paid".
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f4000000-0000-0000-0000-000000000001', 'si-admin@example.test', '{"first_name":"Si","last_name":"Admin"}'),
 ('f4000000-0000-0000-0000-000000000002', 'si-p1@example.test', '{"first_name":"Kwesi","last_name":"One"}'),
 ('f4000000-0000-0000-0000-000000000003', 'si-p2@example.test', '{"first_name":"Efua","last_name":"Two"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f4000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('f4000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000003');
insert into players (id, profile_id, first_name, last_name) values
 ('f4500000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000002', 'Kwesi', 'One'),
 ('f4500000-0000-0000-0000-000000000003', 'f4000000-0000-0000-0000-000000000003', 'Efua', 'Two');
insert into seasons (id, name, starts_on, ends_on) values ('f4200000-0000-0000-0000-000000000001', 'Si 2025', '2025-01-01', '2025-12-31');
create temp table c6 (created int, skipped int);
grant all on c6 to authenticated;

select t.login('f4000000-0000-0000-0000-000000000002');
select t.check('a player cannot create season invoices', t.raises($$select * from create_season_invoices('f4200000-0000-0000-0000-000000000001', '2025-01-01', '2025-10-01', 2000, array['f4500000-0000-0000-0000-000000000002'::uuid], current_date + 30)$$));
select t.login('f4000000-0000-0000-0000-000000000001');
select t.check('last month before the first: refused', t.raises($$select * from create_season_invoices('f4200000-0000-0000-0000-000000000001', '2025-10-01', '2025-01-01', 2000, array['f4500000-0000-0000-0000-000000000002'::uuid], current_date + 30)$$));
select t.check('more than 24 months: refused', t.raises($$select * from create_season_invoices('f4200000-0000-0000-0000-000000000001', '2023-01-01', '2025-02-01', 2000, array['f4500000-0000-0000-0000-000000000002'::uuid], current_date + 30)$$));
select t.check('invoice date after the due date: refused', t.raises($$select * from create_season_invoices('f4200000-0000-0000-0000-000000000001', '2025-01-01', '2025-10-01', 2000, array['f4500000-0000-0000-0000-000000000002'::uuid], current_date - 30, current_date)$$));
insert into c6 select * from create_season_invoices('f4200000-0000-0000-0000-000000000001', '2025-01-15', '2025-10-31', 2000,
  array['f4500000-0000-0000-0000-000000000002'::uuid, 'f4500000-0000-0000-0000-000000000003'::uuid], current_date + 30, current_date - 5, 'Membership fees 2025');
select t.check('January–October 2025 for two players: 2 invoices', (select created || '/' || skipped from c6) = '2/0');
select t.check('…€200 each, 10 lines of €20 dated the 1st of each month', (select bool_and(amount_cents = 20000) from payments where season_id = 'f4200000-0000-0000-0000-000000000001')
  and (select count(*) || '|' || min(line_date) || '|' || max(line_date) from payment_lines l join payments p on p.id = l.payment_id where p.player_id = 'f4500000-0000-0000-0000-000000000002' and p.season_id = 'f4200000-0000-0000-0000-000000000001') = '10|2025-01-01|2025-10-01');
select t.check('…invoice numbers and reference numbers given', (select bool_and(invoice_number is not null and reference is not null) from payments where season_id = 'f4200000-0000-0000-0000-000000000001'));
select t.check('…dated the chosen invoice date', (select bool_and((invoice_sent_at at time zone 'Europe/Helsinki')::date = current_date - 5) from payments where season_id = 'f4200000-0000-0000-0000-000000000001'));
truncate c6;
insert into c6 select * from create_season_invoices('f4200000-0000-0000-0000-000000000001', '2025-09-01', '2025-12-01', 2000, array['f4500000-0000-0000-0000-000000000002'::uuid], current_date + 30);
select t.check('months already billed (Sep–Oct): the player is skipped', (select created || '/' || skipped from c6) = '0/1');
-- part payment, then everything at once
select public.record_invoice_payment((select id from payments where player_id = 'f4500000-0000-0000-0000-000000000003' and season_id = 'f4200000-0000-0000-0000-000000000001'), 5000, current_date - 1, null);
select t.check('bulk paid: both invoices', public.mark_invoices_paid(array(select id from payments where season_id = 'f4200000-0000-0000-0000-000000000001'), current_date) = 2);
select t.check('…both paid in full (Efua: €50 earlier + €150 now)', (select bool_and(status = 'paid' and paid_cents = amount_cents) from payments where season_id = 'f4200000-0000-0000-0000-000000000001')
  and (select string_agg(r.amount_cents::text, '+' order by r.paid_on) from payment_receipts r join payments p on p.id = r.payment_id where p.player_id = 'f4500000-0000-0000-0000-000000000003') = '5000+15000');
select t.check('…running it again changes nothing', public.mark_invoices_paid(array(select id from payments where season_id = 'f4200000-0000-0000-0000-000000000001')) = 0);
select t.login('f4000000-0000-0000-0000-000000000002');
select t.check('a player sees their own season invoice', (select count(*) from payments where season_id = 'f4200000-0000-0000-0000-000000000001') = 1);
select t.check('a player cannot mark invoices paid', t.raises($$select public.mark_invoices_paid(array['00000000-0000-0000-0000-000000000000'::uuid])$$));
rollback;
