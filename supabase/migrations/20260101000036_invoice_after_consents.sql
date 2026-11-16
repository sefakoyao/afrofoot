-- 0036 A player's membership is invoiced only once the player has signed their contract and agreed to the Code of Conduct.
-- Release 0.24.0. A held membership keeps its next invoice date, so the first run after the player completes both steps
-- invoices it: nothing is skipped or lost. The club can switch the rule off in the billing details ("require_consents").
--  * Code of Conduct: consent to the current version by the player's own account (none needed while no version is published).
--  * Contract: a contract the player has signed (player_signed or active; a terminated one until its termination date) that
--    has not ended by that date.

create function app.invoice_hold(p_player uuid, p_on date) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from conduct_versions v where v.is_current)
          and not exists (select 1 from players pl join conduct_consents c on c.profile_id = pl.profile_id
                          join conduct_versions v on v.id = c.version_id and v.is_current where pl.id = p_player)
         then 'conduct' end,
    case when not exists (select 1 from player_contracts k where k.player_id = p_player and k.status in ('player_signed', 'active', 'terminated')
                          and k.ends_on >= p_on and (k.status <> 'terminated' or k.terminated_on > p_on))
         then 'contract' end
  ], null)
$$;
revoke all on function app.invoice_hold(uuid, date) from public, anon, authenticated;

create or replace function app.generate_due_invoices(p_today date default (now() at time zone 'Europe/Helsinki')::date) returns int
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; terms int; lead int; req boolean; m record; months int; per int; i int; v_pay uuid; n int := 0;
begin
  select value into b from site_settings where key = 'billing';
  if b is null or coalesce(b->>'iban', '') = '' then
    raise notice 'Billing details (IBAN) are missing: no invoices issued.';
    return 0;
  end if;
  terms := greatest(0, least(120, coalesce((b->>'payment_terms_days')::int, 14)));
  lead := greatest(0, least(60, coalesce((b->>'lead_days')::int, 14)));
  req := coalesce((b->>'require_consents')::boolean, true);
  for m in
    select ms.id, ms.player_id, ms.next_due_on, ms.ends_on, mp.amount_cents, mp.currency, mp.period
    from memberships ms join membership_plans mp on mp.id = ms.plan_id
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and ms.next_due_on - lead <= p_today
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
      and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and (not req or cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) = 0)   -- 0036: contract signed, Code of Conduct agreed
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

-- Admins: the memberships that are due (or will be within the lead time) but wait for a signature or the Code of Conduct.
create function public.invoice_holds() returns table (membership_id uuid, player_id uuid, player_name text, next_due_on date, missing text[])
language plpgsql stable security definer set search_path = public as $$
declare b jsonb; lead int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select value into b from site_settings where key = 'billing';
  if not coalesce((b->>'require_consents')::boolean, true) then return; end if;
  lead := greatest(0, least(60, coalesce((b->>'lead_days')::int, 14)));
  return query
    select ms.id, ms.player_id, pl.first_name || ' ' || pl.last_name, ms.next_due_on, app.invoice_hold(ms.player_id, ms.next_due_on)
    from memberships ms join membership_plans mp on mp.id = ms.plan_id join players pl on pl.id = ms.player_id
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and ms.next_due_on - lead <= (now() at time zone 'Europe/Helsinki')::date
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season') and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) > 0
    order by ms.next_due_on, pl.last_name;
end $$;
revoke all on function public.invoice_holds() from public, anon;
grant execute on function public.invoice_holds() to authenticated;

-- Existing clubs: the rule is on unless switched off in Admin → Invoices → Billing details.
update site_settings set value = value || '{"require_consents": true}'::jsonb where key = 'billing' and not value ? 'require_consents';

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.24.0','feature','Invoices after the contract and Code of Conduct',
  'A player''s membership invoice is issued only once the player has signed their contract and agreed to the Code of Conduct. Admins see who is waiting. The club can switch this off in the billing details.','2026-11-16')
on conflict (version) do nothing;
