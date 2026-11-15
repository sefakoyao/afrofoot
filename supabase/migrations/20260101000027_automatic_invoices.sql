-- 0027 Automatic membership invoices: invoice lines, billing details, and a nightly job that issues the invoices that are due.
-- An invoice is a payment with method 'invoice' (invoice number and Finnish reference number come from app.payment_defaults, 0013).

-- ===== Billing details printed on every invoice (filled in by an administrator; public so the website can show them for transfers) =====
insert into site_settings (key, value, is_public) values ('billing', jsonb_build_object(
  'legal_name', '', 'street', '', 'postal_city', '', 'business_id', '',
  'iban', '', 'bic', '', 'bank', '', 'email', '', 'phone', '', 'website', '', 'contact_person', '',
  'payment_terms_days', 14,     -- due date = invoice date + this many days (never before the period starts)
  'lead_days', 14,              -- issue the invoice this many days before the period starts
  'late_interest', '8.00'       -- shown on the invoice, per cent
), true) on conflict (key) do nothing;

-- ===== Invoice lines =====
create table payment_lines (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  position int not null default 1 check (position between 1 and 100),
  description text not null check (char_length(description) between 1 and 200),
  line_date date,
  quantity numeric(8,2) not null default 1 check (quantity > 0),
  unit text not null default 'kpl' check (char_length(unit) between 1 and 10),
  unit_price_cents int not null check (unit_price_cents >= 0),
  vat_percent numeric(4,2) not null default 0 check (vat_percent between 0 and 30),
  created_at timestamptz not null default now(),
  unique (payment_id, position)
);
create index on payment_lines (payment_id);
alter table payment_lines enable row level security;
create policy admin_all on payment_lines for all to authenticated using (app.is_admin()) with check (app.is_admin());
-- Players read the lines of their own invoices (same rule as payments_self).
create policy lines_self on payment_lines for select to authenticated
  using (exists (select 1 from payments p where p.id = payment_id and p.player_id = app.my_player_id()));
create trigger audit after insert or update or delete on payment_lines for each row execute function app.audit();
revoke all on payment_lines from anon;

-- ===== Issue the invoices that are due =====
-- A membership is invoiced when it is active, set to renew automatically, has a next invoice date within lead_days, a plan with a
-- price and a regular period, and has not ended. Each invoice covers one plan period with one line per month (one line for a season),
-- then next_due_on moves to the next period, so running this again never invoices the same period twice.
-- Returns the number of invoices issued. Nothing happens while the club's IBAN is not filled in.
create function app.generate_due_invoices(p_today date default (now() at time zone 'Europe/Helsinki')::date) returns int
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; terms int; lead int; m record; months int; per int; i int; v_pay uuid; n int := 0;
begin
  select value into b from site_settings where key = 'billing';
  if b is null or coalesce(b->>'iban', '') = '' then
    raise notice 'Billing details (IBAN) are missing: no invoices issued.';
    return 0;
  end if;
  terms := greatest(0, least(120, coalesce((b->>'payment_terms_days')::int, 14)));
  lead := greatest(0, least(60, coalesce((b->>'lead_days')::int, 14)));
  for m in
    select ms.id, ms.player_id, ms.next_due_on, ms.ends_on, mp.amount_cents, mp.currency, mp.period
    from memberships ms join membership_plans mp on mp.id = ms.plan_id
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and ms.next_due_on - lead <= p_today
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
      and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
    order by ms.next_due_on
    for update of ms skip locked
  loop
    months := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;  -- null for a season
    insert into payments (player_id, membership_id, amount_cents, currency, method, status, due_on, invoice_sent_at, notes)
    values (m.player_id, m.id, m.amount_cents, m.currency, 'invoice', 'pending', greatest(p_today + terms, m.next_due_on), now(), 'automatic invoice')
    returning id into v_pay;
    if months is null then
      insert into payment_lines (payment_id, position, description, line_date, unit_price_cents) values (v_pay, 1, 'Membership fees', m.next_due_on, m.amount_cents);
    else
      per := m.amount_cents / months;   -- whole cents; the last line takes the remainder so the lines add up exactly
      for i in 0 .. months - 1 loop
        insert into payment_lines (payment_id, position, description, line_date, unit_price_cents)
        values (v_pay, i + 1, 'Membership fees', (m.next_due_on + make_interval(months => i))::date,
                case when i = months - 1 then m.amount_cents - per * (months - 1) else per end);
      end loop;
    end if;
    update memberships set next_due_on = case when months is null then null else (m.next_due_on + make_interval(months => months))::date end
    where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.generate_due_invoices(date) from public, anon, authenticated;

-- "Run now" for administrators (the nightly job runs the same function).
create function public.run_invoice_generation() returns int language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return app.generate_due_invoices();
end $$;
revoke all on function public.run_invoice_generation() from public, anon;
grant execute on function public.run_invoice_generation() to authenticated;

-- Players see the invoice number with their own payments (my_payments already has it); nothing else changes for them.

-- ===== Nightly schedule (Supabase pg_cron). 04:15 UTC = 06:15 or 07:15 in Helsinki. Skipped where pg_cron is not available. =====
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('afrofoot-invoices', '15 4 * * *', 'select app.generate_due_invoices()');
    exception when others then
      raise notice 'Could not schedule the invoice job (%). In Supabase: Database > Extensions > enable pg_cron, then run: select cron.schedule(''afrofoot-invoices'', ''15 4 * * *'', ''select app.generate_due_invoices()'');', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available here: schedule app.generate_due_invoices() another way.';
  end if;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.16.0','feature','Automatic membership invoices',
  'Invoices are issued automatically for active memberships set to renew (one line per month, one invoice per plan period), with the club''s bank details, Finnish reference number and bank barcode. Players open them from their page.','2026-11-15')
on conflict (version) do nothing;
