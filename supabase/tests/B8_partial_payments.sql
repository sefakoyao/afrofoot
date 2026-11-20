-- 0056 Partial payments: receipts on invoices; what is owed is amount − paid everywhere; admins only.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fd000000-0000-0000-0000-000000000001', 'pp-admin@example.test', '{"first_name":"Pp","last_name":"Admin"}'),
 ('fd000000-0000-0000-0000-000000000002', 'pp-player@example.test', '{"first_name":"Nana","last_name":"Asare"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fd000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'fd000000-0000-0000-0000-000000000002';
insert into players (id, profile_id, first_name, last_name) values ('fd500000-0000-0000-0000-000000000002', 'fd000000-0000-0000-0000-000000000002', 'Nana', 'Asare');
insert into seasons (id, name, starts_on, ends_on) values ('fd200000-0000-0000-0000-000000000001', 'Pp season', current_date - 60, current_date + 200);
insert into payments (id, player_id, amount_cents, method, status, due_on, invoice_sent_at, season_id) values
 ('fd600000-0000-0000-0000-000000000001', 'fd500000-0000-0000-0000-000000000002', 2000, 'invoice', 'pending', current_date + 10, now(), 'fd200000-0000-0000-0000-000000000001'),
 ('fd600000-0000-0000-0000-000000000002', 'fd500000-0000-0000-0000-000000000002', 3000, 'invoice', 'pending', current_date - 5, now(), 'fd200000-0000-0000-0000-000000000001');

select t.login('fd000000-0000-0000-0000-000000000002');
select t.check('a player cannot record a payment', t.raises($$select record_invoice_payment('fd600000-0000-0000-0000-000000000001', 1000)$$));
select t.check('a player cannot write receipts', t.raises($$insert into payment_receipts (payment_id, amount_cents, paid_on) values ('fd600000-0000-0000-0000-000000000001', 2000, current_date)$$));

select t.login('fd000000-0000-0000-0000-000000000001');
select t.check('admin records EUR 10 of 20', (select (record_invoice_payment('fd600000-0000-0000-0000-000000000001', 1000, current_date - 1, 'Cash at training') ->> 'left_cents')) = '1000');
select t.check('…the invoice stays open with 10 paid', (select status || ':' || paid_cents from payments where id = 'fd600000-0000-0000-0000-000000000001') = 'pending:1000');
select t.check('cannot pay more than what is left', t.raises($$select record_invoice_payment('fd600000-0000-0000-0000-000000000001', 1001)$$));
select t.check('cannot record 0', t.raises($$select record_invoice_payment('fd600000-0000-0000-0000-000000000001', 0)$$));
select t.check('cannot date a payment in the future', t.raises($$select record_invoice_payment('fd600000-0000-0000-0000-000000000001', 100, (now() at time zone 'Europe/Helsinki')::date + 1)$$));
select t.check('admin cannot write receipts directly', t.raises($$insert into payment_receipts (payment_id, amount_cents, paid_on) values ('fd600000-0000-0000-0000-000000000001', 100, current_date)$$));
select t.check('balances: paid 10, owed 10 + 30, overdue 30', (select paid_cents || '/' || open_cents || '/' || overdue_cents || '/' || balance_cents from finance_balances('fd200000-0000-0000-0000-000000000001') where player_id = 'fd500000-0000-0000-0000-000000000002') = '1000/1000/3000/4000');
select t.check('projection: collected 10, outstanding 40', (select (j ->> 'collected') || '/' || (j ->> 'outstanding') from finance_projection('fd200000-0000-0000-0000-000000000001') j) = '1000/4000');
select t.check('sign-in help: owes 40', (select owed_cents from signin_status('fd000000-0000-0000-0000-000000000002')) = 4000);
select t.check('Mark paid records the rest and closes the invoice', (select (record_invoice_payment('fd600000-0000-0000-0000-000000000001') ->> 'paid')) = 'true');
select t.check('…paid, 20 of 20, paid_at set, two receipts', (select status || ':' || paid_cents || ':' || (paid_at is not null) from payments where id = 'fd600000-0000-0000-0000-000000000001') = 'paid:2000:true'
  and (select count(*) from payment_receipts where payment_id = 'fd600000-0000-0000-0000-000000000001') = 2);
select t.check('a paid invoice takes no more payments', t.raises($$select record_invoice_payment('fd600000-0000-0000-0000-000000000001', 100)$$));
select t.check('deleting a receipt reopens it', not t.raises(format($$select delete_invoice_receipt(%L)$$, (select id from payment_receipts where payment_id = 'fd600000-0000-0000-0000-000000000001' and amount_cents = 1000 and note is null))));
select t.check('…pending again with 10 paid, no paid date', (select status || ':' || paid_cents || ':' || (paid_at is null) from payments where id = 'fd600000-0000-0000-0000-000000000001') = 'pending:1000:true');
select t.check('receipts are audited', (select count(*) from audit_log where table_name = 'payment_receipts') >= 3);
-- removing a past-due line may not drop the total below what was paid
select add_past_due('fd600000-0000-0000-0000-000000000002', 'Unpaid balance', 500);
select record_invoice_payment('fd600000-0000-0000-0000-000000000002', 3200);
select t.check('past-due line cannot be removed below what was paid', t.raises(format($$select remove_past_due(%L)$$, (select id from payment_lines where payment_id = 'fd600000-0000-0000-0000-000000000002' and kind = 'past_due'))));
-- any other route to "paid" counts as paid in full
update payments set status = 'paid', paid_at = now() where id = 'fd600000-0000-0000-0000-000000000002';
select t.check('marked paid elsewhere: paid in full', (select paid_cents from payments where id = 'fd600000-0000-0000-0000-000000000002') = 3500);
insert into payments (id, player_id, amount_cents, method, status, paid_at) values ('fd600000-0000-0000-0000-000000000003', 'fd500000-0000-0000-0000-000000000002', 700, 'cash', 'paid', now());
select t.check('a payment inserted as paid is paid in full', (select paid_cents from payments where id = 'fd600000-0000-0000-0000-000000000003') = 700);

select t.login('fd000000-0000-0000-0000-000000000002');
select t.check('player: summary paid 10 + 35 + 7, owes 10', (select paid_cents || '/' || owed_cents from my_payment_summary()) = '5200/1000');
select t.check('player: the invoice shows 10 paid and 10 due', (select paid_cents || '/' || due_cents from my_payments where id = 'fd600000-0000-0000-0000-000000000001') = '1000/1000');
select t.check('player: reads the receipts of own invoices', (select count(*) from payment_receipts) = 2);
rollback;
