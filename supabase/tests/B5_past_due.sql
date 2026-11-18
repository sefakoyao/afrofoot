-- 0053 Past-due amounts on invoices: admins add and remove a line on unpaid invoices only; the total follows.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fa000000-0000-0000-0000-000000000001', 'pd-admin@example.test', '{"first_name":"Pd","last_name":"Admin"}'),
 ('fa000000-0000-0000-0000-000000000002', 'pd-player@example.test', '{"first_name":"Kojo","last_name":"Asante"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fa000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'fa000000-0000-0000-0000-000000000002';
insert into players (id, profile_id, first_name, last_name) values ('fa500000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000002', 'Kojo', 'Asante');
-- an invoice with one line, an old invoice without lines, a paid invoice, and a plain (non-invoice) payment
insert into payments (id, player_id, amount_cents, method, status, due_on, invoice_sent_at) values
 ('fa600000-0000-0000-0000-000000000001', 'fa500000-0000-0000-0000-000000000002', 24000, 'invoice', 'pending', '2027-03-15', now()),
 ('fa600000-0000-0000-0000-000000000002', 'fa500000-0000-0000-0000-000000000002', 6000, 'invoice', 'pending', '2027-04-15', now());
insert into payments (id, player_id, amount_cents, method, status, due_on, invoice_sent_at, paid_at) values
 ('fa600000-0000-0000-0000-000000000003', 'fa500000-0000-0000-0000-000000000002', 6000, 'invoice', 'paid', '2026-04-15', now(), now());
insert into payments (id, player_id, amount_cents, method, status) values ('fa600000-0000-0000-0000-000000000004', 'fa500000-0000-0000-0000-000000000002', 1000, 'cash', 'pending');
update payments set invoice_number = null where id = 'fa600000-0000-0000-0000-000000000004';
insert into payment_lines (payment_id, position, description, line_date, unit_price_cents) values ('fa600000-0000-0000-0000-000000000001', 1, 'Membership fees', '2027-03-01', 24000);

select t.login('fa000000-0000-0000-0000-000000000002');
select t.check('a player cannot add a past-due amount', t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000001', 'Unpaid balance', 6000)$$));

select t.login('fa000000-0000-0000-0000-000000000001');
select t.check('admin adds a past-due line', not t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000001', '  Unpaid balance from season 2026 ', 6050)$$));
select t.check('…the total grows by the amount', (select amount_cents from payments where id = 'fa600000-0000-0000-0000-000000000001') = 30050);
select t.check('…a second line, marked past due, trimmed text, no date', (select count(*) from payment_lines where payment_id = 'fa600000-0000-0000-0000-000000000001' and kind = 'past_due'
  and position = 2 and description = 'Unpaid balance from season 2026' and line_date is null and unit_price_cents = 6050) = 1);
select t.check('…the lines add up to the total', (select sum(unit_price_cents) from payment_lines where payment_id = 'fa600000-0000-0000-0000-000000000001') = 30050);
select t.check('an invoice without lines keeps its amount as a first line', not t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000002', 'Unpaid balance', 2000)$$));
select t.check('…two lines: the original 60 and the 20 added', (select string_agg(kind || ':' || unit_price_cents, ',' order by position) from payment_lines where payment_id = 'fa600000-0000-0000-0000-000000000002') = 'fee:6000,past_due:2000'
  and (select amount_cents from payments where id = 'fa600000-0000-0000-0000-000000000002') = 8000);
select t.check('not on a paid invoice', t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000003', 'Unpaid balance', 1000)$$));
select t.check('not on a payment that is not an invoice', t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000004', 'Unpaid balance', 1000)$$));
select t.check('amount 0 refused', t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000001', 'Unpaid balance', 0)$$));
select t.check('amount over EUR 5000 refused', t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000001', 'Unpaid balance', 500001)$$));
select t.check('too short a description refused', t.raises($$select add_past_due('fa600000-0000-0000-0000-000000000001', ' x ', 1000)$$));
select t.check('a membership-fee line cannot be removed this way', t.raises(format($$select remove_past_due(%L)$$, (select id from payment_lines where payment_id = 'fa600000-0000-0000-0000-000000000001' and kind = 'fee'))));
select t.check('admin removes the past-due line', not t.raises(format($$select remove_past_due(%L)$$, (select id from payment_lines where payment_id = 'fa600000-0000-0000-0000-000000000001' and kind = 'past_due'))));
select t.check('…the total is back', (select amount_cents from payments where id = 'fa600000-0000-0000-0000-000000000001') = 24000
  and (select count(*) from payment_lines where payment_id = 'fa600000-0000-0000-0000-000000000001') = 1);
select t.check('…both changes are in the audit log', (select count(*) from audit_log where table_name = 'payment_lines' and (new_data ->> 'kind' = 'past_due' or old_data ->> 'kind' = 'past_due')) >= 2);
-- once paid, the line stays
update payments set status = 'paid', paid_at = now() where id = 'fa600000-0000-0000-0000-000000000002';
select t.check('a past-due line on a paid invoice cannot be removed', t.raises(format($$select remove_past_due(%L)$$, (select id from payment_lines where payment_id = 'fa600000-0000-0000-0000-000000000002' and kind = 'past_due'))));
select t.login('fa000000-0000-0000-0000-000000000002');
select t.check('the player sees the past-due line on their own invoice', (select count(*) from payment_lines where kind = 'past_due') = 1);
select t.check('a player cannot remove it', t.raises(format($$select remove_past_due(%L)$$, (select id from payment_lines where kind = 'past_due' limit 1))));
rollback;
