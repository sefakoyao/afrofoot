-- 0060 Monthly invoice schedule (release 0.51.0).
-- Automatic invoices are dated on the club's invoice day of the period's month (default the 1st) and due on its due
-- day (default the 10th), both in Club billing details (billing.invoice_day / billing.due_day, 1–28). They are created
-- on the invoice day, no longer `lead_days` before. An invoice that can only be created later (e.g. the contract was
-- signed on the 15th) is due at least 7 days after it is created. Unchanged: nothing is invoiced before the player's
-- contract is signed and the Code of Conduct agreed (0036). Admins set from which month each membership is invoiced
-- (memberships.next_due_on, always the 1st of a month), one by one, for every membership without invoices yet, or from
-- the month each player's contract starts.

create or replace function app.invoice_days() returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array[least(28, greatest(1, coalesce((value ->> 'invoice_day')::int, 1))),
                  least(28, greatest(1, coalesce((value ->> 'due_day')::int, 10)))]
       from site_settings where key = 'billing'),
    array[1, 10])
$$;

-- The invoice date and due date of the period that starts in the month of p_period.
create or replace function app.invoice_dates(p_period date) returns table (issue_on date, due_on date) language sql stable security definer set search_path = public as $$
  select (date_trunc('month', p_period)::date + (d[1] - 1)),
         case when d[2] >= d[1] then date_trunc('month', p_period)::date + (d[2] - 1)
              else (date_trunc('month', p_period) + interval '1 month')::date + (d[2] - 1) end   -- due day before the invoice day: next month
  from (select app.invoice_days() d) x
$$;

create or replace function app.generate_due_invoices(p_today date default (now() at time zone 'Europe/Helsinki')::date) returns int
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; req boolean; m record; months int; per int; i int; v_pay uuid; n int := 0; v_due date;
begin
  select value into b from site_settings where key = 'billing';
  if b is null or coalesce(b->>'iban', '') = '' then
    raise notice 'Billing details (IBAN) are missing: no invoices issued.';
    return 0;
  end if;
  req := coalesce((b->>'require_consents')::boolean, true);
  for m in
    select ms.id, ms.player_id, ms.next_due_on, ms.ends_on, mp.amount_cents, mp.currency, mp.period, d.issue_on, d.due_on
    from memberships ms join membership_plans mp on mp.id = ms.plan_id, lateral app.invoice_dates(ms.next_due_on) d
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and d.issue_on <= p_today
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
      and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and (not req or cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) = 0)   -- 0036: contract signed, Code of Conduct agreed
    order by ms.next_due_on
    for update of ms skip locked
  loop
    months := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;  -- null for a season
    -- on time: dated the invoice day, due the due day; late (e.g. signed after the invoice day): today, due 7 days on at least
    v_due := case when p_today <= m.issue_on then m.due_on else greatest(m.due_on, p_today + 7) end;
    insert into payments (player_id, membership_id, amount_cents, currency, method, status, due_on, invoice_sent_at, notes)
    values (m.player_id, m.id, m.amount_cents, m.currency, 'invoice', 'pending', v_due,
            case when p_today <= m.issue_on then (m.issue_on + time '08:00') at time zone 'Europe/Helsinki' else now() end, 'automatic invoice')
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

-- Admins: the memberships whose invoice day has come but that wait for a signature or the Code of Conduct.
create or replace function public.invoice_holds() returns table (membership_id uuid, player_id uuid, player_name text, next_due_on date, missing text[])
language plpgsql stable security definer set search_path = public as $$
declare b jsonb;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select value into b from site_settings where key = 'billing';
  if not coalesce((b->>'require_consents')::boolean, true) then return; end if;
  return query
    select ms.id, ms.player_id, pl.first_name || ' ' || pl.last_name, ms.next_due_on, app.invoice_hold(ms.player_id, ms.next_due_on)
    from memberships ms join membership_plans mp on mp.id = ms.plan_id join players pl on pl.id = ms.player_id, lateral app.invoice_dates(ms.next_due_on) d
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and d.issue_on <= (now() at time zone 'Europe/Helsinki')::date
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season') and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) > 0
    order by ms.next_due_on, pl.last_name;
end $$;

-- Admins: from which month memberships are invoiced (the 1st of p_month). p_membership null = every active membership
-- of the current season with automatic invoices on and no invoice yet. Returns how many memberships changed.
create or replace function public.set_invoice_start(p_month date, p_membership uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_first date := date_trunc('month', p_month)::date; n int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_month is null or v_first < date_trunc('month', now() at time zone 'Europe/Helsinki')::date - interval '12 months'
     or v_first > date_trunc('month', now() at time zone 'Europe/Helsinki')::date + interval '24 months' then
    raise exception 'month within the last year or the next two' using errcode = '22023';
  end if;
  update memberships ms set next_due_on = v_first, starts_on = least(coalesce(ms.starts_on, v_first), v_first), updated_at = now()
  where ms.status = 'active' and ms.auto_renew
    and (case when p_membership is not null then ms.id = p_membership
              else ms.season_id in (select id from seasons where is_current) and not exists (select 1 from payments p where p.membership_id = ms.id) end);
  get diagnostics n = row_count;
  if p_membership is not null and n = 0 then raise exception 'no such membership with automatic invoices' using errcode = '22023'; end if;
  return n;
end $$;
revoke all on function public.set_invoice_start(date, uuid) from public, anon;
grant execute on function public.set_invoice_start(date, uuid) to authenticated;

-- The month the player's contract starts (the first of it): their sent, signed or running contract that has not ended,
-- earliest first. Null when they have none. Used for "start invoices from each player's contract".
create or replace function app.contract_start_month(p_player uuid) returns date language sql stable security definer set search_path = public as $$
  select date_trunc('month', min(k.starts_on))::date from player_contracts k
  where k.player_id = p_player and k.status in ('sent', 'player_signed', 'active') and k.ends_on >= (now() at time zone 'Europe/Helsinki')::date
$$;
revoke all on function app.contract_start_month(uuid) from public, anon, authenticated;

-- Admins: every membership of the current season without invoices starts in the month its player's contract starts
-- (players without a contract are left as they are). Returns how many memberships changed.
create or replace function public.set_invoice_start_from_contracts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update memberships ms set next_due_on = c.m, starts_on = least(coalesce(ms.starts_on, c.m), c.m), updated_at = now()
  from (select ms2.id, app.contract_start_month(ms2.player_id) m from memberships ms2) c
  where c.id = ms.id and c.m is not null and ms.next_due_on is distinct from c.m
    and ms.status = 'active' and ms.auto_renew and ms.season_id in (select id from seasons where is_current)
    and not exists (select 1 from payments p where p.membership_id = ms.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_invoice_start_from_contracts() from public, anon;
grant execute on function public.set_invoice_start_from_contracts() to authenticated;

-- defaults for clubs that already saved billing details
update site_settings set value = value || jsonb_build_object('invoice_day', coalesce((value ->> 'invoice_day')::int, 1), 'due_day', coalesce((value ->> 'due_day')::int, 10))
 where key = 'billing';

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.51.0','feature','Monthly invoice schedule',
  'Automatic invoices are dated the 1st of the month and due on the 10th (Club billing details). Admins set from which month each membership is invoiced, or for all memberships without invoices at once (e.g. January 2027). Nothing is invoiced before the contract is signed.','2026-11-19')
on conflict (version) do nothing;
