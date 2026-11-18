-- 0053 Past-due amounts on invoices (release 0.42.0).
-- Admin → Invoices: on an unpaid invoice an admin adds a line for an amount still owed from an earlier season (typed in
-- by hand, e.g. "Unpaid balance, season 2025 – EUR 60"). The invoice total grows by that amount; the line can be removed
-- again while the invoice is unpaid. Both go through security-definer functions so the line and the total always change
-- together, and both are in the audit log (payments and payment_lines are audited).

alter table payment_lines add column kind text not null default 'fee' check (kind in ('fee', 'past_due'));

create function public.add_past_due(p_payment uuid, p_description text, p_amount_cents int) returns uuid
language plpgsql security definer set search_path = public as $$
declare p payments; v_desc text := trim(p_description); v_pos int; v_line uuid;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 500000 then raise exception 'amount between EUR 0.01 and 5000' using errcode = '22023'; end if;
  if char_length(v_desc) not between 3 and 200 then raise exception 'description 3–200 characters' using errcode = '22023'; end if;
  select * into p from payments where id = p_payment for update;
  if p.id is null or p.invoice_number is null then raise exception 'not an invoice' using errcode = '22023'; end if;
  if p.status not in ('pending', 'failed') then raise exception 'only unpaid invoices can change' using errcode = 'check_violation'; end if;
  -- an invoice from before invoice lines existed gets its original amount as a first line, so the PDF keeps showing it
  if not exists (select 1 from payment_lines where payment_id = p.id) then
    insert into payment_lines (payment_id, position, description, line_date, unit_price_cents) values (p.id, 1, 'Membership fees', p.due_on, p.amount_cents);
  end if;
  select coalesce(max(position), 0) + 1 into v_pos from payment_lines where payment_id = p.id;
  if v_pos > 100 then raise exception 'too many lines' using errcode = 'check_violation'; end if;
  insert into payment_lines (payment_id, position, description, line_date, unit_price_cents, kind)
  values (p.id, v_pos, v_desc, null, p_amount_cents, 'past_due') returning id into v_line;
  update payments set amount_cents = amount_cents + p_amount_cents, updated_at = now() where id = p.id;
  return v_line;
end $$;
revoke all on function public.add_past_due(uuid, text, int) from public, anon;
grant execute on function public.add_past_due(uuid, text, int) to authenticated;

create function public.remove_past_due(p_line uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l payment_lines; p payments;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into l from payment_lines where id = p_line;
  if l.id is null or l.kind <> 'past_due' then raise exception 'not a past-due line' using errcode = '22023'; end if;
  select * into p from payments where id = l.payment_id for update;
  if p.status not in ('pending', 'failed') then raise exception 'only unpaid invoices can change' using errcode = 'check_violation'; end if;
  delete from payment_lines where id = l.id;
  update payments set amount_cents = amount_cents - l.unit_price_cents, updated_at = now() where id = p.id;
end $$;
revoke all on function public.remove_past_due(uuid) from public, anon;
grant execute on function public.remove_past_due(uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.42.0','feature','Past-due amounts on invoices',
  'Admin → Invoices: add an amount still owed from an earlier season to an unpaid invoice, as its own line with your own description. The total, the PDF and the bank barcode follow; the line can be removed while the invoice is unpaid.','2026-11-18')
on conflict (version) do nothing;
